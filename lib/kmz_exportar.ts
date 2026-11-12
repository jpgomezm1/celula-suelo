// Arma los KMZ para Google Earth: de un lote (tres volúmenes) y de una cartera o estudio guardado.
import { sql } from "./db";
import { volumenesBase, volumenesLote } from "./volumen";
import { carpeta, construirKmz, geometriaKml, globoLote, placemark } from "./kmz";
import { obtenerEstudio } from "./estudios";

const BASE = () => process.env.PUBLIC_URL ?? "https://celula-suelo.vercel.app";

async function proyectosCerca(lat: number, lon: number, radio = 2000) {
  const rows = await sql`SELECT proyecto, construye, precio_m2_oferta, ventas_prom_semestre_un, unidades_disponibles, unidades_por_lanzar, ST_X(geom) AS lon, ST_Y(geom) AS lat
    FROM galeria_vigente WHERE geom IS NOT NULL AND (tipo IS NULL OR tipo ILIKE 'Apto%')
      AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography, ${radio})`;
  return rows.map((g: any) => placemark({ nombre: g.proyecto, estilo: "proyecto",
    descripcion: `<b>${g.proyecto}</b><br>${g.construye ?? ""}<br>$${(Number(g.precio_m2_oferta) / 1e6).toFixed(1)} M/m² · ${g.ventas_prom_semestre_un} und/mes<br>Oferta ${g.unidades_disponibles} + ${g.unidades_por_lanzar} por lanzar<br><i>Galería Inmobiliaria · uso interno</i>`,
    geometria: `<Point><coordinates>${g.lon},${g.lat},0</coordinates></Point>` }));
}

/** KMZ de un lote: contorno, volúmenes de los tres escenarios (el base visible) y proyectos de Galería a 2 km. */
export async function kmzLote(id: string, ocupacion?: number) {
  const v = await volumenesLote(id, { ocupacion });
  if (!v.encontrado) return null;
  const a: any = v.analisis;
  const esc = a.cabida.escenarios as any[];
  const b26 = a.pot_2026_preliminar;
  const globo = globoLote({ nombre: v.barrio ?? id, id, barrio: v.barrio, area: v.area_lote_m2, tratamiento: a?.semaforo ? undefined : undefined, semaforo: a.semaforo.general,
    unidades: { conservador: esc[0]?.unidades, base: esc[1]?.unidades, maximo: esc[2]?.unidades }, pisos: esc[1]?.pisos_sobre_rasante,
    cambio_pot: b26?.disponible ? b26.frente_a_2014.area_construible_m2.cambio : null, valor_residual_m2: null,
    alertas: a.semaforo.items.filter((i: any) => i.luz !== "verde" && i.luz !== "gris").map((i: any) => i.categoria), base: BASE() });
  const volumenes = v.volumenes.map((x) => placemark({ nombre: `${x.escenario}: ${x.pisos} pisos · ${x.unidades ?? "—"} unidades`, estilo: `vol-${x.clave}`, visible: x.clave === "base",
    descripcion: `<b>${x.escenario}</b><br>${x.pisos} pisos (${x.altura_m} m) · huella ${x.huella_m2?.toLocaleString("es-CO")} m²<br>${x.area_construible_m2?.toLocaleString("es-CO")} m² construibles · ${x.unidades} unidades<br><i>${v.tipologia}. ${v.nota}</i>`,
    geometria: geometriaKml(x.geojson, x.altura_m) }));
  const cuerpo = [
    placemark({ nombre: `${v.barrio ?? id} · lote`, estilo: `lote-${a.semaforo.general}`, descripcion: globo, geometria: geometriaKml(v.lote) }),
    carpeta("Volumen posible (3D)", volumenes, true),
    carpeta("Proyectos de Galería a 2 km", await proyectosCerca(v.centro.lat, v.centro.lon), false, true),
  ];
  const nombre = `${v.barrio ?? "Lote"} ${id} · Inteligencia de suelo`;
  return { nombre, buffer: await construirKmz(nombre, `Lote ${id} (${v.area_lote_m2.toLocaleString("es-CO")} m²). Volúmenes de los tres escenarios: activa el que quieras ver en la carpeta. ${v.tipologia}.`, cuerpo) };
}

/** KMZ de una cartera o estudio por perfil guardado: conserva las carpetas de Google Earth y suma el volumen base. */
export async function kmzEstudio(estudioId: string) {
  const e: any = await obtenerEstudio(estudioId);
  if (!e) return null;
  const r = e.resultado;
  const filas: any[] = r.tipo === "cartera" ? r.ranking : r.tipo === "perfil" ? r.oportunidades.map((o: any, i: number) => ({ ...o, nombre: `${i + 1}. ${o.barrio ?? o.id}`, predio: o.id,
    semaforo: null, unidades: { base: o.unidades_posibles }, cambio_pot_2026: null })) : [];
  if (!filas.length) return null;
  const vols = await volumenesBase(filas.map((f) => f.predio ?? f.id));
  // Árbol de carpetas como en Google Earth ("Estructuración / Prioridad A" → carpeta dentro de carpeta).
  type Nodo = { marcas: string[]; hijos: Map<string, Nodo> };
  const raiz: Nodo = { marcas: [], hijos: new Map() };
  const nodo = (ruta: string) => ruta.split(" / ").reduce((n, parte) => { if (!n.hijos.has(parte)) n.hijos.set(parte, { marcas: [], hijos: new Map() }); return n.hijos.get(parte)!; }, raiz);
  for (const [i, f] of filas.entries()) {
    const id = f.predio ?? f.id; const vol = vols[id]; if (!vol) continue;
    const estilo = `lote-${f.semaforo ?? "gris"}`;
    const nombre = r.tipo === "cartera" ? `${i + 1}. ${f.nombre}` : f.nombre;
    const globo = globoLote({ nombre: f.nombre, id, barrio: f.barrio, area: f.area_lote_m2, tratamiento: f.tratamiento, semaforo: f.semaforo ?? undefined, unidades: f.unidades,
      pisos: f.pisos_base ?? vol.pisos, cambio_pot: f.cambio_pot_2026, valor_residual_m2: f.valor_residual_m2, notas: f.notas, alertas: f.alertas, base: BASE() });
    // Englobe dibujado en Google Earth: el volumen va sobre el polígono completo con el área construible sumada.
    let contorno = vol.lote, volumen = vol.volumen, altura = vol.altura_m, pisos = vol.pisos;
    if (f.poligono && f.englobe?.area_construible_2014_m2) {
      const geo = JSON.stringify({ type: "Polygon", coordinates: [f.poligono] });
      const construible = Number(f.englobe.area_construible_2026_m2 || f.englobe.area_construible_2014_m2);
      const [g] = await sql`WITH z AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326) AS g)
        SELECT ST_AsGeoJSON(z.g, 7)::json AS contorno, ST_AsGeoJSON(huella_cabida(z.g, ST_Area(z.g::geography) * ${Number(f.io) || 0.6}), 7)::json AS huella,
               ST_Area(huella_cabida(z.g, ST_Area(z.g::geography) * ${Number(f.io) || 0.6})::geography) AS area FROM z`;
      if (g?.huella && Number(g.area) > 0) { contorno = g.contorno; volumen = g.huella; pisos = Math.ceil(construible / Number(g.area)); altura = Math.round((pisos * 3 + 1.5) * 10) / 10; }
    }
    nodo(f.carpeta ?? (r.tipo === "cartera" ? "Lotes" : "Lotes recomendados")).marcas.push(
      placemark({ nombre, estilo, descripcion: globo, geometria: geometriaKml(contorno), datos: { puntaje: f.puntaje, unidades_base: f.unidades?.base, semaforo: f.semaforo, cambio_pot_2026: f.cambio_pot_2026, ...(f.datos_google_earth ?? {}) } }),
      placemark({ nombre: `${nombre} · volumen ${pisos} pisos${f.englobe ? " (englobe)" : ""}`, estilo: "vol-base", geometria: geometriaKml(volumen, altura) }),
    );
  }
  const pintar = (n: Nodo): string[] => [...n.marcas, ...[...n.hijos.entries()].map(([nom, h]) => carpeta(nom, pintar(h), true))];
  const cuerpo = pintar(raiz);
  const nombre = `${r.estudio} · Inteligencia de suelo`;
  return { nombre, buffer: await construirKmz(nombre, `${r.estudio} (${r.fecha}). Color del lote = semáforo; volumen morado = edificio posible con la norma base. Haz clic en un lote para ver su ficha.`, cuerpo) };
}
