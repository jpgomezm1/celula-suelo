// Carga avisos de lotes exportados del MCP de Fynder: npm run fynder -- data/fynder-lotes-el-poblado.json
// Fynder no trae coordenadas: si la zona coincide con un barrio catastral se ubica en su centro
// (confianza baja); si solo dice "Poblado" queda como aviso de la comuna, sin punto.

import { readFileSync } from "node:fs";
import pg from "pg";

type Aviso = { id: number; titulo: string; tipo: string; zona: string | null; precio: number; area: number;
  precio_m2: number; link: string; nota?: string };

const GENERIC = new Set(["el", "poblado", "sector", "lote", "en", "la", "de", "medellin", "-"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function main() {
  const file = process.argv[2] ?? "data/fynder-lotes-el-poblado.json";
  const data = JSON.parse(readFileSync(file, "utf8"));
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  await db.query("BEGIN");
  const { rows } = await db.query(
    `INSERT INTO source_snapshot (fuente, nombre, url, filtro, tipo_dato, licencia, esperado, registros, notas)
     VALUES ('fynder_lotes', 'Lotes publicados · Fynder', 'https://getfynder.com', $1, 'anunciado',
             'Datos internos de Fynder (contrato de datos interno pendiente)', $2, $2, $3) RETURNING id`,
    [data.consulta, data.avisos.length, `Capturado ${data.capturado_en}`],
  );
  const snap = rows[0].id;
  await db.query("DELETE FROM listing WHERE fuente = 'fynder'");

  for (const a of data.avisos as Aviso[]) {
    const tokens = norm(a.zona ?? "").split(/[\s,]+/).filter((t) => t && !GENERIC.has(t));
    let geomSql = "NULL";
    let metodo = "comuna";
    const params: unknown[] = [];
    if (tokens.length) {
      const pattern = `%${tokens.join("%")}%`;
      const m = await db.query(
        `SELECT count(*)::int n FROM zoning_layer
          WHERE capa = 'barrio' AND translate(lower(attrs->>'nombre_barrio'), 'áéíóú', 'aeiou') LIKE $1`,
        [pattern],
      );
      if (m.rows[0].n > 0) {
        metodo = "barrio";
        geomSql = `(SELECT ST_PointOnSurface(ST_Union(geom)) FROM zoning_layer
                     WHERE capa = 'barrio' AND translate(lower(attrs->>'nombre_barrio'), 'áéíóú', 'aeiou') LIKE $13)`;
        params.push(pattern);
      }
    }
    await db.query(
      `INSERT INTO listing (id, fuente, fuente_id, titulo, tipo, zona, precio, area, precio_m2, link, geom,
                            metodo_ubicacion, confianza, snapshot_id)
       VALUES ($1, 'fynder', $2, $3, $4, $5, $6, $7, $8, $9, ${geomSql}, $10, $11, $12)`,
      [`fynder:${a.id}`, String(a.id), a.titulo, a.tipo, a.zona, a.precio, a.area, a.precio_m2, a.link, metodo,
       metodo === "barrio" ? "baja" : "muy baja", snap, ...params],
    );
    console.log(`${a.id} · ${a.zona ?? "(sin zona)"} → ${metodo}`);
  }
  await db.query("COMMIT");
  await db.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
