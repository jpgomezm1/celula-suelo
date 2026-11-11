// Direcciones colombianas → coordenada, usando las vías y lugares de OpenStreetMap cargados en osm_via / osm_lugar.
// "Cl. 30A # 65B-59" se ubica en el cruce de la Calle 30A con la Carrera 65B, validando que caiga en el municipio esperado.

type Db = { query: (q: string, p?: unknown[]) => Promise<{ rows: any[] }> };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TIPOS: [RegExp, string][] = [
  [/^(calle|cll|cl|clle)$/, "cl"], [/^(carrera|cra|kra|kr|cr|crr)$/, "cr"], [/^(diagonal|diag|dg)$/, "dg"],
  [/^(transversal|transv|trans|trv|tv|tr)$/, "tv"], [/^(circular|circ|cq|cir)$/, "cq"], [/^(avenida|av|avda)$/, "av"],
];
const tipoVia = (t: string) => TIPOS.find(([re]) => re.test(t))?.[1] ?? null;

/** Clave canónica de una vía: "Calle 75 AB Sur" → "cl 75ab sur"; "Carrera 43A (Av. El Poblado)" → "cr 43a". */
export function normalizarVia(nombre: string): string | null {
  const s = sinTildes(nombre).replace(/^(avenida|av)\.?\s+(?=(calle|carrera|diagonal|transversal)\b)/, "").replace(/\(.*?\)/g, " ").replace(/[.,]/g, " ").replace(/(\d)([a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  const m = s.match(/^([a-z]+)\s+(\d+)((?:\s+(?!sur\b|este\b)[a-z]{1,3}\b)*)(?:\s+bis)?(?:\s+(sur|este)\b)?/);
  if (!m) return null;
  const tipo = tipoVia(m[1]);
  if (!tipo) return null;
  const letras = (m[3] ?? "").replace(/\s+/g, "");
  return `${tipo} ${m[2]}${letras}${m[4] ? ` ${m[4]}` : ""}`;
}

/** Separa la vía principal y el cruce: "Cr. 47 # 52 Sur-101" → { principal: "cr 47", cruce: ["cl 52 sur", "dg 52 sur"] }. */
export function parsearDireccion(dir: string): { principal: string; cruces: string[] } | null {
  let s = sinTildes(dir).replace(/[.,]/g, " ").replace(/n[°o]\s*/g, "# ").replace(/\bsur\b|sur(?=\s|-|$)/g, " sur ")
    .replace(/(\d)([a-z])/g, "$1 $2").replace(/\s+/g, " ").trim();
  s = s.replace(/^(calle|cll|clle|carrera|cra|kra|kr|crr|diagonal|diag|transversal|transv|trans|trv|tr|circular|circ|cir|avenida|avda)\b/, (t) => tipoVia(t) ?? t);
  const m = s.match(/^(cl|cr|dg|tv|cq|av|kr)\s+(\d+(?:\s+[a-z]{1,3}\b(?<!\bsur)(?<!\bx))*)(?:\s+bis)?(\s+sur)?\s*(?:#|x|con|y|-)\s*(?:(cl|cr|dg|tv|cq|calle|carrera|cra|kr|diagonal|transversal)\s+)?(\d+(?:\s+[a-z]{1,3}\b(?<!\bsur))*)(?:\s+bis)?(\s+sur)?/);
  if (!m) return null;
  const t1 = tipoVia(m[1]) ?? m[1];
  const n1 = m[2].replace(/\s+/g, "") + (m[3] ? " sur" : "");
  const n2 = m[5].replace(/\s+/g, "") + (m[6] ? " sur" : "");
  const t2 = m[4] ? tipoVia(m[4]) : null;
  const perpendiculares = t2 ? [t2] : t1 === "cl" ? ["cr", "tv"] : t1 === "cr" ? ["cl", "dg"] : ["cl", "cr", "dg", "tv"].filter((t) => t !== t1);
  // En el sur del valle la carrera no lleva "Sur" pero la calle sí: si el "sur" quedó en la carrera principal, pásalo al cruce.
  const cruces = perpendiculares.flatMap((t) => [`${t} ${n2}`, ...(m[3] && (t === "cl" || t === "dg") && !m[6] ? [`${t} ${m[5].replace(/\s+/g, "")} sur`] : [])]);
  return { principal: `${t1} ${n1}`, cruces: [...new Set(cruces)] };
}

/** Ubica una dirección en el municipio dado (código DANE). Devuelve null si no hay cruce confiable. */
export async function geocodificarCruce(db: Db, direccion: string, dane: string | null) {
  const p = parsearDireccion(direccion);
  if (!p || !dane) return null;
  const { rows } = await db.query(
    `WITH a AS (SELECT geom FROM osm_via WHERE clave = $1),
          b AS (SELECT geom FROM osm_via WHERE clave = ANY($2::text[])),
          c AS (SELECT ST_Centroid(ST_ShortestLine(a.geom, b.geom)) AS pt, ST_Distance(a.geom::geography, b.geom::geography) AS d
                FROM a, b WHERE ST_DWithin(a.geom, b.geom, 0.0025))
     SELECT ST_X(c.pt) AS lon, ST_Y(c.pt) AS lat, c.d
     FROM c CROSS JOIN LATERAL (SELECT municipio_dane FROM parcel WHERE ST_DWithin(geom, c.pt, 0.003) ORDER BY geom <-> c.pt LIMIT 1) m
     WHERE m.municipio_dane = $3
     ORDER BY c.d LIMIT 1`, [p.principal, p.cruces, dane]);
  // Cruce exacto (< 90 m entre vías) o aproximado (tramos sin nombre en OSM, hasta ≈ 275 m).
  return rows[0] ? { lon: Number(rows[0].lon), lat: Number(rows[0].lat), via: `${p.principal} × ${p.cruces[0]}`, aproximado: Number(rows[0].d) > 90 } : null;
}

/** Direcciones rurales ("Sector Sajonia", "Vereda La Amapola", "Don Diego - Vía Llanogrande"): nombre de lugar en OSM dentro del municipio. */
export async function geocodificarLugar(db: Db, direccion: string, dane: string | null) {
  if (!dane) return null;
  const partes = sinTildes(direccion).split(/[-,;/]| via | km\b/).map((x) => x.replace(/[^a-z0-9 ]+/g, " ").replace(/\b(vereda|vda|sector|barrio|urbanizacion|parcelacion|condominio|al lado de|cerca a|frente a|\d+ ?mts?( de)?)\b/g, " ").replace(/\s+/g, " ").trim())
    .filter((x) => x.length >= 4 && !/^\d/.test(x));
  if (!partes.length) return null;
  const { rows } = await db.query(
    `SELECT ST_X(l.geom) AS lon, ST_Y(l.geom) AS lat, l.nombre
     FROM osm_lugar l CROSS JOIN LATERAL (SELECT municipio_dane FROM parcel WHERE ST_DWithin(geom, l.geom, 0.01) ORDER BY geom <-> l.geom LIMIT 1) m
     WHERE l.clave = ANY($1::text[]) AND m.municipio_dane = $2 LIMIT 1`, [partes, dane]);
  return rows[0] ? { lon: Number(rows[0].lon), lat: Number(rows[0].lat), lugar: rows[0].nombre } : null;
}
