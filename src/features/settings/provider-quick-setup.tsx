"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, LoaderCircle, PlugZap, RefreshCw, Save, Settings2, WandSparkles } from "lucide-react";
import { createContext, useContext, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Modal } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/tooltip";
import type { Locale, TranslationKey } from "@/i18n/types";
import { useI18n } from "@/i18n/use-i18n";
import { updateAuthUser, type UserProfile } from "@/lib/auth-session";
import { BackendClientError, type BackendClient } from "@/lib/backend-client";
import {
  parseQuickSetupStatus, parseQuickSetupTest, quickSetupKinds, quickSetupPath, quickSetupSessionKey,
  type QuickSetupDraft, type QuickSetupKind, type VerifiedProvider,
} from "@/lib/provider-quick-setup";
import { webSearchTypes, webSearchTypesInfo, type WebSearchType } from "@/lib/web-search-providers";
import { useAuth } from "@/providers/auth-provider";
import { useBackendProviders } from "@/providers/backend-providers-provider";
import { useUiPreferences } from "@/providers/ui-preferences-provider";
import { useWorkspace } from "@/providers/workspace-provider";
import { useArchiveRequest } from "./use-archive-request";

const providersUrl = "/settings?tab=providers";
const vendors = { qwen: "Qwen", openai: "OpenAI" };
const webVendors = Object.fromEntries(webSearchTypes.map(type => [type, webSearchTypesInfo[type].label]));
const sections: Record<QuickSetupKind, { label: TranslationKey; description: TranslationKey; types: Record<string, string>; optional?: boolean }> = {
  language: { label: "quickSetup.languageTitle", description: "quickSetup.languageProvider", types: {
    OpenAi: "OpenAI", Anthropic: "Anthropic", Qwen: "Qwen", GoogleAiGemini: "Google AI Gemini", OpenAiCompiable: "OpenAI Compatible",
  } },
  embedding: { label: "quickSetup.embeddingTitle", description: "quickSetup.embeddingProvider", types: vendors },
  image: { label: "quickSetup.imageTitle", description: "quickSetup.imageProvider", types: vendors, optional: true },
  webSearch: { label: "quickSetup.webSearchTitle", description: "quickSetup.webSearchProvider", types: webVendors, optional: true },
};

const browserLocale = (): Locale => navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";

type Entry = { open: () => void; refresh: () => void; hasEmbedding: boolean; revision: number };
const QuickSetup = createContext<Entry | null>(null);

export function useQuickSetupProviderRevision() {
  return String(useContext(QuickSetup)?.revision ?? 0);
}

function hasAutoOpened(scope: string) {
  try { return sessionStorage.getItem(quickSetupSessionKey(scope)) === "1"; }
  catch { return false; }
}

function rememberAutoOpen(scope: string) {
  try { sessionStorage.setItem(quickSetupSessionKey(scope), "1"); }
  catch { /* The in-memory flag still covers this console. */ }
}

export function QuickSetupProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user?.role === "SystemAdmin" ? <AdminQuickSetup>{children}</AdminQuickSetup> : children;
}

function AdminQuickSetup({ children }: { children: ReactNode }) {
  const { preferences } = useUiPreferences();
  const { retry: refreshProviders } = useBackendProviders();
  const { refresh: refreshWorkspace } = useWorkspace();
  const status = useArchiveRequest(quickSetupPath, parseQuickSetupStatus);
  const { client, data, retry } = status;
  const [dialog, setDialog] = useState<{ first: boolean; scope: string | undefined; browserLocale: Locale } | null>(null);
  const [dialogLocale, setDialogLocale] = useState<Locale>("en");
  const { t } = useI18n(dialogLocale);
  const [done, setDone] = useState(false);
  const [revision, setRevision] = useState(0);
  const autoOpened = useRef(new Set<string>());
  const seen = useRef(new Set<string>());

  function open(target: BackendClient | null) {
    const scope = target?.resourceScope;
    let first = true;
    if (scope) {
      first = !seen.current.has(scope);
      seen.current.add(scope);
      try {
        const key = `mindrails.quick-setup.seen:${scope}`;
        first = first && localStorage.getItem(key) !== "1";
        localStorage.setItem(key, "1");
      } catch { /* The in-memory flag still covers this login. */ }
    }
    const locale = browserLocale();
    setDialogLocale(locale);
    setDone(false);
    setDialog({ first, scope, browserLocale: locale });
  }

  useEffect(() => {
    if (!client || !data?.empty || dialog || autoOpened.current.has(client.resourceScope) || hasAutoOpened(client.resourceScope)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      autoOpened.current.add(client.resourceScope);
      rememberAutoOpen(client.resourceScope);
      open(client);
    });
    return () => { cancelled = true; };
  }, [client, data, dialog]);

  const dismiss = () => {
    setDialog(null);
    if (done) retry();
  };
  const visible = dialog && (!dialog.scope || dialog.scope === client?.resourceScope || !client);
  const hasEmbedding = (data ?? status.previousData)?.hasEmbedding === true || !!visible && done;
  return <QuickSetup.Provider value={{ hasEmbedding, revision, refresh: retry, open: () => {
    if (client) {
      autoOpened.current.add(client.resourceScope);
      rememberAutoOpen(client.resourceScope);
      retry();
    }
    open(client);
  } }}>
    {children}
    {visible && (done ? <SetupComplete locale={dialogLocale} onDismiss={dismiss} /> : data && client && !data.hasEmbedding
      ? <SetupForm key={client.resourceScope} client={client} first={dialog.first} locale={dialogLocale}
        onLocaleChange={setDialogLocale} initialPreference={dialog.first ? dialog.browserLocale : preferences.locale}
        onDismiss={dismiss} onSaved={() => {
        setDone(true);
        setRevision(current => current + 1);
        refreshProviders(true);
        void refreshWorkspace();
      }} onConflict={retry} />
      : <Modal title={t("quickSetup.title")} description={t(data?.hasEmbedding ? "quickSetup.existing" : "quickSetup.welcome")}
        className="quick-setup-modal" locale={dialogLocale} headerActions={<SetupLocaleSwitch locale={dialogLocale} onChange={setDialogLocale} />}
        onDismiss={dismiss}>
        {data?.hasEmbedding ? <div className="modal-actions"><ProvidersLink locale={dialogLocale} onClick={dismiss} /></div>
          : !client || status.error ? <>
            <p role="alert" className="form-error">{t("quickSetup.statusError")}</p>
            {client && <div className="modal-actions"><IconButton icon={RefreshCw} label={t("auth.retry")} title={t("auth.retry")} onClick={retry} /></div>}
          </> : <p role="status">{t("providers.loading")}</p>}
      </Modal>)}
  </QuickSetup.Provider>;
}

function SetupLocaleSwitch({ locale, onChange }: { locale: Locale; onChange: (locale: Locale) => void }) {
  const { t } = useI18n(locale);
  const name = useId();
  return <fieldset className="quick-setup-locale" aria-label={t("quickSetup.dialogLanguage")}>
    <label lang="en"><input className="sr-only" type="radio" name={name} checked={locale === "en"}
      onChange={() => onChange("en")} /><span>English</span></label>
    <label lang="zh-CN"><input className="sr-only" type="radio" name={name} checked={locale === "zh"}
      onChange={() => onChange("zh")} /><span>简体中文</span></label>
  </fieldset>;
}

function ProvidersLink({ locale, onClick }: { locale?: Locale; onClick?: () => void }) {
  const { t } = useI18n(locale);
  const label = t("quickSetup.manage");
  return <Tooltip label={label}><Link className="ui-button ui-button-secondary icon-button quick-setup-icon"
    href={providersUrl} onClick={onClick} aria-label={label} title={onClick ? label : undefined}><Settings2 size={16} aria-hidden="true" /></Link></Tooltip>;
}

export function QuickSetupSetting() {
  const setup = useContext(QuickSetup);
  const { t } = useI18n();
  const refresh = setup?.refresh;
  useEffect(() => { refresh?.(); }, [refresh]);
  if (!setup) return null;
  return <div className="quick-setup-setting"><dt>{t("quickSetup.title")}</dt><dd>
    {setup.hasEmbedding ? <ProvidersLink /> : <IconButton icon={WandSparkles} className="quick-setup-icon" label={t("quickSetup.open")} onClick={setup.open} />}
    {setup.hasEmbedding && <span>{t("quickSetup.existing")}</span>}
  </dd></div>;
}

type SectionState = {
  enabled: boolean;
  draft: QuickSetupDraft;
  tested?: VerifiedProvider;
  testing?: boolean;
  failure?: boolean;
  latency?: number;
};

function SetupForm({ client, first, locale, onLocaleChange, initialPreference, onDismiss, onSaved, onConflict }: {
  client: BackendClient; first: boolean; locale: Locale; onLocaleChange: (locale: Locale) => void;
  initialPreference: Locale; onDismiss: () => void; onSaved: () => void; onConflict: () => void;
}) {
  const { t } = useI18n(locale);
  const [preferredLocale, setPreferredLocale] = useState(initialPreference);
  const [states, setStates] = useState(() => Object.fromEntries(quickSetupKinds.map(kind => [kind, {
    enabled: true,
    draft: { type: "", endpoint: "", apiKey: "", model: "" },
  }])) as Record<QuickSetupKind, SectionState>);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<TranslationKey | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(new Set<QuickSetupKind>());
  const savingRequest = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    return () => controller.abort();
  }, []);

  function change(kind: QuickSetupKind, state: SectionState) {
    setStates(current => ({ ...current, [kind]: state }));
    setSaveError(null);
  }

  async function test(kind: QuickSetupKind) {
    const signal = lifetime.current?.signal;
    const state = states[kind];
    if (!signal || pending.current.has(kind) || savingRequest.current || !state.enabled) return;
    pending.current.add(kind);
    change(kind, { ...state, tested: undefined, failure: false, testing: true });
    try {
      const result = parseQuickSetupTest(await client.request(`${quickSetupPath}/${kind}/test`, {
        method: "POST", json: state.draft, timeoutMs: 45_000, reportTimeout: false, signal,
      }));
      if (signal.aborted) return;
      const tested = result.connected && result.receipt ? { draft: state.draft, receipt: result.receipt } : undefined;
      change(kind, { ...state, tested, testing: false, failure: !tested, latency: result.latencyMs });
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof BackendClientError && error.status === 409) onConflict();
      else change(kind, { ...state, tested: undefined, testing: false, failure: true });
    } finally {
      pending.current.delete(kind);
    }
  }

  const included = quickSetupKinds.filter(kind => states[kind].enabled && (!sections[kind].optional
    || Object.values(states[kind].draft).some(value => value.trim())));
  const canSave = !quickSetupKinds.some(kind => states[kind].testing) && included.every(kind => !!states[kind].tested);
  async function save() {
    const signal = lifetime.current?.signal;
    if (!signal || !canSave || pending.current.size || savingRequest.current) return;
    savingRequest.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const json = { ...Object.fromEntries(included.map(kind => [kind, states[kind].tested])), preferredLanguage: preferredLocale };
      const profile = await client.request<UserProfile>(quickSetupPath, {
        method: "POST", json, signal, timeoutMs: 25_000, reportTimeout: false,
      });
      if (signal.aborted) return;
      if (profile?.language === preferredLocale) updateAuthUser(client.BASE_URL, profile);
      onSaved();
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof BackendClientError && error.status === 409) onConflict();
      if (error instanceof BackendClientError && error.status === 412) {
        setStates(current => Object.fromEntries(quickSetupKinds.map(kind => [kind, {
          ...current[kind], tested: undefined,
        }])) as Record<QuickSetupKind, SectionState>);
        setSaveError("quickSetup.retest");
      } else setSaveError("quickSetup.saveError");
    } finally {
      savingRequest.current = false;
      if (!signal.aborted) setSaving(false);
    }
  }

  return <Modal title={t("quickSetup.title")} description={t(first ? "quickSetup.welcome" : "quickSetup.reopen")}
    className="quick-setup-modal" locale={locale} headerActions={<SetupLocaleSwitch locale={locale} onChange={onLocaleChange} />}
    onDismiss={onDismiss} dismissDisabled={saving}>
    <div className="quick-setup-form">
      <div className="quick-setup-section quick-setup-preference">
        <div><label htmlFor="quick-setup-preferred-language">{t("settings.language")}</label>
          <p id="quick-setup-language-hint">{t("quickSetup.preferredLanguage")}</p></div>
        <select id="quick-setup-preferred-language" className="agent-select" disabled={saving} value={preferredLocale}
          aria-describedby="quick-setup-language-hint" onChange={event => {
            setPreferredLocale(event.target.value === "zh" ? "zh" : "en");
            setSaveError(null);
          }}>
          <option value="en" lang="en">English</option><option value="zh" lang="zh-CN">简体中文</option>
        </select>
      </div>
      <div className="quick-setup-providers">
        {quickSetupKinds.map(kind => <ProviderSection key={kind} kind={kind} locale={locale} state={states[kind]} saving={saving}
          onChange={state => change(kind, state)} onTest={() => void test(kind)} />)}
      </div>
      <footer className="quick-setup-actions">
        {saveError && <p className="form-error" role="alert">{t(saveError)}</p>}
        <div className="modal-actions"><Button variant="primary" disabled={saving || !canSave} onClick={() => void save()}>
          {saving ? <LoaderCircle size={16} className="spinning" aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {t(saving ? "quickSetup.saving" : "quickSetup.save")}
        </Button></div>
      </footer>
    </div>
  </Modal>;
}

function ProviderSection({ kind, locale, state, saving, onChange, onTest }: {
  kind: QuickSetupKind; locale: Locale; state: SectionState; saving: boolean; onChange: (state: SectionState) => void;
  onTest: () => void;
}) {
  const { t } = useI18n(locale);
  const id = useId();
  const section = sections[kind];
  const { draft, enabled, tested, testing, failure, latency } = state;
  const busy = saving || !!testing;
  const endpoint = kind !== "language" || draft.type === "OpenAiCompiable";
  const needsModel = kind !== "webSearch";
  const examples = modelExamples(kind, draft.type);
  const testLabel = t(testing ? "providerAdmin.testing" : "providerAdmin.test");
  const changeDraft = (patch: Partial<QuickSetupDraft>) => onChange({ enabled, draft: { ...draft, ...patch } });

  return <form className="quick-setup-section provider-form" aria-labelledby={`${id}-title`}
    onSubmit={event => { event.preventDefault(); onTest(); }}>
    <div className="quick-setup-section-heading">
      <div><h3 id={`${id}-title`}>{t(section.label)}{section.optional && <span> · {t("quickSetup.optional")}</span>}</h3>
        <p>{t(section.description)}</p></div>
      {section.optional && <Button className="quick-setup-switch" role="switch" aria-label={t(section.label)}
        aria-checked={enabled} aria-controls={`${id}-fields`} disabled={busy} onClick={() => onChange({ ...state, enabled: !enabled })}>
        <span aria-hidden="true" />
      </Button>}
    </div>
    <fieldset id={`${id}-fields`} className="quick-setup-fields" data-model={needsModel} disabled={busy || !enabled} hidden={!enabled}>
        <label>{t("providerAdmin.integration")}
          <select className="agent-select" required value={draft.type} onChange={event => changeDraft({
            type: event.target.value, endpoint: "", apiKey: "", model: "",
          })}>
            <option value="" disabled>{t("quickSetup.chooseType")}</option>
            {Object.entries(section.types).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        {needsModel && <label>{t("quickSetup.modelName")}
          <input name="model_name" required maxLength={255} value={draft.model} placeholder={examples[0]}
            list={examples.length > 1 ? `${id}-models` : undefined} onChange={event => changeDraft({ model: event.target.value })} />
          {examples.length > 1 && <datalist id={`${id}-models`}>
            {examples.map(model => <option key={model} value={model} />)}
          </datalist>}
        </label>}
        {endpoint && <label className="quick-setup-endpoint">{t("quickSetup.endpoint")}
          <input type="url" required maxLength={2048} value={draft.endpoint} placeholder={endpointHint(kind, draft.type)}
            onChange={event => changeDraft({ endpoint: event.target.value })} />
          {(kind === "embedding" || kind === "language") && <small>{t("quickSetup.baseUrl")}</small>}
        </label>}
        <label className="quick-setup-key">{t("providerAdmin.apiKey")}
          <input type="password" autoComplete="new-password" required maxLength={4096}
            value={draft.apiKey} placeholder={draft.type === "Anthropic" ? "sk-ant-…" : t("quickSetup.apiKeyHint")}
            onChange={event => changeDraft({ apiKey: event.target.value })} />
        </label>
        <div className="quick-setup-test">
          <IconButton type="submit" icon={testing ? LoaderCircle : PlugZap} className={`quick-setup-icon${testing ? " is-testing" : ""}`}
            label={testLabel} title={testLabel} disabled={busy || !draft.type || !draft.apiKey.trim()
              || (endpoint && !draft.endpoint.trim()) || (needsModel && !draft.model.trim())} />
          <div aria-live="polite">
            {testing && <p className="provider-test-result">{testLabel}</p>}
            {tested && <p className="provider-test-result is-connected">{t("providerAdmin.testSuccess")} · {latency} ms</p>}
            {failure && <p className="provider-test-result is-failed">{t("providerAdmin.testFailure")}</p>}
          </div>
        </div>
    </fieldset>
  </form>;
}

function modelExamples(kind: QuickSetupKind, type: string): string[] {
  if (kind === "embedding") return type === "qwen" ? ["text-embedding-v4"] : ["text-embedding-3-small"];
  if (kind === "image") return type === "qwen" ? ["qwen-image-3.0-pro"] : ["gpt-image-1"];
  switch (type) {
    case "Anthropic": return ["claude-haiku-4-5-20251001"];
    case "GoogleAiGemini": return ["gemini-3.8-flash"];
    case "Qwen": return ["qwen3.8-flash"];
    case "OpenAi": return ["gpt-5.6-sol", "gpt-6-luna", "gpt-6-sol"];
    default: return ["qwen3.8-flash", "gpt-5.6-sol", "gpt-6-luna", "gpt-6-sol"];
  }
}

function endpointHint(kind: QuickSetupKind, type: string) {
  switch (kind) {
    case "language": return "https://api.example.com/v1";
    case "embedding": return type === "qwen" ? "https://your-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1" : "https://api.openai.com/v1";
    case "image": return type === "qwen" ? "https://your-workspace.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/images/generations" : "https://api.openai.com/v1/images/generations";
    case "webSearch": return webSearchTypesInfo[type as WebSearchType]?.endpoint ?? "https://api.example.com/v1/search";
  }
}

const confettiColors = ["#f5a524", "#35c996", "#6e88ff", "#f1789c", "#a178e3"];

function SetupComplete({ locale, onDismiss }: { locale: Locale; onDismiss: () => void }) {
  const { t } = useI18n(locale);
  return <Modal title={t("quickSetup.done")} description={t("quickSetup.ready")} locale={locale} onDismiss={onDismiss}>
    <div className="quick-setup-celebration">
      <div className="quick-setup-confetti" aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => {
          const angle = index * 2.399963;
          const distance = 65 + index % 7 * 16;
          return <i key={index} style={{ "--x": `${Math.cos(angle) * distance}px`,
            "--y": `${Math.sin(angle) * distance}px`, "--spin": `${240 + index * 31}deg`,
            "--delay": `${index % 5 * 40}ms`, background: confettiColors[index % confettiColors.length],
          } as CSSProperties} />;
        })}
      </div>
      <CheckCircle2 size={42} aria-hidden="true" />
    </div>
    <div className="modal-actions"><IconButton icon={ArrowRight} className="quick-setup-icon" variant="primary"
      label={t("quickSetup.start")} title={t("quickSetup.start")} onClick={onDismiss} /></div>
  </Modal>;
}
