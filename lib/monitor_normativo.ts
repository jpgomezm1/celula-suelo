// Monitor normativo: revisa los documentos que publica la Alcaldía de Medellín (API de medios de su WordPress)
// y guarda los relacionados con ordenamiento territorial en norma_novedad.
import { sql } from "./db";

const CLAVES = /(pot|tomo|anexo|acuerdo|decreto|cartograf|plan[-_ ]parcial|plan[-_ ]maestro|normativ|aprovechamiento|tratamiento|circular|resoluci[oó]n|macroproyecto|uso[-_ ]del[-_ ]suelo|licencia|curadur)/i;
const RUIDO = /(pico[-_ ]y[-_ ]placa|imagen|sisben|tasa|publicidad|predial|tomograf|aprovechamiento[-_ ]del[-_ ]tiempo|aprovechamientoalimentos)/i;

export async function asegurarTablas() {
  await sql`CREATE TABLE IF NOT EXISTS norma_novedad (url text PRIMARY KEY, titulo text, tipo text, publicado_en timestamptz, detectado_en timestamptz NOT NULL DEFAULT now(), relevancia text)`;
  await sql`CREATE TABLE IF NOT EXISTS norma_monitor (id serial PRIMARY KEY, revisado_en timestamptz NOT NULL DEFAULT now(), nuevos int, error text)`;
}

export async function revisarNovedades() {
  await asegurarTablas();
  const [u] = await sql`SELECT max(publicado_en) AS ultima FROM norma_novedad`;
  const desde = u?.ultima ? new Date(new Date(u.ultima).getTime() - 3 * 864e5) : new Date(Date.now() - 60 * 864e5);
  let nuevos = 0;
  try {
    let paginas = 1;
    for (let pagina = 1; pagina <= Math.min(paginas, 30); pagina++) {
      const q = new URLSearchParams({ per_page: "100", page: String(pagina), after: desde.toISOString().slice(0, 19), orderby: "date", order: "desc", media_type: "application" });
      const r = await fetch(`https://www.medellin.gov.co/es/wp-json/wp/v2/media?${q}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.4)" }, signal: AbortSignal.timeout(30_000) });
      if (!r.ok) break;
      paginas = Number(r.headers.get("x-wp-totalpages") ?? 1);
      const items: any[] = await r.json();
      if (!items.length) break;
      for (const it of items) {
        const url: string = it.source_url ?? "";
        const titulo = String(it.title?.rendered ?? url.split("/").pop() ?? "").replace(/<[^>]+>/g, "");
        if (String(it.mime_type).startsWith("image") || RUIDO.test(url) || !CLAVES.test(`${url} ${titulo}`)) continue;
        const relevancia = /tomo[-_ ]?v|proyecto[-_ ]de[-_ ]acuerdo|cartograf|aprovechamiento|tratamiento|acuerdo[-_ ]?\d+[-_ ]de[-_ ]2026/i.test(url) ? "alta" : /pot|anexo|plan[-_ ]parcial|decreto/i.test(url) ? "media" : "baja";
        const res = await sql`INSERT INTO norma_novedad (url, titulo, tipo, publicado_en, relevancia) VALUES (${url}, ${titulo}, ${String(it.mime_type).split("/").pop()}, ${it.date}, ${relevancia})
                              ON CONFLICT (url) DO NOTHING RETURNING 1`;
        nuevos += res.length;
      }
    }
    await sql`INSERT INTO norma_monitor (nuevos) VALUES (${nuevos})`;
    return { ok: true, nuevos };
  } catch (e) {
    await sql`INSERT INTO norma_monitor (nuevos, error) VALUES (${nuevos}, ${(e as Error).message})`;
    return { ok: false, nuevos, error: (e as Error).message };
  }
}
