// Importa exportaciones de Galería Inmobiliaria (Excel "Soportes" o estudios armados con él) a galeria_proyecto.
//   npm run galeria -- <archivo.xlsx> [--corte 2026-11-01]
// Busca en todas las hojas una fila de encabezado con "Código" y "Proyecto" y mapea las columnas por nombre.
// Ubica cada proyecto: 1) por nombre contra el catálogo de proyectos (Zonario, con coordenadas);
// 2) en Medellín, por dirección contra la nomenclatura oficial; 3) por barrio/municipio (centro aproximado).

import ExcelJS from "exceljs";
import pg from "pg";

import { COLUMNAS as COLUMNAS_GALERIA, leerLibroGaleria, norm } from "../lib/galeria_parse";
import { geocodificarCruce, geocodificarLugar } from "../lib/direccion";

export async function leerGaleria(archivo: string) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  return leerLibroGaleria(wb);
}

export async function importarGaleria(archivo: string, corte: string) {
  return importarFilasGaleria(await leerGaleria(archivo), corte, archivo.split(/[\\/]/).pop() ?? archivo);
}

export async function importarFilasGaleria(filas: Record<string, unknown>[], corte: string, nombreArchivo: string) {
  const PERMITIDAS = new Set([...Object.values(COLUMNAS_GALERIA), "rentas_cortas"]);
  filas = filas.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => PERMITIDAS.has(k)))).filter((r) => /^\d+$/.test(String(r.codigo ?? "")) && r.proyecto);
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const municipios = (await db.query("SELECT dane, nombre FROM municipio")).rows;
  const mun = (sub: unknown, ciudad: unknown) => {
    const s = norm(sub);
    const m = municipios.find((x) => norm(x.nombre) === s) ?? municipios.find((x) => s && norm(x.nombre).startsWith(s));
    if (m) return m.dane;
    return norm(ciudad).startsWith("medell") ? "05001" : null;
  };
  let ubicados = 0;
  for (const r of filas) {
    // La base ampliada trae el municipio explícito; si no está entre los 17 cubiertos queda sin municipio (no se asume Medellín).
    const dane = r.municipio ? mun(r.municipio, null) : mun(r.sub_zona, r.ciudad);
    const nombreBase = norm(String(r.proyecto).replace(/\(.*?\)|\*|\.+$/g, " ")).trim();
    // Galería cambia el formato del nombre entre cortes ("On Aptos. (Ciudad Veranova)" → "Ciudad Veranova - On Aptos."): se prueban las partes.
    const limpio = (x: string) => norm(x.replace(/\(.*?\)|\*|\.+$/g, " ").replace(/\(vt\)/gi, " ")).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
    const variantesNombre = [...new Set([nombreBase, ...String(r.proyecto).split(/\s+-\s+/).map(limpio), ...(String(r.proyecto).match(/\((.*?)\)/g) ?? []).map((x) => limpio(x.slice(1, -1)))])];
    await db.query(
      `INSERT INTO galeria_proyecto (${Object.keys(r).join(", ")}, fecha_corte, municipio_dane, archivo)
       VALUES (${Object.keys(r).map((_, i) => `$${i + 1}`).join(", ")}, $${Object.keys(r).length + 1}, $${Object.keys(r).length + 2}, $${Object.keys(r).length + 3})
       ON CONFLICT (codigo, fecha_corte) DO UPDATE SET ${Object.keys(r).map((k) => `${k} = EXCLUDED.${k}`).join(", ")},
         municipio_dane = EXCLUDED.municipio_dane, archivo = EXCLUDED.archivo, importado_en = now()`,
      [...Object.values(r), corte, dane, nombreArchivo],
    );
    const fijar = (lon: number, lat: number, metodo: string) => db.query(
      `UPDATE galeria_proyecto SET geom = ST_SetSRID(ST_MakePoint($3, $4), 4326), ubicacion_metodo = $5 WHERE codigo = $1 AND fecha_corte = $2 RETURNING 1`,
      [r.codigo, corte, lon, lat, metodo]);
    // Punto de referencia (barrio o municipio que reporta Galería) para descartar coincidencias lejanas.
    const ref = (await db.query(
      `SELECT ST_X(pt) AS lon, ST_Y(pt) AS lat FROM (SELECT ST_Centroid(ST_Collect(pt)) AS pt FROM fynder_barrio
         WHERE pt IS NOT NULL AND (norm_txt(nombre) = norm_txt($1) OR norm_txt(comuna) = norm_txt($1)
           OR ($2::text IS NOT NULL AND municipio_dane = $2 AND norm_txt($1) = norm_txt((SELECT nombre FROM municipio WHERE dane = $2))))) x
       WHERE pt IS NOT NULL`, [r.sub_zona ?? "", dane])).rows[0] ?? null;
    let u: { rowCount: number | null } = { rowCount: 0 };
    await db.query("UPDATE galeria_proyecto SET geom = NULL, ubicacion_metodo = NULL WHERE codigo = $1 AND fecha_corte = $2", [r.codigo, corte]);
    // 1) Dirección por cruce de vías (OpenStreetMap), validando el municipio.
    if (r.direccion && dane) {
      const g = await geocodificarCruce(db, String(r.direccion), dane);
      if (g) u = await fijar(g.lon, g.lat, "cruce_vias");
    }
    // 2) Nombre contra el catálogo de proyectos (Zonario), solo si queda a menos de 4 km del barrio/municipio reportado.
    if (!u.rowCount) {
      u = await db.query(
        `UPDATE galeria_proyecto g SET geom = p.geom, ubicacion_metodo = 'zonario'
         FROM (SELECT geom FROM project WHERE geom IS NOT NULL AND ($3::text IS NULL OR municipio_dane = $3)
                 AND EXISTS (SELECT 1 FROM unnest($4::text[]) n WHERE length(n) >= 4 AND (clave = n OR clave LIKE n || ' %' OR n LIKE clave || ' %'))
                 AND ($5::float8 IS NULL OR ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography, 4000)) LIMIT 1) p
         WHERE g.codigo = $1 AND g.fecha_corte = $2 RETURNING 1`, [r.codigo, corte, dane, variantesNombre, ref?.lon ?? null, ref?.lat ?? null]);
    }
    // 3) Medellín: dirección contra la nomenclatura oficial.
    if (!u.rowCount && dane === "05001" && r.direccion) {
      const m = String(r.direccion).toUpperCase().replace(/\./g, "").match(/^(CL|CR|CRA|KR|AV|TV|DG|CIRC)\w*\s+(\d+\w*(?:\s+SUR)?)\s*#\s*(\d+\w*)\s*-\s*(\d+)/);
      if (m) {
        const via = `${m[1] === "CRA" || m[1] === "KR" ? "CR" : m[1]} ${m[2]}`.replace(/\s+/g, " ");
        const placa = `${m[3]}-${m[4].padStart(2, "0")}`;
        const res = await fetch(`https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer/8/query?` +
          new URLSearchParams({ where: `via = '${via}' AND placa LIKE '${placa}%'`, outFields: "latitud,longitud", returnGeometry: "false", f: "json" }),
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.3)" }, signal: AbortSignal.timeout(15_000) }).then((x) => x.json()).catch(() => ({}));
        const a = res.features?.[0]?.attributes;
        if (a?.latitud) u = await fijar(Number(a.longitud), Number(a.latitud), "nomenclatura");
      }
    }
    // 4) Direcciones rurales: vereda o sector con nombre en OpenStreetMap.
    if (!u.rowCount && r.direccion && dane) {
      const g = await geocodificarLugar(db, String(r.direccion), dane);
      if (g) u = await fijar(g.lon, g.lat, "sector");
    }
    // 5) Centro del barrio o municipio reportado (aproximado).
    if (!u.rowCount && ref) u = await fijar(Number(ref.lon), Number(ref.lat), "barrio");
    // 6) Centro del municipio según su catastro.
    if (!u.rowCount && dane) {
      const c = (await db.query(`SELECT avg(lon) AS lon, avg(lat) AS lat FROM parcel_profile WHERE municipio_dane = $1 AND clase = 'U'`, [dane])).rows[0];
      if (c?.lon) u = await fijar(Number(c.lon), Number(c.lat), "municipio");
    }
    if (u.rowCount) ubicados++;
    else await db.query("UPDATE galeria_proyecto SET ubicacion_metodo = 'sin_ubicar' WHERE codigo = $1 AND fecha_corte = $2", [r.codigo, corte]);
  }
  await db.end();
  return { proyectos: filas.length, ubicados };
}

if (process.argv[1]?.endsWith("galeria.ts")) {
  const args = process.argv.slice(2);
  const ci = args.indexOf("--corte");
  const corte = ci >= 0 ? args[ci + 1] : new Date().toISOString().slice(0, 8) + "01";
  const archivos = args.filter((a, i) => a.endsWith(".xlsx") && i !== ci + 1);
  for (const a of archivos) {
    const r = await importarGaleria(a, corte);
    console.log(`${a.split(/[\\/]/).pop()}: ${r.proyectos} proyectos, ${r.ubicados} ubicados (corte ${corte})`);
  }
}
