// Importa exportaciones de Galería Inmobiliaria (Excel "Soportes" o estudios armados con él) a galeria_proyecto.
//   npm run galeria -- <archivo.xlsx> [--corte 2026-11-01]
// Busca en todas las hojas una fila de encabezado con "Código" y "Proyecto" y mapea las columnas por nombre.
// Ubica cada proyecto: 1) por nombre contra el catálogo de proyectos (Zonario, con coordenadas);
// 2) en Medellín, por dirección contra la nomenclatura oficial; 3) por barrio/municipio (centro aproximado).

import ExcelJS from "exceljs";
import pg from "pg";

import { COLUMNAS as COLUMNAS_GALERIA, leerLibroGaleria, norm } from "../lib/galeria_parse";

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
    const dane = mun(r.sub_zona, r.ciudad);
    const nombreBase = norm(String(r.proyecto).replace(/\(.*?\)|\*|\.+$/g, " ")).trim();
    await db.query(
      `INSERT INTO galeria_proyecto (${Object.keys(r).join(", ")}, fecha_corte, municipio_dane, archivo)
       VALUES (${Object.keys(r).map((_, i) => `$${i + 1}`).join(", ")}, $${Object.keys(r).length + 1}, $${Object.keys(r).length + 2}, $${Object.keys(r).length + 3})
       ON CONFLICT (codigo, fecha_corte) DO UPDATE SET ${Object.keys(r).map((k) => `${k} = EXCLUDED.${k}`).join(", ")},
         municipio_dane = EXCLUDED.municipio_dane, archivo = EXCLUDED.archivo, importado_en = now()`,
      [...Object.values(r), corte, dane, nombreArchivo],
    );
    // 1) Nombre contra el catálogo de proyectos (coordenadas de Zonario).
    let u = await db.query(
      `UPDATE galeria_proyecto g SET geom = p.geom, ubicacion_metodo = 'zonario'
       FROM (SELECT geom FROM project WHERE geom IS NOT NULL AND ($3::text IS NULL OR municipio_dane = $3)
               AND (clave = $4 OR clave LIKE $4 || ' %' OR $4 LIKE clave || ' %') LIMIT 1) p
       WHERE g.codigo = $1 AND g.fecha_corte = $2 RETURNING 1`, [r.codigo, corte, dane, nombreBase]);
    // 2) Medellín: dirección contra la nomenclatura oficial.
    if (!u.rowCount && dane === "05001" && r.direccion) {
      const m = String(r.direccion).toUpperCase().replace(/\./g, "").match(/^(CL|CR|CRA|KR|AV|TV|DG|CIRC)\w*\s+(\d+\w*(?:\s+SUR)?)\s*#\s*(\d+\w*)\s*-\s*(\d+)/);
      if (m) {
        const via = `${m[1] === "CRA" || m[1] === "KR" ? "CR" : m[1]} ${m[2]}`.replace(/\s+/g, " ");
        const placa = `${m[3]}-${m[4].padStart(2, "0")}`;
        const res = await fetch(`https://www.medellin.gov.co/servidormapas/rest/services/ServiciosCatastro/Base_Catastral/MapServer/8/query?` +
          new URLSearchParams({ where: `via = '${via}' AND placa LIKE '${placa}%'`, outFields: "latitud,longitud", returnGeometry: "false", f: "json" }),
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.3)" } }).then((x) => x.json()).catch(() => ({}));
        const a = res.features?.[0]?.attributes;
        if (a?.latitud) {
          u = await db.query(`UPDATE galeria_proyecto SET geom = ST_SetSRID(ST_MakePoint($3, $4), 4326), ubicacion_metodo = 'nomenclatura'
                              WHERE codigo = $1 AND fecha_corte = $2 RETURNING 1`, [r.codigo, corte, a.longitud, a.latitud]);
        }
      }
    }
    // 3) Barrio o municipio (centro aproximado, desde los barrios de Fynder).
    if (!u.rowCount) {
      u = await db.query(
        `UPDATE galeria_proyecto g SET geom = b.pt, ubicacion_metodo = 'barrio'
         FROM (SELECT ST_Centroid(ST_Collect(pt)) AS pt FROM fynder_barrio
               WHERE pt IS NOT NULL AND (norm_txt(nombre) = norm_txt($3) OR norm_txt(comuna) = norm_txt($3)
                 OR ($4::text IS NOT NULL AND municipio_dane = $4 AND norm_txt($3) = norm_txt((SELECT nombre FROM municipio WHERE dane = $4))))) b
         WHERE g.codigo = $1 AND g.fecha_corte = $2 AND b.pt IS NOT NULL RETURNING 1`, [r.codigo, corte, r.sub_zona ?? "", dane]);
    }
    // Control: una coincidencia por nombre a más de 4 km del barrio/municipio que reporta Galería es otro proyecto.
    await db.query(
      `UPDATE galeria_proyecto g SET geom = ref.pt, ubicacion_metodo = 'barrio'
       FROM (SELECT ST_Centroid(ST_Collect(pt)) AS pt FROM fynder_barrio
             WHERE pt IS NOT NULL AND (norm_txt(nombre) = norm_txt($3) OR norm_txt(comuna) = norm_txt($3)
               OR ($4::text IS NOT NULL AND municipio_dane = $4 AND norm_txt($3) = norm_txt((SELECT nombre FROM municipio WHERE dane = $4))))) ref
       WHERE g.codigo = $1 AND g.fecha_corte = $2 AND g.ubicacion_metodo = 'zonario' AND ref.pt IS NOT NULL
         AND NOT ST_DWithin(g.geom::geography, ref.pt::geography, 4000)`, [r.codigo, corte, r.sub_zona ?? "", dane]);
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
