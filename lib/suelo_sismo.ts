// Suelo y sismo de un lote: zona de microzonificación sísmica con su espectro (Medellín), geología, susceptibilidad
// sísmica y la historia de gestión del riesgo alrededor (inspecciones del DAGRD, estudios geotécnicos, obras de
// mitigación y monitoreo). Es una lectura previa para cimentación y contenciones: no reemplaza el estudio de suelos.
import { sql } from "./db";

const r2 = (x: number) => Math.round(x * 100) / 100;
export type Coef = { a_smax: number; fa: number; samax_sobre_i: number; t0_s: number; tc_s: number; alfa: number };

/** Espectro de la microzonificación de Medellín (Figura 0): rampa hasta T0, meseta hasta Tc y caída (Tc/T)^α; I = coeficiente de importancia. */
export function espectro(c: Coef, I = 1, periodos = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4]) {
  const smax = c.samax_sobre_i * I;
  return periodos.map((T) => ({ T, Sa: r2(T < c.t0_s ? c.a_smax * I + (smax - c.a_smax * I) * (T / c.t0_s) : T <= c.tc_s ? smax : smax * Math.pow(c.tc_s / T, c.alfa)) }));
}

const GEO_DEBIL = /flujo|escombro|lodo|desliza|llenos|antr[oó]pic|coluvi|aluvi|torrenc/i;

export async function sueloSismoLote(id: string) {
  const [lote]: any = await sql`SELECT id, municipio_dane, geom FROM parcel WHERE id = ${id}`;
  if (!lote) return null;
  if (lote.municipio_dane !== "05001") return { disponible: false, motivo: "Microzonificación y registros de gestión del riesgo cargados solo para Medellín." };

  const [zonas, geologia, susc, inspec, estudios, obras, monitoreo, amenazaAlta]: any = await Promise.all([
    sql`SELECT m.zona, m.nombre, m.coeficientes, round((ST_Area(ST_Intersection(m.geom, p.geom)::geography) / greatest(ST_Area(p.geom::geography), 1) * 100)::numeric, 1)::float pct,
          round(ST_Distance(p.geom::geography, m.geom::geography))::int d
        FROM sismo_microzona m, parcel p WHERE p.id = ${id} AND m.municipio_dane = '05001' AND m.geom && ST_Expand(p.geom, 0.003) AND ST_DWithin(m.geom::geography, p.geom::geography, 125)
        ORDER BY d, pct DESC`,
    sql`SELECT z.valor unidad, z.descripcion, round((sum(ST_Area(ST_Intersection(z.geom, p.geom)::geography)) / greatest(ST_Area(p.geom::geography), 1) * 100)::numeric, 1)::float pct
        FROM riesgo_zona z, parcel p WHERE p.id = ${id} AND z.capa = 'geologia' AND z.geom && p.geom AND ST_Intersects(z.geom, p.geom) GROUP BY 1, 2, p.geom ORDER BY pct DESC`,
    sql`SELECT z.valor FROM riesgo_zona z, parcel p WHERE p.id = ${id} AND z.capa = 'susceptibilidad_sismica' AND z.geom && p.geom AND ST_Intersects(z.geom, p.geom) ORDER BY z.valor DESC`,
    sql`SELECT x.tipo, extract(year FROM x.fecha)::int anio, round(ST_Distance(x.geom::geography, p.geom::geography))::int d
        FROM riesgo_punto x, parcel p WHERE p.id = ${id} AND x.capa = 'inspeccion' AND x.geom && ST_Expand(p.geom, 0.004) AND ST_DWithin(x.geom::geography, p.geom::geography, 300)`,
    sql`SELECT z.valor tipo, z.descripcion titulo, z.attrs->>'anio' anio, round(ST_Distance(z.geom::geography, p.geom::geography))::int d
        FROM riesgo_zona z, parcel p WHERE p.id = ${id} AND z.capa = 'estudio_riesgo' AND z.geom && ST_Expand(p.geom, 0.005) AND ST_DWithin(z.geom::geography, p.geom::geography, 500) ORDER BY d LIMIT 6`,
    sql`SELECT x.tipo, x.attrs->>'objeto' objeto, extract(year FROM x.fecha)::int anio, round(ST_Distance(x.geom::geography, p.geom::geography))::int d
        FROM riesgo_punto x, parcel p WHERE p.id = ${id} AND x.capa = 'obra_mitigacion' AND x.geom && ST_Expand(p.geom, 0.005) AND ST_DWithin(x.geom::geography, p.geom::geography, 500) ORDER BY d LIMIT 6`,
    sql`SELECT x.tipo, x.attrs->>'estado' estado, round(ST_Distance(x.geom::geography, p.geom::geography))::int d
        FROM riesgo_punto x, parcel p WHERE p.id = ${id} AND x.capa = 'monitoreo_geotecnico' AND x.geom && ST_Expand(p.geom, 0.005) AND ST_DWithin(x.geom::geography, p.geom::geography, 500) ORDER BY d LIMIT 6`,
    sql`SELECT EXISTS (SELECT 1 FROM zoning_layer z, parcel p WHERE p.id = ${id} AND z.capa = 'amenaza' AND z.municipio_dane = '05001' AND (z.attrs->>'tipo') = 'movimientos_masa'
          AND (z.attrs->>'grado') ~* '^(alta|muy alta)$' AND ST_Intersects(z.geom, p.geom)) si`,
  ]);

  // Microzona: la que contiene el lote; si hay otra a menos de 125 m, franja de transición → se usa la más exigente.
  const dentro = zonas.filter((z: any) => z.d === 0).sort((a: any, b: any) => b.pct - a.pct);
  const principal = dentro[0] ?? null;
  const vecinas = zonas.filter((z: any) => !principal || z.zona !== principal.zona);
  const exigente = [...(principal ? [principal] : []), ...vecinas].sort((a: any, b: any) => b.coeficientes.diseno.samax_sobre_i - a.coeficientes.diseno.samax_sobre_i)[0] ?? null;
  const transicion = vecinas.length > 0;
  const zonaUso = transicion ? exigente : principal;
  const microzona = zonaUso ? {
    zona: principal?.zona ?? null, nombre: principal?.nombre ?? null,
    zona_para_diseno: zonaUso.zona, nombre_para_diseno: zonaUso.nombre,
    transicion: transicion ? { zonas_cercanas: vecinas.map((v: any) => ({ zona: v.zona, nombre: v.nombre, distancia_m: v.d })), regla: "A menos de 125 m de otra zona se usa la más exigente, salvo estudio geotécnico detallado." } : null,
    diseno: zonaUso.coeficientes.diseno, control_danos: zonaUso.coeficientes.control_danos,
    espectro_diseno: espectro(zonaUso.coeficientes.diseno), espectro_control: espectro(zonaUso.coeficientes.control_danos),
    valido: !amenazaAlta[0]?.si,
    aviso: amenazaAlta[0]?.si ? "El lote toca amenaza alta por movimientos en masa: la microzonificación dice que sus espectros no son válidos en zonas inestables." : null,
  } : null;

  const mm = inspec.filter((x: any) => /masa|desliz/i.test(x.tipo ?? ""));
  const porTipo = (xs: any[]) => Object.entries(xs.reduce((a: any, x: any) => ((a[x.tipo ?? "Sin tipo"] = (a[x.tipo ?? "Sin tipo"] ?? 0) + 1), a), {})).map(([tipo, n]) => ({ tipo, n })).sort((a: any, b: any) => b.n - a.n);
  const anios = inspec.map((x: any) => x.anio).filter(Boolean);
  const inspecciones = {
    a_100m: inspec.filter((x: any) => x.d <= 100).length, a_300m: inspec.length,
    movimiento_masa_100m: mm.filter((x: any) => x.d <= 100).length, movimiento_masa_300m: mm.length,
    por_tipo_100m: porTipo(inspec.filter((x: any) => x.d <= 100)), por_tipo_300m: porTipo(inspec),
    por_anio_300m: Object.entries(inspec.reduce((a: any, x: any) => (x.anio ? ((a[x.anio] = (a[x.anio] ?? 0) + 1), a) : a), {})).map(([anio, n]) => ({ anio: Number(anio), n })).sort((a, b) => a.anio - b.anio),
    desde: anios.length ? Math.min(...anios) : null, hasta: anios.length ? Math.max(...anios) : null,
    nota: "Visitas técnicas del DAGRD por emergencias o solicitudes (registro 2008–2021 más antecedentes). Una concentración alrededor del lote indica inestabilidad, humedades o daños en la ladera.",
  };

  // Lectura para la constructora (cimentación y contenciones)
  const debil = geologia.filter((g: any) => GEO_DEBIL.test(g.descripcion ?? ""));
  const muyDebil = geologia.filter((g: any) => /desliza|llenos|antr[oó]pic/i.test(g.descripcion ?? ""));
  const motivos: string[] = [];
  if (debil.length) motivos.push(`suelo de ${debil.map((g: any) => g.descripcion.toLowerCase()).join(" y ")}`);
  if (inspecciones.movimiento_masa_100m) motivos.push(`${inspecciones.movimiento_masa_100m} inspecciones del DAGRD por movimiento en masa a menos de 100 m`);
  if (microzona && !microzona.valido) motivos.push("amenaza alta por movimientos en masa (espectro de la microzonificación no válido)");
  const luz = muyDebil.length || inspecciones.movimiento_masa_100m >= 5 || (microzona && !microzona.valido) ? "rojo" : debil.length || inspecciones.movimiento_masa_100m > 0 || inspecciones.movimiento_masa_300m >= 5 ? "amarillo" : "verde";
  const lectura = luz === "verde"
    ? `Sin señales de inestabilidad en los registros públicos${geologia[0] ? ` (geología: ${geologia[0].descripcion})` : ""}. El estudio de suelos define la cimentación.`
    : `${luz === "rojo" ? "Riesgo alto de sobrecostos en contenciones y cimentación" : "Revisar contenciones y cimentación"}: ${motivos.join("; ")}. Pedir estudio geotécnico temprano${microzona ? ` y usar el espectro de la zona ${microzona.zona_para_diseno}` : ""}.`;

  return {
    disponible: true, microzona, geologia, susceptibilidad_sismica: susc[0]?.valor ? `${susc[0].valor} g` : null,
    inspecciones, estudios_cercanos: estudios, obras_mitigacion_cercanas: obras, monitoreo_cercano: monitoreo,
    semaforo: { categoria: "Suelo y sismo", luz, lectura },
    fuentes: [
      "Microzonificación sísmica de Medellín (Grupo de Sismología de Medellín; documento del DAP, 2011; mapa de zonas homogéneas del POT). Zonas digitalizadas del mapa vectorial: pendiente de validar.",
      "Gestión del riesgo de Medellín (DAGRD): geología, susceptibilidad sísmica, inspecciones técnicas, estudios, obras de mitigación y monitoreo (servicio público de la Alcaldía).",
    ],
    aviso: "Lectura previa con información pública. No reemplaza el estudio geotécnico ni el análisis de respuesta de sitio que exige la NSR-10.",
  };
}
