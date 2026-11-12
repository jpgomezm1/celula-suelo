// ADN constructivo de una constructora: sistema estructural, reglas de producto, costos, ritmo de obra, financiación y
// tesis de inversión. El anteproyecto y los números se calculan con el perfil de la constructora del usuario; si no
// tiene perfil, se usa el de referencia (valores de mercado, Medellín 2026, a ajustar con los costos reales del cliente).
// Los perfiles son información confidencial del cliente: viven solo en la base de datos, nunca en el repositorio.
import { sql } from "../db";

export type SistemaConstructivo = "muros_vaciados" | "aporticado" | "mamposteria_estructural" | "prefabricado";

export type PerfilConstructora = {
  id: string;
  nombre: string;
  sistema: SistemaConstructivo;
  diseno: {
    crujia_m: number;               // profundidad de apartamento
    pasillo_m: number;
    altura_piso_m: number;          // piso a piso
    altura_primer_piso_m: number;
    modulo_m: number | null;        // módulo de formaleta: los frentes se redondean a múltiplos (null = libre)
    espesor_muro_interior_m: number;
    espesor_muro_fachada_m: number;
    largo_max_torre_m: number;
    eficiencia_minima_pct: number;  // área privada / construida en planta tipo
    mezcla: { tipologia: string; pct: number; area_m2?: number }[];
    plataforma_pisos: number;
    parqueo_privados_viv: number;
    parqueo_visitantes_viv: number;
  };
  costos: {
    // Costo directo por m² construido sobre rasante según altura (pisos hasta → $/m²)
    directo_m2_por_altura: { hasta_pisos: number; valor: number }[];
    directo_m2_sotano: number;
    directo_m2_plataforma: number;
    urbanismo_m2_lote_libre: number;   // zonas verdes, senderos, cerramiento
    diseno_estudios_pct: number;       // sobre costo directo
    interventoria_pct: number;
    gerencia_pct: number;
    honorarios_construccion_pct: number;
    imprevistos_pct: number;
    licencias_impuestos_pct: number;   // expensas, delineación urbana y similares sobre costo directo (supuesto)
    ventas_publicidad_pct: number;     // sobre ventas
    sala_ventas_fijo: number;
    fiducia_pct: number;               // sobre ventas
    compensacion_m2_equipamiento: number; // $/m² de equipamiento no construido en sitio
    reembolsables_pct: number;         // otros (seguros, pólizas, servicios provisionales) sobre directo
    incremento_costo_anual_pct: number; // inflación de costos de construcción (tipo ICCV)
  };
  ventas: {
    cuota_inicial_pct: number;         // pagada durante la obra
    preventa_equilibrio_pct: number;   // punto de equilibrio exigido por la fiducia
    meses_preventa_antes_obra: number;
    incremento_precio_anual_pct: number;
    precio_parqueadero_adicional: number;
  };
  obra: {
    dias_por_piso: number;             // ciclo de estructura por piso
    meses_preliminares: number;        // licencia, cerramiento, movimiento de tierra
    meses_por_sotano: number;
    meses_acabados: number;            // después de terminar la estructura
    meses_entre_etapas: number;        // desfase entre torres
    meses_escrituracion: number;       // después de terminar la torre
  };
  financiacion: {
    credito_constructor_pct_directo: number;
    tasa_ea: number;
    tasa_descuento_ea: number;         // para el valor presente
  };
  comite: {
    margen_minimo_pct: number;         // utilidad / ventas
    tir_minima_ea: number;
    lote_max_sobre_ventas_pct: number;
    estratos: number[];
    municipios: string[];
  };
  notas?: string;
};

/** Referencia de mercado (Medellín, 2026). Supuestos editables, no costos de un cliente. */
export const PERFIL_REFERENCIA: PerfilConstructora = {
  id: "referencia", nombre: "Referencia de mercado (Medellín 2026)", sistema: "muros_vaciados",
  diseno: { crujia_m: 7.6, pasillo_m: 1.6, altura_piso_m: 2.9, altura_primer_piso_m: 3.4, modulo_m: null, espesor_muro_interior_m: 0.1, espesor_muro_fachada_m: 0.15,
    largo_max_torre_m: 45, eficiencia_minima_pct: 74, mezcla: [{ tipologia: "1A", pct: 20 }, { tipologia: "2A", pct: 55 }, { tipologia: "3A", pct: 25 }], plataforma_pisos: 0, parqueo_privados_viv: 1, parqueo_visitantes_viv: 0.2 },
  costos: {
    directo_m2_por_altura: [{ hasta_pisos: 6, valor: 2_700_000 }, { hasta_pisos: 12, valor: 3_000_000 }, { hasta_pisos: 20, valor: 3_300_000 }, { hasta_pisos: 99, valor: 3_700_000 }],
    directo_m2_sotano: 2_600_000, directo_m2_plataforma: 2_900_000, urbanismo_m2_lote_libre: 350_000,
    diseno_estudios_pct: 3.5, interventoria_pct: 1.5, gerencia_pct: 3.0, honorarios_construccion_pct: 8.0, imprevistos_pct: 3.0, licencias_impuestos_pct: 2.5,
    ventas_publicidad_pct: 3.0, sala_ventas_fijo: 900_000_000, fiducia_pct: 0.6, compensacion_m2_equipamiento: 2_500_000, reembolsables_pct: 1.5, incremento_costo_anual_pct: 5,
  },
  ventas: { cuota_inicial_pct: 30, preventa_equilibrio_pct: 60, meses_preventa_antes_obra: 6, incremento_precio_anual_pct: 5, precio_parqueadero_adicional: 40_000_000 },
  obra: { dias_por_piso: 7, meses_preliminares: 3, meses_por_sotano: 2.5, meses_acabados: 7, meses_entre_etapas: 6, meses_escrituracion: 3 },
  financiacion: { credito_constructor_pct_directo: 60, tasa_ea: 14, tasa_descuento_ea: 15 },
  comite: { margen_minimo_pct: 15, tir_minima_ea: 18, lote_max_sobre_ventas_pct: 15, estratos: [3, 4, 5], municipios: ["Medellín", "Envigado", "Sabaneta", "Itagüí", "Bello"] },
  notas: "Valores de referencia para prefactibilidad. Reemplazar con los costos, ritmos y reglas reales de la constructora.",
};

/** Mezcla profunda: un perfil parcial sobre la referencia. */
export function completarPerfil(p: Partial<PerfilConstructora> & { id?: string; nombre?: string }): PerfilConstructora {
  const r = PERFIL_REFERENCIA as any, x = p as any, out: any = { ...r, ...x };
  for (const k of ["diseno", "costos", "ventas", "obra", "financiacion", "comite"]) out[k] = { ...r[k], ...(x[k] ?? {}) };
  return out;
}

let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await sql`CREATE TABLE IF NOT EXISTS constructora_perfil (id text PRIMARY KEY, nombre text NOT NULL, perfil jsonb NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now(), actualizado_por text)`;
  await sql`ALTER TABLE app_usuario ADD COLUMN IF NOT EXISTS constructora_id text`;
  tablaLista = true;
}

export async function obtenerPerfil(id?: string | null): Promise<PerfilConstructora> {
  if (!id || id === "referencia") return PERFIL_REFERENCIA;
  await asegurarTabla();
  const [r] = await sql`SELECT perfil FROM constructora_perfil WHERE id = ${id}`;
  return r ? completarPerfil({ ...r.perfil, id }) : PERFIL_REFERENCIA;
}

export async function perfilDeUsuario(usuario?: string | null): Promise<PerfilConstructora> {
  if (!usuario) return PERFIL_REFERENCIA;
  await asegurarTabla();
  const [u] = await sql`SELECT constructora_id FROM app_usuario WHERE email = lower(${usuario})`;
  return obtenerPerfil(u?.constructora_id ?? null);
}

export async function guardarPerfil(p: Partial<PerfilConstructora> & { id: string; nombre: string }, por?: string) {
  await asegurarTabla();
  const perfil = completarPerfil(p);
  await sql`INSERT INTO constructora_perfil (id, nombre, perfil, actualizado_por) VALUES (${p.id}, ${p.nombre}, ${JSON.stringify(perfil)}::jsonb, ${por ?? null})
    ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, perfil = EXCLUDED.perfil, actualizado_en = now(), actualizado_por = EXCLUDED.actualizado_por`;
  return perfil;
}

export async function listarPerfiles() {
  await asegurarTabla();
  const rs = await sql`SELECT id, nombre, actualizado_en FROM constructora_perfil ORDER BY nombre`;
  return [{ id: "referencia", nombre: PERFIL_REFERENCIA.nombre, actualizado_en: null }, ...rs];
}

export const costoDirectoM2 = (p: PerfilConstructora, pisos: number) =>
  (p.costos.directo_m2_por_altura.find((x) => pisos <= x.hasta_pisos) ?? p.costos.directo_m2_por_altura[p.costos.directo_m2_por_altura.length - 1]).valor;
