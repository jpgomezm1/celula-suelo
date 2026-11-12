// Lectura mínima de KML (Google Earth) sin dependencias: sirve en Node (MCP) y en el navegador (carga de KMZ).
// Devuelve un lugar por Placemark: punto o polígono (anillo exterior), con su nombre.

export type LugarKml = { nombre: string; punto?: [number, number]; poligono?: [number, number][] };

const coords = (txt: string): [number, number][] =>
  txt.trim().split(/\s+/).map((t) => t.split(",").map(Number)).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]] as [number, number]);

const decodificar = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();

export function leerKml(kml: string): LugarKml[] {
  const lugares: LugarKml[] = [];
  const placemarks = kml.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];
  placemarks.forEach((pm, i) => {
    const nombre = decodificar(pm.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? `Lote ${i + 1}`);
    const exterior = pm.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1]
      ?? pm.match(/<Polygon>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1];
    if (exterior) {
      const anillo = coords(exterior);
      if (anillo.length >= 3) {
        if (anillo[0][0] !== anillo.at(-1)![0] || anillo[0][1] !== anillo.at(-1)![1]) anillo.push(anillo[0]);
        lugares.push({ nombre, poligono: anillo });
        return;
      }
    }
    const punto = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1];
    if (punto) {
      const c = coords(punto)[0];
      if (c) lugares.push({ nombre, punto: c });
    }
  });
  return lugares;
}
