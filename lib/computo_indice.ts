// Áreas que no cuentan en el índice de construcción ("trucos de norma"): cuánta área se puede construir y vender
// por encima del índice sin violar la norma. Medellín: Acuerdo 48 de 2014, art. 284 (texto leído del normograma).
// Otros municipios: su acuerdo define el cómputo; no está digitalizado, se informa como pendiente.

const r0 = (x: number) => Math.round(x);
const FUENTE_MED = "Acuerdo 48 de 2014 (POT de Medellín), art. 284 — Cálculo del índice de construcción";

/** Parámetros de anteproyecto típico (vivienda en torre), a validar con el arquitecto. */
const CIRCULACION = 0.12;  // corredores, escaleras, puntos fijos y portería: fuera del índice
const TECNICO = 0.015;     // cuartos de máquinas y de basuras: fuera del índice
const PRIVADA = 0.95;      // del área que computa, lo que se vende como área privada construida (el resto: cuartos útiles y ajustes)

export function computoIndice(p: any, escenario: any, util: number, area: number, au: number) {
  if (!escenario?.disponible) return null;
  const ic = Number(escenario.area_construible_m2) || 0;
  const densidad = escenario.densidad_viv_ha ? Math.floor((escenario.densidad_viv_ha * area) / 10000) : Infinity;
  const vendible284 = ic * PRIVADA;
  const unidades284 = Math.min(Math.floor(vendible284 / au), densidad);
  const unidadesBase = Number(escenario.unidades) || 0;
  const limitaDensidad = Number.isFinite(densidad) && densidad <= Math.floor(vendible284 / au);
  const huella = Number(escenario.huella_m2) || util * 0.6;
  const parq = Number(escenario.parqueaderos) || 0;
  const plazasPlataforma = Math.floor((2 * huella * 0.5) / 28); // pisos 1 y 2, mitad posterior (la mitad del frente con usos activos)
  const porSotano = Math.max(1, Math.floor((util * 0.9) / 28));
  const sotanosConPlataforma = Math.ceil(Math.max(0, parq - plazasPlataforma) / porSotano);
  const med = p.municipio_dane === "05001";

  const palancas = [
    { palanca: "Circulaciones, puntos fijos y portería fuera del índice", m2: r0(ic * CIRCULACION), aplica: med,
      efecto: "Se construyen por encima del índice: todo el índice queda para área privada vendible.",
      cita: "“No se contabilizan para este índice, la circulación peatonal, escaleras, corredores y porterías.”" },
    { palanca: "Cuartos técnicos y de basuras fuera del índice", m2: r0(ic * TECNICO), aplica: med,
      efecto: "Cuartos de máquinas y de basuras no consumen índice.", cita: "“…ni se contabilizarán las áreas técnicas tales como cuartos de máquinas y cuartos de basuras.”" },
    { palanca: "Balcones y terrazas descubiertas, voladizos y azoteas", m2: null, aplica: med,
      efecto: "Un balcón o terraza SIN cubierta y los voladizos no computan; si se cubren, sí. Terrazas descubiertas en retrocesos y en el último piso suman área de venta sin gastar índice (se venden a menor precio por m²).",
      cita: "Computan “balcones y terrazas, que presenten cubiertas de cualquier material”; no computan “las proyecciones de marquesinas, voladizos o tapasoles y azoteas sobre primeros pisos”." },
    { palanca: "Parqueaderos dentro del tope en sótano o semisótano", m2: r0(parq * 28), aplica: med,
      efecto: "No computan si no exceden el tope máximo de la norma; los que excedan el tope sí computan.", cita: "Art. 284, condición 1: “Localizadas en sótano y semisótano.”" },
    { palanca: "Parqueaderos en pisos 1 y 2 con fachada activa", m2: r0(plazasPlataforma * 28), aplica: med,
      efecto: `Si al menos el 50 % del frente en primer piso tiene portería, vivienda, locales u oficinas, los parqueos de los dos primeros pisos no computan: caben ≈${plazasPlataforma} plazas y los sótanos pasarían de ${escenario.sotanos_aprox ?? "—"} a ${sotanosConPlataforma}.`,
      cita: "Art. 284, condición 2 (dos primeros pisos; fachada abierta mínima del 50 % de la longitud en primer piso)." },
    ...(area > 2000 ? [{ palanca: "Parqueo en edificaciones aisladas de hasta 3 pisos (lote > 2.000 m²)", m2: null, aplica: med,
      efecto: "En urbanizaciones residenciales en lotes de más de 2.000 m², los parqueos en edificios aislados de hasta 3 pisos que no den frente al espacio público ni a quebradas no computan.",
      cita: "Art. 284, condición 3." }] : []),
  ];

  return {
    aplica: med,
    fuente: med ? FUENTE_MED : "Pendiente: el cómputo del índice de este municipio no está digitalizado. Revisar su acuerdo POT (definición de índice de construcción).",
    area_que_computa_m2: r0(ic),
    area_fuera_del_indice_m2: med ? r0(ic * (CIRCULACION + TECNICO)) : null,
    area_construida_sobre_rasante_m2: med ? r0(ic * (1 + CIRCULACION + TECNICO)) : null,
    area_vendible_conservadora_m2: r0(Number(escenario.area_vendible_m2) || ic * 0.8),
    area_vendible_aprovechando_m2: med ? r0(vendible284) : null,
    unidades_conservadoras: unidadesBase,
    unidades_aprovechando: med ? unidades284 : null,
    limita: med ? (limitaDensidad ? "densidad" : "índice") : null,
    lectura: !med ? "El cómputo del índice de este municipio no está digitalizado: la cabida usa la regla conservadora (80 % del índice vendible)."
      : limitaDensidad
        ? `La densidad (${densidad} viviendas) limita antes que el índice: las áreas fuera del índice no dan más unidades, pero permiten apartamentos de hasta ≈${r0(vendible284 / Math.max(1, densidad))} m² en promedio (frente a ${au} m²).`
        : `Sacando circulaciones, puntos fijos y cuartos técnicos del índice, el área vendible pasa de ${r0(Number(escenario.area_vendible_m2) || ic * 0.8).toLocaleString("es-CO")} a ${r0(vendible284).toLocaleString("es-CO")} m² (+${unidades284 - unidadesBase} unidades de ${au} m²).`,
    palancas: med ? palancas : [],
    supuestos: `Escenario: ${escenario.escenario}. Circulaciones ${CIRCULACION * 100} % y cuartos técnicos ${TECNICO * 100} % del área que computa; ${PRIVADA * 100} % del área que computa se vende como área privada; 28 m² por plaza de parqueo. Validar con el arquitecto y la curaduría.`,
  };
}
