// KMZ para Google Earth: contorno de cada lote (color por semáforo), volumen 3D del edificio posible (extruido)
// y una ficha en el globo de cada lote con norma, cabida, POT 2026 y enlaces.
import JSZip from "jszip";

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** #rrggbb + alfa (0–255) → aabbggrr de KML. */
const kmlColor = (hex: string, alfa = 255) => {
  const h = hex.replace("#", "");
  return `${alfa.toString(16).padStart(2, "0")}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`;
};

const anillo = (coords: number[][], z: number | null) => coords.map(([x, y]) => `${x.toFixed(7)},${y.toFixed(7)},${z ?? 0}`).join(" ");
function poligono(coords: number[][][], z: number | null) {
  const [ext, ...huecos] = coords;
  return `<Polygon>${z !== null ? "<extrude>1</extrude><altitudeMode>relativeToGround</altitudeMode>" : "<tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode>"}` +
    `<outerBoundaryIs><LinearRing><coordinates>${anillo(ext, z)}</coordinates></LinearRing></outerBoundaryIs>` +
    huecos.map((h) => `<innerBoundaryIs><LinearRing><coordinates>${anillo(h, z)}</coordinates></LinearRing></innerBoundaryIs>`).join("") + `</Polygon>`;
}
/** GeoJSON Polygon/MultiPolygon → geometría KML (z = altura en metros para volúmenes, null para contornos al suelo). */
export function geometriaKml(g: any, z: number | null = null) {
  if (!g) return "";
  if (g.type === "Polygon") return poligono(g.coordinates, z);
  if (g.type === "MultiPolygon") return `<MultiGeometry>${g.coordinates.map((c: any) => poligono(c, z)).join("")}</MultiGeometry>`;
  return "";
}

export const ESTILOS = `
  <Style id="lote-verde"><LineStyle><color>${kmlColor("#3f8f4a")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor("#3f8f4a", 60)}</color></PolyStyle></Style>
  <Style id="lote-amarillo"><LineStyle><color>${kmlColor("#f2a900")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor("#f2a900", 60)}</color></PolyStyle></Style>
  <Style id="lote-rojo"><LineStyle><color>${kmlColor("#c0392b")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor("#c0392b", 60)}</color></PolyStyle></Style>
  <Style id="lote-gris"><LineStyle><color>${kmlColor("#8a8a93")}</color><width>2</width></LineStyle><PolyStyle><color>${kmlColor("#8a8a93", 40)}</color></PolyStyle></Style>
  <Style id="vol-conservador"><LineStyle><color>${kmlColor("#ffffff", 200)}</color><width>1</width></LineStyle><PolyStyle><color>${kmlColor("#a28df5", 170)}</color></PolyStyle></Style>
  <Style id="vol-base"><LineStyle><color>${kmlColor("#ffffff", 220)}</color><width>1</width></LineStyle><PolyStyle><color>${kmlColor("#6c4de7", 190)}</color></PolyStyle></Style>
  <Style id="vol-maximo"><LineStyle><color>${kmlColor("#ffffff", 220)}</color><width>1</width></LineStyle><PolyStyle><color>${kmlColor("#2d1b8a", 200)}</color></PolyStyle></Style>
  <Style id="proyecto"><IconStyle><color>${kmlColor("#6c4de7")}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`;

export function placemark(o: { nombre: string; estilo: string; geometria: string; descripcion?: string; visible?: boolean; datos?: Record<string, unknown> }) {
  const ext = o.datos ? `<ExtendedData>${Object.entries(o.datos).filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `<Data name="${esc(k)}"><value>${esc(v)}</value></Data>`).join("")}</ExtendedData>` : "";
  return `<Placemark><name>${esc(o.nombre)}</name>${o.visible === false ? "<visibility>0</visibility>" : ""}<styleUrl>#${o.estilo}</styleUrl>` +
    (o.descripcion ? `<description><![CDATA[${o.descripcion}]]></description>` : "") + ext + o.geometria + `</Placemark>`;
}

export const carpeta = (nombre: string, contenido: string[], abierta = false, visible = true) =>
  `<Folder><name>${esc(nombre)}</name>${abierta ? "<open>1</open>" : ""}${visible ? "" : "<visibility>0</visibility>"}${contenido.join("")}</Folder>`;

export async function construirKmz(nombre: string, descripcion: string, cuerpo: string[]): Promise<Buffer> {
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><name>${esc(nombre)}</name><open>1</open>
<description><![CDATA[${descripcion}]]></description>${ESTILOS}
${cuerpo.join("\n")}
</Document></kml>`;
  const zip = new JSZip();
  zip.file("doc.kml", kml);
  return Buffer.from(await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

const m2 = (v: any) => (v || v === 0 ? `${Math.round(Number(v)).toLocaleString("es-CO")} m²` : "—");
const num = (v: any, d = 0) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: d }));

/** Ficha HTML del globo de Google Earth para un lote analizado. */
export function globoLote(o: { nombre: string; id: string; barrio?: string; area?: number; tratamiento?: string; semaforo?: string; unidades?: any; pisos?: number | null;
  cambio_pot?: string | null; valor_residual_m2?: number | null; notas?: string | null; alertas?: string[]; base: string }) {
  const color = { verde: "#3f8f4a", amarillo: "#f2a900", rojo: "#c0392b" }[o.semaforo ?? ""] ?? "#8a8a93";
  return `<div style="font-family:Arial,sans-serif;width:300px">
<div style="background:#08061a;color:#fff;padding:10px 12px;border-radius:8px 8px 0 0"><div style="font-size:10px;color:#c9bffa;text-transform:uppercase">${esc(o.tratamiento ?? "")}</div>
<div style="font-size:16px;font-weight:bold">${esc(o.barrio ?? o.nombre)}</div><div style="font-size:11px;opacity:.8">${esc(o.id)} · ${m2(o.area)}</div></div>
<table style="width:100%;font-size:12px;border-collapse:collapse;margin-top:6px">
<tr><td>Semáforo</td><td><b style="color:${color}">● ${esc(o.semaforo ?? "—")}</b></td></tr>
<tr><td>Unidades (conservador / base / máximo)</td><td><b>${num(o.unidades?.conservador)} / ${num(o.unidades?.base)} / ${num(o.unidades?.maximo)}</b></td></tr>
<tr><td>Pisos (base)</td><td><b>${num(o.pisos)}</b></td></tr>
${o.cambio_pot ? `<tr><td>Cambio POT 2026 (área construible)</td><td><b>${esc(o.cambio_pot)}</b></td></tr>` : ""}
${o.valor_residual_m2 ? `<tr><td>Valor residual</td><td><b>$${num(o.valor_residual_m2 / 1e6, 2)} M/m²</b></td></tr>` : ""}
</table>
${o.alertas?.length ? `<div style="font-size:11px;color:#8a5f00;margin-top:6px">⚠ ${esc(o.alertas.join(" · "))}</div>` : ""}
${o.notas ? `<div style="font-size:11px;margin-top:6px;padding:6px;background:#f4f2ff;border-radius:6px"><b>Notas:</b> ${esc(o.notas)}</div>` : ""}
<div style="margin-top:8px;font-size:12px"><a href="${o.base}/api/ficha?id=${encodeURIComponent(o.id)}">Ficha normativa PDF</a> · <a href="${o.base}/mapa">Abrir Inteligencia de suelo</a></div>
<div style="font-size:9px;color:#8a8a93;margin-top:6px">Volumen esquemático sobre la norma pública; no reemplaza el concepto de norma ni la curaduría. irrelevant · Inteligencia de suelo</div></div>`;
}

/** Recorrido de Google Earth (gx:Tour): vuela de lote en lote con la cámara inclinada; se reproduce desde la carpeta y se graba como video en Earth Pro. */
export function recorrido(nombre: string, paradas: { nombre: string; lat: number; lon: number; rango?: number }[], segundos = 5) {
  const pasos = paradas.map((p, i) => `
    <gx:FlyTo><gx:duration>${i ? 4 : 3}</gx:duration><gx:flyToMode>smooth</gx:flyToMode>
      <LookAt><longitude>${p.lon}</longitude><latitude>${p.lat}</latitude><altitude>0</altitude><heading>${(i * 40) % 360}</heading><tilt>62</tilt><range>${p.rango ?? 380}</range><altitudeMode>relativeToGround</altitudeMode></LookAt>
    </gx:FlyTo><gx:Wait><gx:duration>${segundos}</gx:duration></gx:Wait>`).join("");
  return `<gx:Tour><name>${esc(nombre)}</name><description>Reproduce el recorrido: Google Earth vuela por cada lote. En Google Earth Pro se puede grabar como video (Herramientas → Creador de películas).</description><gx:Playlist>${pasos}</gx:Playlist></gx:Tour>`;
}

/** KML con vínculo de red (NetworkLink) que Google Earth Pro refresca solo. */
export function kmlVinculo(nombre: string, url: string, horas = 24) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><NetworkLink><name>${esc(nombre)}</name><open>1</open><refreshVisibility>0</refreshVisibility><flyToView>1</flyToView>
<description>Cartera viva de Inteligencia de suelo: se actualiza cada ${horas} h con la norma, el POT 2026 y el semáforo al día.</description>
<Link><href>${esc(url)}</href><refreshMode>onInterval</refreshMode><refreshInterval>${horas * 3600}</refreshInterval></Link></NetworkLink></kml>`;
}
