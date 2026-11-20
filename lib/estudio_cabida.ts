// Estudio de cabida para desarrolladores (formato de análisis normativo de un arquitecto estructurador):
// localización → marco normativo → ficha → aprovechamiento → lo que se paga al municipio (cargas) → volumetría →
// implantación, planta tipo, cuadro de áreas, corte y fachada → opciones de cabida → mercado y potencial de ventas →
// maqueta, renders y video → qué verificar. Si el lote está en un plan parcial adoptado, su norma manda.
// Las imágenes se generan con OpenAI (OPENAI_API_KEY) o se agregan desde URLs (p. ej. Higgsfield).
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { analizarLote } from "./analisis_lote";
import { anteproyecto } from "./cabida/proyecto";
import { planchas } from "./cabida/planos";
import { aSvg } from "./cabida/lienzo";
import { mercadoZona } from "./mercado";
import { mercadoReporte, logoDataUri } from "./reporte_lote";
import { topografiaLote } from "./topografia";
import { consultaNorma } from "./consulta_norma";
import { ortofotoLote } from "./ortofoto";

const n = (v: unknown) => (v == null || v === "" ? null : Number(v));
const base = () => process.env.URL_BASE ?? "https://celula-suelo.vercel.app";

export type EstudioCabidaInput = {
  lote: { id?: string; cbml?: string; matricula?: string; direccion?: string; lat?: number; lon?: number };
  nombre?: string;
  mezcla?: { tipologia: "estudio" | "1A" | "2A" | "3A"; pct: number }[];
  max_torres?: number; estrato?: number;
  opciones?: boolean;            // calcula 2 alternativas de cabida además de la principal (defecto true)
  renders?: boolean;             // genera imágenes con OpenAI si hay llave (defecto true)
  estilo?: string;               // estilo arquitectónico para las imágenes
  marca?: { cliente: string; logo_url?: string; logo_fondo_oscuro_url?: string };
};

async function esquema() {
  await sql`CREATE TABLE IF NOT EXISTS estudio_imagen (estudio_id text NOT NULL, n int NOT NULL, tipo text, titulo text, mime text NOT NULL, datos bytea NOT NULL, fuente text,
    creado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (estudio_id, n))`;
}

/** Mapa vectorial del entorno: predios, vías, protección; el lote (y su UAU si hay plan parcial) resaltados. */
export async function mapaContexto(id: string, uau: { id: string }[] = []) {
  const ids = [id, ...uau.map((u) => u.id)];
  const [b]: any = await sql`WITH u AS (SELECT ST_Transform(ST_Union(geom), 9377) g FROM parcel WHERE id = ANY(${ids})), c AS (SELECT ST_Centroid(g) c, greatest(ST_XMax(g) - ST_XMin(g), ST_YMax(g) - ST_YMin(g)) r FROM u)
    SELECT ST_X(c) - greatest(r * 0.95, 140) * 1.55 x0, ST_Y(c) - greatest(r * 0.95, 140) y0, ST_X(c) + greatest(r * 0.95, 140) * 1.55 x1, ST_Y(c) + greatest(r * 0.95, 140) y1, (SELECT municipio_dane FROM parcel WHERE id = ${id}) dane FROM c`;
  if (!b) return null;
  const env = sql`ST_Transform(ST_MakeEnvelope(${b.x0}, ${b.y0}, ${b.x1}, ${b.y1}, 9377), 4326)`;
  const geo = (g: any) => sql`ST_AsGeoJSON(ST_SimplifyPreserveTopology(ST_Transform(ST_Intersection(${g}, ${env}), 9377), 0.5), 1)::json`;
  const [parcelas, vias, prot, cauces]: any = await Promise.all([
    sql`SELECT p.id, ${geo(sql`p.geom`)} g, EXISTS (SELECT 1 FROM building x WHERE x.parcel_id = p.id) b FROM parcel p WHERE p.geom && ${env} AND ST_Intersects(p.geom, ${env}) LIMIT 1500`,
    sql`SELECT ${geo(sql`v.geom`)} g FROM osm_via v WHERE v.geom && ${env} AND ST_Intersects(v.geom, ${env}) LIMIT 400`,
    sql`SELECT ${geo(sql`z.geom`)} g FROM zoning_layer z WHERE z.capa = 'proteccion' AND z.municipio_dane = ${b.dane} AND z.geom && ${env} AND ST_Intersects(z.geom, ${env}) LIMIT 300`,
    sql`SELECT ${geo(sql`c.geom`)} g FROM hidro_cauce c WHERE c.geom && ${env} AND ST_Intersects(c.geom, ${env}) LIMIT 300`,
  ]);
  const W = b.x1 - b.x0, H = b.y1 - b.y0;
  const pt = (c: number[]) => `${(c[0] - b.x0).toFixed(1)},${(b.y1 - c[1]).toFixed(1)}`;
  const path = (g: any): string => {
    if (!g) return "";
    const ring = (r: number[][], z: boolean) => "M" + r.map(pt).join("L") + (z ? "Z" : "");
    switch (g.type) {
      case "Polygon": return g.coordinates.map((r: any) => ring(r, true)).join("");
      case "MultiPolygon": return g.coordinates.flatMap((p: any) => p.map((r: any) => ring(r, true))).join("");
      case "LineString": return ring(g.coordinates, false);
      case "MultiLineString": return g.coordinates.map((r: any) => ring(r, false)).join("");
      case "GeometryCollection": return g.geometries.map(path).join("");
      default: return "";
    }
  };
  const centro = (g: any) => { const pts: number[][] = []; const w = (c: any) => (typeof c[0] === "number" ? pts.push(c) : c.forEach(w)); w(g.coordinates); return [pts.reduce((s, p) => s + p[0], 0) / pts.length - b.x0, b.y1 - pts.reduce((s, p) => s + p[1], 0) / pts.length]; };
  const out: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" font-family="Inter, Arial, sans-serif"><rect width="100%" height="100%" fill="#eef1ec"/>`,
    '<defs><pattern id="pv" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="8" height="8" fill="#d6ead2"/><line x1="0" y1="0" x2="0" y2="8" stroke="#8fc28a" stroke-width="2"/></pattern></defs>'];
  for (const z of prot) out.push(`<path d="${path(z.g)}" fill="url(#pv)" opacity=".7"/>`);
  for (const q of parcelas) if (!ids.includes(q.id)) out.push(`<path d="${path(q.g)}" fill="${q.b ? "#e2e2dc" : "#f7f7f3"}" stroke="#b9bdb5" stroke-width=".6"/>`);
  for (const v of vias) out.push(`<path d="${path(v.g)}" fill="none" stroke="#c9c2b4" stroke-width="6" stroke-linecap="round"/>`);
  for (const c of cauces) out.push(`<path d="${path(c.g)}" fill="none" stroke="#4aa3df" stroke-width="2"/>`);
  const etq: string[] = [];
  let k = 1;
  for (const q of parcelas.filter((q: any) => ids.includes(q.id) && q.g)) {
    const own = q.id === id, [cx, cy] = centro(q.g);
    out.push(`<path d="${path(q.g)}" fill="${own ? "rgba(253,183,25,.55)" : "rgba(0,39,77,.16)"}" stroke="${own ? "#c98a00" : "#00274D"}" stroke-width="${own ? 2.2 : 1.4}"/>`);
    etq.push(own ? `<text x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" text-anchor="middle" font-size="11" font-weight="700" fill="#00274D">Lote</text>` : `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="7" fill="#00274D"/><text x="${cx.toFixed(0)}" y="${(cy + 3.5).toFixed(0)}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff">${k++}</text>`);
  }
  const esc = W > 600 ? 100 : 50;
  out.push(...etq, `<g transform="translate(${(W - esc - 20).toFixed(0)},${(H - 16).toFixed(0)})"><line x1="0" y1="0" x2="${esc}" y2="0" stroke="#00274D" stroke-width="2"/><text x="${esc / 2}" y="-5" text-anchor="middle" font-size="10" fill="#00274D">${esc} m</text></g>`,
    `<g transform="translate(${(W - 26).toFixed(0)},30)"><path d="M0,-16 L6,6 L0,1 L-6,6Z" fill="#00274D"/><text y="18" text-anchor="middle" font-size="9" fill="#00274D">N</text></g></svg>`);
  return out.join("");
}

/** Recorta el rótulo de la plancha (a la derecha) para mostrar solo el dibujo. */
const svgPlancha = (pl: any) => aSvg(pl, 2400).replace(/viewBox="[^"]+"/, 'viewBox="0 0 1860 1695"');

function resumenAnte(m: any) {
  const r = m.resumen;
  return { torres: r.torres, pisos: r.pisos_totales, altura_m: r.altura_m, aptos_por_piso: r.aptos_por_piso, unidades: r.unidades, unidades_norma: r.unidades_norma,
    por_tipologia: r.por_tipologia, area_construida_m2: r.area_construida_sobre_rasante_m2, area_vendible_m2: r.area_vendible_m2, eficiencia_pct: r.eficiencia_planta_pct,
    ic: r.indice_construccion, io: r.indice_ocupacion, sotanos: r.sotanos, area_sotanos_m2: r.area_sotanos_m2, parqueaderos_exigidos: r.parqueaderos_exigidos,
    parqueaderos_dibujados: r.parqueaderos_dibujados, visitantes: r.visitantes, estrato: r.estrato, area_edificable_m2: r.area_edificable_m2,
    huellas: (m.torres ?? []).map((t: any) => ({ id: t.id, largo_m: t.planta.L, ancho_m: t.planta.D })), punto_fijo: r.punto_fijo?.notas ?? [], revision: r.revision_arquitectonica ?? null };
}

export async function crearEstudioCabida(input: EstudioCabidaInput) {
  await esquema();
  const c: any = await consultaNorma(input.lote as any);
  if (!c.encontrado) return c;
  const id0 = c.predio ?? c.identificacion?.predio;
  const p: any = await encontrarPredio({ id: id0 });
  if (!p) return { error: "Predio no encontrado." };
  const [an, topo, merc, mz, orto]: any = await Promise.all([
    analizarLote(p, { con_mercado: false }), topografiaLote(p.id).catch(() => null),
    p.lat ? mercadoReporte(Number(p.lat), Number(p.lon)) : null, p.lat ? mercadoZona({ lat: Number(p.lat), lon: Number(p.lon), radio_m: 1500 } as any).catch(() => null) : null,
    ortofotoLote(p.id).catch(() => null),
  ]);
  const [est]: any = p.lat ? await sql`SELECT nombre, linea, sistema, round(ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${Number(p.lon)}, ${Number(p.lat)}), 4326)::geography))::int d
    FROM transporte_estacion WHERE estado = 'Existente' ORDER BY geom <-> ST_SetSRID(ST_MakePoint(${Number(p.lon)}, ${Number(p.lat)}), 4326) LIMIT 1`.catch(() => []) : [];
  const pp = an.plan_parcial;
  const mezcla = input.mezcla?.length ? input.mezcla : pp ? [{ tipologia: "1A", pct: 40 }, { tipologia: "2A", pct: 60 }] : undefined;
  const op = { escenario: "base" as const, mezcla: mezcla as any, estrato: input.estrato, max_torres: input.max_torres };
  const m: any = await anteproyecto(p.id, op);
  if (!m.disponible) return { predio: p.id, disponible: false, motivo: m.mensaje };
  // Opciones de cabida: otra cantidad de torres y una mezcla con 3 alcobas (lo que más se ofrece en la mayoría de zonas)
  const alternativas: any[] = [];
  if (input.opciones !== false) {
    const variantes = [
      { nombre: "Otra cantidad de torres", o: { ...op, max_torres: (m.resumen.torres ?? 1) > 1 ? 1 : 3 } },
      { nombre: "Producto más grande (2 y 3 alcobas)", o: { ...op, mezcla: [{ tipologia: "2A", pct: 60 }, { tipologia: "3A", pct: 40 }] } },
      { nombre: "Producto compacto (apartaestudios y 1 alcoba)", o: { ...op, mezcla: [{ tipologia: "estudio", pct: 20 }, { tipologia: "1A", pct: 50 }, { tipologia: "2A", pct: 30 }] } },
    ];
    const firma = (x: any) => `${x.torres}|${x.pisos}|${x.unidades}|${x.area_vendible_m2}`;
    const vistos = new Set([firma(resumenAnte(m))]);
    for (const v of variantes) {
      const a: any = await anteproyecto(p.id, v.o as any).catch(() => null);
      if (!a?.disponible) continue;
      const ra = resumenAnte(a);
      if (vistos.has(firma(ra))) continue;
      vistos.add(firma(ra));
      alternativas.push({ nombre: v.nombre === "Otra cantidad de torres" ? `${ra.torres} ${ra.torres > 1 ? "torres" : "torre"} de ${ra.pisos} pisos` : v.nombre, ...ra });
    }
  }
  const pl = planchas(m);
  const idx = (re: RegExp) => pl.findIndex((x: any) => re.test(x.titulo ?? x.nombre ?? ""));
  const svgs = { implantacion: svgPlancha(pl[Math.max(0, idx(/implantaci/i))]), planta_tipo: svgPlancha(pl[Math.max(0, idx(/piso tipo/i))]), corte: svgPlancha(pl[Math.max(0, idx(/corte/i))]) };
  const r = resumenAnte(m);
  const precio = n(merc?.fynder?.precio_m2_nuevo);
  const ventas = precio ? Math.round(r.area_vendible_m2 * precio) : null;
  const marca = input.marca?.cliente ? { cliente: input.marca.cliente, logo: await logoDataUri(input.marca.logo_url), logo_oscuro: await logoDataUri(input.marca.logo_fondo_oscuro_url) } : null;
  const id = `c_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${randomBytes(4).toString("hex")}`;
  const nombre = input.nombre ?? (pp ? `Lote en ${pp.plan.nombre} · UAU ${pp.uau.id}` : `Lote en ${p.barrio_catastral ?? p.municipio}`);
  const resultado = {
    tipo: "estudio_cabida", nombre, generado: new Date().toISOString(), marca,
    lote: { id: p.id, clave: p.clave_local, municipio: p.municipio, municipio_dane: p.municipio_dane, barrio: p.barrio_catastral, clase: p.clase, area_m2: n(p.area_lote), lat: n(p.lat), lon: n(p.lon),
      matriculas: c.identificacion?.matriculas ?? [], direcciones: c.identificacion?.direcciones ?? [], estrato: r.estrato,
      estacion: est ? { nombre: est.nombre, linea: est.linea, sistema: est.sistema, distancia_m: est.d } : null },
    norma: { tratamiento: p.tratamiento, codigo: p.codigo_tratamiento, altura_max: n(p.altura_max), ic: n(p.ic_max), ic_total: n(p.ic_total), densidad: n(p.densidad_max), io: n(p.io_max), uso: p.uso,
      acuerdo: p.acuerdo_vigente, fuente: p.norma_fuente, nivel: p.nivel_dato, aviso_pot: c.aviso_pot ?? null, pot2026: an.pot_2026_preliminar?.disponible ? an.pot_2026_preliminar : null },
    plan_parcial: pp, area_util: an.area_util, semaforo: an.semaforo, cabida: an.cabida, cesiones: an.cesiones, usos: an.usos, suelo_sismo: an.suelo_sismo?.disponible ? an.suelo_sismo : null,
    topografia: topo?.disponible ? { pendiente_pct: topo.pendiente_pct, desnivel_m: topo.desnivel_m, cae_hacia: topo.cae_hacia, clase: topo.clase, sotanos: topo.sotanos } : null,
    anteproyecto: { ...r, norma_vol: { frontal: m.norma.frontal, lateral: m.norma.lateral, cabecera: m.norma.cabecera, fondo: m.norma.fondo, entre_torres: m.norma.entre_torres, fuente: m.norma.fuente, citas: m.norma.citas },
      mezcla: m.opciones?.mezcla ?? mezcla, svgs, aviso: m.aviso },
    alternativas,
    mercado: { ...merc, mix_habitaciones: mz?.oferta?.mix_habitaciones ?? [], ventas_estimadas: ventas, techo_lote_15: ventas ? Math.round(ventas * 0.15) : null, techo_lote_20: ventas ? Math.round(ventas * 0.2) : null },
    ortofoto: orto, mapa_svg: await mapaContexto(p.id, pp?.uau?.otros_predios ?? []).catch(() => null), imagenes: [] as any[], video_url: null as string | null,
  };
  await sql`INSERT INTO estudio (id, nombre, entrada, resultado) VALUES (${id}, ${nombre}, ${JSON.stringify(input)}, ${JSON.stringify(resultado)})`;
  let imgs: any = null;
  if (input.renders !== false && process.env.OPENAI_API_KEY) imgs = await generarRenders(id, resultado, input.estilo).catch((e) => ({ error: String(e?.message ?? e) }));
  return {
    id, nombre, estudio: `${base()}/api/estudio/${id}/cabida`,
    plan_parcial: pp ? { nombre: pp.plan.nombre, uau: pp.uau.id, viviendas_uau: pp.uau.viviendas, viviendas_lote: pp.lote.viviendas_estimadas } : null,
    cabida: { torres: r.torres, pisos: r.pisos, unidades: r.unidades, area_vendible_m2: r.area_vendible_m2, parqueaderos: `${r.parqueaderos_dibujados} de ${r.parqueaderos_exigidos} exigidos` },
    alternativas: alternativas.map((a) => ({ nombre: a.nombre, torres: a.torres, pisos: a.pisos, unidades: a.unidades, area_vendible_m2: a.area_vendible_m2 })),
    potencial_ventas: ventas, imagenes: imgs ?? (process.env.OPENAI_API_KEY ? "sin generar" : "Sin OPENAI_API_KEY: genera las imágenes en otra herramienta (p. ej. Higgsfield) y agrégalas con agregar_imagenes_estudio."),
    prompts_imagenes: promptsRenders(resultado, input.estilo),
  };
}

/** Prompts de imágenes coherentes con el anteproyecto (sirven para OpenAI o para generarlas en otra herramienta). */
export function promptsRenders(res: any, estilo?: string) {
  const a = res.anteproyecto, t = a.huellas?.[0], lugar = `${res.lote.municipio ?? "Valle de Aburrá"}, Antioquia, Colombia`;
  const vol = `${a.torres > 1 ? `${a.torres} contemporary residential towers` : "a single contemporary residential tower"} of ${a.pisos} storeys${t ? `, ${Math.round(t.largo_m)} m long and ${Math.round(t.ancho_m)} m deep` : ""}`;
  const est = estilo ?? "warm off-white concrete with horizontal slab bands, light wood-tone balconies and large windows";
  const terreno = res.topografia?.pendiente_pct > 12 ? "on a green sloping hillside" : "on a gently sloping site";
  const tip = (a.por_tipologia ?? []).map((x: any) => x.tipologia).join(" and ");
  return [
    { tipo: "fachada", titulo: "Imagen ilustrativa del anteproyecto", prompt: `Photorealistic architectural render, eye level at golden hour: ${vol}, facade in ${est}, ${terreno} in ${lugar}, lush Andean vegetation, landscaped front garden, mountains in the background. No text, no logos.` },
    { tipo: "acceso", titulo: "Acceso al proyecto", prompt: `Photorealistic architectural render at dusk from the street: entrance of ${vol} in ${lugar}, glass lobby, small guardhouse, vehicle ramp to basement parking, planted front garden with warm uplights, new sidewalk with trees. No text, no logos.` },
    { tipo: "aerea", titulo: "El conjunto en su entorno", prompt: `Photorealistic aerial drone render, late afternoon: ${vol} occupying about ${Math.round((a.io ?? 0.2) * 100)}% of a ${Math.round(res.lote.area_m2 ?? 3000)} m2 lot ${terreno} in ${lugar}; the rest landscaped with lawns, native trees, paths and a social terrace; the Aburrá valley in the background. Realistic scale, no text.` },
    { tipo: "interior", titulo: "Interior de un apartamento", prompt: `Photorealistic interior render of a ${tip || "2-bedroom"} apartment living-dining room in a new residential tower in ${lugar}, floor-to-ceiling window and balcony with a view over the green valley at sunset, light oak floors, open kitchen, warm contemporary Colombian furniture. No people, no text.` },
    { tipo: "social", titulo: "Zona social", prompt: `Photorealistic render at twilight of the social area at the foot of ${vol} in ${lugar}: landscaped terrace, small pool, wooden deck, BBQ pergola, native gardens, city lights of the valley below. No people, no text.` },
    { tipo: "maqueta", titulo: "Maqueta conceptual de volumetría", prompt: `Clean conceptual white architectural massing model on a white table, soft studio light, 3/4 aerial view: an irregular ${res.topografia?.pendiente_pct > 12 ? "sloping site with contour terraces" : "site"} with ${vol.replace("contemporary residential", "simple white")}, small entrance road, white model trees. Minimalist, monochrome. No text.` },
  ];
}

async function generarRenders(id: string, res: any, estilo?: string) {
  const ps = promptsRenders(res, estilo);
  const modelo = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
  const hechos = await Promise.all(ps.map(async (q, i) => {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: modelo, prompt: q.prompt, size: "1536x1024", quality: "medium", output_format: "jpeg", output_compression: 82, n: 1 }),
      signal: AbortSignal.timeout(180000),
    });
    const j: any = await r.json().catch(() => ({}));
    const b64 = j?.data?.[0]?.b64_json;
    if (!r.ok || !b64) return { tipo: q.tipo, error: j?.error?.message ?? `HTTP ${r.status}` };
    await sql`INSERT INTO estudio_imagen (estudio_id, n, tipo, titulo, mime, datos, fuente) VALUES (${id}, ${i}, ${q.tipo}, ${q.titulo}, 'image/jpeg', decode(${b64}, 'base64'), ${`OpenAI ${modelo}`})
      ON CONFLICT (estudio_id, n) DO UPDATE SET datos = EXCLUDED.datos, tipo = EXCLUDED.tipo, titulo = EXCLUDED.titulo, fuente = EXCLUDED.fuente`;
    return { tipo: q.tipo, ok: true };
  }));
  return { generadas: hechos.filter((h: any) => h.ok).length, errores: hechos.filter((h: any) => h.error) };
}

/** Agrega imágenes (URLs https de imagen) y un video (URL) hechos en otra herramienta. */
export async function agregarImagenesEstudio(id: string, imagenes: { url: string; tipo?: string; titulo?: string }[] = [], video_url?: string) {
  await esquema();
  const [e]: any = await sql`SELECT resultado FROM estudio WHERE id = ${id}`;
  if (!e || e.resultado?.tipo !== "estudio_cabida") return { error: "Estudio de cabida no encontrado." };
  const [mx]: any = await sql`SELECT coalesce(max(n), -1)::int n FROM estudio_imagen WHERE estudio_id = ${id}`;
  let k = mx.n + 1, ok = 0; const errores: string[] = [];
  for (const im of imagenes) {
    if (!/^https:\/\//.test(im.url)) { errores.push(`${im.url}: solo https`); continue; }
    try {
      const r = await fetch(im.url, { signal: AbortSignal.timeout(30000) });
      const mime = (r.headers.get("content-type") ?? "").split(";")[0];
      const buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !/^image\/(png|jpeg|webp)$/.test(mime) || buf.length > 9_000_000) { errores.push(`${im.url}: no es una imagen válida (≤ 9 MB)`); continue; }
      // Imágenes pesadas: se reducen a 1920 px en JPEG para que la presentación cargue rápido
      let datos = buf, tipoMime = mime;
      if (buf.length > 1_500_000) { const sharp = (await import("sharp")).default; datos = await sharp(buf).resize({ width: 1920, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer(); tipoMime = "image/jpeg"; }
      await sql`INSERT INTO estudio_imagen (estudio_id, n, tipo, titulo, mime, datos, fuente) VALUES (${id}, ${k++}, ${im.tipo ?? null}, ${im.titulo ?? null}, ${tipoMime}, ${datos}, ${new URL(im.url).hostname})`;
      ok++;
    } catch (err: any) { errores.push(`${im.url}: ${err?.message ?? err}`); }
  }
  if (video_url) {
    if (!/^https:\/\//.test(video_url)) errores.push("video_url debe ser https");
    else await sql`UPDATE estudio SET resultado = jsonb_set(resultado, '{video_url}', to_jsonb(${video_url}::text)) WHERE id = ${id}`;
  }
  return { id, imagenes_agregadas: ok, errores, estudio: `${base()}/api/estudio/${id}/cabida` };
}

export async function imagenesEstudio(id: string) {
  await esquema();
  return (await sql`SELECT n, tipo, titulo, mime, encode(datos, 'base64') b64, fuente FROM estudio_imagen WHERE estudio_id = ${id} ORDER BY n`) as any[];
}
