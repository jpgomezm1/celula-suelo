// Prefactibilidad financiera de un lote con anteproyecto: GET /api/finanzas?id=…&costo_lote=…(&formato=xlsx)
// Acepta las mismas opciones del anteproyecto (/api/cabida) y además costo_lote, precio_m2, absorcion_mes.
// Usa el perfil de constructora (ADN) del usuario de la sesión, o el de referencia.
import { anteproyecto } from "@/lib/cabida/proyecto";
import { modeloFinanciero } from "@/lib/finanzas/modelo";
import { excelFinanzas } from "@/lib/finanzas/excel";
import { perfilDeRequest, opcionesConPerfil } from "@/lib/constructora/sesion";
import { opcionesDe } from "@/lib/cabida/opciones";

export const maxDuration = 120;

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const perfil = await perfilDeRequest(req);
  const m: any = await anteproyecto(String(q.get("id") ?? ""), opcionesConPerfil(opcionesDe(q), perfil));
  if (!m.encontrado || !m.disponible) return Response.json(m, { status: m.encontrado ? 422 : 404 });
  const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const f = await modeloFinanciero(m, perfil, { costo_lote: n("costo_lote"), precio_m2: n("precio_m2"), absorcion_mes: n("absorcion_mes"), estrato: n("estrato") ?? m.resumen.estrato });
  if (q.get("formato") === "xlsx") {
    const nombre = `Prefactibilidad ${String(m.predio).replace(":", "-")}.xlsx`;
    return new Response(new Uint8Array(await excelFinanzas(m, f)), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${nombre}"` } });
  }
  return Response.json({ predio: m.predio, barrio: m.barrio, resumen_anteproyecto: m.resumen, ...f });
}
