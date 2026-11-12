// KMZ de un lote para Google Earth: /api/kmz?id=…  (&ocupacion=0.3 para tipología de torres)
import { kmzLote } from "@/lib/kmz_exportar";

export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const r = await kmzLote(String(q.get("id") ?? ""), q.get("ocupacion") ? Number(q.get("ocupacion")) : undefined);
  if (!r) return new Response("Lote no encontrado", { status: 404 });
  return new Response(new Uint8Array(r.buffer), { headers: { "content-type": "application/vnd.google-earth.kmz",
    "content-disposition": `attachment; filename="${r.nombre.replace(/[^\w\- .·]+/g, "").replace(/:/g, "-")}.kmz"` } });
}
