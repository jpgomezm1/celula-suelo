// Fachada del lote con Google Street View: busca la panorámica de calle más cercana y la orienta hacia el lote.
// Las imágenes no se guardan: se sirven al vuelo (términos de Google Maps Platform).
import { sql } from "./db";

const LLAVE = () => process.env.GOOGLE_MAPS_SERVER_KEY;

function rumbo(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = Math.PI / 180, y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
  const x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
  return (((Math.atan2(y, x) / r) % 360) + 360) % 360;
}

/** Datos de la panorámica más cercana al lote (la consulta de metadatos no tiene costo). */
export async function fachadaLote(id: string) {
  if (!LLAVE()) return { disponible: false, motivo: "Falta la llave de Google (GOOGLE_MAPS_SERVER_KEY)." };
  const [l] = await sql`SELECT ST_Y(ST_PointOnSurface(geom)) lat, ST_X(ST_PointOnSurface(geom)) lon FROM parcel WHERE id = ${id}`;
  if (!l) return { disponible: false, motivo: "Predio no encontrado" };
  const lat = Number(l.lat), lon = Number(l.lon);
  const m: any = await (await fetch(`https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lon}&radius=80&source=outdoor&key=${LLAVE()}`)).json();
  if (m.status !== "OK") return { disponible: false, motivo: m.status === "ZERO_RESULTS" ? "Google no tiene Street View a menos de 80 m del lote." : `Street View: ${m.status}${m.error_message ? ` (${m.error_message})` : ""}` };
  const heading = Math.round(rumbo(m.location.lat, m.location.lng, lat, lon));
  return { disponible: true, pano: m.pano_id as string, fecha: m.date as string | undefined, heading, lat: m.location.lat, lon: m.location.lng,
    abrir: `https://www.google.com/maps/@?api=1&map_action=pano&pano=${m.pano_id}&heading=${heading}&pitch=5`,
    atribucion: m.copyright ?? "© Google" };
}

/** Imagen JPG de la fachada (proxy, para no exponer la llave del servidor). */
export async function imagenFachada(pano: string, heading: number, ancho = 640, alto = 400) {
  const u = `https://maps.googleapis.com/maps/api/streetview?size=${Math.min(640, ancho)}x${Math.min(640, alto)}&pano=${encodeURIComponent(pano)}&heading=${heading}&pitch=5&fov=80&source=outdoor&key=${LLAVE()}`;
  const r = await fetch(u);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
}
