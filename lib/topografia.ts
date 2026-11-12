// Topografía previa de un lote: pendiente, desnivel, hacia dónde cae, relación con la vía, movimiento de tierras
// aproximado y perfil del terreno. Fuentes públicas de terreno desnudo (MDT) y, de respaldo, Google Elevation.
// Es un análisis para filtrar y priorizar: no reemplaza el levantamiento topográfico ni el estudio de suelos.
import { sql } from "./db";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";
const MED = "https://www.medellin.gov.co/servidormapas/rest/services/ServiciosImagen";
const IGAC = "https://mapas2.igac.gov.co/image/rest/services/md";

export type Fuente = { clave: string; nombre: string; tipo: "MDT" | "MDS" | "mixto"; resolucion_m: number; url?: string; google?: boolean; atribucion: string };

const F = {
  med2024: { clave: "med2024", nombre: "Modelo digital del terreno de Medellín 2024 (Alcaldía de Medellín)", tipo: "MDT", resolucion_m: 1, url: `${MED}/Modelo_digital_de_elevacion_medellin_2024/ImageServer`, atribucion: "Alcaldía de Medellín · GeoMedellín" },
  amva: { clave: "amva", nombre: "Modelo digital de elevación del Valle de Aburrá (AMVA)", tipo: "MDT", resolucion_m: 10, url: `${MED}/Modelo_digital_de_elevacion_AMVA/ImageServer`, atribucion: "Área Metropolitana del Valle de Aburrá vía GeoMedellín" },
  google: { clave: "google", nombre: "Google Elevation API", tipo: "mixto", resolucion_m: 8, google: true, atribucion: "Google" },
} satisfies Record<string, Fuente>;

const igac = (slug: string, res: number, nombre: string): Fuente => ({ clave: `igac_${slug}`, nombre: `MDT ${nombre} (IGAC / Gobernación de Antioquia)`, tipo: "MDT", resolucion_m: res, url: `${IGAC}/mdt${slug}/ImageServer`, atribucion: "IGAC · Gobernación de Antioquia (CC BY)" });

/** Fuentes en orden de preferencia para cada municipio. */
function fuentesPara(dane: string): Fuente[] {
  const porMunicipio: Record<string, Fuente[]> = {
    "05001": [F.med2024, F.amva],
    "05631": [igac("05631sabaneta", 2, "Sabaneta"), F.amva],
    "05380": [igac("05380laestrella", 2, "La Estrella"), F.amva],
    "05129": [igac("05129caldas", 2, "Caldas"), F.amva],
    "05318": [igac("05318guarne", 2, "Guarne")],
    "05376": [igac("05376laceja", 2, "La Ceja")],
    "05440": [igac("05440marinilla", 2, "Marinilla")],
    "05607": [igac("05607elretiro", 10, "El Retiro")],
    "05148": [igac("05148elcarmendeviboral", 10, "El Carmen de Viboral")],
  };
  const valle = ["05088", "05266", "05360", "05212", "05308", "05079"];
  const lista = porMunicipio[dane] ?? (valle.includes(dane) ? [F.amva] : []);
  return process.env.GOOGLE_MAPS_SERVER_KEY ? [...lista, F.google] : lista;
}

/** Elevaciones de una lista de puntos [lon, lat]. null donde la fuente no tiene dato. */
async function muestrear(f: Fuente, pts: [number, number][]): Promise<(number | null)[]> {
  if (f.google) {
    const out: (number | null)[] = [];
    for (let i = 0; i < pts.length; i += 400) {
      const lote = pts.slice(i, i + 400);
      const r = await fetch(`https://maps.googleapis.com/maps/api/elevation/json?key=${process.env.GOOGLE_MAPS_SERVER_KEY}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locations: lote.map(([lng, lat]) => ({ lat, lng })) }) }).catch(() => null);
      // La API de elevación solo acepta GET; con POST cae aquí y se repite con locations codificadas.
      let j: any = r && r.ok ? await r.json().catch(() => null) : null;
      if (!j?.results) {
        const loc = lote.map(([lng, lat]) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join("|");
        j = await (await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${encodeURIComponent(loc)}&key=${process.env.GOOGLE_MAPS_SERVER_KEY}`)).json();
      }
      if (j.status !== "OK") throw new Error(`Google Elevation: ${j.status}${j.error_message ? ` (${j.error_message})` : ""}`);
      out.push(...j.results.map((x: any) => Number(x.elevation)));
    }
    return out;
  }
  const out: (number | null)[] = [];
  for (let i = 0; i < pts.length; i += 500) {
    const lote = pts.slice(i, i + 500);
    const body = new URLSearchParams({ geometry: JSON.stringify({ points: lote, spatialReference: { wkid: 4326 } }), geometryType: "esriGeometryMultipoint",
      returnFirstValueOnly: "true", interpolation: "RSP_BilinearInterpolation", f: "json" });
    const r = await fetch(`${f.url}/getSamples`, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error(`${f.nombre}: HTTP ${r.status}`);
    const j: any = await r.json();
    if (j.error) throw new Error(`${f.nombre}: ${j.error.message}`);
    const vals: (number | null)[] = new Array(lote.length).fill(null);
    for (const s of j.samples ?? []) { const v = Number(s.value); if (Number.isFinite(v) && v > 0 && v < 6000) vals[s.locationId] = v; }
    out.push(...vals);
  }
  return out;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const RUMBOS = ["norte", "nororiente", "oriente", "suroriente", "sur", "suroccidente", "occidente", "noroccidente"];
const rumbo = (az: number) => RUMBOS[Math.round((((az % 360) + 360) % 360) / 45) % 8];

export function clasePendiente(p: number) {
  return p < 5 ? "plano" : p < 15 ? "ladera suave" : p < 30 ? "ladera moderada" : p < 50 ? "ladera fuerte" : "ladera muy fuerte";
}

/** Topografía de un predio. Usa caché (tabla topografia_lote) salvo que se pida recalcular. */
export async function topografiaLote(id: string, opts: { recalcular?: boolean } = {}) {
  await sql`CREATE TABLE IF NOT EXISTS topografia_lote (predio_id text PRIMARY KEY, datos jsonb NOT NULL, calculado_en timestamptz NOT NULL DEFAULT now())`;
  if (!opts.recalcular) {
    const [c] = await sql`SELECT datos FROM topografia_lote WHERE predio_id = ${id}`;
    if (c) return c.datos;
  }
  const [lote] = await sql`SELECT municipio_dane, ST_Area(geom::geography) AS area, ST_Y(ST_Centroid(geom)) AS lat, ST_X(ST_Centroid(geom)) AS lon FROM parcel WHERE id = ${id}`;
  if (!lote) return { disponible: false, motivo: "Predio no encontrado" };
  const area = Number(lote.area);
  const fuentes = fuentesPara(lote.municipio_dane);
  if (!fuentes.length) return { disponible: false, motivo: "No hay modelo de terreno para este municipio" };

  let ultimoError = "";
  for (const f of fuentes) {
    // Malla dentro del lote: paso según la resolución de la fuente y el tamaño (≤ ~600 puntos).
    const paso = Math.max(f.resolucion_m, Math.sqrt(area / 600), 1);
    const malla = await sql`
      WITH p AS (SELECT ST_Transform(geom, 3116) g FROM parcel WHERE id = ${id}),
           c AS (SELECT (ST_SquareGrid(${paso}, p.g)).geom AS celda FROM p)
      SELECT ST_X(ST_Transform(ST_Centroid(c.celda), 4326)) lon, ST_Y(ST_Transform(ST_Centroid(c.celda), 4326)) lat,
             ST_X(ST_Centroid(c.celda)) x, ST_Y(ST_Centroid(c.celda)) y
      FROM c, p WHERE ST_Intersects(ST_Centroid(c.celda), p.g)`;
    // Lotes muy pequeños frente a la resolución: al menos centro + vértices interiores.
    const puntos = malla.length >= 4 ? malla : await sql`
      WITH p AS (SELECT ST_Transform(geom, 3116) g FROM parcel WHERE id = ${id})
      SELECT ST_X(ST_Transform(q.geom, 4326)) lon, ST_Y(ST_Transform(q.geom, 4326)) lat, ST_X(q.geom) x, ST_Y(q.geom) y
      FROM p, ST_DumpPoints(ST_GeneratePoints(p.g, 12, 1)) q`;
    let z: (number | null)[];
    try { z = await muestrear(f, puntos.map((p: any) => [Number(p.lon), Number(p.lat)])); }
    catch (e) { ultimoError = (e as Error).message; continue; }
    const ok = puntos.map((p: any, i: number) => ({ x: Number(p.x), y: Number(p.y), z: z[i] })).filter((p: any) => p.z != null) as { x: number; y: number; z: number }[];
    if (ok.length < Math.max(3, puntos.length * 0.6)) { ultimoError = `${f.nombre}: sin cobertura en el lote`; continue; }

    // Plano de ajuste z = a·x + b·y + c (mínimos cuadrados, coordenadas centradas).
    const mx = ok.reduce((s, p) => s + p.x, 0) / ok.length, my = ok.reduce((s, p) => s + p.y, 0) / ok.length, mz = ok.reduce((s, p) => s + p.z, 0) / ok.length;
    let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of ok) { const dx = p.x - mx, dy = p.y - my, dz = p.z - mz; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; sxz += dx * dz; syz += dy * dz; }
    const det = sxx * syy - sxy * sxy;
    const a = det ? (sxz * syy - syz * sxy) / det : 0, b = det ? (syz * sxx - sxz * sxy) / det : 0;
    const pendiente = Math.hypot(a, b) * 100;
    const caeHacia = (Math.atan2(-a, -b) * 180) / Math.PI; // azimut (0 = norte) hacia donde baja el terreno
    const zs = ok.map((p) => p.z).sort((m, n) => m - n);
    const q = (t: number) => zs[Math.min(zs.length - 1, Math.max(0, Math.round(t * (zs.length - 1))))];
    const desnivel = q(0.98) - q(0.02);
    // Pendiente máxima local: entre puntos vecinos de la malla (percentil 90 para evitar ruido).
    const locales: number[] = [];
    const tol = paso * 1.5;
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) {
      const d = Math.hypot(ok[i].x - ok[j].x, ok[i].y - ok[j].y);
      if (d > 0 && d <= tol) locales.push((Math.abs(ok[i].z - ok[j].z) / d) * 100);
    }
    locales.sort((m, n) => m - n);
    const pendMax = locales.length ? locales[Math.floor(locales.length * 0.9)] : pendiente;
    // Movimiento de tierras para dejar una plataforma única a la cota media.
    const celda = paso * paso * (area / (ok.length * paso * paso));
    let corte = 0, lleno = 0;
    for (const p of ok) { const d = p.z - mz; if (d > 0) corte += d * celda; else lleno += -d * celda; }

    // Perfil en la dirección de la pendiente, pasando por el centro del lote.
    const az = ((caeHacia % 360) + 360) % 360;
    const perfilPts = await sql`
      WITH p AS (SELECT ST_Transform(geom, 3116) g FROM parcel WHERE id = ${id}),
           c AS (SELECT ST_Centroid(g) c, g FROM p),
           l AS (SELECT ST_Intersection(g, ST_MakeLine(ST_Translate(c, -1000 * sin(radians(${az})), -1000 * cos(radians(${az}))),
                                                          ST_Translate(c, 1000 * sin(radians(${az})), 1000 * cos(radians(${az}))))) AS linea FROM c),
           s AS (SELECT CASE WHEN GeometryType(linea) = 'LINESTRING' THEN linea ELSE ST_LongestLine(linea, linea) END AS linea FROM l)
      SELECT ST_X(ST_Transform(pt, 4326)) lon, ST_Y(ST_Transform(pt, 4326)) lat, n::float / 30 * ST_Length(linea) AS d
      FROM s, generate_series(0, 30) n, LATERAL ST_LineInterpolatePoint(linea, n::float / 30) pt
      WHERE ST_Length(linea) > 0`;
    let perfil: { d: number; z: number }[] = [];
    try {
      const zp = await muestrear(f, perfilPts.map((p: any) => [Number(p.lon), Number(p.lat)]));
      perfil = perfilPts.map((p: any, i: number) => ({ d: r1(Number(p.d)), z: zp[i] })).filter((p: any) => p.z != null).map((p: any) => ({ d: p.d, z: r1(p.z) }));
    } catch { /* el perfil es opcional */ }

    // Relación con la vía más cercana con nombre (OpenStreetMap): ¿el lote queda por encima o por debajo?
    let via: any = null;
    const [v] = await sql`
      WITH p AS (SELECT geom FROM parcel WHERE id = ${id})
      SELECT o.nombre, ST_X(ST_ClosestPoint(o.geom, ST_Centroid(p.geom))) lon, ST_Y(ST_ClosestPoint(o.geom, ST_Centroid(p.geom))) lat,
             ST_Distance(o.geom::geography, p.geom::geography) dist
      FROM osm_via o, p WHERE ST_DWithin(o.geom::geography, p.geom::geography, 40) ORDER BY o.geom <-> ST_Centroid(p.geom) LIMIT 1`;
    if (v) {
      try {
        const [zv] = await muestrear(f, [[Number(v.lon), Number(v.lat)]]);
        if (zv != null) {
          const dif = mz - zv;
          via = { nombre: v.nombre, distancia_m: Math.round(Number(v.dist)), cota_via_m: r1(zv), diferencia_m: r1(dif),
            lectura: Math.abs(dif) < 1.5 ? "a nivel de la vía" : `${Math.abs(r1(dif)).toLocaleString("es-CO")} m ${dif > 0 ? "por encima" : "por debajo"} de la vía` };
        }
      } catch { /* opcional */ }
    }

    const clase = clasePendiente(pendiente);
    const datos = {
      disponible: true,
      fuente: { nombre: f.nombre, tipo: f.tipo, resolucion_m: f.resolucion_m, atribucion: f.atribucion,
        advertencia: f.tipo !== "MDT" ? "La fuente mide la superficie (puede incluir techos y árboles); úsela solo como referencia." :
          f.resolucion_m >= 10 && area < 2000 ? `Resolución de ${f.resolucion_m} m frente a un lote de ${Math.round(area)} m²: la pendiente es aproximada.` : null },
      puntos_muestreados: ok.length,
      cota_media_m: r1(mz), cota_min_m: r1(q(0.02)), cota_max_m: r1(q(0.98)),
      pendiente_pct: r1(pendiente), pendiente_max_local_pct: r1(pendMax), pendiente_grados: r1((Math.atan(pendiente / 100) * 180) / Math.PI),
      desnivel_m: r1(desnivel), clase, cae_hacia: pendiente < 2 ? null : rumbo(az), azimut_caida: pendiente < 2 ? null : Math.round(az),
      via,
      movimiento_tierras: { cota_plataforma_m: r1(mz), corte_m3: Math.round(corte), lleno_m3: Math.round(lleno),
        nota: "Volumen para dejar una plataforma única a la cota media del lote. Orden de magnitud: no incluye sótanos, taludes ni capa vegetal." },
      sotanos: desnivel >= 3 ? `Con ${r1(desnivel)} m de desnivel, los primeros sótanos pueden salir semienterrados (acceso a nivel por la parte baja).` : "Terreno casi plano: los sótanos serían totalmente enterrados.",
      perfil,
      aviso: "Análisis previo para filtrar y priorizar. No reemplaza el levantamiento topográfico ni el estudio de suelos.",
    };
    await sql`INSERT INTO topografia_lote (predio_id, datos) VALUES (${id}, ${JSON.stringify(datos)}::jsonb)
      ON CONFLICT (predio_id) DO UPDATE SET datos = EXCLUDED.datos, calculado_en = now()`;
    return datos;
  }
  return { disponible: false, motivo: ultimoError || "Sin modelo de terreno disponible" };
}

/** Pendiente aproximada (%) en el centro de muchos lotes a la vez: ráster de pendientes del AMVA (10 m, Valle de Aburrá). */
export async function pendientesRapidas(puntos: { id: string; lon: number; lat: number }[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const url = `${MED}/Modelo_digital_de_pendiente_gr_AMVA/ImageServer/getSamples`;
  for (let i = 0; i < puntos.length; i += 500) {
    const lote = puntos.slice(i, i + 500);
    try {
      const body = new URLSearchParams({ geometry: JSON.stringify({ points: lote.map((p) => [p.lon, p.lat]), spatialReference: { wkid: 4326 } }),
        geometryType: "esriGeometryMultipoint", returnFirstValueOnly: "true", f: "json" });
      const j: any = await (await fetch(url, { method: "POST", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(25000) })).json();
      for (const s of j.samples ?? []) { const g = Number(s.value); if (Number.isFinite(g) && g >= 0 && g < 89) out.set(lote[s.locationId].id, Math.round(Math.tan((g * Math.PI) / 180) * 1000) / 10); }
    } catch { /* sin dato: el lote queda sin pendiente rápida */ }
  }
  return out;
}

/** Preferencias de topografía por perfil de constructora → encaje 0..1 y explicación (no es bueno ni malo, es encaje). */
export type PreferenciaTopo = "plano" | "ladera_moderada" | "ladera_fuerte" | "indiferente";
export function encajeTopografia(pendiente: number | null | undefined, pref: PreferenciaTopo = "indiferente") {
  if (pendiente == null || pref === "indiferente") return { encaje: null as number | null, texto: null as string | null };
  const rango: Record<string, [number, number]> = { plano: [0, 6], ladera_moderada: [6, 30], ladera_fuerte: [25, 80] };
  const [lo, hi] = rango[pref];
  const fuera = pendiente < lo ? lo - pendiente : pendiente > hi ? pendiente - hi : 0;
  const encaje = Math.max(0, 1 - fuera / 10);
  const nombre = { plano: "terreno plano", ladera_moderada: "ladera moderada", ladera_fuerte: "ladera fuerte" }[pref];
  return { encaje: Math.round(encaje * 100) / 100,
    texto: encaje >= 0.99 ? `Encaja con su preferencia de ${nombre} (${r1(pendiente)} %).` : `${clasePendiente(pendiente)} (${r1(pendiente)} %) frente a su preferencia de ${nombre}.` };
}
