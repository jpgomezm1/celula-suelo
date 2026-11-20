// Estudio de cabida (presentación HTML). Protegido por el proxy (correo y clave del workspace).
import { obtenerEstudio } from "@/lib/estudios";
import { imagenesEstudio } from "@/lib/estudio_cabida";
import { renderEstudioCabida } from "@/lib/estudio_cabida_html";

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e: any = await obtenerEstudio(id);
  if (!e || e.resultado?.tipo !== "estudio_cabida") return new Response("Estudio no encontrado", { status: 404 });
  return new Response(renderEstudioCabida(e.resultado, await imagenesEstudio(id)), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
