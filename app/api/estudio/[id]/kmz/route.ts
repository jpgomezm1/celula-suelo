// KMZ de una cartera o estudio por perfil guardado, para Google Earth.
import { kmzEstudio, refrescarCartera } from "@/lib/kmz_exportar";

export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Llamado por el vínculo de red de Google Earth Pro (token firmado): refresca la cartera si tiene más de un día.
  if (new URL(req.url).searchParams.get("t")) await refrescarCartera(id).catch(() => {});
  const r = await kmzEstudio(id);
  if (!r) return new Response("Estudio no encontrado o sin lotes", { status: 404 });
  return new Response(new Uint8Array(r.buffer), { headers: { "content-type": "application/vnd.google-earth.kmz",
    "content-disposition": `attachment; filename="${r.nombre.replace(/[^\w\- .·]+/g, "")}.kmz"` } });
}
