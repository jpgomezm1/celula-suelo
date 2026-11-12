// Lectura de KML (Google Earth) sin dependencias: sirve en Node (MCP) y en el navegador.
// Conserva lo que el usuario puso en Google Earth: nombre, carpeta, descripción (notas) y datos extendidos.

export type LugarKml = { nombre: string; punto?: [number, number]; poligono?: [number, number][]; carpeta?: string | null; notas?: string | null; datos?: Record<string, string> };

const coords = (txt: string): [number, number][] =>
  txt.trim().split(/\s+/).map((t) => t.split(",").map(Number)).filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1])).map((c) => [c[0], c[1]] as [number, number]);

const decodificar = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim();
const textoPlano = (s: string) => decodificar(s).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/[ \t]+/g, " ").replace(/\n\s+/g, "\n").trim();

function placemarkALugar(pm: string, i: number, carpeta: string | null): LugarKml | null {
  const nombre = decodificar(pm.match(/<name>([\s\S]*?)<\/name>/i)?.[1] ?? `Lote ${i + 1}`);
  const desc = pm.match(/<description>([\s\S]*?)<\/description>/i)?.[1];
  const datos: Record<string, string> = {};
  for (const m of pm.matchAll(/<Data\s+name="([^"]+)"[^>]*>[\s\S]*?<value>([\s\S]*?)<\/value>[\s\S]*?<\/Data>/gi)) datos[decodificar(m[1])] = decodificar(m[2]);
  for (const m of pm.matchAll(/<SimpleData\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/SimpleData>/gi)) datos[decodificar(m[1])] = decodificar(m[2]);
  const base = { nombre, carpeta, notas: desc ? textoPlano(desc) || null : null, datos: Object.keys(datos).length ? datos : undefined };
  const exterior = pm.match(/<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1] ?? pm.match(/<Polygon>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1];
  if (exterior) {
    const a = coords(exterior);
    if (a.length >= 3) {
      if (a[0][0] !== a.at(-1)![0] || a[0][1] !== a.at(-1)![1]) a.push(a[0]);
      return { ...base, poligono: a };
    }
  }
  const punto = pm.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1];
  if (punto) { const c = coords(punto)[0]; if (c) return { ...base, punto: c }; }
  return null;
}

/** Lee todos los Placemark (puntos o polígonos) con la carpeta de Google Earth en la que están. */
export function leerKml(kml: string): LugarKml[] {
  const lugares: LugarKml[] = [];
  // Recorre el documento manteniendo la pila de carpetas abiertas para saber en cuál está cada Placemark.
  const pila: string[] = [];
  const re = /<Folder\b[^>]*>|<\/Folder>|<Placemark\b[\s\S]*?<\/Placemark>/gi;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(kml))) {
    const t = m[0];
    if (/^<Folder/i.test(t)) {
      const resto = kml.slice(re.lastIndex, re.lastIndex + 600);
      const nom = resto.match(/^\s*(?:<[^>]+>\s*)*?<name>([\s\S]*?)<\/name>/i)?.[1];
      pila.push(nom ? decodificar(nom) : "Carpeta");
    } else if (/^<\/Folder/i.test(t)) pila.pop();
    else {
      const l = placemarkALugar(t, i++, pila.length ? pila.join(" / ") : null);
      if (l) lugares.push(l);
    }
  }
  return lugares;
}
