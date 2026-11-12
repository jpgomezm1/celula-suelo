// Cabida arquitectónica esquemática: GET /api/cabida?id=…&formato=json|dxf (&local=1 para coordenadas locales)
// Parámetros opcionales: escenario, area_unidad_m2, retiro_frontal_m, retiro_lateral_m, separacion_torres_m,
// profundidad_torre_m, largo_max_torre_m, pisos_plataforma, altura_piso_m, max_torres.
import { cabidaArquitectonica, opcionesDe } from "@/lib/cabida_modelo";
import { cabidaADxf } from "@/lib/dxf";

export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const m: any = await cabidaArquitectonica(String(q.get("id") ?? ""), opcionesDe(q));
  if (!m.encontrado) return Response.json(m, { status: 404 });
  if (q.get("formato") !== "dxf") return Response.json(m);
  if (!m.disponible) return Response.json(m, { status: 422 });
  const nombre = `Cabida ${String(m.predio).replace(":", "-")} ${m.resumen.torres}T ${m.resumen.pisos_totales}P ${m.resumen.unidades}U.dxf`;
  return new Response(cabidaADxf(m, { local: q.get("local") === "1" }), { headers: { "content-type": "application/dxf", "content-disposition": `attachment; filename="${nombre}"` } });
}
