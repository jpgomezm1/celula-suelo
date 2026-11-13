import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { buscarLotes, cobertura, fuentes } from "@/lib/buscar";
import { fichaPredio } from "@/lib/ficha";
import { mercadoZona } from "@/lib/mercado";
import { oportunidades } from "@/lib/oportunidades";
import { prefactibilidadLote } from "@/lib/prefactibilidad_lote";
import { buscarProyectos, constructoraPortafolio, fichaProyecto } from "@/lib/proyectos";
import { contactoPredio, empresaPropietaria } from "@/lib/contacto";
import { completarEstudio, crearEstudio, crearEstudioPerfil } from "@/lib/estudios";
import { origen, verificar } from "@/lib/auth";
import { CORS, opciones } from "@/lib/oauth";
import { consultaNorma, consultaNormaLotes } from "@/lib/consulta_norma";
import { encontrarPredio } from "@/lib/ficha";
import { analizarLote, cabida, usosPermitidos, afectaciones } from "@/lib/analisis_lote";
import { analizarCartera, analizarZona, cambioPot, compararLotes, novedadesNormativas } from "@/lib/herramientas";
import { bloque2026Predio } from "@/lib/norma2026";
import { volumenesLote } from "@/lib/volumen";
import { anteproyecto } from "@/lib/cabida/proyecto";
import { modeloFinanciero } from "@/lib/finanzas/modelo";
import { mezclaOptima } from "@/lib/finanzas/mezcla";
import { listarSeguimiento } from "@/lib/seguimiento";
import { obtenerPerfil } from "@/lib/constructora/perfil";
import { opcionesConPerfil } from "@/lib/constructora/sesion";
import { topografiaLote } from "@/lib/topografia";
import { entornoLote, lecturaEntorno } from "@/lib/entorno";
import { fachadaLote } from "@/lib/fachada";
import { firmar } from "@/lib/auth";

const URL_BASE = () => process.env.PUBLIC_URL ?? "https://celula-suelo.vercel.app";
const urlFicha = (c: any) => `${URL_BASE()}/api/ficha?id=${encodeURIComponent(c.predio)}`;
const LOTE = {
  cbml: z.string().optional().describe("CBML de Medellín (11 dígitos)"), id: z.string().optional().describe("Id de predio 'dane:clave'"),
  matricula: z.string().optional().describe("Matrícula inmobiliaria, con o sin oficina (p. ej. '001-728976')"),
  direccion: z.string().optional().describe("Dirección de Medellín, p. ej. 'Cl. 6 Sur #50C-104'"),
  lat: z.number().optional(), lon: z.number().optional(),
};
async function loteDe(a: any) {
  const c: any = await consultaNorma(a);
  if (!c.encontrado) return { c, p: null };
  return { c, p: await encontrarPredio({ id: c.predio }) };
}

export const maxDuration = 300;

const json = (data: any) => {
  const err = data && typeof data === "object" && !Array.isArray(data) && typeof data.error === "string" ? data.error : null;
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }], ...(err ? { isError: true } : {}) };
};
/** Envuelve cada herramienta: un error de base de datos o de una fuente externa vuelve como mensaje claro, no como caída del servidor. */
const seguro = <A,>(fn: (a: A) => Promise<unknown>) => async (a: A) => {
  try {
    return json(await fn(a));
  } catch (e) {
    console.error("[mcp]", (e as Error).message);
    return { content: [{ type: "text" as const, text: `Error: ${(e as Error).message}. Revisa los parámetros o intenta de nuevo.` }], isError: true };
  }
};
const LECTURA = { readOnlyHint: true, openWorldHint: false } as const;
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true } as const;
const INSTRUCCIONES = `Inteligencia de suelo para 17 municipios del Valle de Aburrá y el Oriente antioqueño: catastro, norma del POT, mercado (Fynder), proyectos nuevos (Zonario y Galería Inmobiliaria) y señales de venta de los folios.
Foco: la decisión sobre un lote (qué se puede hacer, qué lo restringe y cómo se vende la vivienda nueva en su zona). No se ofrecen modelos financieros, planos ni 3D.
Flujos recomendados:
0. "¿Qué se puede hacer en este lote?" o "dame la ficha" → consulta_norma (CBML, matrícula, dirección o coordenada) y comparte su ficha_pdf. Trae semáforo, área neta, cabida, usos, restricciones (amenazas, quebradas y retiros, suelo de protección, plan parcial, árboles patrimoniales), topografía, inventario de vivienda nueva a 2 km y áreas que no cuentan en el índice. ficha_predio da lo mismo más licencias, mercado de Fynder y proyectos cerca. Detalles puntuales → cabida_lote, usos_permitidos, topografia_lote.
1. Varios lotes → comparar_lotes (2–5) o analizar_cartera (KMZ o lista, hasta 250). Una zona dibujada → analizar_zona.
2. Buscar lotes → buscar_lotes (filtros de área, tratamiento, amenaza, % en retiro hídrico, quebrada que cruza, árboles patrimoniales y plan parcial) u oportunidades_por_perfil (producto definido sobre todo un municipio) → consulta_norma de los mejores → contacto_predio.
3. "Estudio de competencia de este lote" → estudio_competencia → redacta territorio, recomendaciones y conclusión con los hechos devueltos → completar_estudio → comparte el enlace al Excel.
4. Mercado de una zona → mercado_zona, buscar_proyectos, ficha_proyecto, constructora. Lotes que el equipo negocia → negociaciones. POT nuevo → cambio_pot y novedades_normativas.
Riesgo y agua: el retiro hídrico es oficial del POT en Medellín y La Estrella; en los demás municipios es una faja de referencia de 30 m a cauces naturales (dilo). Avenidas torrenciales solo están cargadas en 2 municipios y Copacabana y Girardota no tienen capa de amenaza: si el lote está ahí, adviértelo. Los estudios de riesgo de detalle no son públicos.
Norma de Medellín: viene del POT de 2014 (Acuerdo 48); el Concejo aprobó su revisión el 5 de noviembre de 2026 y los valores pueden cambiar cuando entre en vigencia: menciónalo cuando des índices, densidades o unidades de Medellín. Las respuestas traen 'pot_2026_preliminar' con la norma del proyecto de acuerdo (v3, julio de 2026): preséntala como preliminar y compárala con la de 2014.
Reglas: usa cobertura para saber qué tan completo es un municipio (Itagüí, La Estrella, Caldas y Copacabana tienen norma de un POT derogado; el Oriente no tiene norma de tratamiento). Las unidades y el área construible son inferencias sobre la norma, no cabidas. Expresa el dinero en millones de pesos. Nunca entregues nombres, teléfonos ni correos de personas naturales: para contactar dueños usa solo la ruta legal de contacto_predio. Los datos de Galería Inmobiliaria son confidenciales y de uso interno del cliente.`;
const MUNICIPIOS = "Medellín, Envigado, Sabaneta, Itagüí, La Estrella, Caldas, Bello, Copacabana, Girardota, Barbosa, Rionegro, El Retiro, La Ceja, Guarne, Marinilla, El Carmen de Viboral, La Unión";
const predio = {
  id: z.string().optional().describe("Id del predio 'dane:clave', p. ej. 05001:14010050007"),
  cbml: z.string().regex(/^\d{11}$/).optional().describe("CBML de Medellín (11 dígitos)"),
  clave: z.string().optional().describe("Clave catastral local (PK_PREDIOS, número predial) junto con municipio"),
  municipio: z.string().optional(),
  lat: z.number().optional(), lon: z.number().optional(),
};

// Fuera del foco (decisión sobre el lote): finanzas, planos y 3D. El código sigue, pero el MCP no las ofrece.
const OCULTAS = new Set(["valor_residual", "prefactibilidad_lote", "prefactibilidad_financiera", "mezcla_optima", "cabida_arquitectonica", "volumen_3d", "fachada_street_view"]);

const mcp = createMcpHandler(
  (server) => {
    const registrar = server.registerTool.bind(server) as any;
    (server as any).registerTool = (nombre: string, ...resto: any[]) => (OCULTAS.has(nombre) ? undefined : registrar(nombre, ...resto));
    server.registerTool("cobertura", {
      annotations: LECTURA,
      title: "Cobertura por municipio",
      description: `Qué datos hay en cada uno de los 17 municipios (${MUNICIPIOS}): predios, construcciones, estado de la norma del POT, lotes con potencial, avisos en venta, pedidos de compradores y proyectos nuevos. Úsala primero para saber qué tan completa será una respuesta.`,
      inputSchema: z.object({}),
    }, seguro(async () => cobertura()));

    server.registerTool("ficha_predio", {
      annotations: LECTURA,
      title: "Ficha de predio",
      description: "Ficha completa de un predio: catastro, construcciones, norma del POT (con advertencia si la capa pública es de un POT derogado), semáforo, área neta y cabida, restricciones (amenazas por tipo y grado, suelo de protección, quebradas y % del lote en retiro hídrico, plan parcial, árboles patrimoniales), valor del suelo de referencia, licencias, inventario de vivienda nueva a 2 km (Galería y Fynder), áreas que no cuentan en el índice, mercado de Fynder a 1,5 km (oferta, compradores, ritmo), proyectos nuevos y lotes en venta cerca.",
      inputSchema: z.object(predio).refine((v) => v.id || v.cbml || v.clave || (v.lat !== undefined && v.lon !== undefined), "Da un id, cbml, clave+municipio o lat/lon"),
    }, seguro(async (a: any) => {
      const f: any = await fichaPredio(a);
      if (!f.encontrado) return f;
      const p = await encontrarPredio({ id: f.id });
      const an: any = p ? await analizarLote(p, {}) : null;
      if (!an) return f;
      return { ...f, semaforo: an.semaforo, area_util: an.area_util, cabida: an.cabida,
        restricciones: { ...f.restricciones, amenaza_alta_en_lote: an.area_util?.amenaza_alta, ...an.restricciones },
        inventario_zona: an.inventario_zona, areas_fuera_del_indice: an.computo_indice, aviso_legal: an.aviso_legal };
    }));

    server.registerTool("buscar_lotes", {
      annotations: LECTURA,
      title: "Buscar lotes",
      description: "Busca predios por municipio, barrio, área, tratamiento y área construible restante, y filtra por restricciones físicas: % del lote en retiro hídrico, quebrada que lo cruza, árboles patrimoniales y plan parcial. Por defecto solo los marcados con potencial preliminar (inferencia) y sin amenaza alta. Cada lote trae pct_en_retiro_hidrico, cauce_cruza, arboles_patrimoniales y plan_parcial.",
      inputSchema: z.object({
        municipio: z.string().optional(), barrio: z.string().optional(),
        area_min: z.number().min(0).optional(), area_max: z.number().min(0).optional(),
        tratamiento: z.string().optional(), construible_min: z.number().optional().describe("m² construibles restantes mínimos"),
        solo_potencial: z.boolean().optional(), incluir_amenaza_alta: z.boolean().optional(),
        gana_pot_2026: z.boolean().optional().describe("Solo lotes de Medellín cuyo índice de construcción sube con el proyecto POT 2026"),
        max_construcciones: z.number().int().min(0).optional().describe("Excluir lotes con más construcciones (muchos dueños)"),
        max_pct_retiro: z.number().min(0).max(100).optional().describe("Máximo % del lote en retiro hídrico (0 = ninguno)"),
        excluir_cauce: z.boolean().optional().describe("Excluir lotes que cruza una quebrada natural (no canalizada)"),
        excluir_arboles_patrimoniales: z.boolean().optional().describe("Excluir lotes con árboles patrimoniales dentro (censo solo en Medellín)"),
        excluir_plan_parcial: z.boolean().optional().describe("Excluir lotes dentro de un plan parcial"),
        orden: z.enum(["construible_restante", "area", "valor_suelo"]).optional(), limite: z.number().int().min(1).max(50).optional(),
      }),
    }, seguro(async (a: any) => buscarLotes(a)));

    server.registerTool("mercado_zona", {
      annotations: LECTURA,
      title: "Mercado de una zona",
      description: "Oferta (precios p25/mediana/p75, precio por m² nuevo vs usado, mix de habitaciones), demanda real de compradores (pedidos de 90 días cruzados por barrio, presupuesto), ritmo (salidas del mercado, rebajas de precio, meses de venta), proyectos nuevos y tendencia mensual. Zona = municipio, barrio/comuna o coordenada + radio.",
      inputSchema: z.object({
        municipio: z.string().optional(), barrio: z.string().optional(),
        lat: z.number().optional(), lon: z.number().optional(), radio_m: z.number().min(200).max(10000).optional(),
        tipo: z.string().optional().describe("apartamento (defecto), casa, lote, oficina, local, o 'todos'"),
        dias: z.number().int().min(30).max(365).optional(),
      }),
    }, seguro(async (a: any) => mercadoZona(a)));

    server.registerTool("buscar_proyectos", {
      annotations: LECTURA,
      title: "Buscar proyectos sobre planos",
      description: "Proyectos de vivienda nueva activos: filtra por municipio, barrio, constructora, precio, precio por m², año de entrega, habitaciones, VIS o cercanía a un punto.",
      inputSchema: z.object({
        municipio: z.string().optional(), barrio: z.string().optional(), constructora: z.string().optional(),
        lat: z.number().optional(), lon: z.number().optional(), radio_m: z.number().optional(),
        precio_min: z.number().optional(), precio_max: z.number().optional(), precio_m2_max: z.number().optional(),
        entrega_hasta: z.string().optional().describe("Año, p. ej. '2027'"), habitaciones: z.number().int().optional(),
        vis: z.boolean().optional(), orden: z.enum(["precio", "precio_m2", "entrega", "distancia"]).optional(),
        limite: z.number().int().min(1).max(50).optional(),
      }),
    }, seguro(async (a: any) => buscarProyectos(a)));

    server.registerTool("ficha_proyecto", {
      annotations: LECTURA,
      title: "Ficha de proyecto",
      description: "Detalle de un proyecto sobre planos: constructora, tipologías, precios, entrega, historial de precios, competencia a 1,5 km y predio donde está.",
      inputSchema: z.object({ id: z.number().int() }),
    }, seguro(async ({ id }: any) => fichaProyecto(id)));

    server.registerTool("constructora", {
      annotations: LECTURA,
      title: "Portafolio de constructora",
      description: "Proyectos de una constructora en los 17 municipios: activos, municipios, precio por m² típico y años de entrega.",
      inputSchema: z.object({ nombre: z.string().min(2) }),
    }, seguro(async ({ nombre }: any) => constructoraPortafolio(nombre)));

    server.registerTool("prefactibilidad_lote", {
      annotations: LECTURA,
      title: "¿Este lote da?",
      description: "Prefactibilidad comercial y financiera de un predio (modelo comite-de-tierras de Fynder alimentado con la norma del predio y el mercado a 1,5 km): veredicto VA / VA CON AJUSTES / NO VA, lote máximo pagable, índice de tensión, absorción, margen y sensibilidad. Se pueden dar costo del lote, área por unidad, precio por m², plazo y costo directo.",
      inputSchema: z.object({
        ...predio,
        costo_lote: z.number().optional().describe("Precio pedido por el lote en COP"),
        area_unidad: z.number().optional(), precio_m2: z.number().optional(), plazo_obra_meses: z.number().optional(),
        costo_directo_m2: z.number().optional(), radio_m: z.number().optional(),
      }),
    }, seguro(async (a: any) => prefactibilidadLote(a)));

    server.registerTool("oportunidades", {
      annotations: LECTURA,
      title: "Oportunidades de suelo",
      description: "Ranking rápido de lotes con potencial normativo general cruzado con mercado (demanda, proyectos nuevos, precio frente a valor del suelo, lotes anunciados cerca) y señales de venta del folio, con la explicación de cada puntaje. Si el usuario tiene un producto en mente (unidades, área, pisos, VIS/NO VIS, precio), usa mejor oportunidades_por_perfil.",
      inputSchema: z.object({ municipio: z.string().optional(), area_min: z.number().optional(), limite: z.number().int().min(1).max(40).optional() }),
    }, seguro(async (a: any) => oportunidades(a)));

    server.registerTool("contacto_predio", {
      annotations: LECTURA,
      title: "¿Cómo llego al dueño?",
      description: "Ruta de contacto y señales de venta de un predio (hoy con historia de folio en Medellín): direcciones del predio para carta, matrícula inmobiliaria con su oficina de registro, número de folios (propiedad horizontal), titular probable (empresa, fiducia, herederos, copropietarios), señales del folio 2015–2023 (sucesión, embargos, dación en pago, hipotecas, litigios, oferta de compra pública, última compraventa y su valor declarado), probabilidad de venta y pasos legales para identificar y contactar al propietario. No entrega nombres ni teléfonos de personas naturales.",
      inputSchema: z.object(predio).refine((v) => v.id || v.cbml || v.clave || (v.lat !== undefined && v.lon !== undefined), "Da un id, cbml, clave+municipio o lat/lon"),
    }, seguro(async (a: any) => contactoPredio(a)));

    server.registerTool("empresa_propietaria", {
      annotations: { readOnlyHint: true, openWorldHint: true },
      title: "Empresa propietaria",
      description: "Ficha pública de una empresa (por NIT, p. ej. el que aparece en el certificado de tradición de un lote): razón social, estado en el registro mercantil, si está en liquidación, representantes legales, contacto publicado, procesos judiciales y enlace al certificado de cámara de comercio. Fuente: RUES y Rama Judicial vía Croma.",
      inputSchema: z.object({ nit: z.string().min(6).describe("NIT sin dígito de verificación") }),
    }, seguro(async ({ nit }: any) => empresaPropietaria(nit)));

    server.registerTool("estudio_competencia", {
      annotations: ESCRITURA,
      title: "Estudio de competencia de un lote",
      description: "Arma el estudio de competencia de un lote con el formato de estudio de competencia de constructora (Etapa 1, pasos 3 a 9): objetivo, territorio (norma POT del predio, restricciones y entorno OpenStreetMap), proyectos a consultar en la zona con ventas, ritmo, oferta actual y futura (Galería Inmobiliaria), competencia directa, tabla resumen, métricas de zona e insumos para recomendaciones. Zona = polígono GeoJSON o radio. Devuelve un id y un enlace al Excel. Después redacta los textos y guárdalos con completar_estudio.",
      inputSchema: z.object({
        nombre: z.string().optional().describe("Nombre del lote o estudio, p. ej. 'BONEM'"),
        lote: z.object({ id: z.string().optional(), cbml: z.string().optional(), direccion: z.string().optional().describe("Dirección (Medellín), p. ej. 'Cl. 6 Sur #50C-104'"),
          lat: z.number().optional(), lon: z.number().optional() }),
        poligono: z.object({ type: z.literal("Polygon"), coordinates: z.array(z.array(z.array(z.number()))) }).optional(),
        radio_m: z.number().min(300).max(15000).optional(),
        objetivo: z.enum(["proyecto_nuevo", "etapa_nueva", "proyecto_critico"]).optional(),
        tipo_vivienda: z.enum(["VIS", "NO VIS", "todos"]).optional(),
        min_unidades: z.number().int().min(0).optional().describe("Por defecto 100"),
        vocacion: z.enum(["vivienda", "rentas_cortas", "ambos"]).optional(),
        entrega: z.enum(["obra gris", "acabados", "todos"]).optional(),
        corte: z.string().optional().describe("Fecha de corte de Galería (YYYY-MM-DD); por defecto la más reciente"),
        max_competidores: z.number().int().min(1).max(10).optional(),
      }),
    }, seguro(async (a: any) => crearEstudio(a)));

    server.registerTool("completar_estudio", {
      annotations: ESCRITURA,
      title: "Completar estudio (textos)",
      description: "Guarda los textos redactados de un estudio para que salgan en el Excel: objetivo, paso4 {zona, referencias, vias, transporte, comercio, valorizacion}, recomendacion_general, recomendaciones {'Tipo de producto', 'Tipologías', 'Zonas comunes', 'Enfoque comercial', 'Público objetivo', 'Diferencial recomendado', ...} y conclusion.",
      inputSchema: z.object({ id: z.string(), textos: z.record(z.string(), z.any()) }),
    }, seguro(async ({ id, textos }: any) => completarEstudio(id, textos)));

    server.registerTool("oportunidades_por_perfil", {
      annotations: ESCRITURA,
      title: "Oportunidades por perfil de edificio",
      description: "Estudio general de suelo: dado un perfil de edificio (VIS o NO VIS, número de unidades, área por unidad, pisos mínimos, rango de área de lote, precio objetivo por m²), recorre TODOS los predios urbanos del municipio, deja los que la norma del POT permite para ese producto (sin amenaza alta, protección, espacio público ni uso dotacional) y los ordena 0–100 por encaje normativo, precio frente a la zona, absorción según Galería, compradores frente a oferta (Fynder), señales de venta del folio y facilidad (poca construcción existente). Devuelve el resumen (cuántos lotes cumplen, barrios con más lotes), el ranking con el porqué de cada lote y un enlace al Excel. Tarda 5–15 s (hasta 40 s si se pide topografía). Ejemplo: {municipio:'Medellín', tipo_vivienda:'NO VIS', unidades_min:150, unidades_max:300, area_unidad_m2:65, pisos_min:12}.",
      inputSchema: z.object({
        municipio: z.string().optional().describe("Por defecto Medellín. La norma numérica completa está en Medellín, Envigado, Sabaneta, Barbosa y Girardota."),
        barrios: z.array(z.string()).optional().describe("Limitar a estos barrios catastrales (coincidencia parcial)"),
        nombre: z.string().optional().describe("Nombre del estudio"),
        tipo_vivienda: z.enum(["VIS", "NO VIS", "todos"]).optional(),
        unidades_min: z.number().int().min(1).optional().describe("Unidades mínimas que debe permitir el lote (defecto 100)"),
        unidades_max: z.number().int().min(1).optional().describe("Tamaño máximo del proyecto; lotes mucho más grandes bajan un poco de puntaje"),
        area_unidad_m2: z.number().min(20).max(300).optional().describe("Área vendible promedio por unidad (defecto 65; 50 si es VIS)"),
        pisos_min: z.number().int().min(1).optional().describe("Altura mínima que debe permitir la norma"),
        area_lote_min: z.number().min(0).optional(), area_lote_max: z.number().min(0).optional(),
        precio_m2_objetivo: z.number().optional().describe("Precio de venta objetivo por m² en COP; se compara con el precio de la zona"),
        eficiencia: z.number().min(0.5).max(0.95).optional().describe("Área vendible / área construida (defecto 0,8)"),
        permitir_compra_derechos: z.boolean().optional().describe("Incluir lotes que solo llegan comprando derechos de construcción (defecto sí)"),
        max_construcciones: z.number().int().min(0).optional().describe("Excluir lotes con más construcciones que esto (muchos dueños)"),
        norma: z.enum(["2014", "2026"]).optional().describe("Medellín: '2026' usa la norma del proyecto de revisión del POT (v3, julio de 2026, preliminar); por defecto la del POT 2014"),
        topografia: z.enum(["plano", "ladera_moderada", "ladera_fuerte", "indiferente"]).optional().describe("Topografía que prefiere la constructora (no es buena ni mala: plano para torres con sótanos o VIS rápido; ladera para proyectos escalonados con vista). Suma hasta 10 puntos por encaje y calcula el detalle de los 15 primeros."),
        limite: z.number().int().min(1).max(100).optional().describe("Lotes en el ranking (defecto 25)"),
      }),
    }, seguro(async (a: any) => crearEstudioPerfil(a)));

    server.registerTool("consulta_norma", {
      annotations: LECTURA,
      title: "Consulta de norma de un lote",
      description: "Qué se puede hacer en un lote (la consulta principal): semáforo de afectaciones, área útil, cabida en tres escenarios (pisos, sótanos, parqueaderos, m² vendibles, unidades), cesiones urbanísticas, usos permitidos, restricciones (amenazas, quebradas y retiros, plan parcial, árboles patrimoniales), topografía, inventario de vivienda nueva a 2 km, áreas que no cuentan en el índice y enlace a la ficha normativa en PDF; además tratamiento, uso del suelo, altura, índice de construcción (base y con derechos), densidad, área construible, viviendas y unidades estimadas, construcción actual, amenazas y protección, valor del suelo de referencia y las matrículas y direcciones del predio. Se busca por CBML, id de predio, matrícula inmobiliaria (Medellín), dirección de Medellín o coordenada (p. ej. la de Google Maps). En Medellín incluye al lado la norma del proyecto de revisión del POT 2026 (v3, julio de 2026) y la comparación con la de 2014 (índice, densidad, área construible y viviendas). Incluye el aviso de vigencia del POT.",
      inputSchema: z.object({
        cbml: z.string().optional(), id: z.string().optional(),
        matricula: z.string().optional().describe("Matrícula inmobiliaria, con o sin oficina (p. ej. '001-728976' o '728976')"),
        direccion: z.string().optional().describe("Dirección de Medellín, p. ej. 'Cl. 6 Sur #50C-104'"),
        lat: z.number().optional(), lon: z.number().optional(),
        area_unidad_m2: z.number().min(20).max(300).optional().describe("Área por unidad para estimar unidades (defecto 65)"),
        tipo_vivienda: z.enum(["VIS", "NO VIS"]).optional(), actividad: z.string().optional().describe("Actividad a verificar en usos, p. ej. 'clínica', 'restaurante', 'hotel'"),
      }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const conTope = <T,>(pr: Promise<T>, ms: number) => Promise.race([pr, new Promise<null>((r) => setTimeout(() => r(null), ms))]).catch(() => null);
      const [an, topo, ent]: any = await Promise.all([
        analizarLote(p, { area_unidad_m2: a.area_unidad_m2, tipo_vivienda: a.tipo_vivienda, actividad: a.actividad, costo_lote: a.costo_lote }),
        conTope(topografiaLote(c.predio), 12000), conTope(entornoLote(c.predio), 8000)]);
      const topografia = topo?.disponible ? { clase: topo.clase, pendiente_pct: topo.pendiente_pct, desnivel_m: topo.desnivel_m, cae_hacia: topo.cae_hacia, via: topo.via?.lectura ?? null,
        sotanos: topo.sotanos, fuente: topo.fuente.nombre, detalle: "topografia_lote" } : topo ? { disponible: false, motivo: topo.motivo } : null;
      const entorno = ent ? { pisos_mediana_150m: ent.pisos_mediana, pisos_max_150m: ent.pisos_max, fuente: "catastro" } : null;
      return { ...c, semaforo: an.semaforo, area_util: an.area_util, cabida: an.cabida, cesiones: an.cesiones, usos: an.usos, inventario_zona: an.inventario_zona, areas_fuera_del_indice: an.computo_indice, restricciones: an.restricciones,
        topografia, entorno_alturas: entorno,
        ficha_pdf: urlFicha(c), kmz_google_earth: `${URL_BASE()}/api/kmz?id=${encodeURIComponent(c.predio)}`, aviso_legal: an.aviso_legal };
    }));

    server.registerTool("consulta_norma_lotes", {
      annotations: LECTURA,
      title: "Consulta de norma de varios lotes (KMZ / KML)",
      description: "Norma y aprovechamiento de varios lotes a la vez (hasta 150): pasa el texto de un KML de Google Earth (si el usuario adjunta un KMZ, descomprímelo y pasa doc.kml) o una lista de puntos {nombre, lat, lon} o polígonos {nombre, poligono: [[lon, lat], ...]}. Para cada polígono suma los predios que cubre (útil para englobes): área de lotes, tratamientos, área construible, viviendas y unidades estimadas, construcción actual y restricciones.",
      inputSchema: z.object({
        kml: z.string().optional().describe("Contenido de un archivo .kml"),
        lotes: z.array(z.object({ nombre: z.string().optional(), lat: z.number().optional(), lon: z.number().optional(),
          poligono: z.array(z.tuple([z.number(), z.number()])).optional().describe("Anillo [[lon, lat], ...]") })).optional(),
        area_unidad_m2: z.number().min(20).max(300).optional(),
      }),
    }, seguro(async (a: any) => consultaNormaLotes(a)));

    server.registerTool("ficha_normativa_pdf", {
      annotations: LECTURA,
      title: "Ficha normativa en PDF",
      description: "Genera la ficha normativa descargable (PDF fechado, con fuentes y aviso legal) de un lote: identificación, semáforo, norma POT 2014 y proyecto 2026, cabida, área útil, cesiones, restricciones, inventario de vivienda nueva en la zona y usos. Devuelve el enlace (se abre con el correo y clave del usuario) y un resumen.",
      inputSchema: z.object({ ...LOTE, area_unidad_m2: z.number().optional(), actividad: z.string().optional() }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const q = new URLSearchParams({ id: c.predio, ...(a.area_unidad_m2 ? { area_unidad_m2: String(a.area_unidad_m2) } : {}), ...(a.actividad ? { actividad: a.actividad } : {}) });
      return { predio: c.predio, barrio: c.barrio, municipio: c.municipio, area_lote_m2: c.area_lote_m2, ficha_pdf: `${URL_BASE()}/api/ficha?${q}`,
        nota: "Comparte el enlace: abre el PDF con la fecha de hoy. Para verlo en el navegador se pide el correo y clave del workspace." };
    }));

    server.registerTool("cabida_lote", {
      annotations: LECTURA,
      title: "Cabida de un lote (3 escenarios)",
      description: "Cuánto cabe en un lote en tres escenarios: conservador (POT 2014 base), base (proyecto POT 2026 o POT vigente) y máximo (comprando derechos). Para cada uno: área construible y vendible, unidades (y si limita la densidad o el área), pisos sobre rasante, parqueaderos y sótanos aproximados, sobre el área útil (descontando protección y amenaza alta).",
      inputSchema: z.object({ ...LOTE, area_unidad_m2: z.number().min(20).max(300).optional(), tipo_vivienda: z.enum(["VIS", "NO VIS"]).optional() }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const af = await afectaciones(p);
      return { predio: c.predio, barrio: c.barrio, area_lote_m2: c.area_lote_m2, area_util_m2: af.area_util_m2, tratamiento: c.norma?.tratamiento,
        ...cabida(p, await bloque2026Predio(p, a.area_unidad_m2 ?? 65), { area_unidad_m2: a.area_unidad_m2, area_util_m2: af.area_util_m2 ?? 0, tipo_vivienda: a.tipo_vivienda }),
        ficha_pdf: urlFicha(c) };
    }));

    server.registerTool("usos_permitidos", {
      annotations: LECTURA,
      title: "Usos permitidos en un lote",
      description: "¿Qué actividades se pueden desarrollar en el lote? (vivienda, comercio, oficinas, restaurante, bar, hotel, rentas cortas, clínica, educación, bodega, industria liviana) según su área de mixtura. Orientativo: se valida con el anexo de actividades del POT y en la curaduría.",
      inputSchema: z.object({ ...LOTE, actividad: z.string().optional().describe("Actividad puntual a verificar") }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      return { predio: c.predio, barrio: c.barrio, ...usosPermitidos(p, a.actividad) };
    }));

    server.registerTool("valor_residual", {
      annotations: LECTURA,
      title: "Valor residual del suelo",
      description: "Cuánto vale el lote por lo que se puede hacer en él: lo máximo que se puede pagar para que el proyecto dé margen (modelo de prefactibilidad con precios y costos de la zona a 1,5 km), por m², frente al valor de referencia catastral y, si se da, frente al precio pedido.",
      inputSchema: z.object({ ...LOTE, costo_lote: z.number().optional().describe("Precio pedido en COP"), area_unidad_m2: z.number().optional() }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const an = await analizarLote(p, { costo_lote: a.costo_lote, area_unidad_m2: a.area_unidad_m2, con_mercado: true });
      return { predio: c.predio, barrio: c.barrio, area_lote_m2: c.area_lote_m2, ...an.valor_residual, precio_pedido: a.costo_lote ?? null };
    }));

    server.registerTool("topografia_lote", {
      annotations: LECTURA,
      title: "Topografía previa de un lote",
      description: "Topografía de un lote desde modelos públicos del terreno (Medellín: MDT 2024 de 1 m de la Alcaldía; Valle de Aburrá: AMVA 10 m; Sabaneta, La Estrella, Caldas, Guarne, La Ceja, Marinilla: IGAC 2 m; resto: Google Elevation): pendiente media y máxima local, desnivel, clase (plano, ladera suave/moderada/fuerte), hacia dónde cae, si queda por encima o por debajo de la vía, sótanos semienterrados, movimiento de tierras aproximado y perfil del terreno. Incluye la altura del entorno según el catastro (pisos de los vecinos a 150 m). Es un análisis previo: no reemplaza el levantamiento topográfico ni el estudio de suelos. La pendiente no es buena ni mala: explique el encaje según el producto de la constructora.",
      inputSchema: z.object({ ...LOTE }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const [t, e]: any = await Promise.all([topografiaLote(c.predio), entornoLote(c.predio)]);
      const { geojson, ...ent } = e;
      return { predio: c.predio, barrio: c.barrio, area_lote_m2: c.area_lote_m2, topografia: t, entorno_alturas: ent,
        fachada_street_view: `${URL_BASE()}/mapa`, nota: "Para ver el perfil dibujado y la fachada de Street View, abra la ficha del lote en la plataforma." };
    }));

    server.registerTool("cabida_arquitectonica", {
      annotations: LECTURA,
      title: "Anteproyecto esquemático (cabida arquitectónica con planos)",
      description: "Genera un anteproyecto esquemático del lote, listo para que un arquitecto lo revise y desarrolle: implanta torres según la norma volumétrica del municipio (Medellín: Acuerdo 48 de 2014 y Decreto 471 de 2018; Envigado, Sabaneta, Itagüí y Bello digitalizadas), distribuye apartamentos de 1, 2 y 3 alcobas (y apartaestudios) con la mezcla indicada —cada uno con sala-comedor, cocina, alcobas, baños, ropas, puertas, ventanas y amoblamiento—, dimensiona el punto fijo según NSR-10 (escaleras a prueba de humo desde 6 pisos, ascensores por tráfico, shut de basuras), arma el primer piso (lobby y portería, salón social con el equipamiento de 1 m² por vivienda, viviendas adaptables 1 de cada 30) y los sótanos (rampa con pendiente según su largo, parqueaderos según el tope por estrato, visitantes, depósitos y cuartos técnicos). Entrega: resumen y cuadro de áreas, y enlaces a un ZIP con planos DXF (planchas A1 con rótulo: localización, sótanos, primer piso, planta tipo, torre ampliada con cotas, apartamentos tipo, corte y fachada, cuadro de áreas), planchas en PDF, modelo 3D georreferenciado (EPSG 9377) y Excel. Es prefactibilidad: la norma está digitalizada y pendiente de validar; dígale al usuario que el arquitecto debe verificarla. Tarda 3–8 s.",
      inputSchema: z.object({ ...LOTE,
        escenario: z.enum(["conservador", "base", "maximo"]).optional().describe("Norma: POT 2014 base, proyecto POT 2026 (defecto) o comprando derechos"),
        mezcla: z.array(z.object({ tipologia: z.enum(["estudio", "1A", "2A", "3A"]), pct: z.number().min(0).max(100) })).optional().describe("Mezcla de tipologías en %; defecto 1A 20 %, 2A 55 %, 3A 25 %"),
        estrato: z.number().int().min(1).max(6).optional().describe("Estrato para la norma de parqueaderos; si no se da se estima con los inmuebles en venta cercanos"),
        pisos_plataforma: z.number().int().min(0).max(3).optional().describe("0 (defecto): primer piso con lobby y salón social; 1–3: plataforma"),
        crujia_m: z.number().min(6).max(10).optional().describe("Profundidad de apartamento (defecto 7,6 m)"),
        retiro_frontal_m: z.number().min(0).max(20).optional(), retiro_lateral_m: z.number().min(0).max(20).optional(), retiro_fondo_m: z.number().min(0).max(20).optional(),
        separacion_torres_m: z.number().min(3).max(40).optional(), max_torres: z.number().int().min(1).max(10).optional() }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const { cbml, id, matricula, direccion, lat, lon, mezcla, ...op } = a;
      const m: any = await anteproyecto(c.predio, { ...op, mezcla });
      if (!m.disponible) return { predio: c.predio, disponible: false, motivo: m.mensaje };
      const qs = new URLSearchParams({ id: c.predio, ...Object.fromEntries(Object.entries(op).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])),
        ...(mezcla ? { mezcla: mezcla.map((x: any) => `${x.tipologia}:${x.pct}`).join(",") } : {}) }).toString();
      const u = (f: string) => `${URL_BASE()}/api/cabida?${qs}&formato=${f}`;
      return { predio: c.predio, barrio: m.barrio, municipio: m.municipio, resumen: m.resumen, norma: { retiros: { frontal: m.norma.frontal, lateral: m.norma.lateral, cabecera: m.norma.cabecera, fondo: m.norma.fondo, entre_torres: m.norma.entre_torres }, fuente: m.norma.fuente, citas: m.norma.citas },
        torres: m.torres.map((t: any) => ({ id: t.id, largo_m: t.planta.L, ancho_m: t.planta.D, aptos_por_piso: t.planta.aptos.length, tipologias: t.planta.aptos.map((x: any) => x.tipologia).join(",") })),
        entregables: { paquete_zip: u("zip"), planchas_pdf: u("pdf"), planos_dxf: u("dxf"), modelo_3d_dxf: u("dxf3d"), cuadro_de_areas_xlsx: u("xlsx") },
        ver_en_la_plataforma: `${URL_BASE()}/mapa (ficha del lote → Anteproyecto → Ver en 3D / Ver planchas)`,
        dwg: "AutoCAD y BricsCAD abren el DXF y lo guardan como DWG (Guardar como → DWG).", aviso: m.aviso };
    }));

    server.registerTool("prefactibilidad_financiera", {
      annotations: LECTURA,
      title: "Prefactibilidad financiera (¿cuánto puedo pagar por el lote?)",
      description: "Arma el anteproyecto del lote y corre la prefactibilidad financiera: precios por tipología y velocidad de ventas desde Galería (comparables del mismo estrato ±1, sin vivienda turística ni desistidos), presupuesto paramétrico según el perfil de la constructora (costos directos por altura, sótanos, indirectos, licencias, ventas, fiducia), cronograma por torre (preventa, punto de equilibrio, obra, entrega, escrituración), flujo de caja mensual con fiducia y crédito constructor, utilidad, margen, TIR, VPN, exposición máxima, VALOR MÁXIMO A PAGAR POR EL LOTE (el menor entre margen mínimo, TIR mínima y lote/ventas máximo) y sensibilidades. Si se da costo_lote, devuelve el veredicto VA / VA CON AJUSTES / NO VA frente a la tesis de inversión del perfil. Los costos de referencia son supuestos a calibrar con los de la constructora: dígalo. Tarda 5–15 s.",
      inputSchema: z.object({ ...LOTE,
        costo_lote: z.number().optional().describe("Precio pedido o negociado del lote en COP"),
        precio_m2: z.number().optional().describe("Sobrescribe el precio de venta por m² (COP)"), absorcion_mes: z.number().optional().describe("Sobrescribe las ventas por mes (unidades)"),
        estrato: z.number().int().min(1).max(6).optional(), escenario: z.enum(["conservador", "base", "maximo"]).optional(),
        mezcla: z.array(z.object({ tipologia: z.enum(["estudio", "1A", "2A", "3A"]), pct: z.number() })).optional(),
        constructora: z.string().optional().describe("Id del perfil de constructora (ADN); por defecto el de referencia") }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const perfil = await obtenerPerfil(a.constructora);
      const m: any = await anteproyecto(c.predio, opcionesConPerfil({ escenario: a.escenario, estrato: a.estrato, mezcla: a.mezcla }, perfil));
      if (!m.disponible) return { predio: c.predio, disponible: false, motivo: m.mensaje };
      const f: any = await modeloFinanciero(m, perfil, { costo_lote: a.costo_lote, precio_m2: a.precio_m2, absorcion_mes: a.absorcion_mes, estrato: a.estrato ?? m.resumen.estrato });
      const qs = new URLSearchParams({ id: c.predio, ...(a.estrato ? { estrato: String(a.estrato) } : {}), ...(a.costo_lote ? { costo_lote: String(a.costo_lote) } : {}) }).toString();
      const { flujo, ...resto } = f;
      return { predio: c.predio, barrio: m.barrio, anteproyecto: { torres: m.resumen.torres, pisos: m.resumen.pisos_totales, unidades: m.resumen.unidades, area_vendible_m2: m.resumen.area_vendible_m2, sotanos: m.resumen.sotanos },
        ...resto, flujo_trimestral: flujo.filter((x: any) => x.mes % 3 === 0).map((x: any) => ({ mes: x.mes, neto: x.neto, acumulado: x.acumulado })),
        excel: `${URL_BASE()}/api/finanzas?${qs}&formato=xlsx`, carpeta_comite_pdf: `${URL_BASE()}/api/comite?${qs}`, aviso: "Prefactibilidad con supuestos explícitos; los costos de referencia deben calibrarse con los de la constructora." };
    }));

    server.registerTool("mezcla_optima", {
      annotations: LECTURA,
      title: "Mezcla de apartamentos que más deja",
      description: "Prueba decenas de mezclas de producto (apartaestudio, 1, 2 y 3 alcobas) sobre el mismo lote: para cada una arma el anteproyecto y corre los números, y ordena por el valor máximo que se puede pagar por el lote (o por la utilidad si se da costo_lote). Devuelve la mezcla que realmente queda construida (la planta reparte por piso), unidades, ventas, margen, TIR y meses de ventas, frente a la mezcla actual. Tarda 20–60 s.",
      inputSchema: z.object({ ...LOTE, costo_lote: z.number().optional(), estrato: z.number().int().min(1).max(6).optional(), escenario: z.enum(["conservador", "base", "maximo"]).optional(),
        max_estudio_pct: z.number().optional().describe("Tope de apartaestudios (defecto 20 %)"), max_por_tipo_pct: z.number().optional().describe("Tope por tipología (defecto 60 %)"),
        constructora: z.string().optional() }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const perfil = await obtenerPerfil(a.constructora);
      const r: any = await mezclaOptima(c.predio, opcionesConPerfil({ escenario: a.escenario, estrato: a.estrato }, perfil), perfil,
        { costo_lote: a.costo_lote, estrato: a.estrato, max_estudio_pct: a.max_estudio_pct, max_por_tipo_pct: a.max_por_tipo_pct, segundos: 60 });
      const limpiar = (x: any) => x && ({ mezcla_construida: x.texto, mezcla_pedida: x.pedida, unidades: x.unidades, torres: x.torres, pisos: x.pisos, ventas: x.ventas, utilidad: x.utilidad,
        margen_pct: x.margen_pct, tir_ea_pct: x.tir_ea_pct, meses_de_ventas: x.meses_de_ventas, valor_maximo_lote: x.valor_maximo_lote });
      return { predio: c.predio, criterio: r.criterio, lectura: r.lectura, evaluadas: r.evaluadas, actual: limpiar(r.actual), mejor: limpiar(r.mejor), ranking: r.ranking.map(limpiar), advertencias: r.advertencias };
    }));

    server.registerTool("negociaciones", {
      annotations: LECTURA,
      title: "Lotes en negociación de la constructora",
      description: "Lista los lotes que el equipo de una constructora está estudiando o negociando (CRM de suelo): estado (identificado, en estudio, contacto, oferta, negociación, promesa, comprado, descartado), precio pedido, oferta, precio acordado, valor máximo según la última versión guardada y cuánto piden por encima o por debajo de ese máximo, próxima acción y si está vencida. Útil para '¿qué lotes tenemos en negociación?', '¿qué acciones están vencidas?', '¿en cuáles piden más de lo que podemos pagar?'. No incluye datos de propietarios.",
      inputSchema: z.object({ constructora: z.string().describe("Id de la constructora (dominio de correo, p. ej. 'conaltura')"),
        estado: z.string().optional(), solo_activos: z.boolean().optional().describe("Excluye comprados y descartados (defecto true)") }),
    }, seguro(async (a: any) => {
      let ls: any[] = await listarSeguimiento(a.constructora);
      if (a.solo_activos !== false) ls = ls.filter((l) => !["comprado", "descartado"].includes(l.estado));
      if (a.estado) ls = ls.filter((l) => l.estado === a.estado || l.estado_nombre.toLowerCase() === String(a.estado).toLowerCase());
      return { constructora: a.constructora, total: ls.length, vencidas: ls.filter((l) => l.vencida).length,
        lotes: ls.map((l) => ({ predio: l.predio, municipio: l.municipio, barrio: l.barrio, area_lote_m2: l.area_lote, estado: l.estado_nombre, prioridad: ["", "alta", "media", "baja"][l.prioridad],
          precio_pedido: l.precio_pedido, oferta: l.precio_ofertado, precio_acordado: l.precio_acordado, valor_maximo_ultima_version: l.ultima_version?.valor_maximo_lote ?? null,
          pedido_vs_maximo_pct: l.brecha_pct, proxima_accion: l.proxima_accion, fecha: l.proxima_fecha, vencida: l.vencida, responsable: l.responsable, ficha: `${URL_BASE()}/mapa?lote=${encodeURIComponent(l.predio)}` })) };
    }));

    server.registerTool("fachada_street_view", {
      annotations: LECTURA,
      title: "Fachada del lote (Google Street View)",
      description: "Busca la vista de calle de Google Street View más cercana al lote (a menos de 80 m) y la orienta hacia él: devuelve la fecha de la imagen y un enlace para abrirla en Google Maps. Sirve para ver si el lote es una casa, una bodega, un parqueadero o un lote vacío sin ir al sitio. Las imágenes pueden tener años: confírmelo en visita.",
      inputSchema: z.object({ ...LOTE }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const f: any = await fachadaLote(c.predio);
      if (!f.disponible) return { predio: c.predio, disponible: false, motivo: f.motivo };
      return { predio: c.predio, barrio: c.barrio, disponible: true, fecha_imagen: f.fecha ?? null, abrir_en_google_maps: f.abrir, orientacion_grados: f.heading,
        en_la_plataforma: `${URL_BASE()}/mapa (ficha del lote → Fachada)`, atribucion: f.atribucion };
    }));

    server.registerTool("volumen_3d", {
      annotations: LECTURA,
      title: "Edificio posible en 3D (Google Earth)",
      description: "Volumen del edificio que permite la norma en un lote, en los tres escenarios (conservador, base y máximo): pisos, altura en metros, huella y unidades, con dos tipologías: plataforma (índice de ocupación máximo) o torres (ocupación menor, más altura). Devuelve el enlace a un KMZ para abrir en Google Earth con los volúmenes en 3D, el contorno del lote coloreado por semáforo, su ficha y los proyectos de Galería a 2 km.",
      inputSchema: z.object({ ...LOTE, tipologia: z.enum(["plataforma", "torres"]).optional().describe("plataforma (defecto) o torres (ocupación 30 %)"),
        ocupacion: z.number().min(0.1).max(0.9).optional().describe("Ocupación para torres (defecto 0,3)") }),
    }, seguro(async (a: any) => {
      const { c, p } = await loteDe(a);
      if (!p) return c;
      const ocup = a.tipologia === "torres" || a.ocupacion ? (a.ocupacion ?? 0.3) : undefined;
      const [v, ent]: any = await Promise.all([volumenesLote(c.predio, { ocupacion: ocup }), entornoLote(c.predio).catch(() => null)]);
      return { predio: c.predio, barrio: c.barrio, area_lote_m2: c.area_lote_m2, tipologia: v.tipologia,
        escenarios: v.volumenes.map((x: any) => ({ escenario: x.escenario, pisos: x.pisos, altura_m: x.altura_m, huella_m2: x.huella_m2, unidades: x.unidades, area_construible_m2: x.area_construible_m2 })),
        kmz_google_earth: `${URL_BASE()}/api/kmz?id=${encodeURIComponent(c.predio)}${ocup ? `&ocupacion=${ocup}` : ""}`,
        entorno_alturas: ent ? { pisos_mediana_150m: ent.pisos_mediana, pisos_p90_150m: ent.pisos_p90, pisos_max_150m: ent.pisos_max,
          lectura: lecturaEntorno(v.volumenes.find((x: any) => x.clave === "base")?.pisos, ent), fuente: ent.fuente } : null,
        vista_fotorrealista: `${URL_BASE()}/mapa (ficha del lote → Edificio posible en 3D → Vista fotorrealista)`,
        mapa_3d: `${URL_BASE()}/mapa`, nota: v.nota + " Abre el KMZ en Google Earth (web o Pro): activa en la carpeta “Volumen posible (3D)” el escenario que quieras ver." };
    }));

    server.registerTool("comparar_lotes", {
      annotations: LECTURA,
      title: "Comparar lotes",
      description: "Compara de 2 a 5 lotes lado a lado: área útil, semáforo y alertas, unidades en tres escenarios y aprovechando las áreas fuera del índice, pisos, % en retiro hídrico, quebrada que cruza, plan parcial, árboles patrimoniales, meses de inventario de vivienda nueva en la zona, cambio con el POT 2026 y cesiones; dice cuál tiene más unidades, mayor área útil y la zona que vende más rápido.",
      inputSchema: z.object({ lotes: z.array(z.object({ nombre: z.string().optional(), ...LOTE })).min(2).max(5), area_unidad_m2: z.number().optional(), tipo_vivienda: z.enum(["VIS", "NO VIS"]).optional() }),
    }, seguro(async (a: any) => compararLotes(a.lotes, a)));

    server.registerTool("analizar_cartera", {
      annotations: ESCRITURA,
      title: "Analizar cartera de lotes (hasta 250)",
      description: "Analiza una cartera de lotes de una vez: pasa el texto de un KML (si el usuario adjunta un KMZ, descomprímelo y pasa doc.kml) o una lista de lotes por CBML, matrícula, dirección o coordenada. Para cada uno: semáforo, área útil, unidades en tres escenarios, cambio POT 2026, cesiones, restricciones y meses de inventario de la zona; los ordena con un puntaje, resume verdes/amarillos/rojos y entrega un Excel, un KMZ para Google Earth (conserva carpetas y notas, recorrido para comité) y un vínculo de red de 'cartera viva' para Google Earth Pro que se actualiza solo cada 24 h.",
      inputSchema: z.object({ nombre: z.string().optional(), kml: z.string().optional(), lotes: z.array(z.object({ nombre: z.string().optional(), ...LOTE })).optional(),
        area_unidad_m2: z.number().optional(), tipo_vivienda: z.enum(["VIS", "NO VIS"]).optional() }),
    }, seguro(async (a: any) => {
      const r: any = await analizarCartera(a);
      const t = await firmar({ typ: "earth", est: r.id }, 365 * 24 * 3600);
      return { ...r, cartera_viva_google_earth_pro: { url_vinculo_de_red: `${URL_BASE()}/api/estudio/${r.id}/kmz?t=${encodeURIComponent(t)}`,
        como_usarlo: "En Google Earth Pro: Agregar → Vínculo de red → pegar la URL → en Actualizar, cada 24 horas. La cartera se vuelve a analizar sola una vez al día (norma, POT 2026, semáforo). El KMZ trae carpetas, volúmenes 3D y un recorrido para comité. El enlace es de solo lectura y vence en un año; no lo publique." } };
    }));

    server.registerTool("analizar_zona", {
      annotations: LECTURA,
      title: "Analizar una zona (polígono)",
      description: "Resumen de una zona dibujada: predios, lotes con potencial y tratamientos; área construible y viviendas con el POT 2014 y con el proyecto 2026 (y el cambio); competencia de Galería (proyectos, ventas al mes, oferta, meses de inventario, precio por m²) y mercado de usados (Fynder).",
      inputSchema: z.object({ poligono: z.array(z.tuple([z.number(), z.number()])).min(3).describe("Anillo [[lon, lat], ...]"), nombre: z.string().optional() }),
    }, seguro(async (a: any) => analizarZona(a.poligono, a.nombre)));

    server.registerTool("cambio_pot", {
      annotations: LECTURA,
      title: "Cambio de norma POT 2014 → 2026 (Medellín)",
      description: "Quién gana y quién pierde aprovechamiento con el proyecto de revisión del POT de Medellín (v3, julio de 2026): barrios o polígonos que más ganan y más pierden área construible, y los lotes que más ganan. Útil para buscar oportunidades creadas por el POT nuevo.",
      inputSchema: z.object({ agrupar: z.enum(["barrio", "poligono"]).optional(), barrio: z.string().optional(), area_lote_min: z.number().optional(), limite: z.number().int().min(1).max(50).optional() }),
    }, seguro(async (a: any) => cambioPot(a)));

    server.registerTool("novedades_normativas", {
      annotations: LECTURA,
      title: "Novedades normativas",
      description: "Documentos normativos nuevos que publicó la Alcaldía de Medellín (POT 2026, anexos, cartografía, decretos, planes parciales), detectados por el monitor diario, con su relevancia.",
      inputSchema: z.object({ dias: z.number().int().min(1).max(365).optional() }),
    }, seguro(async (a: any) => novedadesNormativas(a.dias ?? 30)));

    server.registerTool("fuentes", {
      annotations: LECTURA,
      title: "Fuentes de datos",
      description: "Catálogo de fuentes cargadas: capa, fecha de captura, registros esperados vs cargados, tipo de dato y licencia.",
      inputSchema: z.object({}),
    }, seguro(async () => fuentes()));
  },
  { serverInfo: { name: "inteligencia-suelo", version: "0.3.0" }, instructions: INSTRUCCIONES },
);

/**
 * Acceso: 1) OAuth (Claude abre la página de login y obtiene un token firmado), 2) token compartido MCP_TOKEN
 * en "Authorization: Bearer" o en ?token= (Claude Code y scripts). Sin credencial responde 401 con la ruta a los
 * metadatos OAuth para que el cliente inicie el login.
 */
async function handler(req: Request) {
  const token = process.env.MCP_TOKEN;
  const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const enUrl = new URL(req.url).searchParams.get("token");
  const autorizado = !token
    || (bearer && bearer === token) || enUrl === token
    || (bearer && (await verificar(bearer, "acceso")));
  if (!autorizado) {
    const meta = `${origen(req)}/.well-known/oauth-protected-resource/api/mcp`;
    return new Response(JSON.stringify({ error: "invalid_token", error_description: "Inicia sesión para usar el MCP" }), {
      status: 401,
      headers: { "content-type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${meta}"`, ...CORS },
    });
  }
  return mcp(req);
}

export { handler as GET, handler as POST, handler as DELETE };
export const OPTIONS = opciones;
