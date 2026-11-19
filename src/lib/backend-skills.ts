import { BackendClientError, type BackendClient } from "./backend-client.ts";

import { isUuid } from "./backend-sessions.ts";

export type Skill = { id: string; ownerId: string; name: string; description: string; root: string | null };
export type SkillPage = { items: Skill[]; total: number; page: number; size: number; hasNext: boolean };
export type SkillDetail = { skill: Skill; content: string; resources: string[] };
export type SkillConfig = { paths: string[]; classpathPath: string };
const bad = () => new BackendClientError("invalid-response", "Invalid Skills response.");
const object = (v: unknown): Record<string, unknown> => { if (!v || typeof v !== "object" || Array.isArray(v)) throw bad(); return v as Record<string, unknown>; };
const text = (v: unknown): string => { if (typeof v !== "string") throw bad(); return v; };
const count = (v: unknown): number => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) throw bad(); return v; };
const bool = (v: unknown): boolean => { if (typeof v !== "boolean") throw bad(); return v; };
const strings = (v: unknown): string[] => { if (!Array.isArray(v)) throw bad(); return v.map(text); };
// Native loaders accept names beyond the old lowercase/hyphen convention.
export const isSkillName = (v: string) => v.trim().length > 0 && v !== "." && v !== ".." && !/[\/\\\u0000-\u001f\u007f]/u.test(v);
export function skillPath(name: string) {
  if (!isSkillName(name)) throw new BackendClientError("invalid-request", "Invalid skill name.");
  return `api/skills/${encodeURIComponent(name)}`;
}
export function parseSkill(value: unknown): Skill {
  const o = object(value); const name = text(o.name);
  if (!isSkillName(name) || !isUuid(o.id) || !isUuid(o.ownerId)) throw bad();
  return { id: o.id, ownerId: o.ownerId, name, description: text(o.description), root: o.root === null ? null : text(o.root) };
}
export function parseSkillPage(value: unknown): SkillPage {
  const o = object(value); if (!Array.isArray(o.items)) throw bad();
  const page = { items: o.items.map(parseSkill), total: count(o.total), page: count(o.page), size: count(o.size), hasNext: bool(o.hasNext) };
  if (page.size < 1 || page.size > 100 || page.items.length > page.size || page.items.length > page.total || new Set(page.items.map(s => s.name)).size !== page.items.length || page.hasNext !== ((page.page + 1) * page.size < page.total)) throw bad();
  return page;
}
export async function uploadSkill(client: BackendClient, file: File, signal: AbortSignal): Promise<Skill> {
  const body = new FormData();
  body.append("file", file);
  return parseSkill(await client.request("api/skills/upload", {
    method: "POST", body, signal, timeoutMs: 60_000, reportTimeout: false,
  }));
}
export async function readSkills(client: BackendClient, signal: AbortSignal): Promise<Skill[]> {
  const items: Skill[] = [];
  for (let page = 0; ; page++) {
    const result = parseSkillPage(await client.request(`api/skills?page=${page}&size=100`, { signal }));
    items.push(...result.items);
    if (!result.hasNext) return items;
    signal.throwIfAborted();
  }
}
export function parseSkillDetail(value: unknown): SkillDetail {
  const o = object(value);
  const resources = strings(o.resources);
  if (resources.some(p => p.startsWith("/") || p.startsWith("\\") || /^[a-z]:/i.test(p) || p.split(/[\\\/]/).includes(".."))) throw bad();
  return { skill: parseSkill(o.skill), content: text(o.content), resources };
}
export function parseSkillConfig(value: unknown): SkillConfig {
  const o = object(value);
  return { paths: strings(o.paths), classpathPath: text(o.classpathPath) };
}
