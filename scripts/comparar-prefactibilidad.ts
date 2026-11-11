// Compara la traducción TypeScript contra el Python original de Fynder en 3 casos.
//   npm run comparar:prefactibilidad
import { execFileSync } from "node:child_process";
import { correr, type Entrada } from "../lib/prefactibilidad";

const PY = "C:/dev/irrelevant-projects/Proyecto-Cupido/.claude/skills/comite-de-tierras/scripts/prefactibilidad.py";

const casos: Record<string, Entrada> = {
  "El Poblado (referencia ago-2026)": {
    producto: { unidades: 40, area_promedio_m2: 110, precio_m2: 8_760_000 }, lote: { costo: 9_000_000_000 },
    mercado: { inventario_activo: 211, dias_inventario_promedio: 146, precio_p25: 958e6, precio_mediana: 1300e6, precio_p75: 1800e6,
      pedidos_compradores: 229, presupuesto_pedidos_mediana: 1000e6, presupuesto_pedidos_promedio: 1414e6 },
  },
  "Envigado (promedio contaminado)": {
    producto: { unidades: 60, area_promedio_m2: 85, precio_m2: 8_300_000 }, lote: { costo: 7_500_000_000 }, plazo_obra_meses: 30,
    mercado: { inventario_activo: 1739, dias_inventario_promedio: 138, precio_p25: 790e6, precio_mediana: 1150e6, precio_p75: 1990e6,
      pedidos_compradores: 467, presupuesto_pedidos_mediana: 1030e6, presupuesto_pedidos_promedio: 11_327e6 },
  },
  "Sabaneta (lote caro)": {
    producto: { unidades: 120, area_promedio_m2: 68, precio_m2: 7_180_000 }, lote: { costo: 14_000_000_000 },
    costos: { directo_m2: 3_400_000 },
    mercado: { inventario_activo: 589, dias_inventario_promedio: 128, precio_p25: 460e6, precio_mediana: 570e6, precio_p75: 680e6,
      pedidos_compradores: 136, presupuesto_pedidos_mediana: 550e6, presupuesto_pedidos_promedio: 738e6 },
  },
};

const numeros = (o: any, ruta = ""): [string, number][] =>
  Object.entries(o ?? {}).flatMap(([k, v]) =>
    typeof v === "number" ? [[`${ruta}${k}`, v] as [string, number]] : v && typeof v === "object" && !Array.isArray(v) ? numeros(v, `${ruta}${k}.`) : []);

let peor = 0;
for (const [nombre, entrada] of Object.entries(casos)) {
  const py = JSON.parse(execFileSync("python", [PY, "--json"], { input: JSON.stringify(entrada), encoding: "utf8" }));
  const ts = correr(entrada) as any;
  const a = new Map(numeros(py)), b = new Map(numeros(ts));
  let max = 0, campo = "";
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w === undefined) continue;
    const d = v === 0 ? Math.abs(w) : Math.abs(w - v) / Math.abs(v);
    if (d > max) { max = d; campo = k; }
  }
  peor = Math.max(peor, max);
  const igualAlertas = JSON.stringify(py.alertas.map((x: any) => x.nivel + x.tema)) === JSON.stringify(ts.alertas.map((x: any) => x.nivel + x.tema));
  console.log(`${nombre}: veredicto ${py.veredicto} / ${ts.veredicto} · diferencia máx ${(max * 100).toFixed(3)}% (${campo}) · alertas ${igualAlertas ? "iguales" : "DISTINTAS"}`);
}
console.log(peor < 0.005 ? "✓ Traducción dentro de 0,5 %" : "✗ Diferencia mayor a 0,5 %");
