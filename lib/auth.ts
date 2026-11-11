// Autenticación sin estado: sesiones web y tokens OAuth firmados con HMAC-SHA256 (Web Crypto, sirve en proxy y en rutas).
// Usuario y clave: APP_USER / APP_PASSWORD. Secreto de firma: AUTH_SECRET (o MCP_TOKEN si no está definido).

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const desdeB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

function secreto() {
  const s = process.env.AUTH_SECRET || process.env.MCP_TOKEN;
  if (!s) throw new Error("Falta AUTH_SECRET");
  return s;
}

let clave: Promise<CryptoKey> | null = null;
const llave = () => (clave ??= crypto.subtle.importKey("raw", enc.encode(secreto()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]));

export async function firmar(datos: Record<string, unknown>, segundos: number) {
  const cuerpo = b64url(enc.encode(JSON.stringify({ ...datos, exp: Math.floor(Date.now() / 1000) + segundos })));
  const firma = new Uint8Array(await crypto.subtle.sign("HMAC", await llave(), enc.encode(cuerpo)));
  return `${cuerpo}.${b64url(firma)}`;
}

export async function verificar<T = Record<string, any>>(token: string | null | undefined, tipo?: string): Promise<(T & { exp: number }) | null> {
  if (!token || !token.includes(".")) return null;
  const [cuerpo, firma] = token.split(".");
  try {
    const ok = await crypto.subtle.verify("HMAC", await llave(), desdeB64url(firma), enc.encode(cuerpo));
    if (!ok) return null;
    const datos = JSON.parse(new TextDecoder().decode(desdeB64url(cuerpo)));
    if (typeof datos.exp !== "number" || datos.exp < Date.now() / 1000) return null;
    if (tipo && datos.typ !== tipo) return null;
    return datos;
  } catch {
    return null;
  }
}

/** Compara usuario y clave contra APP_USER / APP_PASSWORD. */
export function credencialesValidas(usuario: string, clave: string) {
  const u = process.env.APP_USER, p = process.env.APP_PASSWORD;
  if (!p) return false;
  return (!u || usuario.trim() === u) && clave === p;
}

export async function sha256b64url(texto: string) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(texto))));
}

export const COOKIE_SESION = "sesion_suelo";
export const DURACION_SESION = 30 * 24 * 3600;

/** URL pública de este despliegue a partir de la petición (sirve igual en local, previews y producción). */
export function origen(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
