"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Copy, Check, Download, ExternalLink } from "lucide-react";
import { citationPlugin } from "@/lib/citation-links";
import type { ChatSource } from "@/lib/backend-sessions";
import { useI18n } from "@/i18n/use-i18n";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { backendDownloadPath } from "@/lib/backend-download";
import { FileDownloadButton } from "./file-download-button";
import { FileDownloadReference } from "./file-download-reference";

function plainText(value: ReactNode): string {
  return Children.toArray(value).map(child => typeof child === "string" || typeof child === "number" ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? plainText(child.props.children) : "").join("");
}
function CodeBlock({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  const child = Children.toArray(children).find(isValidElement);
  const language = isValidElement<{ className?: string }>(child) ? child.props.className?.match(/language-([\w+-]+)/)?.[1] : null;
  return <div className="markdown-code"><div className="code-toolbar"><span>{language ?? t("markdown.plainText")}</span>
    <button type="button" onClick={() => {
      void navigator.clipboard.writeText(plainText(children).replace(/\n$/, "")).then(() => { setCopied(true); setFailed(false); setTimeout(() => setCopied(false), 2000); }).catch(() => setFailed(true));
    }}>{copied ? <Check size={14} /> : <Copy size={14} />}{t(copied ? "markdown.copied" : "markdown.copy")}</button>
  </div><pre>{children}</pre>{failed && <p role="status">{t("markdown.copyFailed")}</p>}</div>;
}
export function Markdown({ children, sources = [], onSource }: { children: string; sources?: ChatSource[]; onSource?: (source: ChatSource) => void }) {
  const { client } = useBackendConnection();
  return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm, citationPlugin(sources)]} rehypePlugins={children.length <= 100000 ? [[rehypeHighlight, { detect: false, ignoreMissing: true }]] : []} skipHtml
    components={{
      pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
      table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
      a: ({ href, children }) => href && backendDownloadPath(client?.BASE_URL, href)
        ? <FileDownloadReference href={href} filename={plainText(children) || "download"}>{children}<Download size={12} aria-hidden="true" /></FileDownloadReference>
        : <a onClick={event => { if (!href?.startsWith("#citation-")) return; const label = href.slice(10); const source = sources.find(item => item.title.startsWith(`${label} ·`)); if (source && onSource) { event.preventDefault(); onSource(source); } }} className={href?.startsWith("#citation-") ? "citation-link" : "markdown-link"} href={href} target={href?.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">{children}{href && !href.startsWith("#") && <ExternalLink size={12} aria-hidden="true" />}</a>,
      img: ({ src, alt }) => typeof src === "string" ? backendDownloadPath(client?.BASE_URL, src)
        ? <FileDownloadButton href={src} filename={alt || "download"} className="markdown-link">{alt || src}<Download size={12} aria-hidden="true" /></FileDownloadButton>
        : <a href={src} target="_blank" rel="noopener noreferrer">{alt || src}</a> : null,
    }}>{children}</ReactMarkdown></div>;
}
