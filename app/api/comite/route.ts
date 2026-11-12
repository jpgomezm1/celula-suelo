// Carpeta para el comité de tierras en PDF: GET /api/comite?id=…(&costo_lote=…) con las mismas opciones del anteproyecto.
import { anteproyecto } from "@/lib/cabida/proyecto";
import { modeloFinanciero } from "@/lib/finanzas/modelo";
import { carpetaComite } from "@/lib/comite/carpeta";
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
  const pdf = await carpetaComite(m, f, perfil);
  const nombre = `Comite de tierras ${String(m.predio).replace(":", "-")} ${new Date().toISOString().slice(0, 10)}.pdf`;
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nombre}"` } });
}
