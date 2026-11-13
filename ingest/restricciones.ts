// Restricciones que "matan" un lote y no salen de los índices del POT: red hídrica (cauces naturales y canalizados),
// retiros hídricos oficiales, planes parciales y otros instrumentos de planificación complementaria, y árboles
// (patrimoniales y censo urbano). Uso: npm run restricciones [-- cauces|retiros|cauces_municipales|torrencial|planes|arboles]
import { sql } from "../lib/db";
import { queryAll, type Feature } from "./arcgis";

const G = "https://www.medellin.gov.co/servidormapas/rest/services";
const I = "https://portalidem.metropol.gov.co/server/rest/services";
// Servidores propios de los municipios (POT vigentes): Itagüí (Acuerdo 09 de 2023) y Sabaneta (Secretaría de Planeación, ArcGIS Online)
const IT = "https://arcgis.itagui.gov.co/waserver/rest/services/Formulacion";
const SA = "https://services7.arcgis.com/OsNfmcCXlLRPMVA8/ArcGIS/rest/services";
const VALLE = { xmin: -75.72, ymin: 6.0, xmax: -75.4, ymax: 6.45 };
const DANE: Record<string, string> = { "001": "05001", "079": "05079", "088": "05088", "129": "05129", "212": "05212", "266": "05266", "308": "05308", "360": "05360", "380": "05380", "631": "05631" };
const s = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());

async function esquema() {
  await sql`CREATE TABLE IF NOT EXISTS hidro_cauce (id bigserial PRIMARY KEY, fuente text NOT NULL, ref text, nombre text, jerarquia text, canalizado boolean,
    geom geometry(MultiLineString, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS hidro_cauce_geom ON hidro_cauce USING gist (geom)`;
  await sql`CREATE TABLE IF NOT EXISTS hidro_retiro (id bigserial PRIMARY KEY, fuente text NOT NULL, municipio_dane text, nombre text, faja_m numeric,
    geom geometry(MultiPolygon, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS hidro_retiro_geom ON hidro_retiro USING gist (geom)`;
  await sql`CREATE TABLE IF NOT EXISTS instrumento_plan (id bigserial PRIMARY KEY, fuente text NOT NULL, municipio_dane text, instrumento text, nombre text, codigo text, estado text, nivel text, categoria text,
    geom geometry(MultiPolygon, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS instrumento_plan_geom ON instrumento_plan USING gist (geom)`;
  await sql`CREATE TABLE IF NOT EXISTS arbol (id bigint PRIMARY KEY, municipio_dane text, especie text, nombre_comun text, patrimonial boolean NOT NULL, estado text,
    geom geometry(Point, 4326) NOT NULL)`;
  await sql`CREATE INDEX IF NOT EXISTS arbol_geom ON arbol USING gist (geom)`;
}

/** Inserta por lotes con ST_GeomFromGeoJSON (geometrías GeoJSON en 4326). */
async function insertar(tabla: "hidro_cauce" | "hidro_retiro" | "instrumento_plan", filas: Record<string, unknown>[], tipo: "linea" | "poligono") {
  for (let i = 0; i < filas.length; i += 200) {
    const lote = filas.slice(i, i + 200);
    const json = JSON.stringify(lote);
    const conv = tipo === "linea" ? sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)), 2))`
      : sql`ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)), 3))`;
    if (tabla === "hidro_cauce") await sql`INSERT INTO hidro_cauce (fuente, ref, nombre, jerarquia, canalizado, geom)
      SELECT x->>'fuente', x->>'ref', x->>'nombre', x->>'jerarquia', (x->>'canalizado')::boolean, ${conv} FROM jsonb_array_elements(${json}::jsonb) x WHERE x->>'geom' IS NOT NULL`;
    else if (tabla === "hidro_retiro") await sql`INSERT INTO hidro_retiro (fuente, municipio_dane, nombre, faja_m, geom)
      SELECT x->>'fuente', x->>'municipio_dane', x->>'nombre', (x->>'faja_m')::numeric, ${conv} FROM jsonb_array_elements(${json}::jsonb) x WHERE x->>'geom' IS NOT NULL`;
    else await sql`INSERT INTO instrumento_plan (fuente, municipio_dane, instrumento, nombre, codigo, estado, nivel, categoria, geom)
      SELECT x->>'fuente', x->>'municipio_dane', x->>'instrumento', x->>'nombre', x->>'codigo', x->>'estado', x->>'nivel', x->>'categoria', ${conv} FROM jsonb_array_elements(${json}::jsonb) x WHERE x->>'geom' IS NOT NULL`;
  }
}

async function todo(url: string, opts = {}): Promise<Feature[]> { const out: Feature[] = []; for await (const p of queryAll(url, { outFields: "*", ...opts })) out.push(...p); return out; }

async function cauces() {
  await sql`DELETE FROM hidro_cauce WHERE fuente NOT IN ('sabaneta_drenajes', 'itagui_hidrografia')`;
  // 1) Red hídrica oficial del POT 48 de Medellín (cauces con nombre y jerarquía)
  const pot = await todo(`${G}/ordenamiento_ter/VM_04_Estructura_Ecologica_Principal/MapServer/4`);
  await insertar("hidro_cauce", pot.map((f) => ({ fuente: "geomed_red_hidrica_pot48", ref: s(f.properties.t_id), nombre: s(f.properties.nombre), jerarquia: s(f.properties.jerarquia), canalizado: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "linea");
  // 2) Quebradas del catastro de Medellín (red detallada con afluentes)
  const cat = await todo(`${G}/ServiciosCatastro/Base_Catastral/MapServer/9`);
  await insertar("hidro_cauce", cat.map((f) => ({ fuente: "geomed_quebradas_catastro", ref: s(f.properties.codqueb), nombre: s(f.properties.nombre), jerarquia: s(f.properties.tipocauce), canalizado: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "linea");
  // 3) OpenStreetMap: cauces del Valle de Aburrá; tunnel=culvert marca los tramos canalizados cerrados (entubados)
  const q = `[out:json][timeout:120];way["waterway"~"stream|river|canal|drain|ditch"](${VALLE.ymin},${VALLE.xmin},${VALLE.ymax},${VALLE.xmax});out tags geom;`;
  const r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "inteligencia-suelo/1.0" }, signal: AbortSignal.timeout(180_000) });
  const o: any = await r.json();
  const osm = (o.elements ?? []).filter((w: any) => w.geometry?.length > 1).map((w: any) => ({
    fuente: "osm_waterway", ref: String(w.id), nombre: w.tags?.name ?? null, jerarquia: w.tags?.waterway ?? null,
    canalizado: w.tags?.tunnel === "culvert" || w.tags?.tunnel === "yes" || w.tags?.waterway === "canal" ? true : false,
    geom: JSON.stringify({ type: "LineString", coordinates: w.geometry.map((p: any) => [p.lon, p.lat]) }) }));
  await insertar("hidro_cauce", osm, "linea");
  console.log(`cauces: POT ${pot.length}, catastro ${cat.length}, OSM ${osm.length} (${osm.filter((x: any) => x.canalizado).length} canalizados)`);
}

async function retiros() {
  await sql`DELETE FROM hidro_retiro`;
  // Retiros oficiales que no están en la capa de protección ya cargada (Medellín ya está en zoning_layer)
  const le = await todo(`${I}/POT_La_Estrella/MapServer/4`);
  await insertar("hidro_retiro", le.map((f) => ({ fuente: "idem_la_estrella_retiros", municipio_dane: "05380", nombre: s(f.properties.NOMBRE), faja_m: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "poligono");
  // Copia los de Medellín para consultar todo en una tabla
  await sql`INSERT INTO hidro_retiro (fuente, municipio_dane, nombre, faja_m, geom)
    SELECT 'geomed_retiros_hidricos', '05001', NULL, NULLIF(attrs->>'faja_m', '')::numeric, geom FROM zoning_layer WHERE subtipo = 'retiro_hidrico'`;
  // Envigado: la capa de protección del POT (IDEM) describe cada polígono; se toman los de retiro a corrientes, nacimientos y humedales
  const [{ n: env }] = await sql`WITH x AS (INSERT INTO hidro_retiro (fuente, municipio_dane, nombre, faja_m, geom)
    SELECT 'idem_envigado_retiros', '05266', z.attrs->'src'->>'descripcion', NULL, z.geom FROM zoning_layer z
    WHERE z.municipio_dane = '05266' AND z.capa = 'proteccion' AND z.attrs->'src'->>'descripcion' ~* 'retiro a (corrientes|nacimientos|humedales)' RETURNING 1) SELECT count(*)::int n FROM x`;
  // Bello: zonas de retiro a corrientes naturales y corredor ribereño del suelo de protección del POT (IDEM)
  const [{ n: bel }] = await sql`WITH x AS (INSERT INTO hidro_retiro (fuente, municipio_dane, nombre, faja_m, geom)
    SELECT 'idem_bello_retiros', '05088', z.attrs->>'categoria', NULL, z.geom FROM zoning_layer z
    WHERE z.municipio_dane = '05088' AND z.capa = 'proteccion' AND z.attrs->>'categoria' ~ '^(ZRNPA|ZCR):' RETURNING 1) SELECT count(*)::int n FROM x`;
  // Itagüí: retiros a corrientes de agua y a humedales del POT 2023 (Acuerdo 09 de 2023, servidor de la Alcaldía)
  const it: Feature[] = [];
  for (const c of [5, 1, 2]) it.push(...(await todo(`${IT}/03_FG_Suelo_Proteccion/MapServer/${c}`)));
  await insertar("hidro_retiro", it.map((f) => ({ fuente: "itagui_pot2023_retiros", municipio_dane: "05360", nombre: s(f.properties.tipo ?? f.properties.elemento), faja_m: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "poligono");
  // Sabaneta: retiros a quebradas (10, 30 y 60 m) de la Secretaría de Planeación
  const sa = await todo(`${SA}/Retiro_de_Quebradas/FeatureServer/0`);
  await insertar("hidro_retiro", sa.map((f) => ({ fuente: "sabaneta_retiros_quebradas", municipio_dane: "05631", nombre: s(f.properties.Clasi) ? `Retiro a quebrada (${s(f.properties.Clasi)})` : "Retiro a quebrada", faja_m: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "poligono");
  console.log(`retiros: La Estrella ${le.length}, Envigado ${env}, Bello ${bel}, Itagüí ${it.length}, Sabaneta ${sa.length} + Medellín (zoning_layer)`);
}

/** Cauces oficiales municipales (nombres y trazado) que complementan OpenStreetMap. Se pueden recargar sin tocar los demás. */
async function caucesMunicipales() {
  await sql`DELETE FROM hidro_cauce WHERE fuente IN ('sabaneta_drenajes', 'itagui_hidrografia')`;
  const sa = await todo(`${SA}/Drenajes/FeatureServer/0`);
  await insertar("hidro_cauce", sa.map((f) => ({ fuente: "sabaneta_drenajes", ref: s(f.properties.OBJECTID), nombre: s(f.properties.NOMBRE) ?? s(f.properties.ETIQUETA), jerarquia: s(f.properties.TIPO), canalizado: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "linea");
  const it = await todo(`${IT}/00_Cartografia_Base/MapServer/7`);
  const nom = (p: any) => s(p.NOMBRE ?? p.nombre ?? p.NMG ?? p.nmg);
  await insertar("hidro_cauce", it.map((f) => ({ fuente: "itagui_hidrografia", ref: null, nombre: nom(f.properties), jerarquia: null, canalizado: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })), "linea");
  console.log(`cauces municipales: Sabaneta ${sa.length}, Itagüí ${it.length}`);
}

/** Amenaza por avenida torrencial de los POT municipales (Itagüí 2023 y Sabaneta), a la capa de amenazas. */
async function torrencial() {
  const capas: [string, string, string, (p: any) => string | null][] = [
    [`${IT}/ConsultaPOT_RIESGOS_A2023/MapServer/26`, "itagui_pot2023_avenida_torrencial", "05360", (p) => (/alta/i.test(p.amenaza) ? "Alta" : /media/i.test(p.amenaza) ? "Media" : /baja/i.test(p.amenaza) ? "Baja" : s(p.amenaza))],
    [`${IT}/ConsultaPOT_RIESGOS_A2023/MapServer/17`, "itagui_pot2023_condicion_torrencial", "05360", () => "Condición de riesgo"],
    [`${SA}/AmenazaAvTorrencial/FeatureServer/0`, "sabaneta_avenida_torrencial", "05631", (p) => s(p.Amenaza)],
  ];
  for (const [url, fuente, dane, grado] of capas) {
    const fs = await todo(url);
    const filas = fs.filter((f) => f.geometry).map((f) => ({ attrs: { src: f.properties, tipo: "avenidas_torrenciales", grado: grado(f.properties) }, geom: JSON.stringify(f.geometry) }));
    await sql`DELETE FROM zoning_sub WHERE fuente = ${fuente}`;
    await sql`DELETE FROM zoning_layer WHERE fuente = ${fuente}`;
    const [snap] = await sql`INSERT INTO source_snapshot (fuente, nombre, url, tipo_dato, licencia, fetched_at, esperado, registros)
      VALUES (${fuente}, ${`Amenaza por avenida torrencial · ${dane === "05360" ? "POT Itagüí 2023" : "Sabaneta"}`}, ${url}, 'oficial', 'Servicio público del municipio; sin licencia de reutilización declarada', now(), ${fs.length}, ${filas.length}) RETURNING id`;
    for (let i = 0; i < filas.length; i += 100) {
      await sql`WITH n AS (INSERT INTO zoning_layer (fuente, municipio_dane, capa, subtipo, attrs, geom, snapshot_id)
          SELECT ${fuente}, ${dane}, 'amenaza', 'avenidas_torrenciales', x->'attrs', ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)), 3)), ${snap.id}
          FROM jsonb_array_elements(${JSON.stringify(filas.slice(i, i + 100))}::jsonb) x RETURNING id, fuente, municipio_dane, capa, subtipo, attrs, geom)
        INSERT INTO zoning_sub (zoning_id, fuente, municipio_dane, capa, subtipo, attrs, area_orig, geom)
        SELECT id, fuente, municipio_dane, capa, subtipo, attrs, ST_Area(geom), ST_Subdivide(geom, 128) FROM n`;
    }
    console.log(`avenida torrencial ${fuente}: ${filas.length}`);
  }
}

async function planes() {
  await sql`DELETE FROM instrumento_plan`;
  const capas: [string, string, (p: any) => Record<string, unknown>][] = [
    [`${I}/DISTRITO_MEDELLIN_POT/MapServer/4`, "idem_medellin_planificacion", (p) => ({ instrumento: s(p.INSTRUMENTO), nombre: s(p.SIMBOLOGIA), codigo: s(p.CODIGO_TRATAMIENTO), nivel: s(p.NIVEL), categoria: s(p.CATEGORIA) })],
    [`${I}/POT_Envigado/MapServer/3`, "idem_envigado_planes_parciales", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE), codigo: s(p.CODIGO), estado: s(p.ESTADO), categoria: s(p.PERIMETRO) })],
    [`${I}/POT_Envigado/MapServer/4`, "idem_envigado_planes_parciales_desarrollo", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE ?? p.SIMBOLOGIA), codigo: s(p.CODIGO), estado: s(p.ESTADO), categoria: s(p.PERIMETRO) })],
    [`${I}/POT_Itagui/MapServer/3`, "idem_itagui_planes_parciales", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE ?? p.SIMBOLOGIA), codigo: s(p.CODIGO), estado: s(p.ESTADO) })],
    [`${I}/POT_Sabaneta/MapServer/6`, "idem_sabaneta_planes_parciales", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE ?? p.SIMBOLOGIA), codigo: s(p.CODIGO), estado: s(p.ESTADO) })],
    [`${I}/Bello_POT/MapServer/8`, "idem_bello_planes_parciales", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE ?? p.SIMBOLOGIA), codigo: s(p.CODIGO), estado: s(p.ESTADO) })],
    [`${I}/AMVA_POT/MapServer/6`, "idem_amva_planes_parciales", (p) => ({ instrumento: "Plan parcial", nombre: s(p.NOMBRE ?? p.SIMBOLOGIA) })],
  ];
  for (const [url, fuente, map] of capas) {
    try {
      const fs = await todo(url);
      await insertar("instrumento_plan", fs.map((f) => ({ fuente, municipio_dane: DANE[String(f.properties.CODIGO_MUN ?? "").padStart(3, "0")] ?? null, ...map(f.properties), geom: f.geometry ? JSON.stringify(f.geometry) : null })), "poligono");
      console.log(`${fuente}: ${fs.length}`);
    } catch (e) { console.log(`${fuente}: no se pudo (${(e as Error).message})`); }
  }
  // La capa metropolitana repite polígonos municipales: se quitan los que coinciden con uno ya cargado del mismo municipio
  await sql`DELETE FROM instrumento_plan a USING instrumento_plan b WHERE a.fuente = 'idem_amva_planes_parciales' AND b.fuente <> a.fuente
    AND b.municipio_dane = a.municipio_dane AND ST_Area(ST_Intersection(a.geom, b.geom)) > 0.8 * ST_Area(a.geom)`;
}

async function arboles() {
  // Censo de arbolado urbano de Medellín (patrimonio cultural y común): especie, estado y ubicación.
  const capas: [string, boolean][] = [[`${G}/ambiente_dllo_sost/VA_SistemaArbolUrbano_Ciudadano/MapServer/0`, true], [`${G}/ambiente_dllo_sost/VA_SistemaArbolUrbano_Ciudadano/MapServer/1`, false]];
  let n = 0;
  for (const [url, patrimonial] of capas) {
    for await (const pag of queryAll(url, { outFields: "id_individuo_disperso,s_especie,nombre_comun,tipoarbol,s_estado_arbol,s_estado_individuo" })) {
      const filas = pag.filter((f) => f.geometry).map((f) => {
        const g: any = f.geometry; const c = g.type === "MultiPoint" ? g.coordinates[0] : g.coordinates;
        return { id: Number(f.properties.id_individuo_disperso), especie: s(f.properties.s_especie), comun: s(f.properties.nombre_comun), pat: patrimonial || /patrimon/i.test(String(f.properties.tipoarbol ?? "")),
          estado: s(f.properties.s_estado_individuo ?? f.properties.s_estado_arbol), lon: c?.[0], lat: c?.[1] };
      }).filter((x) => Number.isFinite(x.id) && Number.isFinite(x.lon));
      if (!filas.length) continue;
      await sql`INSERT INTO arbol (id, municipio_dane, especie, nombre_comun, patrimonial, estado, geom)
        SELECT (x->>'id')::bigint, '05001', x->>'especie', x->>'comun', (x->>'pat')::boolean, x->>'estado', ST_SetSRID(ST_MakePoint((x->>'lon')::float, (x->>'lat')::float), 4326)
        FROM jsonb_array_elements(${JSON.stringify(filas)}::jsonb) x
        ON CONFLICT (id) DO UPDATE SET patrimonial = arbol.patrimonial OR EXCLUDED.patrimonial, especie = EXCLUDED.especie, estado = EXCLUDED.estado, geom = EXCLUDED.geom`;
      n += filas.length; if (n % 20000 < filas.length) console.log(`  árboles ${n}`);
    }
  }
  console.log(`árboles: ${n}`);
}

const que = process.argv[2];
await esquema();
if (!que || que === "cauces") await cauces();
if (!que || que === "retiros") await retiros();
if (!que || que === "cauces_municipales") await caucesMunicipales();
if (!que || que === "torrencial") await torrencial();
if (!que || que === "planes") await planes();
if (!que || que === "arboles") await arboles();
console.log(JSON.stringify(await sql`SELECT 'cauces' t, count(*)::int n FROM hidro_cauce UNION ALL SELECT 'retiros', count(*)::int FROM hidro_retiro UNION ALL SELECT 'planes', count(*)::int FROM instrumento_plan UNION ALL SELECT 'arboles', count(*)::int FROM arbol`));
