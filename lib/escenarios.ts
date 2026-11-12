// Versiones de un lote: cada versión guarda los parámetros (anteproyecto + números) y una foto de los resultados,
// por constructora, para comparar alternativas y ver cómo cambió el análisis en el tiempo.
import { sql } from "./db";
import { anteproyecto } from "./cabida/proyecto";
import { opcionesDe } from "./cabida/opciones";
import { modeloFinanciero } from "./finanzas/modelo";
import { opcionesConPerfil } from "./constructora/sesion";
import type { PerfilConstructora } from "./constructora/perfil";

let lista = false;
async function asegurar() {
  if (lista) return;
  await sql`CREATE TABLE IF NOT EXISTS escenario_lote (id bigserial PRIMARY KEY, predio text NOT NULL, constructora_id text NOT NULL, nombre text NOT NULL,
    parametros text NOT NULL, resultado jsonb NOT NULL, creado_por text, creado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS escenario_lote_predio ON escenario_lote (constructora_id, predio)`;
  lista = true;
}

/** Recalcula en el servidor (así la versión refleja exactamente lo guardado) y guarda la foto de resultados. */
export async function guardarEscenario(constructora: string, usuario: string | null, predio: string, nombre: string, parametros: string, perfil: PerfilConstructora) {
  await asegurar();
  const q = new URLSearchParams(parametros); q.set("id", predio);
  const m: any = await anteproyecto(predio, opcionesConPerfil(opcionesDe(q), perfil));
  if (!m.disponible) throw new Error(m.mensaje ?? "No se pudo armar el anteproyecto");
  const n = (k: string) => (q.get(k) ? Number(q.get(k)) : undefined);
  const f: any = await modeloFinanciero(m, perfil, { costo_lote: n("costo_lote"), precio_m2: n("precio_m2"), absorcion_mes: n("absorcion_mes"), estrato: n("estrato") ?? m.resumen.estrato, sin_sensibilidades: true });
  const r = m.resumen;
  const resultado = {
    perfil: perfil.nombre, escenario_norma: r.escenario, mezcla: (r.por_tipologia as any[]).map((t) => `${t.tipologia} ${t.pct} %`).join(" · "),
    torres: r.torres, pisos: r.pisos_totales, unidades: r.unidades, area_vendible_m2: r.area_vendible_m2, sotanos: r.sotanos, parqueaderos: r.parqueaderos_dibujados,
    aprovechamiento_pct: r.aprovechamiento_pct, precio_m2_mercado: f.mercado.precio_m2_mediano, absorcion_mes: f.mercado.absorcion_usada_mes,
    ventas: f.resultado.ventas, costo_total: f.resultado.costo_total, utilidad: f.resultado.utilidad, margen_pct: f.resultado.margen_pct, tir_ea_pct: f.resultado.tir_ea_pct,
    exposicion_maxima: f.resultado.exposicion_maxima, duracion_meses: f.resultado.duracion_meses, costo_lote: n("costo_lote") ?? null, valor_maximo_lote: f.lote.valor_maximo,
    veredicto: f.veredicto, costo_directo_m2: f.presupuesto.costo_directo_m2,
  };
  const limpio = new URLSearchParams([...q.entries()].filter(([k]) => k !== "id")).toString();
  const [row] = await sql`INSERT INTO escenario_lote (predio, constructora_id, nombre, parametros, resultado, creado_por)
    VALUES (${predio}, ${constructora}, ${nombre.slice(0, 80) || "Versión"}, ${limpio}, ${JSON.stringify(resultado)}::jsonb, ${usuario}) RETURNING id, creado_en`;
  return { id: Number(row.id), predio, nombre, parametros: limpio, resultado, creado_en: row.creado_en, creado_por: usuario };
}

export async function listarEscenarios(constructora: string, predio?: string) {
  await asegurar();
  const rs = predio
    ? await sql`SELECT id, predio, nombre, parametros, resultado, creado_por, creado_en FROM escenario_lote WHERE constructora_id = ${constructora} AND predio = ${predio} ORDER BY creado_en`
    : await sql`SELECT id, predio, nombre, parametros, resultado, creado_por, creado_en FROM escenario_lote WHERE constructora_id = ${constructora} ORDER BY creado_en DESC LIMIT 200`;
  return rs.map((r: any) => ({ ...r, id: Number(r.id) }));
}

export async function borrarEscenario(constructora: string, id: number) {
  await asegurar();
  const rs = await sql`DELETE FROM escenario_lote WHERE id = ${id} AND constructora_id = ${constructora} RETURNING id`;
  return rs.length > 0;
}
