// Norma del proyecto de revisión del POT de Medellín (Proyecto de Acuerdo 104 de 2026, Tomo V v3, julio de 2026) y su
// comparación con la norma 2014 cargada. Es preliminar: el texto aprobado por el Concejo el 5 de noviembre puede tener cambios.
import { sql } from "./db";

export const ESTADO_2026 = "Proyecto de Acuerdo 104 de 2026 (Tomo V, versión 3, julio de 2026). Preliminar: el texto aprobado por el Concejo el 5 de noviembre de 2026 puede tener cambios y falta la cartografía oficial; se asume que el polígono conserva su delimitación.";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function normas2026(codigos: (string | null | undefined)[]) {
  const cs = [...new Set(codigos.filter(Boolean))] as string[];
  if (!cs.length) return new Map<string, any>();
  const rows = await sql`SELECT e.c14, n.* FROM norma_pot2026_equivalencia e JOIN norma_pot2026 n ON n.codigo = e.c26 WHERE e.c14 = ANY(${cs}::text[])`;
  return new Map(rows.map((r: any) => [r.c14, r]));
}

/** Bloque "POT 2026" de un predio de Medellín, con la comparación frente a la norma 2014. */
export function bloque2026(p: any, r: any | undefined, au = 65) {
  if (p.municipio_dane !== "05001") return null;
  if (!r) return { disponible: false, motivo: "El polígono de este predio no aparece legible en las tablas del proyecto de acuerdo (Zona 1, centralidades rurales y algunos polígonos especiales): se mantiene la norma 2014.", estado: ESTADO_2026 };
  const area = n(p.area_lote) ?? 0;
  const ic = n(r.ic_residencial), dens = n(r.densidad_viv_ha);
  const icD = ic !== null && n(r.ic_adicional) !== null ? ic + n(r.ic_adicional)! : null;
  const densD = dens !== null && n(r.densidad_adicional_viv_ha) !== null ? dens + n(r.densidad_adicional_viv_ha)! : null;
  const construible = ic !== null ? Math.round(area * ic) : null;
  const viv = dens !== null ? Math.floor((dens * area) / 10000) : null;
  const construibleD = icD !== null ? Math.round(area * icD) : null;
  const vivD = densD !== null ? Math.floor((densD * area) / 10000) : null;
  const unidades = (c: number | null, v: number | null) => (c ? Math.min(Math.floor((c * 0.8) / au), v ?? Infinity) : v);
  const ic14 = n(p.ic_max), dens14 = n(p.densidad_max), construible14 = n(p.area_construible_inferida), viv14 = n(p.viviendas_max_inferidas);
  const delta = (a: number | null, b: number | null) => (a !== null && b !== null && b !== 0 ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)} %` : null);
  return {
    disponible: true, codigo_2026: r.codigo, estado: ESTADO_2026, fuente: r.url,
    norma: { densidad_viv_ha: dens, indice_construccion_residencial: ic, indices_ocupacion: { baja_mixtura_lote_menor_2000m2: n(r.io_baja_menor_2000), baja_mixtura_lote_mayor_2000m2: n(r.io_baja_mayor_2000), media_mixtura: n(r.io_media), alta_mixtura: n(r.io_alta) },
      indice_construccion_otros_usos: { baja: n(r.ic_otros_baja), media: n(r.ic_otros_media), alta: n(r.ic_otros_alta) },
      derechos_adicionales: n(r.ic_adicional) !== null ? { densidad_adicional_viv_ha: n(r.densidad_adicional_viv_ha), ic_adicional: n(r.ic_adicional), densidad_total_viv_ha: densD, ic_total: icD } : null },
    que_se_puede_hacer: { area_construible_m2: construible, viviendas_max_por_densidad: viv, unidades_estimadas: unidades(construible, viv),
      con_derechos: icD !== null ? { area_construible_m2: construibleD, viviendas_max_por_densidad: vivD, unidades_estimadas: unidades(construibleD, vivD) } : null },
    frente_a_2014: {
      indice_construccion: { pot2014: ic14, pot2026: ic, cambio: delta(ic, ic14) },
      densidad_viv_ha: { pot2014: dens14, pot2026: dens, cambio: delta(dens, dens14) },
      area_construible_m2: { pot2014: construible14 !== null ? Math.round(construible14) : null, pot2026: construible, cambio: delta(construible, construible14) },
      viviendas: { pot2014: viv14, pot2026: viv, cambio: delta(viv, viv14) },
      lectura: ic !== null && ic14 !== null ? (ic > ic14 ? "El proyecto de POT 2026 sube el aprovechamiento de este lote." : ic < ic14 ? "El proyecto de POT 2026 baja el aprovechamiento de este lote." : "El índice de construcción se mantiene.") : null,
    },
  };
}

export async function bloque2026Predio(p: any, au = 65) {
  if (p?.municipio_dane !== "05001") return null;
  const m = await normas2026([p.codigo_tratamiento]);
  return bloque2026(p, m.get(p.codigo_tratamiento), au);
}
