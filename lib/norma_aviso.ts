// Aviso sobre la vigencia de la norma. Medellín: la capa pública es del POT de 2014 (Acuerdo 48) y el Concejo aprobó
// su revisión (Proyecto de Acuerdo 104 de 2026) el 5 de noviembre de 2026. Cuando se cargue la norma nueva, este aviso cambia.
export const POT_MEDELLIN = {
  vigente_en_datos: "POT de Medellín 2014 (Acuerdo 48 de 2014)",
  revision: "Revisión del POT aprobada por el Concejo el 5 de noviembre de 2026 (Proyecto de Acuerdo 104 de 2026): modifica el 78 % del articulado y habilita ≈ 222.000 viviendas adicionales. Pendiente de sanción y de publicación de la cartografía.",
};

export function avisoPOT(dane: string | null | undefined): string | null {
  if (dane === "05001") {
    return `Norma tomada del ${POT_MEDELLIN.vigente_en_datos}. ${POT_MEDELLIN.revision} Índices, densidades y alturas de este predio pueden cambiar cuando la revisión entre en vigencia: validar antes de decidir.`;
  }
  return null;
}
