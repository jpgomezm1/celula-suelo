// Estudio de cabida (presentación HTML). Protegido por el proxy (correo y clave del workspace).
import { obtenerEstudio } from "@/lib/estudios";
import { imagenesEstudio } from "@/lib/estudio_cabida";
import { renderEstudioCabida } from "@/lib/estudio_cabida_html";
import { referentesDatos } from "@/lib/estilo";

export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e: any = await obtenerEstudio(id);
  if (!e || e.resultado?.tipo !== "estudio_cabida") return new Response("Estudio no encontrado", { status: 404 });
  const refs = e.resultado.estilo?.id ? (await referentesDatos(e.resultado.estilo.id, 4).catch(() => [])).map((x: any) => ({ ...x, b64: Buffer.from(x.datos).toString("base64") })) : [];
  return new Response(renderEstudioCabida(e.resultado, await imagenesEstudio(id), refs), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
