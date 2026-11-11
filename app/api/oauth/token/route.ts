// Intercambio de código (con PKCE) y refresco de tokens.
import { sha256b64url, verificar } from "@/lib/auth";
import { json, opciones, tokensPara } from "@/lib/oauth";

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  const b: Record<string, string> = ct.includes("application/json")
    ? await req.json().catch(() => ({}))
    : Object.fromEntries(new URLSearchParams(await req.text()));
  if (b.grant_type === "authorization_code") {
    const c = await verificar<{ sub: string; cid: string; ru: string; cc: string }>(b.code, "codigo");
    if (!c) return json({ error: "invalid_grant", error_description: "Código vencido o inválido" }, 400);
    if (b.redirect_uri && b.redirect_uri !== c.ru) return json({ error: "invalid_grant", error_description: "redirect_uri distinta" }, 400);
    if (b.client_id && b.client_id !== c.cid) return json({ error: "invalid_client" }, 400);
    if (!c.cc || !b.code_verifier || (await sha256b64url(b.code_verifier)) !== c.cc) {
      return json({ error: "invalid_grant", error_description: "PKCE no coincide" }, 400);
    }
    return json(await tokensPara(c.sub, c.cid));
  }
  if (b.grant_type === "refresh_token") {
    const r = await verificar<{ sub: string; cid: string }>(b.refresh_token, "refresco");
    if (!r) return json({ error: "invalid_grant" }, 400);
    return json(await tokensPara(r.sub, r.cid));
  }
  return json({ error: "unsupported_grant_type" }, 400);
}
export const OPTIONS = opciones;
