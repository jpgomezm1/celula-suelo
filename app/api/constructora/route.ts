// Perfil de constructora (ADN) del usuario: GET devuelve el perfil vigente y la referencia; POST guarda el perfil de su constructora.
import { PERFIL_REFERENCIA, completarPerfil, constructoraDeUsuario, guardarPerfil, obtenerPerfil } from "@/lib/constructora/perfil";
import { usuarioDeRequest } from "@/lib/constructora/sesion";

export async function GET(req: Request) {
  const usuario = await usuarioDeRequest(req);
  const id = await constructoraDeUsuario(usuario);
  const perfil = await obtenerPerfil(id);
  return Response.json({ usuario, constructora_id: id, usa_referencia: perfil.id === "referencia", perfil, referencia: PERFIL_REFERENCIA });
}

export async function POST(req: Request) {
  const usuario = await usuarioDeRequest(req);
  const id = (await constructoraDeUsuario(usuario)) ?? "general";
  const b = await req.json().catch(() => null);
  if (!b?.perfil) return Response.json({ error: "Falta el perfil" }, { status: 400 });
  if (b.restablecer) return Response.json({ perfil: await guardarPerfil({ ...PERFIL_REFERENCIA, id, nombre: b.perfil.nombre || id }, usuario ?? undefined) });
  const perfil = completarPerfil({ ...b.perfil, id, nombre: String(b.perfil.nombre || id).slice(0, 80) });
  return Response.json({ perfil: await guardarPerfil(perfil, usuario ?? undefined) });
}
