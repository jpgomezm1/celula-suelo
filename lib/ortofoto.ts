// Ortofoto del lote: imagen aérea recortada al lote y su entorno, con el lindero dibujado encima.
// Las fuentes por municipio se configuran en FUENTES; si ninguna responde, el estudio usa el mapa vectorial.
import { sql } from "./db";

type Fuente = { nombre: string; municipios: string[] | "*"; url: (b: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) => string; srid: number; atribucion: string };

// Servicios públicos verificados (export por bbox, nov. 2026). De más nítido a más general; Esri queda por fuera porque
// sus términos no permiten guardar las imágenes exportadas.
const GM = "https://www.medellin.gov.co/servidormapas/rest/services";
const img = (url: string) => (b: { x0: number; y0: number; x1: number; y1: number }, w: number, h: number) =>
  `${url}${url.includes("?") ? "&" : "?"}bbox=${b.x0},${b.y0},${b.x1},${b.y1}&bboxSR=3857&imageSR=3857&size=${w},${h}&format=jpg&f=image`;
const ORIENTE = ["05615", "05607", "05376", "05318", "05440", "05148", "05400"];
export const FUENTES: Fuente[] = [
  { nombre: "Ortofoto de Medellín 2024", municipios: ["05001"], srid: 3857, atribucion: "Ortofoto Medellín 2024 · Alcaldía de Medellín (GeoMedellín)", url: img(`${GM}/ServiciosImagen/Ortofoto_Medellin_2024/ImageServer/exportImage?bandIds=0,1,2`) },
  { nombre: "Ortofoto de Bello 2021", municipios: ["05088"], srid: 3857, atribucion: "Ortofoto Bello 2021 · servicio de GeoMedellín", url: img(`${GM}/ServiciosImagen/ortofoto_bello_2021_jp2/ImageServer/exportImage?bandIds=0,1,2`) },
  { nombre: "Ortofoto verdadera de Itagüí", municipios: ["05360"], srid: 3857, atribucion: "Ortofoto verdadera 8 cm · Alcaldía de Itagüí", url: img("https://arcgis.itagui.gov.co/waserver/rest/services/ServiciosImagen/True_Itagui_EPSG9377_08CM_tif/ImageServer/exportImage?bandIds=0,1,2") },
  { nombre: "Ortofoto urbana de Antioquia 2022–2023", municipios: ["05631", "05380", "05129", "05212", "05308", "05079", "05266", ...ORIENTE], srid: 3857, atribucion: "Mosaico urbano 10 cm · Gobernación de Antioquia (GeoAntioquia)", url: img("https://geodatos.antioquia.gov.co/image/rest/services/Mosaicos_2022/Mosaico_Urbano_1K/ImageServer/exportImage?bandIds=0,1,2") },
  { nombre: "Ortofoto del Oriente antioqueño 1:5.000", municipios: ORIENTE, srid: 3857, atribucion: "Antioquia Oriente 1:5.000 · servicio de GeoMedellín", url: img(`${GM}/ServiciosImagen/Antioquia_Oriente_5000/ImageServer/exportImage?bandIds=0,1,2`) },
  { nombre: "Mosaico de imágenes del Valle de Aburrá", municipios: "*", srid: 3857, atribucion: "Mosaico de imágenes 2024 · Alcaldía de Medellín (GeoMedellín)", url: img(`${GM}/ServiciosCiudad/IMAGEN_WEBM_2024/MapServer/export`) },
];

export async function ortofotoLote(id: string, w = 1600, h = 1000) {
  const [b]: any = await sql`WITH l AS (SELECT ST_Transform(geom, 3857) g, geom FROM parcel WHERE id = ${id}), c AS (SELECT ST_Centroid(g) c, greatest(ST_XMax(g) - ST_XMin(g), ST_YMax(g) - ST_YMin(g)) r FROM l)
    SELECT ST_X(c) cx, ST_Y(c) cy, r, (SELECT municipio_dane FROM parcel WHERE id = ${id}) dane FROM c`;
  if (!b) return null;
  const half = Math.max(120, Number(b.r) * 0.9), x0 = b.cx - half * (w / h), x1 = b.cx + half * (w / h), y0 = b.cy - half, y1 = b.cy + half;
  for (const f of FUENTES.filter((f) => f.municipios === "*" || f.municipios.includes(b.dane))) {
    try {
      const r = await fetch(f.url({ x0, y0, x1, y1 }, w, h), { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(20000) });
      const mime = (r.headers.get("content-type") ?? "").split(";")[0];
      if (!r.ok || !/^image\/(png|jpeg)$/.test(mime)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length / (w * h) < 0.04) continue; // imagen vacía (fuera de la cobertura del servicio)
      // Lindero del lote en coordenadas de la imagen
      const [g]: any = await sql`SELECT ST_AsGeoJSON(ST_Transform(geom, 3857), 1)::json j FROM parcel WHERE id = ${id}`;
      const anillos = (g.j.type === "MultiPolygon" ? g.j.coordinates.map((p: any) => p[0]) : [g.j.coordinates[0]]) as number[][][];
      const lindero = anillos.map((r) => "M" + r.map(([x, y]) => `${(((x - x0) / (x1 - x0)) * w).toFixed(1)},${(((y1 - y) / (y1 - y0)) * h).toFixed(1)}`).join("L") + "Z").join("");
      return { disponible: true, fuente: f.nombre, atribucion: f.atribucion, w, h, mime, b64: buf.toString("base64"), lindero, escala_m_por_px: (x1 - x0) / w };
    } catch { /* siguiente fuente */ }
  }
  return { disponible: false, motivo: "Sin servicio de ortofoto disponible para este municipio." };
}
