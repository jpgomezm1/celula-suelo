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
Flujos recomendados:
0. "¿Qué se puede hacer en este lote?" → consulta_norma (CBML, matrícula, dirección o coordenada); varios lotes o un KMZ → consulta_norma_lotes.
1. "¿Dónde puedo hacer este edificio?" → oportunidades_por_perfil (perfil de producto sobre todo un municipio) → ficha_predio de los mejores → contacto_predio.
2. "Estudio de competencia de este lote" → estudio_competencia → redacta territorio, recomendaciones y conclusión con los hechos devueltos → completar_estudio → comparte el enlace al Excel.
3. "¿Este lote da?" → ficha_predio → prefactibilidad_lote (con el precio pedido por el lote).
4. Mercado de una zona → mercado_zona, buscar_proyectos, ficha_proyecto, constructora.
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

const mcp = createMcpHandler(
  (server) => {
    server.registerTool("cobertura", {
      annotations: LECTURA,
      title: "Cobertura por municipio",
      description: `Qué datos hay en cada uno de los 17 municipios (${MUNICIPIOS}): predios, construcciones, estado de la norma del POT, lotes con potencial, avisos en venta, pedidos de compradores y proyectos nuevos. Úsala primero para saber qué tan completa será una respuesta.`,
      inputSchema: z.object({}),
    }, seguro(async () => cobertura()));

    server.registerTool("ficha_predio", {
      annotations: LECTURA,
      title: "Ficha de predio",
      description: "Ficha completa de un predio: catastro, construcciones, norma del POT (con advertencia si la capa pública es de un POT derogado), amenazas y protección, valor del suelo, licencias, potencial constructivo (inferencia), mercado a 1,5 km (oferta, demanda, ritmo), proyectos nuevos y lotes en venta cerca, y prefactibilidad rápida con lote máximo pagable.",
      inputSchema: z.object(predio).refine((v) => v.id || v.cbml || v.clave || (v.lat !== undefined && v.lon !== undefined), "Da un id, cbml, clave+municipio o lat/lon"),
    }, seguro(async (a: any) => fichaPredio(a)));

    server.registerTool("buscar_lotes", {
      annotations: LECTURA,
      title: "Buscar lotes",
      description: "Busca predios por municipio, barrio, área, tratamiento y área construible restante. Por defecto solo los marcados con potencial preliminar (inferencia) y sin amenaza alta.",
      inputSchema: z.object({
        municipio: z.string().optional(), barrio: z.string().optional(),
        area_min: z.number().min(0).optional(), area_max: z.number().min(0).optional(),
        tratamiento: z.string().optional(), construible_min: z.number().optional().describe("m² construibles restantes mínimos"),
        solo_potencial: z.boolean().optional(), incluir_amenaza_alta: z.boolean().optional(),
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
      description: "Estudio general de suelo: dado un perfil de edificio (VIS o NO VIS, número de unidades, área por unidad, pisos mínimos, rango de área de lote, precio objetivo por m²), recorre TODOS los predios urbanos del municipio, deja los que la norma del POT permite para ese producto (sin amenaza alta, protección, espacio público ni uso dotacional) y los ordena 0–100 por encaje normativo, precio frente a la zona, absorción según Galería, compradores frente a oferta (Fynder), señales de venta del folio y facilidad (poca construcción existente). Devuelve el resumen (cuántos lotes cumplen, barrios con más lotes), el ranking con el porqué de cada lote y un enlace al Excel. Tarda 5–15 s. Ejemplo: {municipio:'Medellín', tipo_vivienda:'NO VIS', unidades_min:150, unidades_max:300, area_unidad_m2:65, pisos_min:12}.",
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
        limite: z.number().int().min(1).max(100).optional().describe("Lotes en el ranking (defecto 25)"),
      }),
    }, seguro(async (a: any) => crearEstudioPerfil(a)));

    server.registerTool("consulta_norma", {
      annotations: LECTURA,
      title: "Consulta de norma de un lote",
      description: "Qué se puede hacer en un lote, en una respuesta corta: tratamiento, uso del suelo, altura, índice de construcción (base y con derechos), densidad, área construible, viviendas y unidades estimadas, construcción actual, amenazas y protección, valor del suelo de referencia y las matrículas y direcciones del predio. Se busca por CBML, id de predio, matrícula inmobiliaria (Medellín), dirección de Medellín o coordenada (p. ej. la de Google Maps). En Medellín incluye al lado la norma del proyecto de revisión del POT 2026 (v3, julio de 2026) y la comparación con la de 2014 (índice, densidad, área construible y viviendas). Incluye el aviso de vigencia del POT.",
      inputSchema: z.object({
        cbml: z.string().optional(), id: z.string().optional(),
        matricula: z.string().optional().describe("Matrícula inmobiliaria, con o sin oficina (p. ej. '001-728976' o '728976')"),
        direccion: z.string().optional().describe("Dirección de Medellín, p. ej. 'Cl. 6 Sur #50C-104'"),
        lat: z.number().optional(), lon: z.number().optional(),
        area_unidad_m2: z.number().min(20).max(300).optional().describe("Área por unidad para estimar unidades (defecto 65)"),
      }),
    }, seguro(async (a: any) => consultaNorma(a)));

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
