"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Cifra, interpretarBusqueda, m2, num, Vacio } from "./comunes";
import { FichaProyecto, PanelCartera, PanelComparar, PanelLote, PanelPot, PanelZona, ResultadoEstudio } from "./paneles";

const MUNICIPIOS: [string, number, number][] = [
  ["Medellín", -75.5736, 6.2442], ["Envigado", -75.5906, 6.1716], ["Sabaneta", -75.6159, 6.1515], ["Itagüí", -75.6115, 6.1846],
  ["Bello", -75.5585, 6.3373], ["La Estrella", -75.6436, 6.1576], ["Caldas", -75.6342, 6.0911], ["Copacabana", -75.5091, 6.3488],
  ["Girardota", -75.4446, 6.3772], ["Barbosa", -75.3315, 6.4389], ["Rionegro", -75.3747, 6.1550], ["El Retiro", -75.5025, 6.0603],
  ["La Ceja", -75.4316, 6.0300], ["Guarne", -75.4436, 6.2795], ["Marinilla", -75.3364, 6.1736], ["El Carmen de Viboral", -75.3346, 6.0826],
  ["La Unión", -75.3610, 5.9734],
];

const C = { oscuro: "#1a1a1f", lila: "#a28df5", morado: "#6c4de7", gris: "#8a8a93", ambar: "#f2a900", verde: "#3f8f4a", rojo: "#c0392b" };

type Seccion = "lote" | "oportunidades" | "estudio" | "cartera" | "comparar" | "zona" | "pot";
const SECCIONES: [Seccion, string, string][] = [
  ["lote", "⌖", "Lote"], ["oportunidades", "★", "Dónde construir"], ["estudio", "◎", "Competencia"], ["cartera", "▤", "Cartera"],
  ["comparar", "⇄", "Comparar"], ["zona", "⬠", "Zona"], ["pot", "◆", "POT 2026"],
];
type ModoCapa = "potencial" | "cambio" | "ninguno";

const PINTURA: Record<ModoCapa, { color: any; opacidad: any }> = {
  potencial: { color: ["case", ["get", "potencial"], C.morado, ["get", "amenaza"], C.gris, C.lila], opacidad: ["case", ["get", "potencial"], 0.5, 0.07] },
  cambio: {
    color: ["case", ["==", ["typeof", ["get", "delta_ic"]], "number"],
      ["interpolate", ["linear"], ["get", "delta_ic"], -1.5, C.rojo, -0.01, "#f3b3a8", 0, "#e6e3da", 0.01, "#cbbcf8", 0.5, C.lila, 1.5, C.morado], "#e6e3da"],
    opacidad: ["case", ["==", ["typeof", ["get", "delta_ic"]], "number"], ["case", ["==", ["get", "delta_ic"], 0], 0.12, 0.6], 0.03],
  },
  ninguno: { color: C.lila, opacidad: 0.02 },
};

export default function Mapa() {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<maplibregl.Map | null>(null);
  const [seccion, setSeccion] = useState<Seccion>("lote");
  const [seleccion, setSeleccion] = useState<{ tipo: "predio" | "proyecto"; id: string; datos?: any } | null>(null);
  const [cargando, setCargando] = useState<string | null>(null);
  const [municipio, setMunicipio] = useState("Medellín");
  const [busqueda, setBusqueda] = useState("");
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null);
  const [dibujando, setDibujando] = useState(false);
  const dibujandoRef = useRef(false);
  const [vertices, setVertices] = useState<[number, number][]>([]);
  const [comparar, setComparar] = useState<string[]>([]);
  const [modoCapa, setModoCapa] = useState<ModoCapa>("potencial");
  const [capas, setCapas] = useState({ proyectos: true, galeria: true, avisos: false });
  const [form, setForm] = useState({ nombre: "", tipo_vivienda: "NO VIS", vocacion: "ambos", min_unidades: 100, radio_m: 3000 });
  const [estudio, setEstudio] = useState<any>(null);
  const [modoOp, setModoOp] = useState<"perfil" | "rapidas">("perfil");
  const [perfil, setPerfil] = useState({ tipo_vivienda: "NO VIS", unidades_min: 150, unidades_max: 300, area_unidad_m2: 65, pisos_min: 12, area_lote_min: "", precio_m2_objetivo: "", barrios: "", norma: "2014" });
  const [resPerfil, setResPerfil] = useState<any>(null);
  const [oportunidades, setOportunidades] = useState<any>(null);
  const rankingRef = useRef<any[]>([]);

  const loteId = seleccion?.tipo === "predio" ? seleccion.id : null;

  /* ---------- mapa ---------- */
  function marcarLote(id: string | null) { mapa.current?.setFilter("lote-sel", ["==", ["get", "id"], id ?? "__ninguno__"]); }

  function pintarZona(vs: [number, number][]) {
    const src = mapa.current?.getSource("zona") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const anillo = vs.length >= 3 ? [...vs, vs[0]] : vs;
    src.setData({ type: "FeatureCollection", features: [
      ...(vs.length >= 2 ? [{ type: "Feature", properties: {}, geometry: vs.length >= 3 ? { type: "Polygon", coordinates: [anillo] } : { type: "LineString", coordinates: anillo } }] : []),
      ...vs.map((v) => ({ type: "Feature", properties: { vertice: true }, geometry: { type: "Point", coordinates: v } })),
    ] } as any);
  }

  function pintarRanking(lista: { id: string; lat: number; lon: number }[]) {
    rankingRef.current = lista;
    const src = mapa.current?.getSource("ranking") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    src.setData({ type: "FeatureCollection", features: lista.filter((o) => o.lat && o.lon).map((o, i) => ({ type: "Feature", properties: { n: i + 1, id: o.id },
      geometry: { type: "Point", coordinates: [Number(o.lon), Number(o.lat)] } })) } as any);
    if (lista.length && mapa.current) {
      const b = new maplibregl.LngLatBounds();
      lista.forEach((o) => o.lat && b.extend([Number(o.lon), Number(o.lat)]));
      if (!b.isEmpty()) mapa.current.fitBounds(b, { padding: 80, maxZoom: 15 });
    }
  }

  function abrirLote(id: string, lon?: number, lat?: number) {
    setSeleccion({ tipo: "predio", id }); setSeccion("lote"); marcarLote(id);
    if (lon && lat) mapa.current?.flyTo({ center: [lon, lat], zoom: 17 });
  }

  async function abrirProyecto(id: string) {
    setCargando("Cargando proyecto…"); setSeccion("lote");
    try { setSeleccion({ tipo: "proyecto", id, datos: await (await fetch(`/api/datos?tipo=proyecto&id=${id}`)).json() }); }
    finally { setCargando(null); }
  }

  async function buscar() {
    const body = interpretarBusqueda(busqueda);
    if (!body) return;
    setCargando("Buscando el lote…"); setErrorBusqueda(null);
    try {
      const j = await (await fetch("/api/norma", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      if (!j.encontrado) { setErrorBusqueda(j.mensaje ?? "No encontré el lote"); return; }
      const [lon, lat] = await fetch(`/api/datos?tipo=predio&id=${encodeURIComponent(j.predio)}`).then((r) => r.json()).then((d) => [d?.ubicacion?.lon, d?.ubicacion?.lat]).catch(() => [body.lon, body.lat]);
      abrirLote(j.predio, Number(lon ?? body.lon), Number(lat ?? body.lat));
    } finally { setCargando(null); }
  }

  useEffect(() => {
    if (!contenedor.current || mapa.current) return;
    const origen = window.location.origin;
    const m = new maplibregl.Map({ container: contenedor.current, style: "https://tiles.openfreemap.org/styles/positron", center: [-75.5736, 6.2442], zoom: 12 });
    mapa.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
    m.on("load", () => {
      for (const capa of ["predios", "proyectos", "avisos"]) {
        m.addSource(capa, { type: "vector", tiles: [`${origen}/api/tiles/${capa}/{z}/{x}/{y}`], minzoom: capa === "predios" ? 14 : 8, maxzoom: 16 });
      }
      m.addLayer({ id: "predios-relleno", type: "fill", source: "predios", "source-layer": "predios", paint: { "fill-color": PINTURA.potencial.color, "fill-opacity": PINTURA.potencial.opacidad } });
      m.addLayer({ id: "predios-borde", type: "line", source: "predios", "source-layer": "predios",
        paint: { "line-color": C.oscuro, "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.2, 18, 0.8], "line-opacity": 0.4 } });
      m.addLayer({ id: "lote-sel", type: "line", source: "predios", "source-layer": "predios", filter: ["==", ["get", "id"], "__ninguno__"], paint: { "line-color": C.morado, "line-width": 3.5 } });
      m.addLayer({ id: "avisos", type: "circle", source: "avisos", "source-layer": "avisos", layout: { visibility: "none" },
        paint: { "circle-radius": 3, "circle-color": C.ambar, "circle-opacity": ["case", ["get", "aprox"], 0.35, 0.85] } });
      m.addLayer({ id: "proyectos", type: "circle", source: "proyectos", "source-layer": "proyectos",
        paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 7], "circle-color": C.oscuro, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      m.addSource("galeria", { type: "geojson", data: `${origen}/api/analisis/galeria` });
      m.addLayer({ id: "galeria", type: "circle", source: "galeria",
        paint: { "circle-radius": ["interpolate", ["linear"], ["get", "ventas_mes"], 0, 4, 10, 8, 40, 14], "circle-color": C.morado, "circle-opacity": ["case", ["get", "aprox"], 0.35, 0.75],
          "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      m.addSource("zona", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      m.addLayer({ id: "zona-relleno", type: "fill", source: "zona", filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": C.lila, "fill-opacity": 0.15 } });
      m.addLayer({ id: "zona-borde", type: "line", source: "zona", filter: ["!=", ["geometry-type"], "Point"], paint: { "line-color": C.morado, "line-width": 2.5, "line-dasharray": [2, 1] } });
      m.addLayer({ id: "zona-vertices", type: "circle", source: "zona", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": C.morado, "circle-stroke-width": 2.5 } });
      m.addSource("ranking", { type: "geojson", data: { type: "FeatureCollection", features: [] } as any });
      m.addLayer({ id: "ranking", type: "circle", source: "ranking", paint: { "circle-radius": 11, "circle-color": C.morado, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
      m.addLayer({ id: "ranking-n", type: "symbol", source: "ranking",
        layout: { "text-field": ["to-string", ["get", "n"]], "text-size": 11, "text-font": ["Noto Sans Bold"], "text-allow-overlap": true }, paint: { "text-color": "#fff" } });
      if (rankingRef.current.length) setTimeout(() => pintarRanking(rankingRef.current), 0);

      m.on("click", (e) => {
        if (!dibujandoRef.current) return;
        setVertices((vs) => { const n = [...vs, [e.lngLat.lng, e.lngLat.lat] as [number, number]]; pintarZona(n); return n; });
      });
      m.on("click", "ranking", (e) => { const f = e.features?.[0]; if (f && !dibujandoRef.current) abrirLote(String(f.properties.id)); });
      m.on("click", "proyectos", (e) => { if (dibujandoRef.current) return; const f = e.features?.[0]; if (f) abrirProyecto(String(f.properties.id)); });
      m.on("click", "galeria", (e) => {
        if (dibujandoRef.current) return;
        const f = e.features?.[0]; if (!f) return; const p: any = f.properties;
        new maplibregl.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(e.lngLat).setHTML(
          `<b>${p.proyecto}</b><br><span style="color:#4d4d57">${p.construye} · ${p.zona}</span><br>` +
          `$${(p.precio_m2 / 1e6).toFixed(1)} M/m² · ${p.ventas_mes} und/mes · ${Math.round(p.vendido * 100)}% vendido<br>Oferta ${p.oferta} + ${p.por_lanzar} por lanzar` +
          (p.aprox ? `<br><i style="color:#8a8a93">ubicación aproximada</i>` : "")).addTo(m);
      });
      m.on("click", "predios-relleno", (e) => {
        if (dibujandoRef.current) return;
        if (m.queryRenderedFeatures(e.point, { layers: ["proyectos", "galeria", "ranking"] }).length) return;
        const f = e.features?.[0]; if (f) abrirLote(String(f.properties.id));
      });
      for (const l of ["proyectos", "predios-relleno", "galeria", "ranking"]) {
        m.on("mouseenter", l, () => { if (!dibujandoRef.current) m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", l, () => { if (!dibujandoRef.current) m.getCanvas().style.cursor = ""; });
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = mapa.current; if (!m || !m.getLayer("predios-relleno")) return;
    m.setPaintProperty("predios-relleno", "fill-color", PINTURA[modoCapa].color);
    m.setPaintProperty("predios-relleno", "fill-opacity", PINTURA[modoCapa].opacidad);
  }, [modoCapa]);
  useEffect(() => {
    const m = mapa.current; if (!m) return;
    for (const [k, v] of Object.entries(capas)) if (m.getLayer(k)) m.setLayoutProperty(k, "visibility", v ? "visible" : "none");
  }, [capas]);

  function empezarDibujo() {
    setVertices([]); pintarZona([]); setDibujando(true); dibujandoRef.current = true;
    if (mapa.current) mapa.current.getCanvas().style.cursor = "crosshair";
  }
  function terminarDibujo() { setDibujando(false); dibujandoRef.current = false; if (mapa.current) mapa.current.getCanvas().style.cursor = ""; }
  function borrarZona() { setVertices([]); pintarZona([]); }
  function irA(nombre: string) { setMunicipio(nombre); const c = MUNICIPIOS.find((x) => x[0] === nombre); if (c) mapa.current?.flyTo({ center: [c[1], c[2]], zoom: 14 }); }

  /* ---------- estudios ---------- */
  async function generarEstudio() {
    if (!loteId && vertices.length < 3) return;
    setCargando("Armando el estudio de competencia…"); setEstudio(null);
    const centro = vertices.length >= 3 ? [vertices.reduce((a, v) => a + v[0], 0) / vertices.length, vertices.reduce((a, v) => a + v[1], 0) / vertices.length] : null;
    const body: any = { nombre: form.nombre || undefined, tipo_vivienda: form.tipo_vivienda, vocacion: form.vocacion, min_unidades: Number(form.min_unidades),
      lote: loteId ? { id: loteId } : { lon: centro![0], lat: centro![1] } };
    if (vertices.length >= 3) body.poligono = { type: "Polygon", coordinates: [[...vertices, vertices[0]]] }; else body.radio_m = Number(form.radio_m);
    try { setEstudio(await (await fetch("/api/estudio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()); }
    catch (e) { setEstudio({ error: (e as Error).message }); } finally { setCargando(null); }
  }

  async function estudioPerfil() {
    setCargando("Recorriendo todos los lotes del municipio…"); setResPerfil(null);
    const n = (v: any) => (v === "" || v === null || v === undefined ? undefined : Number(v));
    const body = { municipio, tipo_vivienda: perfil.tipo_vivienda, unidades_min: n(perfil.unidades_min), unidades_max: n(perfil.unidades_max), area_unidad_m2: n(perfil.area_unidad_m2),
      pisos_min: n(perfil.pisos_min), area_lote_min: n(perfil.area_lote_min), precio_m2_objetivo: perfil.precio_m2_objetivo ? Number(perfil.precio_m2_objetivo) * 1e6 : undefined,
      barrios: perfil.barrios ? perfil.barrios.split(",").map((x) => x.trim()).filter(Boolean) : undefined, limite: 30, norma: perfil.norma };
    try {
      const j = await (await fetch("/api/perfil", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      setResPerfil(j); if (!j.error) pintarRanking(j.oportunidades ?? []);
    } catch (e) { setResPerfil({ error: (e as Error).message }); } finally { setCargando(null); }
  }

  async function verOportunidades() {
    setCargando("Buscando oportunidades…");
    try { const j = await (await fetch(`/api/datos?tipo=oportunidades&municipio=${encodeURIComponent(municipio)}`)).json(); setOportunidades(j); pintarRanking((j.oportunidades ?? []).map((o: any) => ({ id: o.id, lat: o.lat, lon: o.lon }))); }
    finally { setCargando(null); }
  }

  const zonaLista = vertices.length >= 3;
  const titulos: Record<Seccion, [string, string]> = {
    lote: ["Lote", "Norma, cabida, semáforo, cesiones y valor residual"], oportunidades: [`Dónde construir · ${municipio}`, "Lotes donde cabe tu edificio, en todo el municipio"],
    estudio: ["Estudio de competencia", "Etapa 1 · pasos 3 a 9, con Excel"], cartera: ["Cartera de lotes", "Analiza hasta 250 lotes de una vez"],
    comparar: ["Comparar lotes", "De 2 a 5 lotes lado a lado"], zona: ["Analizar una zona", "Norma, POT 2026, competencia y mercado de un polígono"],
    pot: ["POT 2026", "Quién gana y quién pierde con la revisión del POT de Medellín"],
  };

  return (
    <>
      <header className="barra">
        <a className="logo" href="/mapa"><img src="/marca/irrelevant.png" alt="" />irrelevant</a>
        <div className="sep" />
        <div className="producto">Inteligencia de suelo<small>Norma, mercado y competencia · Valle de Aburrá</small></div>
        <div className="buscador">
          <span>⌕</span>
          <input placeholder="Busca un lote: CBML, matrícula, dirección o coordenada de Google Maps" value={busqueda}
            onChange={(e) => { setBusqueda(e.target.value); setErrorBusqueda(null); }} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} />
          {errorBusqueda && <div className="error-busqueda">{errorBusqueda}</div>}
        </div>
        <div className="derecha"><a href="/que-puedo-hacer.html" target="_blank">Guía</a><a href="/api/logout">Salir</a></div>
        <div className="franja" />
      </header>

      <div className="workspace">
        <div className="lienzo">
          <div ref={contenedor} className="mapa" />
          <div className="herramientas">
            <select className="entrada" style={{ width: 160 }} value={municipio} onChange={(e) => irA(e.target.value)}>{MUNICIPIOS.map(([n]) => <option key={n}>{n}</option>)}</select>
            {!dibujando
              ? <button className="btn btn-oscuro" onClick={empezarDibujo}>✎ Dibujar zona</button>
              : <button className="btn btn-activo" onClick={terminarDibujo} disabled={vertices.length > 0 && vertices.length < 3}>✓ Terminar ({vertices.length})</button>}
            {vertices.length > 0 && !dibujando && <button className="btn btn-borde" onClick={borrarZona}>Borrar zona</button>}
          </div>
          <div className="capas">
            <div className="segmento">
              {([["potencial", "Potencial"], ["cambio", "Cambio POT 2026"], ["ninguno", "Sin color"]] as [ModoCapa, string][]).map(([k, t]) => (
                <button key={k} className={modoCapa === k ? "on" : ""} onClick={() => setModoCapa(k)}>{t}</button>
              ))}
            </div>
            <div className="toggles">
              {([["galeria", "Galería"], ["proyectos", "Proyectos"], ["avisos", "En venta"]] as [keyof typeof capas, string][]).map(([k, t]) => (
                <label key={k}><input type="checkbox" checked={capas[k]} onChange={(e) => setCapas({ ...capas, [k]: e.target.checked })} />{t}</label>
              ))}
            </div>
          </div>
          {dibujando && <div className="aviso-dibujo">Haz clic en el mapa para marcar los vértices de la zona. Mínimo 3 puntos.</div>}
          {cargando && <div className="cargando-mapa"><span className="giro" />{cargando}</div>}
          <div className="leyenda">
            {modoCapa === "cambio" ? (
              <>
                <b>Cambio de índice de construcción (POT 2026)</b>
                <div className="gradiente" />
                <div className="extremos"><span>baja</span><span>igual</span><span>sube</span></div>
              </>
            ) : (
              <>
                <b>Convenciones</b>
                <span><i className="cuadro" style={{ background: C.morado, opacity: 0.7 }} /> Lote con potencial</span>
                <span><i className="punto" style={{ background: C.morado, opacity: 0.75, width: 12, height: 12 }} /> Proyecto Galería (tamaño = ventas)</span>
                <span><i className="punto" style={{ background: C.oscuro, border: "2px solid #fff", boxShadow: "0 0 0 1px #0002" }} /> Proyecto nuevo (Zonario)</span>
                {capas.avisos && <span><i className="punto" style={{ background: C.ambar, width: 8, height: 8 }} /> Inmueble en venta</span>}
              </>
            )}
          </div>
        </div>

        <aside className="panel">
          <nav className="riel">
            {SECCIONES.map(([k, ic, t]) => (
              <button key={k} className={seccion === k ? "on" : ""} onClick={() => setSeccion(k)} title={t}>
                <span className="ic">{ic}</span><span className="tx">{t}</span>
                {k === "comparar" && comparar.length > 0 && <span className="globo">{comparar.length}</span>}
              </button>
            ))}
          </nav>
          <div className="contenido">
            <div className="titulo"><h2>{titulos[seccion][0]}</h2><div className="sub">{titulos[seccion][1]}</div></div>

            {seccion === "lote" && (
              <div className="buscador-panel">
                <div className="caja">
                  <span>⌕</span>
                  <input placeholder="CBML, matrícula, dirección o coordenada" value={busqueda}
                    onChange={(e) => { setBusqueda(e.target.value); setErrorBusqueda(null); }} onKeyDown={(e) => { if (e.key === "Enter") buscar(); }} />
                  <button className="btn btn-primario" disabled={!busqueda.trim() || !!cargando} onClick={buscar}>Buscar</button>
                </div>
                {errorBusqueda && <div className="error">{errorBusqueda}</div>}
                {!seleccion && (
                  <div className="ejemplos">
                    <span className="nota">Prueba con:</span>
                    {[["15090030008", "CBML"], ["001-728976", "Matrícula"], ["Cl. 6 Sur #50C-104", "Dirección"], ["6.2032, -75.5826", "Google Maps"]].map(([v, t]) => (
                      <button key={v} className="etiqueta chip" onClick={() => setBusqueda(v)} title={t}>{t}: {v}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {seccion === "lote" && (
              !seleccion ? <Vacio icono="⌖" titulo="Busca o selecciona un lote" texto="Escribe arriba un CBML, una matrícula, una dirección de Medellín o una coordenada de Google Maps, o acércate en el mapa y haz clic en un predio." />
              : seleccion.tipo === "predio" ? <PanelLote id={seleccion.id} enComparacion={comparar.includes(seleccion.id)}
                  onComparar={(id) => setComparar((c) => (c.includes(id) || c.length >= 5 ? c : [...c, id]))} onEstudio={() => setSeccion("estudio")} />
              : seleccion.datos?.encontrado ? <FichaProyecto d={seleccion.datos} /> : <div className="error">No encontré el proyecto.</div>
            )}

            {seccion === "comparar" && <PanelComparar ids={comparar} quitar={(id) => setComparar((c) => c.filter((x) => x !== id))} abrir={(id) => abrirLote(id)} />}
            {seccion === "cartera" && <PanelCartera pintar={pintarRanking} abrir={(id) => abrirLote(id)} />}
            {seccion === "zona" && <PanelZona vertices={vertices} dibujar={empezarDibujo} borrar={borrarZona} onEstudio={() => setSeccion("estudio")} />}
            {seccion === "pot" && <PanelPot abrir={abrirLote} verCapa={() => { setModoCapa("cambio"); mapa.current?.flyTo({ center: [-75.58, 6.24], zoom: 14 }); }} />}

            {seccion === "estudio" && (
              <>
                <div className="tarjeta">
                  <h4>1 · Lote y zona</h4>
                  <div className="etiquetas">
                    <span className={`etiqueta ${loteId ? "lima" : ""}`}>{loteId ? `Lote ${loteId}` : "Sin lote: búscalo o haz clic en un predio"}</span>
                    <span className={`etiqueta ${zonaLista ? "lima" : ""}`}>{zonaLista ? `Zona de ${vertices.length} vértices` : "Sin zona dibujada"}</span>
                  </div>
                  {!zonaLista && (
                    <div className="campo"><label>Radio alrededor del lote</label>
                      <div className="segmento">{[1500, 3000, 5000].map((r) => <button key={r} className={form.radio_m === r ? "on" : ""} onClick={() => setForm({ ...form, radio_m: r })}>{r / 1000} km</button>)}</div>
                    </div>
                  )}
                </div>
                <div className="tarjeta">
                  <h4>2 · Objetivo</h4>
                  <div className="campo"><label>Nombre del lote</label><input className="entrada" placeholder="p. ej. BONEM" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
                  <div className="campo"><label>Tipo de vivienda</label>
                    <div className="segmento">{[["todos", "VIS y NO VIS"], ["VIS", "VIS"], ["NO VIS", "NO VIS"]].map(([v, t]) => <button key={v} className={form.tipo_vivienda === v ? "on" : ""} onClick={() => setForm({ ...form, tipo_vivienda: v })}>{t}</button>)}</div>
                  </div>
                  <div className="campo"><label>Vocación</label>
                    <div className="segmento">{[["ambos", "Ambas"], ["vivienda", "Vivienda"], ["rentas_cortas", "Rentas cortas"]].map(([v, t]) => <button key={v} className={form.vocacion === v ? "on" : ""} onClick={() => setForm({ ...form, vocacion: v })}>{t}</button>)}</div>
                  </div>
                  <div className="campo"><label>Proyectos de más de</label><input className="entrada" type="number" min={0} value={form.min_unidades} onChange={(e) => setForm({ ...form, min_unidades: Number(e.target.value) })} /></div>
                </div>
                <button className="btn btn-primario btn-bloque" disabled={(!loteId && !zonaLista) || !!cargando} onClick={generarEstudio}>{cargando?.startsWith("Armando") ? "Generando…" : "Generar estudio"}</button>
                {estudio?.error && <div className="error">{estudio.error}</div>}
                {estudio && !estudio.error && <ResultadoEstudio e={estudio} />}
              </>
            )}

            {seccion === "oportunidades" && (
              <>
                <div className="segmento">
                  <button className={modoOp === "perfil" ? "on" : ""} onClick={() => setModoOp("perfil")}>Por perfil de edificio</button>
                  <button className={modoOp === "rapidas" ? "on" : ""} onClick={() => setModoOp("rapidas")}>Ranking general</button>
                </div>
                {modoOp === "perfil" && (
                  <>
                    <div className="tarjeta">
                      <div className="campo"><label>Tipo de vivienda</label>
                        <div className="segmento">{[["NO VIS", "NO VIS"], ["VIS", "VIS"], ["todos", "Ambos"]].map(([v, t]) => (
                          <button key={v} className={perfil.tipo_vivienda === v ? "on" : ""} onClick={() => setPerfil({ ...perfil, tipo_vivienda: v, area_unidad_m2: v === "VIS" ? 50 : perfil.area_unidad_m2 === 50 ? 65 : perfil.area_unidad_m2 })}>{t}</button>))}</div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>Unidades mínimas</label><input className="entrada" type="number" value={perfil.unidades_min} onChange={(e) => setPerfil({ ...perfil, unidades_min: Number(e.target.value) })} /></div>
                        <div className="campo"><label>Unidades máximas</label><input className="entrada" type="number" value={perfil.unidades_max} onChange={(e) => setPerfil({ ...perfil, unidades_max: Number(e.target.value) })} /></div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>m² por unidad</label><input className="entrada" type="number" value={perfil.area_unidad_m2} onChange={(e) => setPerfil({ ...perfil, area_unidad_m2: Number(e.target.value) })} /></div>
                        <div className="campo"><label>Pisos mínimos</label><input className="entrada" type="number" value={perfil.pisos_min} onChange={(e) => setPerfil({ ...perfil, pisos_min: Number(e.target.value) })} /></div>
                      </div>
                      <div className="fila">
                        <div className="campo"><label>Lote mínimo (m²)</label><input className="entrada" type="number" placeholder="opcional" value={perfil.area_lote_min} onChange={(e) => setPerfil({ ...perfil, area_lote_min: e.target.value })} /></div>
                        <div className="campo"><label>Precio objetivo ($M/m²)</label><input className="entrada" type="number" step="0.1" placeholder="p. ej. 9,5" value={perfil.precio_m2_objetivo} onChange={(e) => setPerfil({ ...perfil, precio_m2_objetivo: e.target.value })} /></div>
                      </div>
                      <div className="campo"><label>Norma (Medellín)</label>
                        <div className="segmento">{[["2014", "POT 2014 vigente"], ["2026", "Proyecto POT 2026"]].map(([v, t]) => <button key={v} className={perfil.norma === v ? "on" : ""} onClick={() => setPerfil({ ...perfil, norma: v })}>{t}</button>)}</div>
                      </div>
                      <div className="campo"><label>Barrios (opcional)</label><input className="entrada" placeholder="p. ej. Guayabal, Belén" value={perfil.barrios} onChange={(e) => setPerfil({ ...perfil, barrios: e.target.value })} /></div>
                    </div>
                    <button className="btn btn-primario btn-bloque" disabled={!!cargando} onClick={estudioPerfil}>Buscar lotes para este edificio</button>
                    {resPerfil?.error && <div className="error">{resPerfil.error}</div>}
                    {resPerfil && !resPerfil.error && (
                      <>
                        <div className="tarjeta destacada">
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
                            <div><h3 style={{ fontSize: 17 }}>{resPerfil.resumen.lotes_que_cumplen_la_norma} lotes sirven</h3>
                              <div style={{ fontSize: 12, opacity: 0.85 }}>{resPerfil.perfil.tipo_vivienda} · {resPerfil.perfil.unidades_min}{resPerfil.perfil.unidades_max ? `–${resPerfil.perfil.unidades_max}` : "+"} unidades de {resPerfil.perfil.area_unidad_m2} m² · {resPerfil.perfil.norma}</div></div>
                            <a className="btn btn-primario" href={`/api/estudio/${resPerfil.id}/xlsx`}>⤓ Excel</a>
                          </div>
                          <div className="cifras"><Cifra v={num(resPerfil.resumen.con_norma_base)} k="con la norma base" /><Cifra v={num(resPerfil.resumen.solo_comprando_derechos)} k="comprando derechos" /></div>
                        </div>
                        <div className="tarjeta"><h4>Barrios con más lotes</h4>
                          <table className="tabla"><thead><tr><th>Barrio</th><th>Lotes</th><th>Área</th><th>Unidades</th></tr></thead>
                            <tbody>{resPerfil.resumen.barrios_con_mas_lotes.slice(0, 8).map((b: any) => <tr key={b.barrio}><td>{b.barrio}</td><td>{b.lotes}</td><td>{num(b.area_lote_total / 10000, 1)} ha</td><td>{num(b.unidades_posibles)}</td></tr>)}</tbody></table>
                        </div>
                        <div className="tarjeta"><h4>Mejores lotes ({resPerfil.oportunidades.length})</h4>
                          <ul className="lista">{resPerfil.oportunidades.map((o: any, i: number) => (
                            <li key={o.id} className="clicable" onClick={() => abrirLote(o.id, Number(o.lon), Number(o.lat))}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="n">{i + 1}. {o.barrio ?? o.municipio}</span><span className="etiqueta lima">{o.puntaje} pts</span></div>
                              <span className="sub">{m2(o.area_lote_m2)} · ≈ {o.unidades_posibles} unidades{o.requiere_compra_derechos ? " (con derechos)" : ""} · {o.tratamiento}</span>
                              <span className="nota">{o.por_que.slice(1, 3).join(" · ")}</span>
                            </li>))}</ul>
                        </div>
                        <div className="nota">{resPerfil.metodo}</div>
                      </>
                    )}
                  </>
                )}
                {modoOp === "rapidas" && (
                  <>
                    {!oportunidades && <button className="btn btn-oscuro btn-bloque" onClick={verOportunidades}>Ver ranking general de {municipio}</button>}
                    {oportunidades && !oportunidades.error && (
                      <div className="tarjeta"><ul className="lista">{(oportunidades.oportunidades ?? []).map((o: any, i: number) => (
                        <li key={o.id} className="clicable" onClick={() => abrirLote(o.id, Number(o.lon), Number(o.lat))}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="n">{i + 1}. {o.barrio ?? o.municipio}</span><span className="etiqueta lima">{o.puntaje} pts</span></div>
                          <span className="sub">{m2(Number(o.area_lote))} · {o.por_que.slice(0, 2).join(" · ")}</span>
                        </li>))}</ul></div>
                    )}
                  </>
                )}
              </>
            )}

          </div>
        </aside>
      </div>
    </>
  );
}
