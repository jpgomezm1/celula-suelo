// Cliente mínimo para servicios ArcGIS REST y WFS públicos (GeoMedellín, IDEM, GeoAntioquia, Cornare).
// Pagina con resultOffset; si la capa no pagina (ArcGIS 10.x) recorre por lotes de objectIds.

const UA = "Mozilla/5.0 (compatible; celula-suelo/0.2)";

export type Envelope = { xmin: number; ymin: number; xmax: number; ymax: number };
export type QueryOptions = { where?: string; envelope?: Envelope; outFields?: string };
export type Feature = {
  type: "Feature";
  geometry: { type: string; coordinates: unknown } | null;
  properties: Record<string, unknown>;
};

async function request(url: string, body?: URLSearchParams, attempt = 1): Promise<any> {
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: { "User-Agent": UA, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.error) throw new Error(`ArcGIS ${json.error.code}: ${json.error.message}`);
    return json;
  } catch (err) {
    if (attempt >= 5) throw new Error(`Falló ${url}: ${(err as Error).message}`);
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return request(url, body, attempt + 1);
  }
}

function params(opts: QueryOptions, extra: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams({ where: opts.where ?? "1=1", f: "json", ...extra });
  if (opts.envelope) {
    p.set("geometry", JSON.stringify({ ...opts.envelope, spatialReference: { wkid: 4326 } }));
    p.set("geometryType", "esriGeometryEnvelope");
    p.set("inSR", "4326");
    p.set("spatialRel", "esriSpatialRelIntersects");
  }
  return p;
}

export const layerInfo = (layerUrl: string) => request(`${layerUrl}?f=json`);

export async function count(layerUrl: string, opts: QueryOptions): Promise<number> {
  return (await request(`${layerUrl}/query`, params(opts, { returnCountOnly: "true" }))).count;
}

const featureParams = (opts: QueryOptions, extra: Record<string, string>) => {
  const p = params(opts, { outFields: opts.outFields ?? "*", outSR: "4326", returnGeometry: "true", ...extra });
  p.set("f", "geojson");
  return p;
};

/**
 * Todas las entidades que cumplen el filtro, página por página, empezando en `desde`.
 * Algunas capas devuelven páginas más cortas que maxRecordCount aunque haya más datos,
 * así que se sigue hasta recibir una página vacía o alcanzar `total`.
 */
export async function* queryAll(layerUrl: string, opts: QueryOptions, total?: number, desde = 0, tamano?: number): AsyncGenerator<Feature[]> {
  const info = await layerInfo(layerUrl);
  const pageSize: number = tamano ?? Math.min(info.maxRecordCount ?? 1000, 2000);
  const oid: string = info.objectIdField ?? info.fields?.find((f: any) => f.type === "esriFieldTypeOID")?.name ?? "OBJECTID";

  if (!info.advancedQueryCapabilities?.supportsPagination) {
    // ArcGIS 10.x sin paginación: pedir todos los ids y traer por lotes.
    const ids: number[] = (await request(`${layerUrl}/query`, params(opts, { returnIdsOnly: "true" }))).objectIds ?? [];
    ids.sort((a, b) => a - b);
    // ArcGIS 10.2 no entrega GeoJSON: se pide Esri JSON y se convierte.
    const lote = tamano ?? 500;
    for (let i = desde; i < ids.length; i += lote) {
      const p = featureParams({ outFields: opts.outFields }, { objectIds: ids.slice(i, i + lote).join(",") });
      p.delete("where");
      p.set("f", "json");
      const body = await request(`${layerUrl}/query`, p);
      yield ((body.features ?? []) as any[]).map(esriToGeojson);
    }
    return;
  }

  // Si una página falla, se parte en mitades hasta aislar el registro defectuoso, que se salta y se reporta.
  // Devuelve las entidades y cuántas posiciones cubrió (en éxito normal = entidades recibidas).
  const pagina = async (offset: number, size: number): Promise<{ feats: Feature[]; cubre: number }> => {
    try {
      const body = await request(`${layerUrl}/query`, featureParams(opts, {
        orderByFields: oid, resultOffset: String(offset), resultRecordCount: String(size),
      }), size < pageSize ? 4 : 1);
      const feats: Feature[] = body.features ?? [];
      return { feats, cubre: feats.length };
    } catch {
      if (size <= 1) {
        console.log(`
  ⚠ registro en posición ${offset} no se puede leer de la fuente; se salta`);
        return { feats: [], cubre: 1 };
      }
      const mitad = Math.ceil(size / 2);
      const a = await pagina(offset, mitad);
      const b = await pagina(offset + mitad, size - mitad);
      return { feats: [...a.feats, ...b.feats], cubre: size };
    }
  };

  let offset = desde;
  for (;;) {
    const { feats, cubre } = await pagina(offset, pageSize);
    if (!cubre) break;
    if (feats.length) yield feats;
    offset += cubre;
    if (total !== undefined && offset >= total) break;
  }
}

/** Esri JSON → GeoJSON. Polígono: todos los anillos en un Polygon; ST_MakeValid lo arma como (Multi)Polygon válido. */
function esriToGeojson(f: any): Feature {
  const g = f.geometry;
  let geometry: Feature["geometry"] = null;
  if (g?.rings) geometry = { type: "Polygon", coordinates: g.rings };
  else if (g?.paths) geometry = { type: "MultiLineString", coordinates: g.paths };
  else if (g && typeof g.x === "number") geometry = { type: "Point", coordinates: [g.x, g.y] };
  return { type: "Feature", geometry, properties: f.attributes ?? {} };
}

/** WFS 1.0.0 (GeoServer) en EPSG:4326 con orden lon/lat. */
export async function wfsCount(url: string, typeName: string): Promise<number> {
  const qs = new URLSearchParams({ service: "WFS", version: "1.1.0", request: "GetFeature", typeName, resultType: "hits" });
  const res = await fetch(`${url}?${qs}`, { headers: { "User-Agent": UA } });
  const m = (await res.text()).match(/numberOfFeatures="(\d+)"/);
  return m ? Number(m[1]) : NaN;
}

export async function* wfsAll(url: string, typeName: string, pageSize = 1000): AsyncGenerator<Feature[]> {
  for (let start = 0; ; start += pageSize) {
    const qs = new URLSearchParams({
      service: "WFS", version: "1.0.0", request: "GetFeature", typeName, outputFormat: "application/json",
      srsName: "EPSG:4326", maxFeatures: String(pageSize), startIndex: String(start),
    });
    const body = await request(`${url}?${qs}`);
    const feats: Feature[] = body.features ?? [];
    if (!feats.length) break;
    yield feats;
    if (feats.length < pageSize) break;
  }
}
