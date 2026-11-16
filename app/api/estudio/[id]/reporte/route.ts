// Reporte visual de lote (HTML). Protegido por el proxy (correo y clave del workspace).
import { obtenerEstudio } from "@/lib/estudios";
import { renderReporte } from "@/lib/reporte_html";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e: any = await obtenerEstudio(id);
  if (!e || e.resultado?.tipo !== "reporte_lote") return new Response("Reporte no encontrado", { status: 404 });
  return new Response(renderReporte(e.resultado, { ...(e.entrada?.textos ?? {}), ...(e.textos ?? {}) }), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" },
  });
}
