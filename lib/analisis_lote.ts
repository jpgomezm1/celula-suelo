// Análisis de un lote "al nivel de una consulta de norma profesional": área útil (descontando afectaciones), semáforo,
// cesiones urbanísticas, cabida en tres escenarios, usos permitidos (orientativo) y valor residual del suelo.
// Todo es inferencia sobre datos públicos: no reemplaza el concepto de norma ni la curaduría.
import { sql } from "./db";
import { bloque2026, normas2026 } from "./norma2026";
import { mercadoZona } from "./mercado";
import { prefactibilidadRapida } from "./ficha";
import { restriccionesLote } from "./restricciones";
import { inventarioLote } from "./inventario";
import { computoIndice } from "./computo_indice";

export const AVISO_LEGAL = "Análisis automático sobre información pública (catastro, POT y capas oficiales). Es orientativo: no reemplaza el concepto de norma, la consulta a la curaduría ni el estudio de títulos.";

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const r0 = (v: number | null) => (v === null || !Number.isFinite(v) ? null : Math.round(v));

/** Áreas del lote afectadas por protección (retiros a quebradas, áreas protegidas) y por amenaza alta. */
export async function afectaciones(p: any) {
  const rows = await sql`
    WITH l AS (SELECT geom FROM parcel WHERE id = ${p.id})
    SELECT z.capa, COALESCE(z.attrs->>'categoria', z.attrs->>'tipo', z.subtipo) AS tipo, z.attrs->>'grado_amenaza' AS grado,
           sum(ST_Area(ST_Intersection(z.geom, l.geom)::geography)) AS m2
    FROM l JOIN zoning_sub z ON z.municipio_dane = ${p.municipio_dane} AND z.capa IN ('proteccion', 'amenaza') AND ST_Intersects(z.geom, l.geom)
    GROUP BY 1, 2, 3`;
  const area = n(p.area_lote) ?? 0;
  const proteccion = rows.filter((r: any) => r.capa === "proteccion").map((r: any) => ({ tipo: r.tipo, m2: r0(Number(r.m2)), pct: area ? Math.round((Number(r.m2) / area) * 1000) / 10 : null }));
  const amenazaAlta = rows.filter((r: any) => r.capa === "amenaza" && /alta/i.test(r.grado ?? "")).map((r: any) => ({ tipo: String(r.tipo).replace(/_/g, " "), grado: r.grado, m2: r0(Number(r.m2)) }));
  const m2Prot = Math.min(area, proteccion.reduce((a, x) => a + (x.m2 ?? 0), 0));
  const m2Alta = Math.min(area, amenazaAlta.reduce((a, x) => a + (x.m2 ?? 0), 0));
  const descuento = Math.min(area, m2Prot + m2Alta);
  return { proteccion, amenaza_alta: amenazaAlta, area_lote_m2: r0(area), area_afectada_m2: r0(descuento), area_util_m2: r0(area - descuento),
    nota: "Área útil = lote menos suelo de protección y amenaza alta que lo cruzan. No descuenta aún vías proyectadas ni retiros viales (sin capa pública cargada)." };
}

type Luz = "verde" | "amarillo" | "rojo" | "gris";
export function semaforo(p: any, af: any, rs?: any) {
  const items: { categoria: string; luz: Luz; lectura: string }[] = [];
  const am: string[] = p.amenazas ?? [];
  const grados = am.map((a) => a.split(":")[1] ?? "");
  items.push(af.amenaza_alta.length || p.amenaza_alta
    ? { categoria: "Amenaza y riesgo", luz: "rojo", lectura: `Amenaza alta: ${af.amenaza_alta.map((x: any) => x.tipo).join(", ") || "según capa del POT"}. Requiere estudio de riesgo de detalle.` }
    : grados.some((g) => /media/i.test(g)) ? { categoria: "Amenaza y riesgo", luz: "amarillo", lectura: `Amenaza media (${am.join(", ")}): pedir estudio geotécnico.` }
    : { categoria: "Amenaza y riesgo", luz: "verde", lectura: am.length ? `Amenaza baja o muy baja (${am.map((a) => a.replace(/_/g, " ")).join(", ")}).` : "Sin amenazas cruzadas." });
  const pctProt = af.area_lote_m2 ? ((af.proteccion.reduce((a: number, x: any) => a + (x.m2 ?? 0), 0)) / af.area_lote_m2) * 100 : 0;
  items.push(pctProt > 30 ? { categoria: "Protección ambiental y retiros", luz: "rojo", lectura: `${Math.round(pctProt)} % del lote en suelo de protección (${af.proteccion.map((x: any) => x.tipo).join(", ")}).` }
    : pctProt > 0.5 ? { categoria: "Protección ambiental y retiros", luz: "amarillo", lectura: `${Math.round(pctProt * 10) / 10} % del lote en protección (${af.proteccion.map((x: any) => x.tipo).join(", ")}): se descuenta del área útil.` }
    : { categoria: "Protección ambiental y retiros", luz: "verde", lectura: "Sin suelo de protección ni retiros a quebradas cruzados." });
  if (rs?.hidrico) items.push({ categoria: "Quebradas y retiros hídricos", luz: rs.hidrico.luz, lectura: rs.hidrico.lectura });
  const t = `${p.tratamiento ?? ""} ${p.codigo_tratamiento ?? ""}`;
  items.push(/conservaci[oó]n|_C[0-9]?_|BIC/i.test(t) ? { categoria: "Patrimonio", luz: /patrimonial|BIC/i.test(t) ? "rojo" : "amarillo", lectura: `Tratamiento de ${p.tratamiento}: restricciones de intervención y altura.` }
    : { categoria: "Patrimonio", luz: "verde", lectura: "Sin tratamiento de conservación." });
  if (rs?.planificacion?.instrumentos?.length) items.push({ categoria: "Planificación complementaria", luz: rs.planificacion.luz, lectura: rs.planificacion.lectura });
  else items.push(/renovaci|desarrollo|_R_|_RE[DAV]_|_D_|_DE_/i.test(t) ? { categoria: "Planificación complementaria", luz: "amarillo", lectura: `${p.tratamiento}: requiere plan parcial (o unidad de actuación) antes de licenciar.` }
    : /API|_API_/i.test(t) ? { categoria: "Planificación complementaria", luz: "rojo", lectura: "Área para la preservación de infraestructuras (API): no apta para vivienda privada." }
    : { categoria: "Planificación complementaria", luz: "verde", lectura: "Licencia directa (sin plan parcial previo)." });
  items.push(p.pot_servicio === "derogado" ? { categoria: "Norma", luz: "rojo", lectura: "La capa pública del municipio es de un POT derogado." }
    : !n(p.ic_max) && !n(p.area_construible_inferida) ? { categoria: "Norma", luz: "amarillo", lectura: "Sin índice de construcción publicado para este predio." }
    : { categoria: "Norma", luz: "verde", lectura: `Norma numérica disponible (${p.norma_fuente ?? "servicio"}).` });
  const nc = n(p.construcciones) ?? 0;
  items.push(nc > 15 ? { categoria: "Gestión del suelo", luz: "rojo", lectura: `${nc} construcciones: probablemente muchos propietarios; exige englobe y demoliciones.` }
    : nc > 3 ? { categoria: "Gestión del suelo", luz: "amarillo", lectura: `${nc} construcciones existentes (${r0(n(p.area_construida))} m²): considerar demolición y negociación.` }
    : { categoria: "Gestión del suelo", luz: "verde", lectura: nc ? `${nc} construcción(es) menor(es).` : "Lote sin construcciones registradas." });
  if (rs?.arbolado) items.push({ categoria: "Árboles", luz: rs.arbolado.luz, lectura: rs.arbolado.lectura });
  items.push({ categoria: "Vías proyectadas", luz: "gris", lectura: "Sin dato: la capa de proyectos viales no está cargada; validar afectación vial en la curaduría." });
  const peor: Luz = items.some((i) => i.luz === "rojo") ? "rojo" : items.some((i) => i.luz === "amarillo") ? "amarillo" : "verde";
  return { general: peor, items };
}

/** Cesiones urbanísticas aproximadas con las reglas generales del POT (2014 y proyecto 2026). */
export function cesiones(p: any, viviendas: number | null, areaUtil: number) {
  const t = `${p.tratamiento ?? ""} ${p.codigo_tratamiento ?? ""}`;
  const desarrollo = /desarrollo|_D_|_DE_/i.test(t);
  const base = desarrollo ? n(p.area_lote) ?? areaUtil : areaUtil;
  const minimo = 0.18 * base;
  const porHabitantes = viviendas ? viviendas * 2.9 * 3 : 0; // 2,9 hab/vivienda (ECV) × 3 m²/hab (valor típico de la tabla del art. 280)
  const ep = Math.max(minimo, porHabitantes);
  return {
    espacio_publico_suelo_m2: r0(ep), regla: ep === minimo ? `18 % del área ${desarrollo ? "bruta" : "neta"} (mínimo del POT)` : "viviendas × 2,9 hab × 3 m²/hab (factor típico; el valor exacto varía por polígono)",
    equipamiento_construido_m2: viviendas ? viviendas * 1 : null, regla_equipamiento: "1 m² construido de equipamiento por vivienda (y 1 % del área en otros usos)",
    pct_del_lote: n(p.area_lote) ? Math.round((ep / n(p.area_lote)!) * 1000) / 10 : null,
    nota: "En renovación y desarrollo las cesiones se concretan en el plan parcial y pueden trasladarse parcialmente (hasta 50 %) o pagarse en dinero.",
  };
}

type Esc = { nombre: string; indice_construccion: number | null; densidad_viv_ha: number | null };
/** Cabida en tres escenarios (conservador, base, máximo con derechos). */
export function cabida(p: any, b26: any, opts: { area_unidad_m2?: number; area_util_m2: number; tipo_vivienda?: "VIS" | "NO VIS" }) {
  const au = opts.area_unidad_m2 ?? (opts.tipo_vivienda === "VIS" ? 50 : 65);
  const area = n(p.area_lote) ?? 0;
  const util = opts.area_util_m2 || area;
  const usa26 = b26?.disponible;
  const ic14 = n(p.ic_max), d14 = n(p.densidad_max), icT14 = n(p.ic_total) ?? ic14;
  const ic26 = usa26 ? n(b26.norma.indice_construccion_residencial) : null;
  const d26 = usa26 ? n(b26.norma.densidad_viv_ha) : null;
  const icT26 = usa26 ? (n(b26.norma.derechos_adicionales?.ic_total) ?? ic26) : null;
  const dT26 = usa26 ? (n(b26.norma.derechos_adicionales?.densidad_total_viv_ha) ?? d26) : null;
  const dT14 = d14 !== null && icT14 && ic14 ? d14 * (icT14 / ic14) : d14;
  const uso = (p.uso ?? "").toLowerCase();
  const ios = usa26 ? b26.norma.indices_ocupacion : null;
  const io = (ios ? n(/alta/.test(uso) ? ios.alta_mixtura : /media/.test(uso) ? ios.media_mixtura : area >= 2000 ? ios.baja_mixtura_lote_mayor_2000m2 : ios.baja_mixtura_lote_menor_2000m2) : null) ?? n(p.io_max) ?? 0.6;
  const altura = n(p.altura_max);
  const escenarios: Esc[] = [
    { nombre: "Conservador (POT 2014 base)", indice_construccion: ic14, densidad_viv_ha: d14 },
    { nombre: usa26 ? "Base (proyecto POT 2026)" : "Base (POT vigente)", indice_construccion: ic26 ?? ic14, densidad_viv_ha: d26 ?? d14 },
    { nombre: "Máximo (comprando derechos)", indice_construccion: icT26 ?? icT14, densidad_viv_ha: dT26 ?? dT14 },
  ];
  const parqPorViv = opts.tipo_vivienda === "VIS" ? 0.5 : 1;
  return {
    supuestos: { area_unidad_m2: au, eficiencia_vendible: 0.8, indice_ocupacion: io, parqueaderos_por_vivienda: parqPorViv, visitantes_por_vivienda: 0.2, m2_por_parqueadero_en_sotano: 28 },
    escenarios: escenarios.map((e) => {
      if (!e.indice_construccion) return { escenario: e.nombre, disponible: false };
      const construible = area * e.indice_construccion;
      const porDensidad = e.densidad_viv_ha ? Math.floor((e.densidad_viv_ha * area) / 10000) : Infinity;
      const unidades = Math.min(Math.floor((construible * 0.8) / au), porDensidad);
      const huella = util * io;
      let pisos = huella ? Math.ceil(construible / huella) : null;
      const limitadoAltura = altura && pisos && pisos > altura;
      if (limitadoAltura) pisos = altura;
      const parqueaderos = Math.ceil(unidades * (parqPorViv + 0.2));
      const sotanos = Math.ceil((parqueaderos * 28) / Math.max(util * 0.9, 1));
      return {
        escenario: e.nombre, disponible: true, indice_construccion: e.indice_construccion, densidad_viv_ha: e.densidad_viv_ha,
        area_construible_m2: r0(construible), area_vendible_m2: r0(construible * 0.8), unidades, limita: Number.isFinite(porDensidad) && porDensidad < Math.floor((construible * 0.8) / au) ? "densidad" : "área construible",
        pisos_sobre_rasante: pisos, limitado_por_altura: !!limitadoAltura, parqueaderos, sotanos_aprox: sotanos, huella_m2: r0(huella),
      };
    }),
    nota: "Cabida aproximada (no arquitectónica): retiros, aislamientos, circulaciones y la norma de parqueaderos por estrato la ajustan.",
  };
}

const ACTIVIDADES = ["vivienda", "comercio minorista", "oficinas y servicios", "restaurante", "bar o discoteca", "hotel", "alojamiento turístico (rentas cortas)", "clínica o salud", "educación", "bodega o logística", "industria liviana"] as const;
/** Usos permitidos por área de mixtura: orientativo, según el régimen general de usos del POT de Medellín. */
export function usosPermitidos(p: any, actividad?: string) {
  const u = (p.uso ?? "").toLowerCase();
  const nivel = /alta/.test(u) ? "alta" : /media/.test(u) ? "media" : /baja/.test(u) ? "baja" : /dotacional/.test(u) ? "dotacional" : /espacio p/.test(u) ? "espacio_publico" : "desconocido";
  const M: Record<string, string[]> = {
    // P = permitido, C = condicionado (escala, impacto, licencia o norma específica), X = prohibido
    baja:       ["P", "C", "C", "C", "X", "C", "X", "C", "C", "X", "X"],
    media:      ["P", "P", "P", "P", "C", "P", "C", "P", "P", "C", "C"],
    alta:       ["P", "P", "P", "P", "C", "P", "P", "P", "P", "P", "C"],
    dotacional: ["X", "X", "C", "X", "X", "X", "X", "P", "P", "X", "X"],
    espacio_publico: ACTIVIDADES.map(() => "X"),
  };
  const fila = M[nivel];
  const txt = { P: "permitido", C: "condicionado", X: "no permitido" } as Record<string, string>;
  const tabla = fila ? ACTIVIDADES.map((a, i) => ({ actividad: a, estado: txt[fila[i]] })) : null;
  const pedido = actividad && tabla ? tabla.find((t) => actividad.toLowerCase().split(/\s+/).some((w) => w.length > 3 && t.actividad.includes(w.normalize("NFD").replace(/[̀-ͯ]/g, "")))) ?? null : null;
  return { area_de_actividad: p.uso ?? "sin dato", nivel_mixtura: nivel, actividad_consultada: pedido, usos: tabla,
    nota: "Orientativo según el área de mixtura (régimen general de usos del POT y su revisión 2026, que restringe el alojamiento turístico en baja mixtura). La escala, el impacto y la actividad CIIU exacta se validan con el Anexo de agrupación de actividades y en la curaduría." };
}

/** Análisis completo de un predio de parcel_profile. */
export async function analizarLote(p: any, opts: { area_unidad_m2?: number; tipo_vivienda?: "VIS" | "NO VIS"; actividad?: string; costo_lote?: number; con_mercado?: boolean; con_inventario?: boolean } = {}) {
  const [af, n26, rs, inv] = await Promise.all([afectaciones(p), normas2026([p.codigo_tratamiento]), restriccionesLote(p.id).catch(() => null), opts.con_inventario === false ? null : inventarioLote(p.id).catch(() => null)]);
  // Fuera de Medellín los retiros hídricos no vienen en la capa de protección: se descuentan aquí (oficial o faja de referencia).
  if (rs?.hidrico && p.municipio_dane !== "05001" && (rs.hidrico.area_en_retiro_m2 ?? 0) > 0) {
    const extra = Math.min(Number(rs.hidrico.area_en_retiro_m2) || 0, Math.max(0, af.area_util_m2 ?? 0));
    af.proteccion.push({ tipo: rs.hidrico.faja_referencia_m2 ? "Retiro hídrico (faja de referencia 30 m)" : "Retiro hídrico", m2: extra, pct: af.area_lote_m2 ? Math.round((extra / af.area_lote_m2) * 1000) / 10 : null });
    af.area_afectada_m2 = (af.area_afectada_m2 ?? 0) + extra; af.area_util_m2 = Math.max(0, (af.area_util_m2 ?? 0) - extra);
  }
  const b26 = bloque2026(p, n26.get(p.codigo_tratamiento), opts.area_unidad_m2 ?? 65);
  const cab = cabida(p, b26, { area_unidad_m2: opts.area_unidad_m2, area_util_m2: af.area_util_m2 ?? 0, tipo_vivienda: opts.tipo_vivienda });
  const esBase = cab.escenarios[1] as any;
  const ces = cesiones(p, esBase?.unidades ?? null, af.area_util_m2 ?? 0);
  let valor: any = null;
  if (opts.con_mercado === true && p.lat && p.lon) { // residual financiero: solo bajo pedido
    const mercado = await mercadoZona({ lat: Number(p.lat), lon: Number(p.lon), radio_m: 1500 });
    const pf: any = prefactibilidadRapida(p, mercado, { costo_lote: opts.costo_lote, area_unidad: opts.area_unidad_m2 });
    if (pf.disponible) {
      const max = n(pf.lote_maximo_pagable);
      valor = { valor_residual_total: max, valor_residual_m2: max && n(p.area_lote) ? r0(max / n(p.area_lote)!) : null, valor_residual_legible: pf.lote_maximo_legible,
        valor_suelo_referencia_m2: r0(n(p.valor_suelo_m2)), veredicto_si_se_paga_referencia: pf.veredicto, precio_m2_venta_supuesto: pf.producto_supuesto?.precio_m2 ?? null,
        nota: "Valor residual = lo máximo que se puede pagar por el lote para que el proyecto dé margen, con precios y costos de la zona (modelo de prefactibilidad)." };
    } else valor = { disponible: false, motivo: pf.motivo };
  }
  return { area_util: af, semaforo: semaforo(p, af, rs), restricciones: rs ? { ...rs, hidrico: { ...rs.hidrico, geometria_9377: undefined } } : null, cabida: cab, computo_indice: computoIndice(p, esBase, af.area_util_m2 ?? 0, n(p.area_lote) ?? 0, opts.area_unidad_m2 ?? cab.supuestos.area_unidad_m2), inventario_zona: inv, cesiones: ces, usos: usosPermitidos(p, opts.actividad), valor_residual: valor, pot_2026_preliminar: b26, aviso_legal: AVISO_LEGAL };
}
