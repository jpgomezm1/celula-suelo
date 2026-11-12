// Excel de negociaciones de la constructora.
import ExcelJS from "exceljs";
import { listarSeguimiento } from "@/lib/seguimiento";
import { constructoraDeUsuario } from "@/lib/constructora/perfil";
import { usuarioDeRequest } from "@/lib/constructora/sesion";

export async function GET(req: Request) {
  const constructora = (await constructoraDeUsuario(await usuarioDeRequest(req))) ?? "general";
  const lotes = await listarSeguimiento(constructora);
  const wb = new ExcelJS.Workbook(); wb.creator = "irrelevant · Inteligencia de suelo";
  const ws = wb.addWorksheet("Negociaciones");
  ws.columns = [{ header: "Predio", key: "predio", width: 22 }, { header: "Municipio", key: "municipio", width: 14 }, { header: "Barrio", key: "barrio", width: 22 },
    { header: "Área lote (m²)", key: "area_lote", width: 13 }, { header: "Estado", key: "estado_nombre", width: 18 }, { header: "Prioridad", key: "prio", width: 10 },
    { header: "Precio pedido", key: "precio_pedido", width: 17 }, { header: "Nuestra oferta", key: "precio_ofertado", width: 17 }, { header: "Precio acordado", key: "precio_acordado", width: 17 },
    { header: "Valor máximo (última versión)", key: "vmax", width: 22 }, { header: "Pedido vs máximo", key: "brecha", width: 15 }, { header: "Próxima acción", key: "proxima_accion", width: 36 },
    { header: "Fecha", key: "fecha", width: 12 }, { header: "Responsable", key: "responsable", width: 18 }, { header: "Actualizado", key: "act", width: 12 }];
  for (const l of lotes) ws.addRow({ ...l, prio: ["", "Alta", "Media", "Baja"][l.prioridad] ?? "", vmax: l.ultima_version?.valor_maximo_lote != null ? Number(l.ultima_version.valor_maximo_lote) : null,
    brecha: l.brecha_pct != null ? l.brecha_pct / 100 : null, fecha: l.proxima_fecha ? new Date(l.proxima_fecha) : null, act: new Date(l.actualizado_en) });
  for (const k of ["precio_pedido", "precio_ofertado", "precio_acordado", "vmax"]) ws.getColumn(k).numFmt = "$#,##0";
  ws.getColumn("brecha").numFmt = "+0%;-0%"; ws.getColumn("fecha").numFmt = "dd/mm/yyyy"; ws.getColumn("act").numFmt = "dd/mm/yyyy";
  const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF6C4DE7" } };
  ws.views = [{ state: "frozen", ySplit: 1 }]; ws.autoFilter = { from: "A1", to: "O1" };
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "content-disposition": `attachment; filename="Negociaciones ${new Date().toISOString().slice(0, 10)}.xlsx"` } });
}
