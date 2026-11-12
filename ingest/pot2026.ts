// Carga la norma del Proyecto de Acuerdo de la revisión del POT de Medellín (v3, julio de 2026) en norma_pot2026
// y la enlaza con los polígonos actuales (POT 2014): mismo código, o renovación R → RED / REA / REV con el mismo número.
// Uso: npm run pot2026   (CSV generado con scripts/extraer_pot2026.py)
import { readFileSync } from "node:fs";
import { sql } from "../lib/db";

const FUENTE = "Proyecto de Acuerdo 104 de 2026, revisión del POT de Medellín, Tomo V versión 3 (julio de 2026), arts. 280 y 294";
const URL = "https://www.medellin.gov.co/es/wp-content/uploads/2026/07/13_Tomo_V_Proyecto-de-Acuerdo.pdf";

const [cab, ...lineas] = readFileSync("data/normas/medellin_pot2026_v3.csv", "utf8").trim().split(/\r?\n/);
const campos = cab.split(",");
const filas = lineas.map((l) => Object.fromEntries(l.split(",").map((v, i) => [campos[i], v === "" ? null : v])));

await sql`CREATE TABLE IF NOT EXISTS norma_pot2026 (
  codigo text PRIMARY KEY, densidad_viv_ha numeric, io_baja_menor_2000 numeric, io_baja_mayor_2000 numeric, io_media numeric, io_alta numeric,
  ic_residencial numeric, ic_otros_baja numeric, ic_otros_media numeric, ic_otros_alta numeric,
  densidad_adicional_viv_ha numeric, ic_adicional numeric, fuente text, url text, estado text NOT NULL DEFAULT 'proyecto_v3_julio_2026')`;
await sql`TRUNCATE norma_pot2026`;
await sql`INSERT INTO norma_pot2026 (codigo, densidad_viv_ha, io_baja_menor_2000, io_baja_mayor_2000, io_media, io_alta, ic_residencial,
            ic_otros_baja, ic_otros_media, ic_otros_alta, densidad_adicional_viv_ha, ic_adicional, fuente, url)
  SELECT x->>'codigo', (x->>'densidad_viv_ha')::numeric, (x->>'io_baja_mixtura_lote_menor_2000')::numeric, (x->>'io_baja_mixtura_lote_mayor_2000')::numeric,
         (x->>'io_media_mixtura')::numeric, (x->>'io_alta_mixtura')::numeric, (x->>'ic_residencial')::numeric, (x->>'ic_otros_usos_baja')::numeric,
         (x->>'ic_otros_usos_media')::numeric, (x->>'ic_otros_usos_alta')::numeric, (x->>'densidad_adicional_viv_ha')::numeric, (x->>'ic_adicional')::numeric,
         ${FUENTE}, ${URL}
  FROM jsonb_array_elements(${JSON.stringify(filas)}::jsonb) x`;

// Equivalencia código 2014 → código 2026
await sql`CREATE OR REPLACE VIEW norma_pot2026_equivalencia AS
  WITH viejos AS (SELECT DISTINCT codigo_tratamiento AS c14 FROM parcel_profile WHERE municipio_dane = '05001' AND codigo_tratamiento IS NOT NULL)
  SELECT v.c14, COALESCE(
      (SELECT codigo FROM norma_pot2026 WHERE codigo = v.c14),
      (SELECT codigo FROM norma_pot2026 n WHERE v.c14 ~ '^Z[0-9]+_R_[0-9]+$'
         AND n.codigo ~ ('^' || split_part(v.c14, '_', 1) || '_RE[DAV]_' || split_part(v.c14, '_', 3) || '$') LIMIT 1)) AS c26
  FROM viejos v`;
const [c] = await sql`SELECT count(*)::int AS total, count(c26)::int AS con_equivalente FROM norma_pot2026_equivalencia`;
const [p] = await sql`SELECT count(*)::int AS predios, count(e.c26)::int AS con_norma_2026 FROM parcel_profile pp
                      LEFT JOIN norma_pot2026_equivalencia e ON e.c14 = pp.codigo_tratamiento WHERE pp.municipio_dane = '05001'`;
const sin = await sql`SELECT c14 FROM norma_pot2026_equivalencia WHERE c26 IS NULL ORDER BY 1`;
console.log(`norma_pot2026: ${filas.length} polígonos · códigos 2014 con equivalente: ${c.con_equivalente}/${c.total} · predios de Medellín con norma 2026: ${p.con_norma_2026}/${p.predios}`);
console.log(`sin equivalente: ${sin.map((r: any) => r.c14).join(", ")}`);
