// Estado y acto de adopción de los planes parciales (y demás instrumentos de tercer nivel) donde la fuente pública lo trae,
// y estaciones del transporte masivo.
//  · Medellín: GeoMedellín, Instrumentos de Tercer Nivel del POT 48 (estado, acto administrativo, vigencia, observación).
//  · Sabaneta: IDEM, planes parciales con fecha de vigencia (el estado se recalcula con la fecha: la capa no lo actualiza).
//  · Estaciones de metro, metrocable, Metroplús y tranvía (GeoMedellín).
// Uso: npm run estado_planes   (correr después de npm run restricciones, que no borra las fuentes 'estado_*')
import { sql } from "../lib/db";

const GM = "https://www.medellin.gov.co/servidormapas/rest/services";
const s = (v: unknown) => (v == null || String(v).trim() === "" || String(v).trim().toUpperCase() === "N/A" ? null : String(v).trim());

async function todo(url: string) {
  const out: any[] = [];
  for (let off = 0; ; off += 1000) {
    const r = await fetch(`${url}/query?where=1%3D1&outFields=*&outSR=4326&resultOffset=${off}&resultRecordCount=1000&f=geojson`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(60000) });
    const j: any = await r.json();
    const fs = j.features ?? [];
    out.push(...fs);
    if (fs.length < 1000) break;
  }
  return out;
}

const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
function fechaTexto(t: string | null) {
  const m = t?.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de|del)\s+(\d{4})/);
  if (!m || !MESES[m[2]]) return null;
  return new Date(Number(m[3]), MESES[m[2]] - 1, Number(m[1]));
}

async function insertar(fuente: string, dane: string, filas: any[]) {
  await sql`DELETE FROM instrumento_plan WHERE fuente = ${fuente}`;
  for (let i = 0; i < filas.length; i += 100) {
    const lote = JSON.stringify(filas.slice(i, i + 100).filter((f) => f.geom));
    await sql`INSERT INTO instrumento_plan (fuente, municipio_dane, instrumento, nombre, codigo, estado, nivel, categoria, acto, vigencia, observacion, geom)
      SELECT ${fuente}, ${dane}, x->>'instrumento', x->>'nombre', x->>'codigo', x->>'estado', x->>'nivel', x->>'categoria', x->>'acto', x->>'vigencia', x->>'observacion',
        ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326)), 3))
      FROM jsonb_array_elements(${lote}::jsonb) x`;
  }
  const [n]: any = await sql`SELECT count(*)::int n FROM instrumento_plan WHERE fuente = ${fuente}`;
  console.log(`${fuente}: ${filas.length} leídos, ${n.n} cargados`);
}

await sql`ALTER TABLE instrumento_plan ADD COLUMN IF NOT EXISTS acto text`;
await sql`ALTER TABLE instrumento_plan ADD COLUMN IF NOT EXISTS vigencia text`;
await sql`ALTER TABLE instrumento_plan ADD COLUMN IF NOT EXISTS observacion text`;

// Medellín
const med = await todo(`${GM}/ordenamiento_ter/VM_POT48_Instrum_Planif_Compl/MapServer/1`);
await insertar("estado_geomedellin_tercer_nivel", "05001", med.map((f) => {
  const p = f.properties;
  return { instrumento: s(p.instrumento) === "Planes Parciales" ? "Plan parcial" : s(p.instrumento), nombre: s(p.nombre), codigo: s(p.cod_pol_z) ?? s(p.poligono), estado: s(p.estado), nivel: s(p.nivel),
    categoria: s(p.categoria), acto: s(p.acto_administrativo), vigencia: s(p.vigencia_acto_administrativo), observacion: s(p.observacion), geom: f.geometry ? JSON.stringify(f.geometry) : null };
}));

// Sabaneta: el estado se recalcula con la fecha de vigencia
const sab = await todo("https://portalidem.metropol.gov.co/server/rest/services/POT_Sabaneta/MapServer/6");
const hoy = new Date();
await insertar("estado_idem_sabaneta", "05631", sab.map((f) => {
  const p = f.properties, vig = s(p.VIGENCIA), d = fechaTexto(vig);
  const estado = /vencid/i.test(p.ESTADO ?? "") || (d && d < hoy) ? "Vencido" : /adopt/i.test(p.ESTADO ?? "") ? "Adoptado" : s(p.ESTADO);
  return { instrumento: "Plan parcial", nombre: s(p.NOMBRE), codigo: null, estado, nivel: null, categoria: s(p.SUELO), acto: null, vigencia: vig ? `Vigente hasta el ${vig}` : null,
    observacion: p.VIVIENDA_T ? `Viviendas del plan: ${p.VIVIENDA_T}` : null, geom: f.geometry ? JSON.stringify(f.geometry) : null };
}));

// Estaciones del transporte masivo
await sql`CREATE TABLE IF NOT EXISTS transporte_estacion (id bigserial PRIMARY KEY, nombre text, linea text, sistema text, estado text, tipo_est text, geom geometry(Point, 4326) NOT NULL)`;
await sql`CREATE INDEX IF NOT EXISTS transporte_estacion_geom ON transporte_estacion USING gist (geom)`;
const est = await todo(`${GM}/transporte/VC_Infraest_Gestion_Transporte/MapServer/11`);
const SIS: Record<string, string> = { "1": "Metro", "2": "Metrocable", "3": "Metroplús", "4": "Tranvía" };
const EST: Record<string, string> = { "1": "Existente", "2": "Ampliación", "3": "Proyectado", "4": "En ejecución", "5": "En estudio" };
await sql`DELETE FROM transporte_estacion`;
const filas = est.filter((f) => f.geometry?.type === "Point").map((f) => ({ nombre: s(f.properties.nombre), linea: s(f.properties.linea), sistema: SIS[String(f.properties.tipo)] ?? s(f.properties.tipo),
  estado: EST[String(f.properties.estado)] ?? s(f.properties.estado), tipo_est: s(f.properties.tipo_est), geom: JSON.stringify(f.geometry) }));
await sql`INSERT INTO transporte_estacion (nombre, linea, sistema, estado, tipo_est, geom)
  SELECT x->>'nombre', x->>'linea', x->>'sistema', x->>'estado', x->>'tipo_est', ST_SetSRID(ST_GeomFromGeoJSON(x->>'geom'), 4326) FROM jsonb_array_elements(${JSON.stringify(filas)}::jsonb) x`;
console.log(`estaciones: ${filas.length}`);
process.exit(0);
