// Inicio de sesión del workspace: valida usuario y clave y deja una cookie firmada por 30 días.
import { COOKIE_SESION, DURACION_SESION, firmar, origen } from "@/lib/auth";
import { validarUsuario } from "@/lib/usuarios";

export async function POST(req: Request) {
  const f = await req.formData();
  const usuario = String(f.get("usuario") ?? ""), clave = String(f.get("clave") ?? "");
  const nextRaw = String(f.get("next") ?? "/mapa");
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/mapa";
  const base = origen(req);
  const sub = await validarUsuario(usuario, clave);
  if (!sub) {
    return Response.redirect(`${base}/login?error=1&next=${encodeURIComponent(next)}`, 303);
  }
  const token = await firmar({ typ: "sesion", sub }, DURACION_SESION);
  const seguro = base.startsWith("https") ? "; Secure" : "";
  return new Response(null, { status: 303, headers: {
    location: `${base}${next}`,
    "set-cookie": `${COOKIE_SESION}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACION_SESION}${seguro}`,
  } });
}
