// Perfil de estilo de un arquitecto o estudio: sus referentes (fotos de obras propias) y la descripción de su lenguaje.
// El estudio de cabida lo usa para que las imágenes (renders, acceso, interior, zona social) salgan con ese lenguaje y no
// con un estilo genérico: los prompts llevan la descripción y, con OpenAI, los referentes van como imágenes de referencia.
import { randomBytes } from "node:crypto";
import { sql } from "./db";
import { firmar } from "./auth";

const base = () => process.env.URL_BASE ?? "https://celula-suelo.vercel.app";
const t = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v).trim());

export type Estilo = {
  id?: string; nombre: string; estudio?: string | null;
  descripcion?: string | null;   // cómo describe el arquitecto su arquitectura, en sus palabras
  materiales?: string | null;    // concreto a la vista, ladrillo, madera, celosías…
  paleta?: string | null;        // colores
  rasgos?: string | null;        // fachada, ventanería, balcones, cubiertas, paisajismo, interiores
  evitar?: string | null;        // lo que nunca haría
  prompt_en?: string | null;     // síntesis en inglés para los modelos de imagen (la arma Claude o el análisis con IA)
};

let listo = false;
export async function esquemaEstilo() {
  if (listo) return;
  await sql`CREATE TABLE IF NOT EXISTS estilo (id text PRIMARY KEY, nombre text NOT NULL, estudio text, descripcion text, materiales text, paleta text, rasgos text, evitar text,
    prompt_en text, analisis_fuente text, creado_en timestamptz NOT NULL DEFAULT now(), actualizado_en timestamptz NOT NULL DEFAULT now())`;
  await sql`CREATE TABLE IF NOT EXISTS estilo_referente (estilo_id text NOT NULL REFERENCES estilo(id) ON DELETE CASCADE, n int NOT NULL, titulo text, proyecto text, nota text,
    mime text NOT NULL, datos bytea NOT NULL, ancho int, alto int, creado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (estilo_id, n))`;
  listo = true;
}

export async function guardarEstilo(e: Estilo) {
  await esquemaEstilo();
  if (!t(e.nombre) && !e.id) return { error: "Falta el nombre del perfil de estilo." };
  const campos = { nombre: t(e.nombre), estudio: t(e.estudio), descripcion: t(e.descripcion), materiales: t(e.materiales), paleta: t(e.paleta), rasgos: t(e.rasgos), evitar: t(e.evitar), prompt_en: t(e.prompt_en) };
  if (e.id) {
    // Solo cambia los campos que vienen (un texto vacío borra el campo)
    const v = (k: keyof typeof campos) => (e as any)[k] !== undefined;
    const [x]: any = await sql`UPDATE estilo SET nombre = coalesce(${campos.nombre}, nombre),
      estudio = CASE WHEN ${v("estudio")} THEN ${campos.estudio} ELSE estudio END, descripcion = CASE WHEN ${v("descripcion")} THEN ${campos.descripcion} ELSE descripcion END,
      materiales = CASE WHEN ${v("materiales")} THEN ${campos.materiales} ELSE materiales END, paleta = CASE WHEN ${v("paleta")} THEN ${campos.paleta} ELSE paleta END,
      rasgos = CASE WHEN ${v("rasgos")} THEN ${campos.rasgos} ELSE rasgos END, evitar = CASE WHEN ${v("evitar")} THEN ${campos.evitar} ELSE evitar END,
      prompt_en = CASE WHEN ${v("prompt_en")} THEN ${campos.prompt_en} ELSE prompt_en END, actualizado_en = now() WHERE id = ${e.id} RETURNING id`;
    if (!x) return { error: "Perfil de estilo no encontrado." };
    return verEstilo(e.id);
  }
  const id = `e_${randomBytes(4).toString("hex")}`;
  await sql`INSERT INTO estilo (id, nombre, estudio, descripcion, materiales, paleta, rasgos, evitar, prompt_en)
    VALUES (${id}, ${campos.nombre}, ${campos.estudio}, ${campos.descripcion}, ${campos.materiales}, ${campos.paleta}, ${campos.rasgos}, ${campos.evitar}, ${campos.prompt_en})`;
  return verEstilo(id);
}

/** Reduce a 1600 px en JPEG; devuelve también las dimensiones. */
async function normalizar(buf: Buffer) {
  const sharp = (await import("sharp")).default;
  const datos = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 84 }).toBuffer();
  const meta = await sharp(datos).metadata();
  return { datos, mime: "image/jpeg", ancho: meta.width ?? null, alto: meta.height ?? null };
}

export async function agregarReferente(estiloId: string, r: { b64?: string; url?: string; titulo?: string; proyecto?: string; nota?: string }) {
  await esquemaEstilo();
  const [e]: any = await sql`SELECT id FROM estilo WHERE id = ${estiloId}`;
  if (!e) return { error: "Perfil de estilo no encontrado." };
  const [c]: any = await sql`SELECT count(*)::int n, coalesce(max(n), -1)::int mx FROM estilo_referente WHERE estilo_id = ${estiloId}`;
  if (c.n >= 24) return { error: "Máximo 24 referentes por perfil: borra alguno antes de subir más." };
  let buf: Buffer;
  if (r.b64) buf = Buffer.from(r.b64.replace(/^data:[^,]+,/, ""), "base64");
  else if (r.url && /^https:\/\//.test(r.url)) {
    const res = await fetch(r.url, { signal: AbortSignal.timeout(30000), headers: { "user-agent": "Mozilla/5.0" } });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!res.ok || !/^image\//.test(mime)) return { error: `${r.url}: no es una imagen.` };
    buf = Buffer.from(await res.arrayBuffer());
  } else return { error: "Falta la imagen (archivo o URL https)." };
  if (buf.length > 20_000_000) return { error: "Imagen de más de 20 MB." };
  let img;
  try { img = await normalizar(buf); } catch { return { error: "No se pudo leer la imagen (usa JPG, PNG o WebP)." }; }
  const n = c.mx + 1;
  await sql`INSERT INTO estilo_referente (estilo_id, n, titulo, proyecto, nota, mime, datos, ancho, alto)
    VALUES (${estiloId}, ${n}, ${t(r.titulo)}, ${t(r.proyecto)}, ${t(r.nota)}, ${img.mime}, ${img.datos}, ${img.ancho}, ${img.alto})`;
  await sql`UPDATE estilo SET actualizado_en = now() WHERE id = ${estiloId}`;
  return { ok: true, n };
}

export async function borrarReferente(estiloId: string, n: number) {
  await esquemaEstilo();
  await sql`DELETE FROM estilo_referente WHERE estilo_id = ${estiloId} AND n = ${n}`;
  return { ok: true };
}

export async function borrarEstilo(estiloId: string) {
  await esquemaEstilo();
  await sql`DELETE FROM estilo WHERE id = ${estiloId}`;
  return { ok: true };
}

/** URL firmada de un referente (7 días), para pasarlo como imagen de referencia a otra herramienta (p. ej. Higgsfield). */
export async function urlReferente(estiloId: string, n: number) {
  return `${base()}/api/estilo/${estiloId}/referente/${n}?t=${await firmar({ typ: "ref", est: estiloId, n }, 7 * 24 * 3600)}`;
}

export async function verEstilo(id: string, conUrls = true) {
  await esquemaEstilo();
  const [e]: any = await sql`SELECT id, nombre, estudio, descripcion, materiales, paleta, rasgos, evitar, prompt_en, analisis_fuente, creado_en, actualizado_en FROM estilo WHERE id = ${id}`;
  if (!e) return null;
  const refs: any[] = await sql`SELECT n, titulo, proyecto, nota, ancho, alto FROM estilo_referente WHERE estilo_id = ${id} ORDER BY n`;
  return { ...e, referentes: await Promise.all(refs.map(async (r) => ({ ...r, url: conUrls ? await urlReferente(id, r.n) : undefined }))),
    texto_prompt: textoEstilo(e), pagina: `${base()}/estilo?id=${id}` };
}

export async function listarEstilos() {
  await esquemaEstilo();
  return (await sql`SELECT e.id, e.nombre, e.estudio, left(coalesce(e.descripcion, ''), 160) descripcion, (e.prompt_en IS NOT NULL) con_sintesis, e.actualizado_en,
    (SELECT count(*)::int FROM estilo_referente r WHERE r.estilo_id = e.id) referentes FROM estilo e ORDER BY e.actualizado_en DESC`) as any[];
}

export async function referentesDatos(id: string, max = 4) {
  await esquemaEstilo();
  return (await sql`SELECT n, titulo, proyecto, mime, datos FROM estilo_referente WHERE estilo_id = ${id} ORDER BY n LIMIT ${max}`) as any[];
}

/** Texto de estilo para los prompts de imagen: la síntesis en inglés si existe; si no, lo que escribió el arquitecto. */
export function textoEstilo(e: any) {
  if (!e) return null;
  if (t(e.prompt_en)) return `${e.prompt_en}${t(e.evitar) && !/avoid/i.test(e.prompt_en) ? `. Avoid: ${e.evitar}` : ""}`;
  const partes = [t(e.descripcion), t(e.materiales) && `materials: ${e.materiales}`, t(e.paleta) && `color palette: ${e.paleta}`, t(e.rasgos) && `signature features: ${e.rasgos}`].filter(Boolean);
  if (!partes.length) return null;
  return `${partes.join("; ")}${t(e.evitar) ? `. Avoid: ${e.evitar}` : ""}`;
}

/** Lee los referentes con un modelo de visión de OpenAI y propone la descripción del lenguaje (sin llave, lo hace Claude con ver_estilo). */
export async function analizarEstilo(id: string) {
  if (!process.env.OPENAI_API_KEY) return { error: "Sin OPENAI_API_KEY: pídele a Claude que lea el perfil (herramienta estilo_arquitectonico) y guarde la descripción." };
  const e: any = await verEstilo(id, false);
  if (!e) return { error: "Perfil de estilo no encontrado." };
  const refs = await referentesDatos(id, 8);
  if (!refs.length) return { error: "El perfil no tiene referentes todavía." };
  const sharp = (await import("sharp")).default;
  const imgs = await Promise.all(refs.map(async (r) => `data:image/jpeg;base64,${(await sharp(r.datos).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 78 }).toBuffer()).toString("base64")}`));
  const pista = [e.descripcion && `El arquitecto describe su trabajo así: ${e.descripcion}`, e.evitar && `Nunca haría: ${e.evitar}`].filter(Boolean).join("\n");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini", response_format: { type: "json_object" },
      messages: [{ role: "user", content: [
        { type: "text", text: `Estas son obras de un mismo arquitecto o estudio en Colombia. Describe su lenguaje arquitectónico común (no cada foto) para que un modelo de imágenes lo reproduzca en un edificio nuevo. ${pista}\nResponde en JSON: {"descripcion": "2-3 frases en español", "materiales": "español", "paleta": "español", "rasgos": "fachada, vanos, balcones, remates, paisajismo, interiores, en español", "evitar": "español", "prompt_en": "one dense English paragraph (max 90 words) describing the design language only, no site, no building size"}` },
        ...imgs.map((u) => ({ type: "image_url", image_url: { url: u, detail: "low" } })),
      ] }],
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  const txt = j?.choices?.[0]?.message?.content;
  if (!r.ok || !txt) return { error: j?.error?.message ?? `HTTP ${r.status}` };
  let p: any; try { p = JSON.parse(txt); } catch { return { error: "Respuesta del análisis no válida." }; }
  // Lo que escribió el arquitecto se respeta: el análisis solo llena lo que está vacío, salvo la síntesis en inglés
  await sql`UPDATE estilo SET descripcion = coalesce(descripcion, ${t(p.descripcion)}), materiales = coalesce(materiales, ${t(p.materiales)}), paleta = coalesce(paleta, ${t(p.paleta)}),
    rasgos = coalesce(rasgos, ${t(p.rasgos)}), evitar = coalesce(evitar, ${t(p.evitar)}), prompt_en = ${t(p.prompt_en)}, analisis_fuente = ${`OpenAI ${process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini"}`}, actualizado_en = now()
    WHERE id = ${id}`;
  return { ok: true, propuesta: p, estilo: await verEstilo(id) };
}
