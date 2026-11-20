// Carga los planes parciales adoptados de data/planes_parciales/*.json (transcritos del decreto de adopción y su DTS).
// La norma de un plan parcial adoptado manda sobre la norma general del POT para los predios que incluye.
// Uso: npm run planes_parciales
import { readFileSync, readdirSync } from "node:fs";
import { guardarPlanParcial } from "../lib/plan_parcial";

for (const f of readdirSync("data/planes_parciales").filter((x) => x.endsWith(".json"))) {
  const r: any = await guardarPlanParcial(JSON.parse(readFileSync(`data/planes_parciales/${f}`, "utf8")));
  console.log(r.error ?? `${r.nombre}: ${r.uaus} UAU, ${r.predios} predios${r.predios_sin_catastro.length ? `; sin geometría en el catastro: ${r.predios_sin_catastro.join(", ")}` : ""}`);
}
process.exit(0);
