// Estudio general por perfil de edificio: dado un producto (unidades, área por unidad, pisos, VIS/NO VIS, precio objetivo),
// recorre todos los lotes de un municipio, deja los que la norma permite y los ordena por encaje, mercado y señales de venta.
// Todo es inferencia para priorizar visitas y estudios; no reemplaza una cabida ni un avalúo.
import { sql } from "./db";
import { resolverMunicipio } from "./mercado";
import { avisoPOT } from "./norma_aviso";
import { clasePendiente, encajeTopografia, pendientesRapidas, topografiaLote, type PreferenciaTopo } from "./topografia";

export type PerfilEdificio = {
  municipio?: string;
  barrios?: string[];
  nombre?: string;
  tipo_vivienda?: "VIS" | "NO VIS" | "todos";
  unidades_min?: number;
  unidades_max?: number;
  area_unidad_m2?: number;
  pisos_min?: number;
  area_lote_min?: number;
  area_lote_max?: number;
  precio_m2_objetivo?: number;
  eficiencia?: number;
  permitir_compra_derechos?: boolean;
  max_construcciones?: number;
  norma?: "2014" | "2026";
  /** Topografía que prefiere la constructora: no es buena ni mala, es encaje con su forma de construir. */
  topografia?: PreferenciaTopo;
  limite?: number;
};

const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const mediana = (xs: number[]) => {
  const v = xs.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

export async function oportunidadesPorPerfil(p: PerfilEdificio) {
  const mun = await resolverMunicipio(p.municipio ?? "Medellín");
  if (!mun) return { error: `Municipio no reconocido: ${p.municipio}` };
  const tipo = p.tipo_vivienda ?? "todos";
  const au = p.area_unidad_m2 ?? (tipo === "VIS" ? 50 : 65);
  const ef = clamp(p.eficiencia ?? 0.8, 0.5, 0.95);
  const umin = Math.max(1, p.unidades_min ?? 100);
  const umax = p.unidades_max ?? null;
  const pisos = p.pisos_min ?? null;
  const derechos = p.permitir_compra_derechos ?? true;
  const limite = Math.min(Math.max(p.limite ?? 25, 1), 100);
  const usa26 = p.norma === "2026" && mun.dane === "05001";
  const barrios = (p.barrios ?? []).map((b) => `%${b.trim()}%`).filter((b) => b.length > 2);

  // 1. Lotes que la norma permite para el perfil (todo el municipio, sin mercado).
  const candidatos = await sql`
    WITH n AS (
      -- Norma a usar: la del POT 2014 cargada o, si se pide, la del proyecto de revisión 2026 (v3, julio de 2026)
      SELECT pp.*,
             CASE WHEN ${usa26} THEN pp.area_lote * n26.ic_residencial ELSE pp.area_construible_inferida END AS c_base,
             CASE WHEN ${usa26} THEN n26.densidad_viv_ha * pp.area_lote / 10000.0 ELSE pp.viviendas_max_inferidas END AS v_base,
             CASE WHEN ${usa26} THEN n26.ic_residencial + COALESCE(n26.ic_adicional, 0) ELSE COALESCE(pp.ic_total, pp.ic_max) END AS ic_tope,
             CASE WHEN ${usa26} THEN (n26.densidad_viv_ha + COALESCE(n26.densidad_adicional_viv_ha, 0)) * pp.area_lote / 10000.0
                  ELSE pp.densidad_max * pp.area_lote / 10000.0 * CASE WHEN pp.ic_total > pp.ic_max THEN pp.ic_total / NULLIF(pp.ic_max, 0) ELSE 1 END END AS v_tope,
             CASE WHEN ${usa26} THEN n26.codigo END AS codigo_2026
      FROM parcel_profile pp
      LEFT JOIN norma_pot2026_equivalencia e ON ${usa26} AND e.c14 = pp.codigo_tratamiento
      LEFT JOIN norma_pot2026 n26 ON n26.codigo = e.c26
      WHERE pp.municipio_dane = ${mun.dane} AND (NOT ${usa26} OR n26.codigo IS NOT NULL)
    ),
    base AS (
      SELECT id, municipio, barrio_catastral, area_lote, tratamiento, codigo_tratamiento, codigo_2026, uso, altura_max, ic_max, ic_total, densidad_max,
             c_base AS construible, v_base AS viv_max, area_construida, construcciones, pisos_max,
             valor_suelo_m2, nivel_dato, norma_fuente, lat, lon,
             LEAST(floor(c_base * ${ef} / ${au}), COALESCE(floor(v_base), 1e9))::int AS u_base,
             LEAST(floor(area_lote * ic_tope * ${ef} / ${au}), COALESCE(floor(v_tope), 1e9))::int AS u_derechos
      FROM n
      WHERE tipo_desarrollable AND clase = 'U'
        AND NOT COALESCE(amenaza_alta, false) AND COALESCE(cardinality(protecciones), 0) = 0
        AND c_base > 0
        AND COALESCE(uso, '') NOT ILIKE 'Espacio P%' AND COALESCE(uso, '') NOT ILIKE '%Dotacional%'
        AND (${p.max_construcciones ?? null}::int IS NULL OR COALESCE(construcciones, 0) <= ${p.max_construcciones ?? null})
        AND (${p.area_lote_min ?? null}::numeric IS NULL OR area_lote >= ${p.area_lote_min ?? null})
        AND (${p.area_lote_max ?? null}::numeric IS NULL OR area_lote <= ${p.area_lote_max ?? null})
        AND (${pisos}::numeric IS NULL OR altura_max IS NULL OR altura_max >= ${pisos})
        AND (${barrios.length ? barrios : null}::text[] IS NULL OR barrio_catastral ILIKE ANY (${barrios.length ? barrios : null}::text[]))
    )
    SELECT * FROM base
    WHERE u_base >= ${umin} OR (${derechos} AND u_derechos >= ${umin})
    ORDER BY (u_base >= ${umin}) DESC, COALESCE(area_construida, 0) / NULLIF(area_lote, 0) ASC, construible DESC`;

  const total = candidatos.length;
  const porBarrio = new Map<string, { barrio: string; lotes: number; area_lote_total: number; unidades_posibles: number }>();
  for (const c of candidatos as any[]) {
    const k = c.barrio_catastral ?? "(sin barrio)";
    const b = porBarrio.get(k) ?? { barrio: k, lotes: 0, area_lote_total: 0, unidades_posibles: 0 };
    b.lotes++; b.area_lote_total += Number(c.area_lote); b.unidades_posibles += Math.max(c.u_base, 0);
    porBarrio.set(k, b);
  }

  // 2. Mercado y señales solo para los mejores 300 candidatos (las consultas espaciales son lo costoso).
  const ids = (candidatos as any[]).slice(0, 300).map((c) => c.id);
  const mercado = ids.length ? await sql`
    WITH c AS (SELECT id, ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography AS g FROM parcel_profile WHERE id = ANY(${ids}::text[]))
    SELECT c.id, m.inventario, m.precio_m2_usados, d.pedidos, pr.proyectos, pr.precio_m2_proyectos,
           ga.galeria_proyectos, ga.galeria_precio_m2, ga.galeria_ventas_mes, ga.galeria_oferta, ga.galeria_por_lanzar,
           s.registro AS matricula, s.sucesion, s.derechos_de_cuota, s.dacion_en_pago, s.señal_empresa AS senal_empresa,
           s.fiducia, s.litigio, s.oferta_compra_publica, s.ultima_compraventa,
           (s.ultimo_embargo IS NOT NULL AND (s.ultima_cancelacion IS NULL OR s.ultima_cancelacion < s.ultimo_embargo)) AS embargo_vigente
    FROM c
    LEFT JOIN parcel_senales s ON s.parcel_id = c.id
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS inventario, percentile_cont(0.5) WITHIN GROUP (ORDER BY l.precio_m2)::bigint AS precio_m2_usados
      FROM listing l WHERE l.activa AND l.negocio = 'venta' AND l.tipo LIKE 'apartamento%' AND l.precio >= 30000000
        AND ST_DWithin(l.geom::geography, c.g, 1000)) m
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS pedidos FROM demand_request dr
      WHERE dr.fecha > now() - interval '90 days' AND COALESCE(dr.estado, '') NOT IN ('retirado', 'reemplazado')
        AND dr.barrio_ids && ARRAY(SELECT b.id FROM fynder_barrio b WHERE ST_DWithin(b.pt::geography, c.g, 1000))) d
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS proyectos, percentile_cont(0.5) WITHIN GROUP (ORDER BY p.precio_m2_desde)::bigint AS precio_m2_proyectos
      FROM project p WHERE p.estado = 'activo' AND ST_DWithin(p.geom::geography, c.g, 1500)) pr
    CROSS JOIN LATERAL (
      SELECT count(*)::int AS galeria_proyectos, percentile_cont(0.5) WITHIN GROUP (ORDER BY g.precio_m2_oferta)::bigint AS galeria_precio_m2,
             sum(g.ventas_prom_semestre_un)::numeric AS galeria_ventas_mes, sum(g.unidades_disponibles)::int AS galeria_oferta,
             sum(g.unidades_por_lanzar)::int AS galeria_por_lanzar
      FROM galeria_vigente g WHERE g.geom IS NOT NULL AND (g.tipo IS NULL OR g.tipo ILIKE 'Apto%') AND ST_DWithin(g.geom::geography, c.g, 2000)
        AND (${tipo} = 'todos' OR (${tipo} = 'VIS' AND g.tipo_vivienda ILIKE '%VIS%' AND g.tipo_vivienda NOT ILIKE 'NO VIS%')
             OR (${tipo} = 'NO VIS' AND g.tipo_vivienda ILIKE '%NO VIS%'))) ga` : [];
  const mk = new Map((mercado as any[]).map((r) => [r.id, r]));

  const evaluados = (candidatos as any[]).slice(0, 300).map((c) => {
    const m: any = mk.get(c.id) ?? {};
    const conDerechos = c.u_base < umin;
    const uPosibles = conDerechos ? c.u_derechos : c.u_base;
    const uProyecto = umax ? Math.min(uPosibles, umax) : uPosibles;
    const pisosNecesarios = Math.ceil((uProyecto * au / ef) / (Number(c.area_lote) * 0.6));
    const ocupacion = Number(c.area_construida ?? 0) / Number(c.area_lote);

    const precioZona = Number(m.galeria_precio_m2 || m.precio_m2_proyectos || m.precio_m2_usados) || null;
    const fuentePrecio = m.galeria_precio_m2 ? "Galería (proyectos nuevos a 2 km)" : m.precio_m2_proyectos ? "proyectos nuevos a 1,5 km" : m.precio_m2_usados ? "usados en venta a 1 km" : null;
    let fPrecio = 0;
    let lecturaPrecio = "Sin precio de referencia en la zona";
    if (precioZona && p.precio_m2_objetivo) {
      const desv = p.precio_m2_objetivo / precioZona - 1;
      fPrecio = Math.round(20 * clamp(1 - (Math.abs(desv) - 0.1) / 0.25));
      lecturaPrecio = `Precio objetivo ${desv >= 0 ? "+" : ""}${Math.round(desv * 100)}% frente a la zona ($${(precioZona / 1e6).toFixed(1)} M/m², ${fuentePrecio})`;
    } else if (precioZona && c.valor_suelo_m2) {
      const rel = precioZona / Number(c.valor_suelo_m2);
      fPrecio = Math.round(20 * clamp((rel - 1) / 5));
      lecturaPrecio = `La zona vende a $${(precioZona / 1e6).toFixed(1)} M/m² (${fuentePrecio}), ${rel.toFixed(1)}× el valor de referencia del suelo`;
    }

    const ventas = Number(m.galeria_ventas_mes) || 0;
    const meses = ventas > 0 ? (Number(m.galeria_oferta || 0) + Number(m.galeria_por_lanzar || 0)) / ventas : null;
    const fAbsorcion = m.galeria_proyectos ? (meses === null ? 0 : Math.round(15 * clamp(1 - (meses - 12) / 30))) : m.proyectos > 0 ? 5 : 0;
    const presion = m.inventario > 0 ? m.pedidos / m.inventario : m.pedidos > 0 ? 1 : 0;
    const fDemanda = Math.round(15 * clamp(presion / 0.6));
    const favorables = [m.sucesion, m.embargo_vigente, m.dacion_en_pago, m.senal_empresa].filter(Boolean).length;
    const riesgos = [m.fiducia, m.litigio, m.oferta_compra_publica].filter(Boolean).length;
    const reciente = m.ultima_compraventa && Date.now() - new Date(m.ultima_compraventa).getTime() < 3 * 365 * 864e5;
    const fSenales = m.matricula ? Math.round(clamp((5 * favorables + (m.derechos_de_cuota ? 2 : 0) - 5 * riesgos - (reciente ? 4 : 0)) / 10) * 10) : 0;
    const fEncaje = conDerechos ? 18 : umax && uPosibles > umax * 2 ? 24 : 30;
    const nConstr = Number(c.construcciones ?? 0);
    const fFacilidad = Math.round(10 * clamp(1 - ocupacion / 2.5) * clamp(1 - (nConstr - 3) / 30));

    const factores = { encaje_normativo: fEncaje, precio: fPrecio, absorcion: fAbsorcion, demanda: fDemanda, senales_de_venta: fSenales, facilidad: fFacilidad };
    const senales = [m.sucesion && "heredado", m.embargo_vigente && "embargo sin cancelar", m.dacion_en_pago && "dación en pago",
      m.senal_empresa && "titular probable empresa", m.derechos_de_cuota && "copropiedad", m.fiducia && "fiducia (riesgo)",
      m.litigio && "litigio (riesgo)", m.oferta_compra_publica && "oferta de compra pública (riesgo)", reciente && "comprado hace poco"].filter(Boolean);
    return {
      id: c.id, barrio: c.barrio_catastral, municipio: c.municipio, lat: Number(c.lat), lon: Number(c.lon),
      area_lote_m2: Math.round(Number(c.area_lote)), tratamiento: c.tratamiento, codigo_tratamiento: c.codigo_tratamiento, codigo_pot_2026: c.codigo_2026 ?? null, uso: c.uso,
      norma: { altura_max_pisos: c.altura_max, ic_base: c.ic_max, ic_con_derechos: c.ic_total, densidad_viv_ha: c.densidad_max, fuente: c.norma_fuente },
      unidades_posibles: uPosibles, requiere_compra_derechos: conDerechos, pisos_aprox_con_ocupacion_60: pisosNecesarios,
      construccion_actual: { construcciones: Number(c.construcciones ?? 0), area_construida_m2: Math.round(Number(c.area_construida ?? 0)), pisos_max: c.pisos_max },
      valor_suelo_m2: c.valor_suelo_m2 ? Math.round(Number(c.valor_suelo_m2)) : null,
      mercado: {
        precio_m2_referencia: precioZona, fuente_precio: fuentePrecio,
        galeria: m.galeria_proyectos ? { proyectos_2km: m.galeria_proyectos, ventas_mes: ventas, oferta: m.galeria_oferta, por_lanzar: m.galeria_por_lanzar, meses_inventario: meses ? Math.round(meses * 10) / 10 : null } : null,
        proyectos_nuevos_1500m: m.proyectos ?? 0, usados_en_venta_1km: m.inventario ?? 0, pedidos_compradores_90d_1km: m.pedidos ?? 0,
      },
      folio: m.matricula ?? null, senales_de_venta: senales,
      puntaje: Object.values(factores).reduce((a, b) => a + b, 0), factores,
      por_que: [
        `Caben ≈ ${uPosibles} unidades de ${au} m²${conDerechos ? " comprando derechos de construcción" : " con la norma base"} (${c.tratamiento ?? "s/t"}${c.altura_max ? `, hasta ${c.altura_max} pisos` : ""})`,
        lecturaPrecio,
        m.galeria_proyectos ? `${m.galeria_proyectos} proyectos de Galería a 2 km venden ${ventas.toFixed(1)} und/mes; inventario para ${meses ? meses.toFixed(0) : "—"} meses` : `${m.proyectos ?? 0} proyectos nuevos a 1,5 km (sin datos de Galería)`,
        `${m.pedidos ?? 0} compradores buscando (90 d) frente a ${m.inventario ?? 0} usados en venta a 1 km`,
        ocupacion < 0.3 && nConstr <= 3 ? "Lote casi libre (poca construcción existente)" : `${nConstr} construcciones existentes, ${Math.round(Number(c.area_construida))} m² (${ocupacion.toFixed(1)}× el lote)${nConstr > 15 ? ": probablemente muchos dueños, exige englobe" : ""}`,
        senales.length ? `Folio: ${senales.join(", ")}` : m.matricula ? "Folio sin señales particulares 2015–2023" : null,
      ].filter(Boolean),
    };
  });

  // Topografía: pendiente rápida (ráster AMVA) para todos los evaluados; si hay preferencia, suma hasta 10 puntos por encaje.
  const pref = p.topografia ?? "indiferente";
  const pend = await pendientesRapidas(evaluados.map((e) => ({ id: e.id, lon: e.lon, lat: e.lat })));
  for (const e of evaluados as any[]) {
    const pc = pend.get(e.id);
    e.topografia = pc == null ? null : { pendiente_aprox_pct: pc, clase: clasePendiente(pc), fuente: "Pendiente del AMVA (10 m) en el centro del lote" };
    const enc = encajeTopografia(pc, pref);
    if (enc.encaje != null) { e.factores.topografia = Math.round(10 * enc.encaje); e.puntaje += e.factores.topografia; e.por_que.push(enc.texto); }
  }
  evaluados.sort((a, b) => b.puntaje - a.puntaje);

  const top = evaluados.slice(0, limite);
  // Detalle (MDT de 1 m en Medellín) para los primeros cuando el perfil pide una topografía: confirma el encaje con el lote completo.
  if (pref !== "indiferente") {
    const det = top.slice(0, 15);
    for (let i = 0; i < det.length; i += 5) await Promise.all(det.slice(i, i + 5).map(async (e: any) => {
      const t: any = await topografiaLote(e.id).catch(() => null);
      if (!t?.disponible) return;
      e.topografia = { pendiente_pct: t.pendiente_pct, clase: t.clase, desnivel_m: t.desnivel_m, cae_hacia: t.cae_hacia, via: t.via?.lectura ?? null, fuente: t.fuente.nombre };
      // Recalcula el encaje con el lote completo (la pendiente del centro puede engañar).
      const enc = encajeTopografia(t.pendiente_pct, pref);
      if (enc.encaje != null) {
        e.puntaje += Math.round(10 * enc.encaje) - (e.factores.topografia ?? 0);
        e.factores.topografia = Math.round(10 * enc.encaje);
        e.por_que = [...e.por_que.filter((x: string) => !/preferencia de|frente a su preferencia/.test(x)), enc.texto];
      }
    }));
    top.sort((a, b) => b.puntaje - a.puntaje);
  }
  const precios = top.map((t) => Number(t.mercado.precio_m2_referencia)).filter(Boolean);
  return {
    estudio: p.nombre ?? `Oportunidades por perfil · ${mun.nombre}`,
    fecha: new Date().toISOString().slice(0, 10),
    perfil: { municipio: mun.nombre, barrios: p.barrios ?? null, tipo_vivienda: tipo, unidades_min: umin, unidades_max: umax, area_unidad_m2: au,
      pisos_min: pisos, area_lote_min: p.area_lote_min ?? null, area_lote_max: p.area_lote_max ?? null, precio_m2_objetivo: p.precio_m2_objetivo ?? null,
      eficiencia: ef, permitir_compra_derechos: derechos, topografia_preferida: pref, norma: usa26 ? "Proyecto POT 2026 (v3, julio de 2026), preliminar" : "POT vigente cargado (Medellín: 2014)" },
    resumen: {
      lotes_que_cumplen_la_norma: total,
      con_norma_base: (candidatos as any[]).filter((c) => c.u_base >= umin).length,
      solo_comprando_derechos: (candidatos as any[]).filter((c) => c.u_base < umin).length,
      evaluados_con_mercado: evaluados.length,
      barrios_con_mas_lotes: [...porBarrio.values()].sort((a, b) => b.lotes - a.lotes).slice(0, 15).map((b) => ({ ...b, area_lote_total: Math.round(b.area_lote_total) })),
      precio_m2_mediano_zonas_top: mediana(precios),
    },
    oportunidades: top,
    metodo: "Filtro normativo sobre todos los predios urbanos desarrollables del municipio (sin amenaza alta, suelo de protección, espacio público ni uso dotacional): unidades posibles = mín(área construible × eficiencia ÷ área por unidad, densidad máxima). Puntaje 0–100 = encaje normativo (30; 18 si exige comprar derechos) + precio frente a la zona (20) + absorción según Galería (15) + compradores frente a oferta en Fynder (15) + señales de venta del folio (10) + facilidad por poca construcción existente y pocas construcciones, es decir pocos dueños probables (10) + encaje con la topografía preferida si se indica (10; la pendiente no es buena ni mala, depende del producto). El mercado se calcula para los 300 primeros lotes ordenados por encaje y lote más libre.",
    advertencias: [
      ...(usa26 ? ["Calculado con la norma del Proyecto de Acuerdo 104 de 2026 (Tomo V v3, julio de 2026): preliminar, puede cambiar con el texto aprobado; la altura máxima y la clase de tratamiento se toman aún del POT 2014. La Zona 1 no está incluida (tabla no legible en el PDF)."] : avisoPOT(mun.dane) ? [avisoPOT(mun.dane)!] : []),
      "Las unidades posibles son una inferencia sobre la norma del POT; no son una cabida arquitectónica (retiros, cesiones y parqueaderos pueden reducirlas).",
      "Los lotes catastrales pueden requerir englobe; la ficha de cada predio muestra la construcción existente y el folio.",
      "Los datos de Galería son de uso interno del cliente que los contrata.",
    ],
  };
}
