// Registro dinámico de clientes (RFC 7591).
import { json, opciones, redirectPermitida, registrarCliente } from "@/lib/oauth";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const uris: string[] = Array.isArray(b.redirect_uris) ? b.redirect_uris.map(String) : [];
  if (!uris.length || !uris.every(redirectPermitida)) return json({ error: "invalid_redirect_uri" }, 400);
  const client_id = await registrarCliente(uris, b.client_name);
  return json({
    client_id, client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: uris, client_name: b.client_name ?? null,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, 201);
}
export const OPTIONS = opciones;
