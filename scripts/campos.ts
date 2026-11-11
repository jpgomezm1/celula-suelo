// Inspección de capas ArcGIS: nombre, tipo, paginación, campos, conteo y una muestra.
// Uso: npx tsx scripts/campos.ts <url_capa> [<url_capa> ...]   (o un archivo con una URL por línea: @lista.txt)
import { readFileSync } from "node:fs";

const UA = { "User-Agent": "Mozilla/5.0 (compatible; celula-suelo/0.2)" };
const SKIP = /^(shape|st_|se_anno|geom$|globalid)/i;

async function j(url: string) {
  const r = await fetch(url, { headers: UA });
  return r.json();
}

let urls = process.argv.slice(2);
if (urls[0]?.startsWith("@")) urls = readFileSync(urls[0].slice(1), "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));

for (const url of urls) {
  try {
    const info = await j(`${url}?f=json`);
    if (info.error) { console.log(`✗ ${url} → ${info.error.message}`); continue; }
    const cnt = await j(`${url}/query?where=1%3D1&returnCountOnly=true&f=json`);
    const sample = await j(`${url}/query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=1&f=json`);
    const fields = (info.fields ?? []).map((f: any) => f.name).filter((n: string) => !SKIP.test(n));
    const attrs = sample.features?.[0]?.attributes ?? {};
    const ej = Object.fromEntries(Object.entries(attrs).filter(([k, v]) => !SKIP.test(k) && v !== null && v !== "").slice(0, 14));
    console.log(`■ ${url.replace(/^https:\/\/[^/]+\/[^/]+\/rest\/services\//, "")}`);
    console.log(`  ${info.name} · ${info.geometryType ?? "-"} · n=${cnt.count} · max=${info.maxRecordCount} · pag=${info.advancedQueryCapabilities?.supportsPagination ?? "?"}`);
    console.log(`  campos: ${fields.join(", ")}`);
    console.log(`  ej: ${JSON.stringify(ej)}`);
  } catch (e) {
    console.log(`✗ ${url} → ${(e as Error).message}`);
  }
}
