// Recibe el formulario de /oauth/authorize: valida usuario y clave y devuelve el código a Claude.
import { credencialesValidas, firmar, origen } from "@/lib/auth";
import { leerCliente } from "@/lib/oauth";

const CAMPOS = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource"];

export async function POST(req: Request) {
  const f = await req.formData();
  const p: Record<string, string> = Object.fromEntries(CAMPOS.map((k) => [k, String(f.get(k) ?? "")]));
  const cliente = await leerCliente(p.client_id);
  if (!cliente || !cliente.r.includes(p.redirect_uri)) return new Response("Cliente o redirect_uri no válidos", { status: 400 });
  const usuario = String(f.get("usuario") ?? "");
  if (!credencialesValidas(usuario, String(f.get("clave") ?? ""))) {
    const q = new URLSearchParams({ ...p, response_type: "code", error: "1" });
    return Response.redirect(`${origen(req)}/oauth/authorize?${q}`, 303);
  }
  const code = await firmar({ typ: "codigo", sub: usuario.trim(), cid: p.client_id, ru: p.redirect_uri, cc: p.code_challenge }, 300);
  const destino = new URL(p.redirect_uri);
  destino.searchParams.set("code", code);
  if (p.state) destino.searchParams.set("state", p.state);
  return Response.redirect(destino.toString(), 303);
}
