// Consulta de norma: qué se puede hacer en un lote. Entrada por CBML, id, matrícula, dirección de Medellín, coordenada
// o un archivo KML/KMZ con uno o varios lotes (puntos o polígonos). Respuesta corta y directa.
import { sql } from "./db";
import { encontrarPredio } from "./ficha";
import { geocodificarMedellin } from "./estudio";
import { avisoPOT } from "./norma_aviso";
import { leerKml, type LugarKml } from "./kml";
import { bloque2026, normas2026 } from "./norma2026";

export type ConsultaNormaInput = { id?: string; cbml?: string; matricula?: string; direccion?: string; lat?: number; lon?: number; area_unidad_m2?: number };

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const limpiarMatricula = (m: string) => m.replace(/^\s*\d{3}[a-z]?\s*-\s*/i, "").replace(/\D/g, "");

function resumenNorma(p: any, au = 65, n26?: Map<string, any>) {
  const construible = n(p.area_construible_inferida);
  const construibleDerechos = n(p.ic_total) && n(p.area_lote) ? Math.round(n(p.ic_total)! * n(p.area_lote)!) : null;
  const viv = n(p.viviendas_max_inferidas);
  const porArea = construible ? Math.floor((construible * 0.8) / au) : null;
  return {
    predio: p.id, municipio: p.municipio, barrio: p.barrio_catastral, clase_suelo: p.clase === "U" ? "urbano" : "rural",
    area_lote_m2: n(p.area_lote) ? Math.round(n(p.area_lote)!) : null,
    construccion_actual: { construcciones: n(p.construcciones), area_construida_m2: n(p.area_construida) ? Math.round(n(p.area_construida)!) : null, pisos_max: n(p.pisos_max) },
    norma: {
      tratamiento: p.tratamiento, codigo: p.codigo_tratamiento, uso_del_suelo: p.uso,
      altura_max_pisos: n(p.altura_max), altura_texto: p.altura_texto, indice_construccion_base: n(p.ic_max), indice_construccion_con_derechos: n(p.ic_total),
      densidad_max_viv_ha: n(p.densidad_max), indice_ocupacion_max: n(p.io_max), fuente: p.norma_fuente, acuerdo: p.norma_acuerdo ?? p.acuerdo_vigente ?? null,
      nivel_dato: p.nivel_dato,
    },
    que_se_puede_hacer: construible ? {
      area_construible_m2: Math.round(construible), area_construible_con_derechos_m2: construibleDerechos,
      viviendas_max_por_densidad: viv, unidades_estimadas: viv && porArea ? Math.min(viv, porArea) : porArea ?? viv, supuesto: `${au} m² por unidad y 80 % de área vendible`,
      area_construible_restante_m2: n(p.area_construible_restante_inferida) ? Math.round(n(p.area_construible_restante_inferida)!) : null,
    } : { nota: "Sin índice de construcción en la capa pública de este municipio: no se calcula aprovechamiento." },
    restricciones: { amenazas: p.amenazas ?? [], amenaza_alta: !!p.amenaza_alta, proteccion: p.protecciones ?? [] },
    valor_suelo_referencia_m2: n(p.valor_suelo_m2) ? Math.round(n(p.valor_suelo_m2)!) : null,
    potencial_preliminar: !!p.potencial_preliminar,
    pot_2026_preliminar: n26 ? bloque2026(p, n26.get(p.codigo_tratamiento), au) : null,
    aviso_pot: avisoPOT(p.municipio_dane),
    advertencia: p.pot_servicio === "derogado" ? "La capa pública de este municipio es de un POT derogado: la norma mostrada puede no estar vigente." : null,
  };
}

export async function consultaNorma(f: ConsultaNormaInput) {
  let p: any = null;
  let via = "";
  let matriculas: string[] = [];
  if (f.matricula) {
    const m = limpiarMatricula(f.matricula);
    const r = await sql`SELECT parcel_id FROM parcel_folio WHERE matricula = ${m} LIMIT 1`;
    if (r[0]) { p = await encontrarPredio({ id: r[0].parcel_id }); via = `matrícula ${m}`; }
    else return { encontrado: false, mensaje: `No encontré la matrícula ${m}. Hoy las matrículas cubren Medellín (MEData); en otros municipios usa coordenada o KMZ.` };
  }
  if (!p && (f.id || f.cbml)) { p = await encontrarPredio({ id: f.id, cbml: f.cbml }); via = f.id ? "id" : "CBML"; }
  if (!p && f.direccion) {
    const g = await geocodificarMedellin(f.direccion);
    if (g) { p = await encontrarPredio({ cbml: g.cbml }) ?? await encontrarPredio({ lat: g.lat, lon: g.lon }); via = "dirección (nomenclatura de Medellín)"; }
  }
  if (!p && f.lat !== undefined && f.lon !== undefined) { p = await encontrarPredio({ lat: f.lat, lon: f.lon }); via = "coordenada"; }
  if (!p) return { encontrado: false, mensaje: "No encontré el predio. Da un CBML, matrícula, dirección de Medellín o coordenada dentro del lote." };
  const folios = await sql`SELECT matricula, por_derecho FROM parcel_folio WHERE parcel_id = ${p.id} ORDER BY por_derecho DESC NULLS LAST LIMIT 20`;
  matriculas = folios.map((x: any) => x.matricula);
  const dirs = await sql`SELECT direccion FROM parcel_address WHERE parcel_id = ${p.id} LIMIT 5`;
  return {
    encontrado: true, buscado_por: via,
    identificacion: { predio: p.id, cbml: p.municipio_dane === "05001" ? String(p.id).split(":")[1] : null, matriculas, direcciones: dirs.map((d: any) => d.direccion) },
    ...resumenNorma(p, f.area_unidad_m2, await normas2026([p.codigo_tratamiento])),
  };
}

/** Varios lotes a la vez: lista de puntos/polígonos o el texto de un KML. Para polígonos suma los predios que cubre (englobe). */
export async function consultaNormaLotes(entrada: { kml?: string; lotes?: { nombre?: string; lat?: number; lon?: number; poligono?: [number, number][] }[]; area_unidad_m2?: number }) {
  const lugares: LugarKml[] = entrada.kml ? leerKml(entrada.kml)
    : (entrada.lotes ?? []).map((l, i) => ({ nombre: l.nombre ?? `Lote ${i + 1}`, ...(l.poligono ? { poligono: l.poligono } : { punto: [l.lon!, l.lat!] as [number, number] }) }));
  if (!lugares.length) return { error: "No encontré lotes: envía puntos, polígonos o un KML con Placemarks." };
  if (lugares.length > 150) return { error: "Máximo 150 lotes por consulta." };
  const au = entrada.area_unidad_m2 ?? 65;
  const resultados = [];
  for (const l of lugares) {
    if (l.punto) {
      const p = await encontrarPredio({ lon: l.punto[0], lat: l.punto[1] });
      resultados.push(p ? { nombre: l.nombre, tipo: "punto", ...resumenNorma(p, au, await normas2026([p.codigo_tratamiento])) } : { nombre: l.nombre, tipo: "punto", encontrado: false, mensaje: "El punto no cae sobre un predio cargado." });
      continue;
    }
    const geo = JSON.stringify({ type: "Polygon", coordinates: [l.poligono] });
    const predios = await sql`
      WITH z AS (SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geo}), 4326) AS g)
      SELECT pp.*, ST_Area(ST_Intersection(pp.geom, z.g)::geography) / NULLIF(ST_Area(pp.geom::geography), 0) AS fraccion, ST_Area(z.g::geography) AS area_poligono
      FROM parcel_profile pp, z WHERE ST_Intersects(pp.geom, z.g)
      ORDER BY fraccion DESC LIMIT 400`;
    const dentro = (predios as any[]).filter((p) => Number(p.fraccion) >= 0.5);
    if (!dentro.length) { resultados.push({ nombre: l.nombre, tipo: "poligono", encontrado: false, mensaje: "El polígono no cubre al menos la mitad de ningún predio cargado." }); continue; }
    const suma = (k: string) => dentro.reduce((a, p) => a + (n(p[k]) ?? 0), 0);
    const tratamientos = [...new Set(dentro.map((p) => p.tratamiento).filter(Boolean))];
    const n26 = await normas2026(dentro.map((p) => p.codigo_tratamiento));
    const b26 = dentro.map((p) => bloque2026(p, n26.get(p.codigo_tratamiento), au));
    const con26 = b26.filter((b: any) => b?.disponible);
    const pot2026 = dentro[0].municipio_dane === "05001" ? {
      predios_con_norma_2026: con26.length, de: dentro.length,
      area_construible_m2: con26.reduce((a: number, b: any) => a + (b.que_se_puede_hacer.area_construible_m2 ?? 0), 0),
      viviendas_max_por_densidad: con26.reduce((a: number, b: any) => a + (b.que_se_puede_hacer.viviendas_max_por_densidad ?? 0), 0),
      con_derechos_viviendas: con26.reduce((a: number, b: any) => a + (b.que_se_puede_hacer.con_derechos?.viviendas_max_por_densidad ?? b.que_se_puede_hacer.viviendas_max_por_densidad ?? 0), 0),
      estado: con26[0]?.estado ?? null,
    } : null;
    const construible = suma("area_construible_inferida");
    const viv = suma("viviendas_max_inferidas");
    resultados.push({
      nombre: l.nombre, tipo: "poligono", area_poligono_m2: Math.round(Number(dentro[0].area_poligono)),
      predios: dentro.length, area_lotes_m2: Math.round(suma("area_lote")), tratamientos,
      que_se_puede_hacer: { area_construible_m2: Math.round(construible) || null, viviendas_max_por_densidad: Math.round(viv) || null,
        unidades_estimadas: construible ? Math.min(Math.floor((construible * 0.8) / au), viv || Infinity) : null, supuesto: `${au} m² por unidad, 80 % vendible; suma de predios (englobe)` },
      construccion_actual: { construcciones: suma("construcciones"), area_construida_m2: Math.round(suma("area_construida")) },
      pot_2026_preliminar: pot2026,
      amenaza_alta: dentro.some((p) => p.amenaza_alta), con_proteccion: dentro.some((p) => (p.protecciones ?? []).length > 0),
      aviso_pot: avisoPOT(dentro[0].municipio_dane),
      detalle: dentro.slice(0, 30).map((p) => resumenNorma(p, au, n26)),
    });
  }
  return { lotes: resultados.length, resultados };
}
