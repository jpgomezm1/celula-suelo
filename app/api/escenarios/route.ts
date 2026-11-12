// Versiones de un lote por constructora: GET ?id=predio · POST {id, nombre, parametros} · DELETE ?vid=…
import { borrarEscenario, guardarEscenario, listarEscenarios } from "@/lib/escenarios";
import { constructoraDeUsuario, obtenerPerfil } from "@/lib/constructora/perfil";
import { usuarioDeRequest } from "@/lib/constructora/sesion";

export const maxDuration = 60;
async function quien(req: Request) {
  const usuario = await usuarioDeRequest(req);
  const constructora = (await constructoraDeUsuario(usuario)) ?? "general";
  return { usuario, constructora };
}

export async function GET(req: Request) {
  const { constructora } = await quien(req);
  const id = new URL(req.url).searchParams.get("id") ?? undefined;
  return Response.json({ versiones: await listarEscenarios(constructora, id) });
}

export async function POST(req: Request) {
  const { usuario, constructora } = await quien(req);
  const b = await req.json().catch(() => null);
  if (!b?.id) return Response.json({ error: "Falta el predio" }, { status: 400 });
  try {
    const perfil = await obtenerPerfil(constructora);
    return Response.json({ version: await guardarEscenario(constructora, usuario, String(b.id), String(b.nombre ?? ""), String(b.parametros ?? ""), perfil) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 422 }); }
}

export async function DELETE(req: Request) {
  const { constructora } = await quien(req);
  const vid = Number(new URL(req.url).searchParams.get("vid"));
  return Response.json({ borrada: await borrarEscenario(constructora, vid) });
}
