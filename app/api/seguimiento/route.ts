// Seguimiento de lotes en negociación por constructora.
// GET (todos) · GET ?id=predio (uno con historial) · POST {id, ...cambios, nota?} · DELETE ?id=predio
import { ESTADOS, actualizarSeguimiento, listarSeguimiento, obtenerSeguimiento, quitarSeguimiento } from "@/lib/seguimiento";
import { constructoraDeUsuario } from "@/lib/constructora/perfil";
import { usuarioDeRequest } from "@/lib/constructora/sesion";

async function quien(req: Request) {
  const usuario = await usuarioDeRequest(req);
  return { usuario, constructora: (await constructoraDeUsuario(usuario)) ?? "general" };
}

export async function GET(req: Request) {
  const { constructora } = await quien(req);
  const id = new URL(req.url).searchParams.get("id");
  if (id) return Response.json({ seguimiento: await obtenerSeguimiento(constructora, id), estados: ESTADOS });
  return Response.json({ lotes: await listarSeguimiento(constructora), estados: ESTADOS });
}

export async function POST(req: Request) {
  const { usuario, constructora } = await quien(req);
  const b = await req.json().catch(() => null);
  if (!b?.id) return Response.json({ error: "Falta el predio" }, { status: 400 });
  const { id, ...cambios } = b;
  try { return Response.json({ seguimiento: await actualizarSeguimiento(constructora, String(id), cambios, usuario) }); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const { constructora } = await quien(req);
  return Response.json({ quitado: await quitarSeguimiento(constructora, String(new URL(req.url).searchParams.get("id") ?? "")) });
}
