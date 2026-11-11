// Ingesta v2 en streaming.
//   npm run ingest -- <clave> [<clave> ...]      fuentes concretas
//   npm run ingest -- --grupo valle               todas las de un grupo (suelo, medellin, valle, oriente, <dane>)
//   npm run ingest -- --grupo 05266 --reanudar    retoma desde el último punto de control
// Cada página se inserta al llegar con el snapshot nuevo; al final se borran las filas de snapshots
// anteriores de esa fuente. Si se corta, lo anterior sigue en pie y --reanudar continúa.

import { mkdirSync, appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { count, queryAll, wfsAll, wfsCount, type Feature } from "./arcgis";
import { SOURCES, type Source } from "./sources";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
const RAW_DIR = join(process.cwd(), "data", "raw");

const GEOM = (g: string) => `ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(${g}), 4326)), 3))`;
const TABLE = { parcel: "parcel", building: "building", zoning: "zoning_layer", licence: "licence" } as const;

async function insertPage(src: Source, feats: Feature[], snap: number): Promise<number> {
  const rows = feats.flatMap((f) => {
    if (!f.geometry) return [];
    const m = src.map(f.properties);
    if (!m) return [];
    const mun = (m.municipio_dane as string) ?? src.municipio;
    if (!mun) return [];
    return [{ ...m, municipio_dane: mun, g: JSON.stringify(f.geometry) }];
  });
  if (!rows.length) return 0;
  const j = JSON.stringify(rows);
  switch (src.target) {
    case "parcel": {
      const r = await db.query(
        `INSERT INTO parcel (id, municipio_dane, clave_local, clase, geom, area_lote, tipo_lote, fuente, snapshot_id)
         -- Varias entidades con la misma clave = partes del mismo terreno: se unen y se suman sus áreas.
         SELECT x.municipio_dane || ':' || x.clave, x.municipio_dane, x.clave, min(x.clase),
                ST_Multi(ST_CollectionExtract(ST_Union(x.geom), 3)),
                COALESCE(sum(x.area_lote), round(ST_Area(ST_Union(x.geom)::geography)::numeric, 1)), min(x.tipo_lote), $2, $3
         FROM (SELECT r.*, ${GEOM("r.g")} AS geom
               FROM jsonb_to_recordset($1::jsonb) AS r(clave text, clase text, area_lote numeric, tipo_lote text,
                                                       municipio_dane text, g text)
               WHERE r.clave IS NOT NULL) x
         WHERE NOT ST_IsEmpty(x.geom)
         GROUP BY x.municipio_dane, x.clave
         ON CONFLICT (id) DO UPDATE SET
           geom = CASE WHEN parcel.snapshot_id = EXCLUDED.snapshot_id
                       THEN ST_Multi(ST_CollectionExtract(ST_Union(parcel.geom, EXCLUDED.geom), 3)) ELSE EXCLUDED.geom END,
           area_lote = CASE WHEN parcel.snapshot_id = EXCLUDED.snapshot_id
                            THEN parcel.area_lote + EXCLUDED.area_lote ELSE EXCLUDED.area_lote END,
           clase = EXCLUDED.clase, tipo_lote = EXCLUDED.tipo_lote, fuente = EXCLUDED.fuente, snapshot_id = EXCLUDED.snapshot_id`,
        [j, src.key, snap],
      );
      return r.rowCount ?? 0;
    }
    case "building": {
      const r = await db.query(
        `INSERT INTO building (id, municipio_dane, pisos, area_construida, huella_m2, uso, pt, fuente, snapshot_id)
         SELECT DISTINCT ON (x.oid) $4 || ':' || x.oid, x.municipio_dane, x.pisos,
                COALESCE(x.area_construida, round((ST_Area(x.geom::geography) * GREATEST(COALESCE(x.pisos, 1), 1))::numeric, 1)),
                round(ST_Area(x.geom::geography)::numeric, 1), x.uso, ST_PointOnSurface(x.geom), $2, $3
         FROM (SELECT r.*, ${GEOM("r.g")} AS geom
               FROM jsonb_to_recordset($1::jsonb) AS r(oid text, pisos numeric, area_construida numeric, uso text,
                                                       municipio_dane text, g text)) x
         WHERE NOT ST_IsEmpty(x.geom)
         ON CONFLICT (id) DO UPDATE SET pisos = EXCLUDED.pisos, area_construida = EXCLUDED.area_construida,
           huella_m2 = EXCLUDED.huella_m2, uso = EXCLUDED.uso, pt = EXCLUDED.pt, parcel_id = NULL, fuente = EXCLUDED.fuente,
           snapshot_id = EXCLUDED.snapshot_id`,
        [j, src.key, snap, src.idPrefix ?? src.key],
      );
      return r.rowCount ?? 0;
    }
    case "zoning": {
      const r = await db.query(
        `INSERT INTO zoning_layer (fuente, municipio_dane, capa, subtipo, attrs, geom, snapshot_id)
         SELECT $2, x.municipio_dane, $3, $4, x.attrs, x.geom, $5
         FROM (SELECT r.municipio_dane, r.attrs, ${GEOM("r.g")} AS geom
               FROM jsonb_to_recordset($1::jsonb) AS r(municipio_dane text, attrs jsonb, g text)) x
         WHERE NOT ST_IsEmpty(x.geom)`,
        [j, src.key, src.capa, src.subtipo ?? null, snap],
      );
      return r.rowCount ?? 0;
    }
    case "licence": {
      const r = await db.query(
        `INSERT INTO licence (id, parcel_id, municipio_dane, curaduria, anio, objeto, nombre_proyecto, radicado, resolucion,
                              direccion, geom, fuente, snapshot_id)
         SELECT DISTINCT ON (r.oid) $2 || ':' || r.oid, CASE WHEN r.clave IS NOT NULL THEN r.municipio_dane || ':' || r.clave END,
                r.municipio_dane, r.curaduria, r.anio, r.objeto, r.nombre_proyecto, r.radicado, r.resolucion, r.direccion,
                ST_SetSRID(ST_GeomFromGeoJSON(r.g), 4326), $2, $3
         FROM jsonb_to_recordset($1::jsonb) AS r(oid text, clave text, curaduria text, anio int, objeto text, nombre_proyecto text,
                                                 radicado text, resolucion text, direccion text, municipio_dane text, g text)
         ON CONFLICT (id) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id, parcel_id = EXCLUDED.parcel_id`,
        [j, src.key, snap],
      );
      return r.rowCount ?? 0;
    }
  }
}

async function ingest(src: Source, reanudar: boolean) {
  const t0 = Date.now();
  const esperado = src.wfsType ? await wfsCount(src.url, src.wfsType) : await count(src.url, { where: src.where });
  let snap: number;
  let desde = 0;
  const cp = reanudar ? (await db.query("SELECT * FROM ingest_checkpoint WHERE fuente = $1", [src.key])).rows[0] : null;
  if (cp) {
    snap = cp.snapshot_id;
    desde = cp.offset_n;
    console.log(`\n▶ ${src.key}: reanudando en ${desde} de ${esperado}`);
  } else {
    const { rows } = await db.query(
      `INSERT INTO source_snapshot (fuente, nombre, url, filtro, tipo_dato, licencia, esperado, notas)
       VALUES ($1, $2, $3, $4, 'oficial', $5, $6, $7) RETURNING id`,
      [src.key, src.nombre, src.wfsType ? `${src.url} · ${src.wfsType}` : src.url, src.where ?? null, src.licencia, esperado, src.notas ?? null],
    );
    snap = rows[0].id;
    console.log(`\n▶ ${src.key}: ${esperado} registros esperados`);
  }

  mkdirSync(join(RAW_DIR, src.key), { recursive: true });
  const rawFile = join(RAW_DIR, src.key, `${new Date().toISOString().slice(0, 10)}.ndjson`);
  if (!cp) writeFileSync(rawFile, "");

  let descargados = desde;
  const pages = src.wfsType ? wfsAll(src.url, src.wfsType) : queryAll(src.url, { where: src.where }, esperado, desde, src.pageSize);
  for await (const page of pages) {
    appendFileSync(rawFile, page.map((f) => JSON.stringify(f)).join("\n") + "\n");
    await insertPage(src, page, snap);
    descargados += page.length;
    await db.query(
      `INSERT INTO ingest_checkpoint (fuente, snapshot_id, offset_n, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (fuente) DO UPDATE SET snapshot_id = $2, offset_n = $3, updated_at = now()`,
      [src.key, snap, descargados],
    );
    process.stdout.write(`  ${descargados}/${esperado}\r`);
  }

  // Cierre: quitar lo de snapshots anteriores de esta fuente y registrar el conteo real.
  const table = TABLE[src.target];
  await db.query(`DELETE FROM ${table} WHERE fuente = $1 AND snapshot_id <> $2`, [src.key, snap]);
  const total = (await db.query(`SELECT count(*)::int n FROM ${table} WHERE snapshot_id = $1`, [snap])).rows[0].n;
  await db.query("UPDATE source_snapshot SET registros = $1 WHERE id = $2", [total, snap]);
  await db.query("DELETE FROM ingest_checkpoint WHERE fuente = $1", [src.key]);
  const estado = total === esperado ? "OK" : "REVISAR";
  console.log(`  ${estado}: ${total} en base · ${descargados} descargados · ${esperado} esperados · ${Math.round((Date.now() - t0) / 1000)} s`);
}

/** Enlaza construcciones sin predio al predio que contiene su punto interior. */
async function enlazarConstrucciones() {
  const t0 = Date.now();
  const r = await db.query(
    `UPDATE building b SET parcel_id = p.id
     FROM parcel p
     WHERE b.parcel_id IS NULL AND b.pt IS NOT NULL AND p.municipio_dane = b.municipio_dane AND ST_Contains(p.geom, b.pt)`,
  );
  console.log(`\nConstrucciones enlazadas a predio: ${r.rowCount} (${Math.round((Date.now() - t0) / 1000)} s)`);
}

async function main() {
  const args = process.argv.slice(2);
  const reanudar = args.includes("--reanudar");
  const soloEnlazar = args.includes("--enlazar");
  const gi = args.indexOf("--grupo");
  const grupo = gi >= 0 ? args[gi + 1] : null;
  const claves = args.filter((a, i) => !a.startsWith("--") && (gi < 0 || i !== gi + 1));
  if (soloEnlazar) {
    await enlazarConstrucciones();
    await db.end();
    return;
  }
  const lista = grupo ? SOURCES.filter((s) => s.grupo.includes(grupo)) : SOURCES.filter((s) => claves.includes(s.key));
  if (!lista.length) throw new Error(`Nada que cargar. Claves disponibles:\n${SOURCES.map((s) => s.key).join("\n")}`);
  // Predios primero: el resto se enlaza a ellos.
  const orden = { parcel: 0, building: 1, zoning: 2, licence: 3 };
  lista.sort((a, b) => orden[a.target] - orden[b.target]);
  const fallas: string[] = [];
  for (const src of lista) {
    if (reanudar) {
      // Con --reanudar se saltan las fuentes que ya cerraron bien en las últimas 24 h.
      const hecho = (await db.query(
        `SELECT 1 FROM source_snapshot WHERE fuente = $1 AND registros IS NOT NULL AND fetched_at > now() - interval '24 hours'
           AND NOT EXISTS (SELECT 1 FROM ingest_checkpoint WHERE fuente = $1)`, [src.key])).rowCount;
      if (hecho) { console.log(`· ${src.key}: ya cargada, se salta`); continue; }
    }
    try {
      await ingest(src, reanudar);
    } catch (err) {
      fallas.push(`${src.key}: ${(err as Error).message}`);
      console.error(`  ✗ ${src.key}: ${(err as Error).message}`);
    }
  }
  if (lista.some((s) => s.target === "building")) await enlazarConstrucciones();
  if (fallas.length) console.log(`\nFallas (${fallas.length}):\n  ${fallas.join("\n  ")}`);
  await db.end();
}

main().catch(async (err) => {
  console.error(err);
  await db.end();
  process.exit(1);
});
