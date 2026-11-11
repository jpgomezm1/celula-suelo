// Lectura de exportaciones de Galería Inmobiliaria. Sin dependencias de servidor: corre en Node y en el navegador
// (el navegador lee el Excel de ~30 MB y solo envía las filas, porque Vercel limita las peticiones a 4,5 MB).
import type ExcelJS from "exceljs";

export const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

// Encabezado de Galería → columna de galeria_proyecto
export const COLUMNAS: Record<string, string> = {
  "codigo": "codigo", "ciudad": "ciudad", "proyecto": "proyecto", "vende": "vende", "construye": "construye", "direccion": "direccion",
  "zona": "zona", "sub zona": "sub_zona", "estrato": "estrato", "$ prom. oferta m2": "precio_m2_oferta", "meses activo": "meses_activo",
  "fecha inicio ventas": "fecha_inicio_ventas", "ventas promedio semestre (un)": "ventas_prom_semestre_un",
  "$ ventas promedio semestre (mm)": "ventas_prom_semestre_mm", "puesto zonas valores": "puesto_zona",
  "calificacion % valores zona": "calificacion_zona", "total unidades del proyecto": "unidades_total", "ventas totales (un)": "ventas_total_un",
  "unidades disponibles": "unidades_disponibles", "unidades por lanzar": "unidades_por_lanzar", "% vendido total (un)": "pct_vendido",
  "ventas promedio total (un)": "ventas_prom_total_un", "capacidad ventas proyecto (mm)": "capacidad_ventas_mm",
  "capacidad ventas oferta (mm)": "capacidad_oferta_mm", "capacidad ventas actual + futura (mm)": "capacidad_actual_futura_mm",
  "meses que lleva en venta": "meses_en_venta", "meses faltante en venta": "meses_faltantes", "fecha entrega ult. etapa": "fecha_entrega",
  "precio promedio oferta (mm)": "precio_prom_oferta_mm", "area promedio ventas": "area_prom_ventas", "ventas mes (un)": "ventas_mes_un",
  "$ ventas mes (mm)": "ventas_mes_mm", "area promedio oferta": "area_prom_oferta", "tipo": "tipo",
  "tipo de vivienda (vis o no vis)": "tipo_vivienda", "financiera": "financiera", "fiduciaria": "fiduciaria", "lote futuro": "lote_futuro",
  "estado obra": "estado_obra", "certificacion de sostenibilidad": "certificacion", "entrega (obra gris o acabados)": "entrega",
  "se vende en smlv": "smlv",
  // Base competitividad (exportación ampliada)
  "fecha terminacion de obra ult. etapa": "fecha_entrega", "puesto ciudad": "puesto_ciudad", "puesto filtro": "puesto_filtro",
  "calificacion % valores del filtro": "calificacion_filtro", "nit constructor": "nit_constructor", "gerenciador": "gerenciador",
  "municipio": "municipio", "descuento": "descuento",
};
const NUMERICAS = new Set(["estrato", "precio_m2_oferta", "meses_activo", "ventas_prom_semestre_un", "ventas_prom_semestre_mm", "puesto_zona",
  "calificacion_zona", "unidades_total", "ventas_total_un", "unidades_disponibles", "unidades_por_lanzar", "pct_vendido", "ventas_prom_total_un",
  "capacidad_ventas_mm", "capacidad_oferta_mm", "capacidad_actual_futura_mm", "meses_en_venta", "meses_faltantes", "precio_prom_oferta_mm",
  "area_prom_ventas", "ventas_mes_un", "ventas_mes_mm", "area_prom_oferta", "puesto_ciudad", "puesto_filtro", "calificacion_filtro"]);
const FECHAS = new Set(["fecha_inicio_ventas", "fecha_entrega"]);

function valor(c: ExcelJS.CellValue): unknown {
  if (c === null || c === undefined) return null;
  if (c instanceof Date) return c;
  if (typeof c === "object" && "result" in (c as any)) return (c as any).result;
  if (typeof c === "object" && "richText" in (c as any)) return (c as any).richText.map((t: any) => t.text).join("");
  return c;
}

export function leerLibroGaleria(wb: ExcelJS.Workbook) {
  const filas = new Map<string, Record<string, unknown>>();
  wb.eachSheet((ws) => {
    let mapa: Record<number, string> | null = null;
    ws.eachRow((row) => {
      const celdas = (row.values as ExcelJS.CellValue[]).map(valor);
      const textos = celdas.map(norm);
      if (textos.includes("codigo") && textos.includes("proyecto")) {
        mapa = {};
        textos.forEach((t, i) => { if (COLUMNAS[t] && !Object.values(mapa!).includes(COLUMNAS[t])) mapa![i] = COLUMNAS[t]; });
        return;
      }
      if (!mapa) return;
      const r: Record<string, unknown> = {};
      for (const [i, col] of Object.entries(mapa)) {
        let v = celdas[Number(i)];
        if (NUMERICAS.has(col)) v = typeof v === "number" ? v : v === null || v === "N.A" ? null : Number(String(v).replace(",", ".")) || null;
        else if (FECHAS.has(col)) v = v instanceof Date ? v.toISOString().slice(0, 10) : null;
        else v = v === null ? null : String(v).trim();
        r[col] = v;
      }
      const codigo = r.codigo ? String(r.codigo).trim() : "";
      if (!/^\d+$/.test(codigo) || !r.proyecto) { if (!codigo) mapa = null; return; }
      r.codigo = codigo;
      r.rentas_cortas = /\(vt\)|renta corta|rentas cortas/i.test(String(r.proyecto));
      // Una fila por proyecto: la que trae más campos llenos (los estudios repiten proyectos en varias hojas).
      const prev = filas.get(codigo);
      const llenos = (x: Record<string, unknown>) => Object.values(x).filter((v) => v !== null && v !== "").length;
      if (!prev || llenos(r) > llenos(prev)) filas.set(codigo, r);
    });
  });
  return [...filas.values()];
}

