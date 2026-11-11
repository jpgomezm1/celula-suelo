// Carga las normas digitalizadas: npm run normas  (lee data/normas/<dane>.csv)
// Reporta los tratamientos del servicio que quedaron sin fila; nunca inventa valores.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/** CSV con comillas dobles (RFC 4180). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  return rows;
}

const n = (s: string | undefined) => {
  if (!s || !s.trim()) return null;
  const v = Number(s.trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

const dir = join(process.cwd(), "data", "normas");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
for (const file of readdirSync(dir).filter((f) => f.endsWith(".csv"))) {
  const [header, ...rows] = parseCsv(readFileSync(join(dir, file), "utf8").replace(/^﻿/, ""));
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const dane = file.replace(".csv", "");
  await db.query("BEGIN");
  await db.query("DELETE FROM norma_tratamiento WHERE municipio_dane = $1 AND estado <> 'validada'", [dane]);
  let conNumeros = 0;
  for (const r of rows) {
    const get = (k: string) => r[idx[k]]?.trim() || null;
    const fila = {
      codigo: get("codigo"), nombre: get("nombre"), altura_max: n(get("altura_max") ?? ""), ic_base: n(get("ic_base") ?? ""),
      ic_max: n(get("ic_max") ?? ""), densidad_max: n(get("densidad_max") ?? ""), io_max: n(get("io_max") ?? ""),
    };
    if (!fila.codigo) continue;
    if (fila.altura_max ?? fila.ic_base ?? fila.ic_max ?? fila.densidad_max ?? fila.io_max) conNumeros++;
    await db.query(
      `INSERT INTO norma_tratamiento (municipio_dane, codigo, nombre, altura_max, ic_base, ic_max, densidad_max, io_max, acuerdo, articulo, url, estado, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'digitalizada_pendiente',$12)
       ON CONFLICT (municipio_dane, codigo) DO NOTHING`,
      [dane, fila.codigo, fila.nombre, fila.altura_max, fila.ic_base, fila.ic_max, fila.densidad_max, fila.io_max,
       get("acuerdo"), get("articulo"), get("url"), get("notas")],
    );
  }
  await db.query("COMMIT");
  // Tratamientos del servicio sin fila en la tabla digitalizada.
  const faltan = (await db.query(
    `SELECT DISTINCT z.attrs->>'codigo' AS codigo FROM zoning_layer z
     WHERE z.capa = 'tratamiento' AND z.municipio_dane = $1
       AND NOT EXISTS (SELECT 1 FROM norma_tratamiento nt WHERE nt.municipio_dane = $1
                       AND (nt.codigo = z.attrs->>'codigo' OR norm_txt(nt.codigo) = norm_txt(z.attrs->>'tratamiento')))`,
    [dane])).rows.map((r) => r.codigo);
  console.log(`${dane}: ${rows.length} filas, ${conNumeros} con números · códigos del servicio sin fila: ${faltan.length ? faltan.join(", ") : "ninguno"}`);
}
await db.end();
