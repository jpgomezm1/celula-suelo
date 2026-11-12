// KMZ de una cartera o estudio por perfil guardado, para Google Earth.
import { kmzEstudio } from "@/lib/kmz_exportar";

export const maxDuration = 300;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await kmzEstudio(id);
  if (!r) return new Response("Estudio no encontrado o sin lotes", { status: 404 });
  return new Response(new Uint8Array(r.buffer), { headers: { "content-type": "application/vnd.google-earth.kmz",
    "content-disposition": `attachment; filename="${r.nombre.replace(/[^\w\- .·]+/g, "")}.kmz"` } });
}
