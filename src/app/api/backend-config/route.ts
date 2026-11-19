import "server-only";
import { resolve } from "node:path";
import { normalizeBackendUrl } from "@/lib/backend-url";
import { readBackendConfigFile } from "@/server/backend-config-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const baseUrl = process.env.MINDRAILS_BACKEND_BASE_URL;
    const config = baseUrl === undefined
      ? await readBackendConfigFile(resolve(process.env.MINDRAILS_BACKEND_CONFIG_PATH ?? "config/backend.json"))
      : { version: 1, BASE_URL: normalizeBackendUrl(baseUrl) };
    return Response.json({ config }, { headers });
  } catch {
    return Response.json({ error: "Unable to read backend configuration. Check MINDRAILS_BACKEND_BASE_URL, MINDRAILS_BACKEND_CONFIG_PATH or config/backend.json." }, { status: 503, headers });
  }
}
