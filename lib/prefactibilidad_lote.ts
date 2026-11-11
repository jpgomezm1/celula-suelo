import { encontrarPredio, prefactibilidadRapida, type FichaInput } from "./ficha";
import { mercadoZona } from "./mercado";

export type PrefactibilidadInput = FichaInput & {
  costo_lote?: number; area_unidad?: number; precio_m2?: number; plazo_obra_meses?: number;
  costo_directo_m2?: number; radio_m?: number;
};

export async function prefactibilidadLote(f: PrefactibilidadInput) {
  const p = await encontrarPredio(f);
  if (!p) return { encontrado: false, mensaje: "Predio no encontrado." };
  const mercado = await mercadoZona({ lat: Number(p.lat), lon: Number(p.lon), radio_m: f.radio_m ?? 1500, tipo: "apartamento" });
  const r = prefactibilidadRapida(p, mercado, {
    costo_lote: f.costo_lote, area_unidad: f.area_unidad, precio_m2: f.precio_m2, plazo_obra_meses: f.plazo_obra_meses,
    costos: f.costo_directo_m2 ? { directo_m2: f.costo_directo_m2 } : undefined,
  });
  return {
    predio: { id: p.id, municipio: p.municipio, barrio: p.barrio_catastral, area_lote_m2: Number(p.area_lote), tratamiento: p.tratamiento,
      area_construible_m2: p.area_construible_inferida === null ? null : Number(p.area_construible_inferida), nivel_dato: p.nivel_dato },
    mercado_usado: { radio_m: f.radio_m ?? 1500, oferta: mercado.oferta, demanda: mercado.demanda, ritmo: mercado.ritmo },
    prefactibilidad: r,
    advertencia: "Prefactibilidad comercial. No reemplaza estudio de suelos, revisión del POT vigente, topografía ni estudio de cabida.",
  };
}
