// Norma para la cabida: volumetría (retiros y separaciones, por municipio), punto fijo (NSR-10 Título K y
// Decreto 471 de 2018 de Medellín), parqueaderos y rampas. Las reglas con cita vienen de data/normas/punto_fijo_nsr10.csv;
// la volumetría por municipio se completa con data/normas/volumetria_*.csv (digitalizada, pendiente de validar).
/** Retiros: `lateral` aplica a fachadas abiertas (las largas de la torre) frente a linderos; `cabecera` a las culatas cerradas.
 *  Separaciones dentro del lote: entre fachadas abiertas, abierta frente a cerrada y entre culatas. */
export type NormaVol = { municipio: string; pisos: number; frontal: number; lateral: number; cabecera: number; fondo: number; entre_torres: number;
  entre_abierta_cerrada: number; entre_cabeceras: number; plataforma_max_pisos: number | null; io_torre: number | null; io_plataforma: number | null;
  fuente: string; citas: string[]; provisional: boolean };

export function normaVolumetrica(dane: string, pisos: number, o: { retiro_frontal_m?: number; retiro_lateral_m?: number; retiro_fondo_m?: number; separacion_torres_m?: number } = {},
  ctx: { cbml?: string | null; area_lote?: number | null } = {}): NormaVol {
  let n: NormaVol;
  if (dane === "05001") {
    // Medellín: Acuerdo 48 de 2014 (arts. 345–355) y Decreto 471 de 2018 (arts. 205, 207, 213).
    const comuna = String(ctx.cbml ?? "").slice(0, 2);
    const zona5 = comuna === "14"; // El Poblado
    const grande = (ctx.area_lote ?? 0) >= 2000;
    const citas = ["Acuerdo 48 de 2014, art. 351: 12 m entre fachadas abiertas; 6 m abierta frente a cerrada o semicerrada; 0 a 3 m entre cerradas.",
      "Acuerdo 48, art. 346: fuera de la Zona 5, los retiros laterales y de fondo son los retiros entre fachadas (art. 351).",
      "Decreto 471 de 2018, art. 205: antejardín de 3 m (vías de servicio y colectoras) a 5 m (arterias); se asume 5 m mientras no se conozca la jerarquía de la vía.",
      "Decreto 471, art. 207: el antejardín no se puede ocupar con sótanos; los retiros laterales y de fondo sí, si no sobresalen del terreno."];
    // Hacia el lindero se toma la mitad de la separación entre fachadas (6 m abierta, 3 m cerrada), salvo reglas específicas.
    let lateral = 6, cabecera = 3, fondo = 6;
    if (zona5) { lateral = pisos <= 14 ? 6 : 9; cabecera = lateral; fondo = lateral; citas.push("Acuerdo 48, art. 347 (Zona 5): retiros laterales y de fondo de 6 m hasta 14 pisos y 9 m por encima (5 m hasta 3 pisos)."); if (pisos <= 3) { lateral = cabecera = fondo = 5; } }
    if (grande) { const r = pisos <= 3 ? 5 : pisos <= 14 ? 6 : 9; lateral = Math.max(lateral, r); cabecera = Math.max(cabecera, r); fondo = Math.max(fondo, r); citas.push(`Acuerdo 48, art. 345: lote de 2.000 m² o más, retiro perimetral de ${r} m (5 m hasta 3 pisos, 6 m, 9 m por encima de 14 pisos).`); }
    n = { municipio: dane, pisos, frontal: 5, lateral, cabecera, fondo, entre_torres: 12, entre_abierta_cerrada: 6, entre_cabeceras: 3, plataforma_max_pisos: null, io_torre: 0.6, io_plataforma: 0.8,
      fuente: `Medellín · Acuerdo 48 de 2014 y Decreto 471 de 2018${zona5 ? " · Zona 5" : ""}${grande ? " · lote ≥ 2.000 m²" : ""} (digitalizada, pendiente de validar)`, citas, provisional: false };
    n.citas.push("Acuerdo 48, art. 282: índice de ocupación de 80 % en plataforma y 60 % en torre (media y alta mixtura).");
  } else if (VALLE[dane]) {
    const v = VALLE[dane], grande = (ctx.area_lote ?? 0) >= 2000;
    const lateral = v.lateral, cabecera = v.lote_grande_todos && grande ? v.lateral : v.cabecera;
    n = { municipio: dane, pisos, frontal: v.antejardin, lateral, cabecera, fondo: lateral, entre_torres: 12, entre_abierta_cerrada: 6, entre_cabeceras: v.entre_cerradas,
      plataforma_max_pisos: v.plataforma, io_torre: null, io_plataforma: null, fuente: `${v.nombre} · ${v.instrumento} (digitalizada${v.provisional ? ", parcialmente adoptada" : ""}, pendiente de validar)`,
      citas: v.citas, provisional: !!v.provisional };
  } else {
    // Otros municipios: provisional hasta cargar su norma (retiros crecientes con la altura, práctica usual).
    const lateral = pisos <= 3 ? 3 : pisos <= 5 ? 4 : pisos <= 10 ? 5 : pisos <= 15 ? 6 : 7;
    n = { municipio: dane, pisos, frontal: 5, lateral, cabecera: Math.max(3, lateral / 2), fondo: lateral, entre_torres: Math.max(12, lateral * 2), entre_abierta_cerrada: Math.max(6, lateral), entre_cabeceras: 3,
      plataforma_max_pisos: 3, io_torre: null, io_plataforma: null, fuente: "Supuesto de práctica: la norma volumétrica de este municipio está en digitalización", citas: [], provisional: true };
  }
  if (o.retiro_frontal_m != null) n.frontal = o.retiro_frontal_m;
  if (o.retiro_lateral_m != null) { n.lateral = o.retiro_lateral_m; n.cabecera = Math.min(n.cabecera, o.retiro_lateral_m); }
  if (o.retiro_fondo_m != null) n.fondo = o.retiro_fondo_m; else if (o.retiro_lateral_m != null) n.fondo = o.retiro_lateral_m;
  if (o.separacion_torres_m != null) n.entre_torres = o.separacion_torres_m;
  if (o.retiro_frontal_m != null || o.retiro_lateral_m != null || o.separacion_torres_m != null) n.fuente += " · ajustado por el usuario";
  return n;
}

// Norma volumétrica de otros municipios del Valle de Aburrá (data/normas/volumetria_valle.csv).
const VALLE: Record<string, { nombre: string; instrumento: string; lateral: number; cabecera: number; entre_cerradas: number; antejardin: number; plataforma: number | null;
  lote_grande_todos?: boolean; provisional?: boolean; citas: string[] }> = {
  "05266": { nombre: "Envigado", instrumento: "POT Acuerdo 010 de 2011 y Acuerdo 056 de 2001", lateral: 6, cabecera: 3, entre_cerradas: 3, antejardin: 5, plataforma: null,
    citas: ["Acuerdo 056 de 2001, art. 105: retiro a linderos de 6 m con fachada abierta y 3 m con fachada semicerrada o cerrada.",
      "Art. 104: 12 m entre fachadas abiertas, 6 m entre semicerradas, 3 m entre cerradas si se separan.", "Art. 103: retiro de 11 m al eje de vía para 4 pisos o más.",
      "Art. 40: antejardín de 5 m en multifamiliar.", "Ojo: el Decreto 600 de 2019 que modificaba el POT está suspendido."] },
  "05631": { nombre: "Sabaneta", instrumento: "PBOT Acuerdo 022 de 2009 y Acuerdo 007 de 2019", lateral: 6, cabecera: 3, entre_cerradas: 0, antejardin: 5, plataforma: 5, provisional: true,
    citas: ["Acuerdo 007 de 2019, art. 235: 12 m entre fachadas abiertas, 6 m semicerradas o mixtas, 0 m cerradas; 6 m al lindero.", "Art. 213: plataforma de hasta 5 pisos en corredores de renovación.",
      "Ojo: un juzgado anuló 68 artículos del Acuerdo 007 de 2019; verificar vigencia."] },
  "05360": { nombre: "Itagüí", instrumento: "POT Acuerdo 09 de 2023", lateral: 6, cabecera: 3, entre_cerradas: 3, antejardin: 5, plataforma: null, provisional: true,
    citas: ["Acuerdo 09 de 2023, art. 224: los retiros a medianería en multifamiliares quedan por reglamentar; se usan los del documento técnico (12 m y 6 m), no adoptados.",
      "Art. 205: altura de 8 a 20 pisos según el área del lote."] },
  "05088": { nombre: "Bello", instrumento: "POT Acuerdo 033 de 2009 y Decreto 193 de 2011", lateral: 6, cabecera: 3, entre_cerradas: 3, antejardin: 3, plataforma: null, lote_grande_todos: true,
    citas: ["Decreto 193 de 2011, art. 187: retiros laterales y de fondo de 6 m en lotes de más de 2.000 m²; 12 m entre fachadas abiertas, 6 m semicerradas, 3 m cerradas.",
      "Retiro de 11 m al eje de vía para más de 4 pisos o 17 m.", "Arts. 160–161: plataforma solo en zonas y corredores comerciales.", "Ojo: verificar cambios del Acuerdo 004 de 2025."] },
};

/** Punto fijo según NSR-10 Título K y Decreto 471 de 2018 (Medellín). */
export function puntoFijo(o: { pisos: number; altura_m: number; viviendas_torre: number; alcobas_torre: number; area_piso_m2: number }) {
  const carga = Math.ceil(o.area_piso_m2 / 18);                         // NSR-10 Tabla K.3.3-1: 18 m²/persona (grupo R)
  const salidas = carga <= 100 ? 1 : carga <= 500 ? 2 : 3;               // NSR-10 Tabla K.3.4-1
  const aPruebaDeHumo = o.pisos >= 6;                                     // NSR-10 K.3.8.7.2
  let asc = 0;
  if (o.altura_m > 15) asc = 1;                                           // Decreto 471, art. 226 num. 1
  if (o.altura_m > 15 && o.viviendas_torre > 50) asc = 2;                 // art. 226 num. 3
  // Tráfico (art. 226 num. 6): transportar el 5 % de la población en 5 minutos; población = 1,5 hab por alcoba.
  if (asc > 0) {
    const poblacion = o.alcobas_torre * 1.5;
    const rtt = (2 * o.altura_m) / 1.6 + Math.min(o.pisos, 7) * 10 + 20;  // viaje redondo aproximado (s), cabina de 8 personas al 80 %
    const capacidad5min = (300 / rtt) * 8 * 0.8;
    asc = Math.max(asc, Math.ceil((0.05 * poblacion) / capacidad5min));
  }
  const notas = [
    `Carga de ocupación por piso ≈ ${carga} personas (NSR-10 Tabla K.3.3-1) → ${salidas} salida(s) (Tabla K.3.4-1).`,
    aPruebaDeHumo ? "6 o más pisos: al menos una escalera a prueba de humo con vestíbulo (NSR-10 K.3.8.7.2)." : "Menos de 6 pisos: escalera cerrada continua hasta la calle (NSR-10 J.2.5.1.7).",
    "Escalera de 1,20 m de ancho mínimo, huella ≥ 0,28 m y contrahuella 0,16–0,18 m (NSR-10 K.3.8.3; Decreto 471 art. 225).",
    asc ? `${asc} ascensor(es): obligatorio por altura > 15 m; mínimo 2 con más de 50 viviendas; tráfico del 5 % de la población en 5 min (Decreto 471 art. 226).` : "Sin ascensor obligatorio (altura ≤ 15 m, Decreto 471 art. 226).",
    o.pisos > 5 ? "Ducto de basuras obligatorio (más de 5 pisos, Decreto 471 art. 233) y red contra incendio con salida por piso (NSR-10 J.2.4.7)." : "",
    o.pisos > 7 ? "Más de 7 pisos: rociadores y detección de humo en zonas comunes (NSR-10 J.4.3.8.1 y Tabla J.4.2-1)." : "",
    "Recorrido máximo de 35 m desde la puerta de cada vivienda hasta la escalera sin rociadores (NSR-10 K.3.18.2.4).",
  ].filter(Boolean);
  return { escaleras: Math.max(1, salidas), ascensores: asc, a_prueba_de_humo: aPruebaDeHumo, carga_ocupacion_piso: carga, notas };
}

/** Rampa vehicular recta (Decreto 471 art. 243): la pendiente depende de la longitud; transiciones de largo 2 × P (dm). */
export function rampa(altura: number, celdas: number) {
  for (const [P, lmin, lmax] of [[0.20, 0, 15], [0.18, 15, 20], [0.16, 20, 25], [0.13, 25, 99]] as [number, number, number][]) {
    const trans = (2 * P * 100) / 10;                                    // m (2 × P en dm)
    const subeTrans = 2 * trans * (P / 2);
    const tramo = Math.max(0, altura - subeTrans) / P;
    const total = tramo + 2 * trans;
    if (total >= lmin && total <= lmax) return { pendiente: P, largo_m: Math.round(total * 10) / 10, transiciones_m: trans, ancho_m: celdas <= 30 ? 3.5 : 7.0,
      nota: `Rampa de ${Math.round(total * 10) / 10} m al ${P * 100} % con transiciones de ${trans} m; ${celdas <= 30 ? "un carril de 3,50 m" : "dos carriles de 3,50 m"} (Decreto 471 art. 240 y 243).` };
  }
  return { pendiente: 0.13, largo_m: Math.round((altura / 0.13 + 6) * 10) / 10, transiciones_m: 2.6, ancho_m: 7.0, nota: "Rampa larga al 13 % (Decreto 471 art. 243)." };
}

export function parqueaderos(dane: string, unidades: number, estrato: number | null) {
  const e = estrato ?? 4;
  let porViv = 1, porVis = 1 / 5, base = "supuesto de 1 privado + 0,2 visitantes por vivienda (norma del municipio en digitalización)";
  if (dane === "05001") {
    // Acuerdo 48 de 2014, art. 364: son TOPES máximos por estrato; se diseña con el tope.
    [porViv, porVis] = e <= 3 ? [1, 1 / 4] : e === 4 ? [1.25, 1 / 3] : [1.5, 1 / 3];
    base = `tope del Acuerdo 48 art. 364 para estrato ${e}${estrato == null ? " (estimado)" : ""}: ${porViv} privado(s) y 1 visitante por cada ${Math.round(1 / porVis)} viviendas; los topes son máximos, no mínimos`;
  }
  else if (dane === "05266") { porViv = 1; porVis = 1 / 3; base = "Envigado, Acuerdo 056 de 2001 art. 160: 1 por vivienda y 1 de visitantes por cada 3"; }
  else if (dane === "05631") { porViv = 1; porVis = 1 / 4; base = "Sabaneta, Acuerdo 007 de 2019 art. 237: topes de 1 por vivienda y 1 de visitantes por cada 4 (1,5 y 1/3 en Consolidación 2 y Desarrollo 2)"; }
  else if (dane === "05360") { porViv = 1; porVis = 1 / 6; base = "Itagüí, Acuerdo 09 de 2023 art. 205: 1 por vivienda (10 a 50 % canjeable por motos); el Acuerdo no fija visitantes, se usa 1/6 del documento técnico"; }
  else if (dane === "05088") { const t: Record<number, [number, number]> = { 1: [1 / 4, 1 / 6], 2: [1 / 4, 1 / 6], 3: [1 / 2, 1 / 5], 4: [1 / 2, 1 / 4], 5: [1, 1 / 4], 6: [1, 1 / 3] }; [porViv, porVis] = t[e] ?? t[4];
    base = `Bello, Decreto 193 de 2011 art. 173 para estrato ${e}${estrato == null ? " (estimado)" : ""}`; }
  const privados = Math.ceil(unidades * porViv), visitantes = Math.ceil(unidades * porVis);
  return { privados, visitantes, total: privados + visitantes, estrato: e, celda: [2.5, 5.0] as [number, number], calle: 6.0,
    nota: `Parqueaderos: ${base}. Celda de diseño 2,50 × 5,00 m (mínimo 2,30 × 5,00, Decreto 471 art. 241), calle de 6,00 m con celdas a 90° (art. 239); 1 de cada 30 para movilidad reducida.` };
}

/** Obligaciones del primer piso y equipamiento (Decreto 471 de 2018 y Acuerdo 48 de 2014). */
export function obligaciones(unidades: number, pisos: number) {
  return {
    equipamiento_m2: unidades * 1,                                        // 1 m² construido por vivienda (obligación urbanística de equipamiento)
    porteria: pisos > 5 || unidades > 10,                                  // Decreto 471 art. 230
    viviendas_adaptables: Math.ceil(unidades / 30),                        // art. 225 parágrafo
    tanque_24h: pisos > 3,                                                 // art. 231
    cuarto_basuras_exterior: unidades > 50,                                // art. 232 num. 2
  };
}
