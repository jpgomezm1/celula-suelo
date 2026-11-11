// Conector Zonario (columna vertebral del catálogo de proyectos).
//   npm run proyectos:zonario            descarga (con caché de 7 días) y guarda en project_source
// Reglas (projects/TERMINOS.md): robots.txt lo permite; una solicitud cada 2,5 s; se guarda la URL y la fecha;
// no se republica en bloque: se usa para análisis y fichas con atribución.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const UA = "Mozilla/5.0 (compatible; celula-suelo/0.2; analisis de mercado)";
const CACHE = join(process.cwd(), "data", "raw", "zonario");
const PAUSA_MS = 2500;

/** Ciudades de Zonario dentro del alcance → DANE. */
const CIUDADES: Record<string, string> = {
  medellin: "05001", envigado: "05266", sabaneta: "05631", itagui: "05360", bello: "05088", "la-estrella": "05380",
  caldas: "05129", copacabana: "05212", girardota: "05308", barbosa: "05079", rionegro: "05615", "el-retiro": "05607",
  "la-ceja": "05376", guarne: "05318", marinilla: "05440", "el-carmen-de-viboral": "05148", "la-union": "05400",
};

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function html(url: string): Promise<{ texto: string; desdeCache: boolean }> {
  const archivo = join(CACHE, url.replace(/^https?:\/\/[^/]+\//, "").replace(/[^\w-]+/g, "_") + ".html");
  if (existsSync(archivo) && Date.now() - statSync(archivo).mtimeMs < 7 * 864e5) {
    return { texto: readFileSync(archivo, "utf8"), desdeCache: true };
  }
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  const texto = await res.text();
  writeFileSync(archivo, texto);
  return { texto, desdeCache: false };
}

type Proyecto = {
  url: string; nombre: string | null; constructora: string | null; municipio_dane: string; barrio: string | null;
  lat: number | null; lon: number | null; direccion: string | null; precio_desde: number | null; precio_hasta: number | null;
  unidades_ofertadas: number | null; area_min: number | null; area_max: number | null; habitaciones: number[];
  tipologias: { area: number; habitaciones: number | null }[]; entrega: string | null; vis: boolean | null;
  estado_obra: string | null; tipo: string | null; disponibilidad: string | null;
};

export function parsear(url: string, municipio_dane: string, h: string): Proyecto | null {
  const nodos: any[] = [];
  for (const m of h.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      nodos.push(...(d["@graph"] ?? [d]));
    } catch { /* bloque inválido: se ignora */ }
  }
  const listado = nodos.find((n) => n["@type"] === "RealEstateListing");
  const complejo = nodos.find((n) => ["ApartmentComplex", "Residence", "House", "SingleFamilyResidence"].includes(n["@type"]));
  const faq = nodos.find((n) => n["@type"] === "FAQPage");
  if (!complejo && !listado) return null;
  const respuestas: string[] = (faq?.mainEntity ?? []).map((q: any) => `${q.name} ${q.acceptedAnswer?.text ?? ""}`);
  const buscar = (re: RegExp) => respuestas.map((r) => r.match(re)?.[1]).find(Boolean) ?? null;
  const planes: any[] = complejo?.accommodationFloorPlan ?? [];
  const tipologias = planes
    .map((p) => ({ area: Number(p.floorSize?.value), habitaciones: p.numberOfBedrooms ?? null }))
    .filter((p) => Number.isFinite(p.area) && p.area > 0);
  const areas = tipologias.map((t) => t.area);
  const lugar = complejo?.containedInPlace;
  const estadoObra = buscar(/estado de obra[^?]*\?\s*(.+)$/i);
  return {
    url,
    nombre: complejo?.name ?? listado?.name ?? null,
    constructora: complejo?.provider?.name ?? listado?.offers?.seller?.name ?? null,
    municipio_dane,
    barrio: lugar?.name ?? null,
    lat: complejo?.geo?.latitude ?? null,
    lon: complejo?.geo?.longitude ?? null,
    direccion: complejo?.address?.streetAddress ?? null,
    precio_desde: listado?.offers?.lowPrice ?? null,
    precio_hasta: listado?.offers?.highPrice ?? null,
    unidades_ofertadas: listado?.offers?.offerCount ?? null,
    area_min: areas.length ? Math.min(...areas) : null,
    area_max: areas.length ? Math.max(...areas) : null,
    habitaciones: [...new Set(tipologias.map((t) => t.habitaciones).filter((x): x is number => x !== null))].sort(),
    tipologias,
    entrega: buscar(/proyectada para (\d{4})/i) ?? buscar(/entrega[^0-9]{0,40}(\d{4})/i),
    vis: respuestas.some((r) => /es VIS\?\s*S[ií]/i.test(r)) ? true : respuestas.some((r) => /es VIS\?\s*No/i.test(r)) ? false : null,
    estado_obra: estadoObra && !/no informan/i.test(estadoObra) ? estadoObra.slice(0, 200) : null,
    tipo: complejo?.["@type"] === "ApartmentComplex" ? "apartamentos" : complejo?.["@type"] ? "casas" : null,
    disponibilidad: listado?.offers?.availability?.split("/").pop() ?? null,
  };
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const sitemap = (await html("https://www.zonario.co/sitemap.xml")).texto;
  const urls = [...sitemap.matchAll(/<loc>([^<]*\/proyecto\/([^/<]+)\/[^<]+)<\/loc>/g)]
    .filter((m) => CIUDADES[m[2]])
    .map((m) => ({ url: m[1], dane: CIUDADES[m[2]] }));
  console.log(`Zonario: ${urls.length} proyectos en el alcance`);

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let ok = 0, sinDatos = 0, fallas = 0;
  for (const [i, { url, dane }] of urls.entries()) {
    try {
      const { texto, desdeCache } = await html(url);
      const p = parsear(url, dane, texto);
      if (!p) { sinDatos++; continue; }
      await db.query(
        `INSERT INTO project_source (fuente, fuente_id, url, nombre, constructora, municipio_dane, barrio, geom, datos, fetched_at, activo)
         VALUES ('zonario', $1, $1, $2, $3, $4, $5,
                 CASE WHEN $6::float8 IS NOT NULL THEN ST_SetSRID(ST_MakePoint($7, $6), 4326) END, $8, now(), true)
         ON CONFLICT (fuente, fuente_id) DO UPDATE SET nombre = EXCLUDED.nombre, constructora = EXCLUDED.constructora,
           municipio_dane = EXCLUDED.municipio_dane, barrio = EXCLUDED.barrio, geom = EXCLUDED.geom, datos = EXCLUDED.datos,
           fetched_at = now(), activo = true`,
        [url, p.nombre, p.constructora, dane, p.barrio, p.lat, p.lon, p],
      );
      ok++;
      if (!desdeCache) await dormir(PAUSA_MS);
    } catch (e) {
      fallas++;
      console.log(`  ✗ ${url}: ${(e as Error).message}`);
      await dormir(PAUSA_MS);
    }
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${urls.length}`);
  }
  // Proyectos que ya no están en el sitemap → inactivos en esta fuente.
  await db.query(`UPDATE project_source SET activo = false WHERE fuente = 'zonario' AND NOT (fuente_id = ANY($1))`, [urls.map((u) => u.url)]);
  await db.query(
    `INSERT INTO source_snapshot (fuente, nombre, url, filtro, tipo_dato, licencia, esperado, registros, notas)
     VALUES ('zonario', 'Proyectos de vivienda nueva · Zonario', 'https://www.zonario.co/sitemap.xml', '17 municipios del alcance',
             'anunciado', 'Ver projects/TERMINOS.md: uso analítico con atribución, sin republicación en bloque', $1, $2, $3)`,
    [urls.length, ok, `${sinDatos} sin datos estructurados · ${fallas} fallas`],
  );
  console.log(`Listo: ${ok} guardados · ${sinDatos} sin datos · ${fallas} fallas`);
  await db.end();
}

if (process.argv[1]?.endsWith("zonario.ts")) main().catch((e) => { console.error(e); process.exit(1); });
