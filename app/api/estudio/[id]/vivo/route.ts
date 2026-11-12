// Archivo .kml con un vínculo de red para Google Earth Pro: muestra la cartera y la refresca sola cada 24 h.
// El vínculo lleva un token firmado que solo da acceso de lectura al KMZ de esta cartera (vence en un año).
import { firmar } from "@/lib/auth";
import { kmlVinculo } from "@/lib/kmz";
import { obtenerEstudio } from "@/lib/estudios";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e: any = await obtenerEstudio(id);
  if (!e) return new Response("Estudio no encontrado", { status: 404 });
  const t = await firmar({ typ: "earth", est: id }, 365 * 24 * 3600);
  const base = process.env.PUBLIC_URL ?? new URL(req.url).origin;
  const kml = kmlVinculo(`${e.resultado?.estudio ?? id} (viva)`, `${base}/api/estudio/${id}/kmz?t=${encodeURIComponent(t)}`);
  return new Response(kml, { headers: { "content-type": "application/vnd.google-earth.kml+xml", "content-disposition": `attachment; filename="Cartera viva ${id}.kml"` } });
}
