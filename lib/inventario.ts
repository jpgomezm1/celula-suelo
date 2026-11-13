// Inventario de vivienda nueva alrededor de un lote: cuánto hay por vender, a qué ritmo se vende
// y cuánto está ya terminado sin vender ("inventario cerrado"). Fuentes: Galería Inmobiliaria (unidades
// disponibles y ventas mensuales por proyecto, confidencial) y Fynder (avisos de inmuebles nuevos).
// Meses de inventario = unidades disponibles ÷ ventas promedio por mes del último semestre.

import { sql } from "./db";

const ETAPA = (e: string) => (/desist|paral/i.test(e) ? "parado" : /^term\.\/$/i.test(e.trim()) ? "terminado" : /term/i.test(e) ? "mixto" : /const/i.test(e) ? "construccion" : "sobre_planos");
const r1 = (x: number | null) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const meses = (disp: number, ventas: number) => (disp <= 0 ? 0 : ventas > 0 ? r1(disp / ventas) : null);

export async function inventarioLote(id: string, opciones: { radio_m?: number; tipo?: "Apto" | "Casa" | "Lote" } = {}) {
  const radio = opciones.radio_m ?? 2000, tipo = opciones.tipo ?? "Apto";
  // Estrato de la zona: el más frecuente en los folios vecinos (300 m) o, si no hay folios, la mediana de los avisos a 500 m.
  const [lote] = await sql`
    SELECT ST_X(ST_PointOnSurface(q.geom)) lon, ST_Y(ST_PointOnSurface(q.geom)) lat,
      coalesce(
        (SELECT mode() WITHIN GROUP (ORDER BY f.estrato) FROM parcel_folio f JOIN parcel p ON p.id = f.parcel_id
          WHERE f.estrato BETWEEN 1 AND 6 AND p.geom && ST_Expand(q.geom, 0.004) AND ST_DWithin(p.geom::geography, q.geom::geography, 300)),
        (SELECT percentile_disc(0.5) WITHIN GROUP (ORDER BY l.estrato) FROM listing l
          WHERE l.estrato BETWEEN 1 AND 6 AND l.geom && ST_Expand(q.geom, 0.005) AND ST_DWithin(l.geom::geography, q.geom::geography, 500))) estrato
    FROM parcel q WHERE q.id = ${id}`;
  if (!lote) return null;
  const est = (lote as any).estrato != null ? Number((lote as any).estrato) : null;
  const caja = radio / 90000; // grados de margen para el prefiltro por índice espacial

  const filas = (await sql`
    SELECT codigo, proyecto, construye, estrato, estado_obra, coalesce(unidades_disponibles,0)::float disp,
      coalesce(unidades_por_lanzar,0)::float por_lanzar, greatest(coalesce(ventas_prom_semestre_un,0),0)::float ventas_mes,
      coalesce(unidades_total,0)::float total, precio_m2_oferta::float precio_m2, fecha_entrega, fecha_corte,
      round(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${(lote as any).lon}, ${(lote as any).lat}), 4326)::geography))::int dist
    FROM galeria_vigente
    WHERE geom IS NOT NULL AND tipo = ${tipo} AND NOT coalesce(rentas_cortas, false)
      AND geom && ST_Expand(ST_SetSRID(ST_MakePoint(${(lote as any).lon}, ${(lote as any).lat}), 4326), ${caja})
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${(lote as any).lon}, ${(lote as any).lat}), 4326)::geography, ${radio})
      AND (${est}::int IS NULL OR estrato IS NULL OR abs(estrato - ${est}::int) <= 1)`) as any[];

  const grupos: Record<string, { proyectos: number; disponibles: number; ventas_mes: number; meses_inventario: number | null }> = {};
  for (const f of filas) {
    const g = (grupos[ETAPA(f.estado_obra ?? "")] ??= { proyectos: 0, disponibles: 0, ventas_mes: 0, meses_inventario: null });
    g.proyectos++; g.disponibles += f.disp; g.ventas_mes += f.ventas_mes;
  }
  for (const g of Object.values(grupos)) { g.ventas_mes = r1(g.ventas_mes)!; g.meses_inventario = meses(g.disponibles, g.ventas_mes); }

  const vivos = filas.filter((f) => ETAPA(f.estado_obra ?? "") !== "parado");
  const disp = vivos.reduce((s, f) => s + f.disp, 0), xl = vivos.reduce((s, f) => s + f.por_lanzar, 0);
  const ventas = vivos.reduce((s, f) => s + f.ventas_mes, 0);
  const term = filas.filter((f) => ETAPA(f.estado_obra ?? "") === "terminado" && f.disp > 0);
  const mixtos = filas.filter((f) => ETAPA(f.estado_obra ?? "") === "mixto" && f.disp > 0);
  const estancados = term.filter((f) => f.ventas_mes <= 0);
  const fmt = (x: number | null) => (x == null ? "—" : x.toLocaleString("es-CO", { maximumFractionDigits: 1 }));
  const dispTerm = term.reduce((s, f) => s + f.disp, 0), dispMix = mixtos.reduce((s, f) => s + f.disp, 0);
  const mesesHoy = meses(disp, ventas), mesesTotal = meses(disp + xl, ventas);

  // Fynder: avisos activos de inmuebles nuevos (entregados) en la misma zona; antigüedad ≈ mitad del tiempo de venta.
  const [fy] = (await sql`
    SELECT count(*)::int n, percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(epoch FROM now() - publicado_en) / 86400)::int dias_mediana
    FROM listing WHERE activa AND negocio = 'venta' AND estado_inmueble = 'nuevo' AND tipo LIKE 'apartamento%' AND geom IS NOT NULL
      AND geom && ST_Expand(ST_SetSRID(ST_MakePoint(${(lote as any).lon}, ${(lote as any).lat}), 4326), ${caja})
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${(lote as any).lon}, ${(lote as any).lat}), 4326)::geography, ${radio})`) as any[];

  const suficiente = vivos.length >= 3;
  const luz = !suficiente ? "gris" : mesesHoy == null ? "rojo" : mesesHoy > 36 ? "rojo" : mesesHoy > 18 ? "amarillo" : "verde";
  const lectura = !suficiente
    ? `Solo ${vivos.length} proyecto(s) de vivienda nueva en Galería a ${radio / 1000} km${est ? ` (estrato ${est} ±1)` : ""}: muestra insuficiente para medir el ritmo de la zona.`
    : `A ${radio / 1000} km${est ? `, estrato ${est} ±1` : ""}: ${fmt(Math.round(disp))} unidades disponibles en ${vivos.length} proyectos, se venden ${fmt(r1(ventas))} por mes → ${mesesHoy == null ? "sin ventas" : `${fmt(mesesHoy)} meses`} de inventario` +
      `${xl > 0 ? ` (${fmt(mesesTotal)} meses contando ${fmt(Math.round(xl))} por lanzar)` : ""}.` +
      (term.length ? ` Terminado sin vender: ${fmt(Math.round(dispTerm))} unidades en ${term.length} proyectos ya terminados${estancados.length ? ` (${estancados.length} sin ninguna venta en el semestre)` : ""}` : " Ningún proyecto terminado con unidades por vender") +
      `${mixtos.length ? `, y ${fmt(Math.round(dispMix))} más en ${mixtos.length} proyectos que tienen alguna etapa terminada` : ""}.`;

  return {
    radio_m: radio, tipo, estrato_zona: est,
    fecha_corte: filas.reduce((m: any, f) => (f.fecha_corte > (m ?? 0) ? f.fecha_corte : m), null),
    proyectos: vivos.length, disponibles: Math.round(disp), por_lanzar: Math.round(xl), ventas_mes: r1(ventas),
    meses_inventario: suficiente ? mesesHoy : null, meses_inventario_con_por_lanzar: suficiente ? mesesTotal : null,
    por_etapa: grupos,
    inventario_cerrado: {
      unidades: Math.round(dispTerm), proyectos: term.length,
      ventas_mes: r1(term.reduce((s, f) => s + f.ventas_mes, 0)),
      meses: meses(dispTerm, term.reduce((s, f) => s + f.ventas_mes, 0)),
      proyectos_sin_ventas: estancados.length,
      en_proyectos_con_etapa_terminada: Math.round(dispMix), proyectos_con_etapa_terminada: mixtos.length,
      detalle: [...term, ...mixtos].sort((a, b) => b.disp - a.disp).slice(0, 8).map((f) => ({ proyecto: f.proyecto, constructora: f.construye, disponibles: f.disp, ventas_mes: r1(f.ventas_mes), meses: meses(f.disp, f.ventas_mes), distancia_m: f.dist, solo_terminado: ETAPA(f.estado_obra) === "terminado" })),
      fynder_avisos_nuevos: (fy as any)?.n ?? 0, fynder_dias_publicado_mediana: (fy as any)?.dias_mediana ?? null,
      fynder_meses_venta_estimados: (fy as any)?.dias_mediana ? r1(((fy as any).dias_mediana * 2) / 30) : null,
    },
    semaforo: { categoria: "Inventario de vivienda nueva en la zona", luz, lectura },
    nota: "Meses de inventario = unidades disponibles ÷ ventas promedio mensuales del último semestre (Galería Inmobiliaria). Las etapas mixtas (p. ej. una torre terminada y otra en preventa) cuentan en 'mixto'; Galería no separa las disponibles por etapa. Fynder: avisos de inmuebles nuevos ya entregados; su antigüedad × 2 aproxima el tiempo de venta. Más de 36 meses = rojo, 18 a 36 = amarillo.",
    fuente: "Galería Inmobiliaria (corte mensual, confidencial) y Fynder.",
  };
}
