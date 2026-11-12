// Ficha normativa de un lote: GET /api/ficha?cbml=…|matricula=…|direccion=…|lat=…&lon=…|id=…  (&formato=pdf | json)
import { consultaNorma } from "@/lib/consulta_norma";
import { encontrarPredio } from "@/lib/ficha";
import { analizarLote } from "@/lib/analisis_lote";
import { fichaPdf } from "@/lib/pdf_ficha";
import { topografiaLote } from "@/lib/topografia";
import { entornoLote } from "@/lib/entorno";

export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const num = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const c: any = await consultaNorma({ id: q.get("id") ?? undefined, cbml: q.get("cbml") ?? undefined, matricula: q.get("matricula") ?? undefined,
    direccion: q.get("direccion") ?? undefined, lat: num("lat"), lon: num("lon"), area_unidad_m2: num("area_unidad_m2") });
  if (!c.encontrado) return Response.json(c, { status: 404 });
  const p = await encontrarPredio({ id: c.predio });
  const a = await analizarLote(p, { area_unidad_m2: num("area_unidad_m2"), tipo_vivienda: (q.get("tipo_vivienda") as any) ?? undefined, actividad: q.get("actividad") ?? undefined });
  if (q.get("formato") === "json") return Response.json({ ...c, analisis: a });
  const [topografia, entorno] = await Promise.all([topografiaLote(c.predio).catch(() => null), entornoLote(c.predio).catch(() => null)]);
  const pdf = await fichaPdf(c, a, { topografia, entorno });
  const nombre = `Ficha normativa ${String(c.predio).replace(":", "-")} ${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombre}"` } });
}
