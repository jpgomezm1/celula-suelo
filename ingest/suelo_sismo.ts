// Suelo y sismo: lo que una constructora mira para cimentación y contenciones.
//  1) Microzonificación sísmica de Medellín (14 zonas homogéneas con su espectro): digitalizada del mapa del POT
//     (data/sismo/medellin_microzonas.geojson) con los coeficientes de la Tabla 0 (data/sismo/medellin_microzonificacion.json).
//  2) Gestión del riesgo de Medellín (DAGRD, servicio público de la Alcaldía): geología, susceptibilidad sísmica,
//     inspecciones técnicas por emergencias, estudios geotécnicos, obras de mitigación y monitoreo geotécnico.
// Uso: npm run suelo_sismo [-- microzonas|dagrd]
import { readFileSync } from "node:fs";
import { sql } from "../lib/db";
import { queryAll, type Feature } from "./arcgis";

const R = "https://www.medellin.gov.co/servidormapas/rest/services/ambiente_dllo_sost/VM_Gestion_Riesgo_Publico/MapServer";
const s = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());
const fecha = (v: unknown) => (typeof v === "number" && v > 0 ? new Date(v).toISOString().slice(0, 10) : null);

async function esquema() {
  await sql`CREATE TABLE IF NOT EXISTS sismo_microzona (municipio_dane text NOT NULL, zona int NOT NULL, nombre text, coeficientes jsonb NOT NULL, fuente text NOT NULL,
    geom geometry(MultiPolygon, 4326) NOT NULL, PRIMARY KEY (municipio_dane, zona))`;
  await sql`CREATE INDEX IF NOT EXISTS sismo_microzona_geom ON sismo_microzona USING gist (geom)`;
  await sql`CREATE TABLE IF NOT EXISTS riesgo_zona (id bigserial PRIMARY KEY, fuente text NOT NULL, municipio_dane text, capa text NOT NULL, valor text, descripcion text, attrs jsonb,
    geom geometry(MultiPolygon, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS riesgo_zona_geom ON riesgo_zona USING gist (geom)`;
  await sql`CREATE INDEX IF NOT EXISTS riesgo_zona_capa ON riesgo_zona (capa)`;
  await sql`CREATE TABLE IF NOT EXISTS riesgo_punto (id bigserial PRIMARY KEY, fuente text NOT NULL, municipio_dane text, capa text NOT NULL, tipo text, fecha date, attrs jsonb,
    geom geometry(Point, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE INDEX IF NOT EXISTS riesgo_punto_geom ON riesgo_punto USING gist (geom)`;
  await sql`CREATE INDEX IF NOT EXISTS riesgo_punto_capa ON riesgo_punto (capa)`;
}

async function microzonas() {
  const meta = JSON.parse(readFileSync("data/sismo/medellin_microzonificacion.json", "utf8"));
  const geo = JSON.parse(readFileSync("data/sismo/medellin_microzonas.geojson", "utf8"));
  await sql`DELETE FROM sismo_microzona WHERE municipio_dane = ${meta.municipio_dane}`;
  for (const f of geo.features) {
    const z = meta.zonas.find((x: any) => x.zona === f.properties.zona);
    await sql`INSERT INTO sismo_microzona (municipio_dane, zona, nombre, coeficientes, fuente, geom)
      VALUES (${meta.municipio_dane}, ${z.zona}, ${z.nombre}, ${JSON.stringify({ diseno: z.diseno, control_danos: z.control_danos })}, 'medellin_microzonificacion_pot',
        ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 4326)), 3)))`;
  }
  const [r]: any = await sql`SELECT count(*)::int n, round(sum(ST_Area(geom::geography))::numeric / 1e6, 1) km2 FROM sismo_microzona WHERE municipio_dane = ${meta.municipio_dane}`;
  console.log(`microzonas: ${r.n} zonas, ${r.km2} km²`);
}

async function todo(url: string, outFields = "*"): Promise<Feature[]> { const out: Feature[] = []; for await (const p of queryAll(url, { outFields })) out.push(...p); return out; }

/** Paginación directa en GeoJSON (2.000 por página); una página que falla se reintenta una vez y si no, se salta y se reporta. */
async function puntos(url: string, outFields: string, oid: string): Promise<Feature[]> {
  const out: Feature[] = [];
  for (let off = 0; ; off += 2000) {
    const q = `${url}/query?where=1%3D1&outFields=${outFields}&orderByFields=${oid}&resultOffset=${off}&resultRecordCount=2000&outSR=4326&f=geojson`;
    let fs: Feature[] | null = null;
    for (let i = 0; i < 2 && !fs; i++) {
      try { const r = await fetch(q, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) }); const j: any = await r.json(); if (Array.isArray(j.features)) fs = j.features; } catch { /* reintento */ }
    }
    if (!fs) { console.warn(`  ⚠ página ${off} de ${url} no responde; se salta`); continue; }
    out.push(...fs);
    if (fs.length < 2000) break;
  }
  return out;
}

async function insertarZonas(capa: string, fuente: string, filas: { valor: string | null; descripcion: string | null; attrs: any; geom: any }[]) {
  await sql`DELETE FROM riesgo_zona WHERE fuente = ${fuente}`;
  for (let i = 0; i < filas.length; i += 100) {
    const lote = JSON.stringify(filas.slice(i, i + 100).filter((f) => f.geom));
    await sql`INSERT INTO riesgo_zona (fuente, municipio_dane, capa, valor, descripcion, attrs, geom)
      SELECT ${fuente}, '05001', ${capa}, x->>'valor', x->>'descripcion', x->'attrs', ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)), 3))
      FROM jsonb_array_elements(${lote}::jsonb) x`;
  }
  const [n]: any = await sql`SELECT count(*)::int n FROM riesgo_punto WHERE fuente = ${fuente}`;
  console.log(`${capa}: ${filas.length} leídos, ${n.n} cargados`);
}
async function insertarPuntos(capa: string, fuente: string, filas: { tipo: string | null; fecha: string | null; attrs: any; geom: any }[]) {
  await sql`DELETE FROM riesgo_punto WHERE fuente = ${fuente}`;
  for (let i = 0; i < filas.length; i += 1000) {
    const lote = JSON.stringify(filas.slice(i, i + 1000).filter((f) => (typeof f.geom === "string" ? f.geom.includes('"Point"') : f.geom?.type === "Point")));
    await sql`INSERT INTO riesgo_punto (fuente, municipio_dane, capa, tipo, fecha, attrs, geom)
      SELECT ${fuente}, '05001', ${capa}, x->>'tipo', (x->>'fecha')::date, x->'attrs', ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)
      FROM jsonb_array_elements(${lote}::jsonb) x`;
  }
  const [n]: any = await sql`SELECT count(*)::int n FROM riesgo_punto WHERE fuente = ${fuente}`;
  console.log(`${capa}: ${filas.length} leídos, ${n.n} cargados`);
}

async function dagrd() {
  const geol = await todo(`${R}/6`);
  await insertarZonas("geologia", "dagrd_geologia", geol.map((f) => ({ valor: s(f.properties.unidad), descripcion: s(f.properties.descripcion), attrs: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
  const sis = await todo(`${R}/4`);
  await insertarZonas("susceptibilidad_sismica", "dagrd_susceptibilidad_sismos", sis.map((f) => ({ valor: s(f.properties.aceleracion), descripcion: "Aceleración esperada (g)", attrs: null, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
  const est = await todo(`${R}/13`);
  await insertarZonas("estudio_riesgo", "dagrd_estudios", est.map((f) => ({ valor: s(f.properties.tipo_estudio), descripcion: s(f.properties.titulo),
    attrs: { anio: s(f.properties.anio), estado: s(f.properties.estado), barrio: s(f.properties.nombre_barrio_vereda) }, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
  await dagrdPuntos();
}

async function dagrdPuntos() {
  const ins = await puntos(`${R}/9`, "tipo_evento,fecha_visita,evacuacion_def,evacuacion_temp", "objectid_12");
  await insertarPuntos("inspeccion", "dagrd_inspecciones_2008_2021", ins.map((f) => ({ tipo: s(f.properties.tipo_evento), fecha: fecha(f.properties.fecha_visita),
    attrs: { evacuacion_definitiva: f.properties.evacuacion_def ?? null, evacuacion_temporal: f.properties.evacuacion_temp ?? null }, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
  // Inspecciones SIRE (2021 en adelante): el servicio público devuelve error a toda consulta (nov. 2026); se deja por fuera.
  const obras = await puntos(`${R}/14`, "*", "objectid_12");
  await insertarPuntos("obra_mitigacion", "dagrd_obras_mitigacion", obras.map((f) => ({ tipo: s(f.properties.obra_ejecutada), fecha: s(f.properties.anio) ? `${String(f.properties.anio).slice(0, 4)}-01-01` : null,
    attrs: { objeto: s(f.properties.objeto), estado: s(f.properties.estado) }, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
  const mon = await puntos(`${R}/11`, "*", "objectid");
  await insertarPuntos("monitoreo_geotecnico", "dagrd_monitoreo", mon.map((f) => ({ tipo: s(f.properties.instrumento), fecha: null,
    attrs: { estado: s(f.properties.estado), profundidad_m: f.properties.profund_instalacion ?? null }, geom: f.geometry ? JSON.stringify(f.geometry) : null })));
}

const que = process.argv[2];
await esquema();
if (!que || que === "microzonas") await microzonas();
if (!que || que === "dagrd") await dagrd();
if (que === "puntos") await dagrdPuntos();
process.exit(0);
