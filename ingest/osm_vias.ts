// Carga las vías con nombre (Calle, Carrera, Diagonal, Transversal, Circular, Avenida) y los nombres de lugares
// (veredas, sectores, barrios) de OpenStreetMap para la región. Sirven para ubicar direcciones por cruce de vías.
// Uso: npm run osm:vias   (datos © colaboradores de OpenStreetMap, licencia ODbL)
import { sql } from "../lib/db";
import { normalizarVia } from "../lib/direccion";

const BBOX = "5.90,-75.80,6.55,-75.20";
const SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

async function overpass(q: string) {
  for (const srv of SERVIDORES) {
    try {
      console.log(`  ${srv}`);
      const r = await fetch(srv, { method: "POST", body: new URLSearchParams({ data: q }),
        headers: { "User-Agent": "celula-suelo/0.3 (analisis inmobiliario)", Accept: "application/json" }, signal: AbortSignal.timeout(600_000) });
      const t = await r.text();
      if (t.trimStart().startsWith("{")) return JSON.parse(t).elements as any[];
      console.log(`  respuesta no JSON (HTTP ${r.status})`);
    } catch (e) { console.log(`  falló: ${(e as Error).message}`); }
  }
  throw new Error("Overpass no respondió");
}

await sql`CREATE TABLE IF NOT EXISTS osm_via (id bigint PRIMARY KEY, nombre text NOT NULL, clave text, geom geometry(LineString, 4326) NOT NULL)`;
await sql`CREATE INDEX IF NOT EXISTS osm_via_clave ON osm_via (clave)`;
await sql`CREATE INDEX IF NOT EXISTS osm_via_geom ON osm_via USING gist (geom)`;
await sql`CREATE TABLE IF NOT EXISTS osm_lugar (id text PRIMARY KEY, nombre text NOT NULL, clave text NOT NULL, tipo text, geom geometry(Point, 4326) NOT NULL)`;
await sql`CREATE INDEX IF NOT EXISTS osm_lugar_clave ON osm_lugar (clave)`;

console.log("Vías con nombre…");
const vias = await overpass(`[out:json][timeout:600][bbox:${BBOX}];way[highway][name~"^(Calle|Carrera|Diagonal|Transversal|Circular|Avenida|Autopista|Variante|V[ií]a)",i];out geom;`);
const filasVias = vias.filter((w) => w.geometry?.length >= 2).map((w) => ({
  id: w.id, nombre: w.tags.name, clave: normalizarVia(w.tags.name),
  wkt: `LINESTRING(${w.geometry.map((p: any) => `${p.lon} ${p.lat}`).join(",")})`,
}));
await sql`TRUNCATE osm_via`;
for (let i = 0; i < filasVias.length; i += 1000) {
  await sql`INSERT INTO osm_via (id, nombre, clave, geom)
    SELECT (x->>'id')::bigint, x->>'nombre', x->>'clave', ST_GeomFromText(x->>'wkt', 4326)
    FROM jsonb_array_elements(${JSON.stringify(filasVias.slice(i, i + 1000))}::jsonb) x ON CONFLICT (id) DO NOTHING`;
}
console.log(`osm_via: ${filasVias.length} tramos`);

console.log("Lugares con nombre…");
const lugares = await overpass(`[out:json][timeout:300][bbox:${BBOX}];(node[place~"^(suburb|neighbourhood|quarter|hamlet|village|isolated_dwelling|locality|town)$"][name];node[landuse=residential][name];way[landuse=residential][name];way[place][name];);out center tags;`);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const filasLug = lugares.map((e) => ({ id: `${e.type}/${e.id}`, nombre: e.tags.name, clave: norm(e.tags.name).replace(/^(vereda|sector|barrio|urbanizacion|parcelacion) /, ""),
  tipo: e.tags.place ?? e.tags.landuse, lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon })).filter((f) => Number.isFinite(f.lat));
await sql`TRUNCATE osm_lugar`;
for (let i = 0; i < filasLug.length; i += 1000) {
  await sql`INSERT INTO osm_lugar (id, nombre, clave, tipo, geom)
    SELECT x->>'id', x->>'nombre', x->>'clave', x->>'tipo', ST_SetSRID(ST_MakePoint((x->>'lon')::float8, (x->>'lat')::float8), 4326)
    FROM jsonb_array_elements(${JSON.stringify(filasLug.slice(i, i + 1000))}::jsonb) x ON CONFLICT (id) DO NOTHING`;
}
console.log(`osm_lugar: ${filasLug.length} lugares`);
