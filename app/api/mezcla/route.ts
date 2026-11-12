// Mezcla óptima de producto para un lote: GET /api/mezcla?id=…(&costo_lote=…) con las mismas opciones del anteproyecto.
import { mezclaOptima } from "@/lib/finanzas/mezcla";
import { perfilDeRequest, opcionesConPerfil } from "@/lib/constructora/sesion";
import { opcionesDe } from "@/lib/cabida/opciones";

export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const perfil = await perfilDeRequest(req);
  const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const r = await mezclaOptima(String(q.get("id") ?? ""), opcionesConPerfil(opcionesDe(q), perfil), perfil,
    { costo_lote: n("costo_lote"), estrato: n("estrato"), max_estudio_pct: n("max_estudio_pct"), max_por_tipo_pct: n("max_por_tipo_pct"), segundos: 90 });
  return Response.json(r);
}
