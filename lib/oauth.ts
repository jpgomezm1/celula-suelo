// OAuth 2.1 mínimo para conectar el MCP desde Claude (claude.ai, Claude Desktop, Claude Code):
// registro dinámico de clientes, autorización con PKCE (S256) y login de usuario y clave, tokens firmados sin estado.
import { firmar, verificar } from "./auth";

export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "content-type, authorization, mcp-protocol-version" };
export const opciones = () => new Response(null, { status: 204, headers: CORS });
export const json = (data: unknown, status = 200, extra: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { ...CORS, "cache-control": "no-store", ...extra } });

export const DURACION_ACCESO = 30 * 24 * 3600;
export const DURACION_REFRESCO = 365 * 24 * 3600;

/** El client_id lleva firmadas las redirect_uris registradas: no hace falta guardar clientes en la base. */
export async function registrarCliente(redirectUris: string[], nombre?: string) {
  return firmar({ typ: "cliente", r: redirectUris, n: nombre ?? null }, 10 * 365 * 24 * 3600);
}
export async function leerCliente(clientId: string | null | undefined) {
  return verificar<{ r: string[]; n: string | null }>(clientId, "cliente");
}
export function redirectPermitida(uri: string) {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1";
  } catch { return false; }
}

export async function tokensPara(sub: string, clientId: string) {
  return {
    access_token: await firmar({ typ: "acceso", sub, cid: clientId.slice(0, 24) }, DURACION_ACCESO),
    refresh_token: await firmar({ typ: "refresco", sub, cid: clientId }, DURACION_REFRESCO),
    token_type: "Bearer",
    expires_in: DURACION_ACCESO,
    scope: "mcp",
  };
}
