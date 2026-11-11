// Carga una vez los lugares de interés de OpenStreetMap del Valle de Aburrá y el Oriente cercano (transporte, comercio,
// educación, salud, parques y paraderos) en la tabla osm_poi, para que el entorno de un estudio se calcule localmente.
// Uso: npm run osm:poi   (datos © colaboradores de OpenStreetMap, licencia ODbL)
import { sql } from "../lib/db";

const BBOX = "5.95,-75.75,6.50,-75.25";
const Q = `[out:json][timeout:300][bbox:${BBOX}];(
  node[railway~"station|tram_stop"];node[public_transport=station];node[aerialway=station];
  nwr[shop~"^(mall|supermarket)$"];nwr[amenity~"^(school|university|college|hospital|clinic)$"];
  nwr[leisure=park][name];node[highway=bus_stop];
);out center tags;`;

const SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

await sql`CREATE TABLE IF NOT EXISTS osm_poi (
  id text PRIMARY KEY, nombre text, tags jsonb NOT NULL, geom geometry(Point, 4326) NOT NULL, cargado_en timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE INDEX IF NOT EXISTS osm_poi_geom ON osm_poi USING gist (geom)`;

let els: any[] | null = null;
for (const srv of SERVIDORES) {
  try {
    console.log(`Consultando ${srv}…`);
    const r = await fetch(srv, { method: "POST", body: new URLSearchParams({ data: Q }),
      headers: { "User-Agent": "celula-suelo/0.3 (analisis inmobiliario)", Accept: "application/json" }, signal: AbortSignal.timeout(360_000) });
    const t = await r.text();
    if (t.trimStart().startsWith("{")) { els = JSON.parse(t).elements ?? []; break; }
    console.log(`  respuesta no JSON (HTTP ${r.status})`);
  } catch (e) { console.log(`  falló: ${(e as Error).message}`); }
}
if (!els) throw new Error("Ningún servidor de Overpass respondió");

const filas = els.map((e) => ({ id: `${e.type}/${e.id}`, nombre: e.tags?.name ?? null, tags: e.tags ?? {}, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon }))
  .filter((f) => Number.isFinite(f.lat) && Number.isFinite(f.lon));
await sql`TRUNCATE osm_poi`;
for (let i = 0; i < filas.length; i += 500) {
  const lote = filas.slice(i, i + 500);
  await sql`INSERT INTO osm_poi (id, nombre, tags, geom)
    SELECT x->>'id', x->>'nombre', x->'tags', ST_SetSRID(ST_MakePoint((x->>'lon')::float8, (x->>'lat')::float8), 4326)
    FROM jsonb_array_elements(${JSON.stringify(lote)}::jsonb) x ON CONFLICT (id) DO NOTHING`;
}
console.log(`osm_poi: ${filas.length} lugares cargados`);
