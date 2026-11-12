"use client";
// Paneles del workspace: ficha completa del lote, comparación, cartera, zona, POT 2026 y estudio de competencia.
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
const Anteproyecto3D = dynamic(() => import("./Anteproyecto3D"), { ssr: false });
import { Cambio, Cifra, Luz, Seccion, Vacio, m2, millones, num, pct } from "./comunes";

/* ───────────── Inicio ───────────── */
const HERRAMIENTAS: [string, string, string, string][] = [
  ["lote", "⌖", "Consultar un lote", "Qué se puede construir, semáforo, cesiones, valor residual y ficha PDF. Busca por CBML, matrícula, dirección o coordenada, o haz clic en el mapa."],
  ["pot", "◆", "POT 2026 de Medellín", "La revisión del POT cambia lo que se puede construir. Mira qué barrios y lotes ganan o pierden, y colorea el mapa."],
  ["oportunidades", "★", "Dónde construir", "Describe tu edificio (VIS/NO VIS, unidades, m², pisos) y encuentra los lotes de todo un municipio donde cabe."],
  ["estudio", "◎", "Estudio de competencia", "Proyectos de Galería alrededor de un lote: ventas, ritmo, oferta y precio. Sale el Excel de la Etapa 1."],
  ["comparar", "⇄", "Comparar lotes", "Pon de 2 a 5 lotes lado a lado. Agrégalos con “+ Comparar” desde el mapa."],
  ["cartera", "▤", "Analizar una cartera", "Sube un KMZ o pega una lista de hasta 250 lotes y obtén un ranking con semáforo y Excel."],
  ["zona", "⬠", "Analizar una zona", "Dibuja un polígono: norma, cambio POT, competencia y mercado de esa zona."],
  ["negociaciones", "◷", "Negociaciones", "Los lotes que tu equipo estudia o negocia: estado, precio pedido contra el máximo que se puede pagar, próximas acciones e historial."],
  ["adn", "⚙", "Mi constructora", "Carga tu sistema constructivo, costos, ritmo de obra y tesis de inversión: el anteproyecto y los números se calculan como los harías tú."],
];
export function PanelInicio({ ir }: { ir: (k: string) => void }) {
  return (
    <>
      <div className="consejo-mapa">💡 Haz clic en cualquier predio del mapa (acercándote a nivel de manzana) para ver su resumen.</div>
      <div className="herramientas-inicio">
        {HERRAMIENTAS.map(([k, ic, t, d]) => (
          <button key={k} className={`tarjeta-inicio ${k === "pot" ? "destacada-pot" : ""}`} onClick={() => ir(k)}>
            <span className="ic">{ic}</span>
            <span className="tx"><b>{t}</b><span>{d}</span></span>
            <span className="flecha">→</span>
          </button>
        ))}
      </div>
    </>
  );
}

/* ───────────── Ficha completa del lote ───────────── */
export function PanelLote({ id, onComparar, onEstudio, enComparacion, ver3D, google3D, anteMapa }: { id: string; onComparar: (id: string) => void; onEstudio: () => void; enComparacion: boolean; ver3D: (d: any, clave: string) => void; google3D: (d: any, clave: string) => void; anteMapa?: (fc: any | null) => void }) {
  const [f, setF] = useState<any>(null);
  const [d, setD] = useState<any>(null);
  const [contacto, setContacto] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setF(null); setD(null); setContacto(null); setError(null);
    fetch(`/api/ficha?formato=json&id=${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => (j.encontrado === false ? setError(j.mensaje) : setF(j))).catch((e) => setError(e.message));
    fetch(`/api/datos?tipo=predio&id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setD).catch(() => {});
  }, [id]);
  if (error) return <div className="error">{error}</div>;
  if (!f) return <div className="cargando-panel"><span className="giro" />Analizando el lote…</div>;
  const a = f.analisis;
  const esc = a.cabida.escenarios as any[];
  const b26 = a.pot_2026_preliminar;
  return (
    <>
      <div className="cabecera-lote">
        <div>
          <div className="sobretitulo">{f.municipio}{f.norma?.tratamiento ? ` · ${f.norma.tratamiento}` : ""}</div>
          <h2>{f.barrio ?? f.municipio}</h2>
          <div className="sub">{f.predio}{f.identificacion?.matriculas?.length ? ` · Mat. ${f.identificacion.matriculas.slice(0, 2).join(", ")}` : ""}{f.identificacion?.direcciones?.[0] ? ` · ${f.identificacion.direcciones[0]}` : ""}</div>
        </div>
        <div className="semaforo-grande" title={`Semáforo ${a.semaforo.general}`}><Luz luz={a.semaforo.general} tam={18} /></div>
      </div>
      {b26?.disponible && (
        <div className={`banda-pot ${String(b26.frente_a_2014.area_construible_m2.cambio).startsWith("-") ? "baja" : b26.frente_a_2014.area_construible_m2.cambio === "+0 %" ? "igual" : "sube"}`}>
          <div className="etq-pot">POT 2026</div>
          <div><b>{String(b26.frente_a_2014.area_construible_m2.cambio).startsWith("-") ? "Este lote pierde" : b26.frente_a_2014.area_construible_m2.cambio === "+0 %" ? "Este lote queda igual" : "Este lote gana"} {b26.frente_a_2014.area_construible_m2.cambio !== "+0 %" ? b26.frente_a_2014.area_construible_m2.cambio.replace(/^[+-]/, "") : ""} de área construible</b>
            <span>{m2(b26.frente_a_2014.area_construible_m2.pot2014)} con el POT 2014 → {m2(b26.frente_a_2014.area_construible_m2.pot2026)} con el proyecto 2026{b26.que_se_puede_hacer?.con_derechos ? ` · hasta ${num(b26.que_se_puede_hacer.con_derechos.viviendas_max_por_densidad)} viviendas comprando derechos` : ""}</span></div>
        </div>
      )}
      <div className="cifras tres">
        <Cifra v={m2(f.area_lote_m2)} k="área del lote" />
        <Cifra v={m2(a.area_util.area_util_m2)} k="área útil" />
        <Cifra v={num(esc[1]?.unidades)} k="unidades (base)" />
      </div>
      <div className="acciones">
        <a className="btn btn-primario" href={`/api/ficha?id=${encodeURIComponent(f.predio)}`} target="_blank">⤓ Ficha PDF</a>
        <button className="btn btn-borde" onClick={() => onComparar(f.predio)} disabled={enComparacion}>{enComparacion ? "✓ En comparación" : "+ Comparar"}</button>
        <button className="btn btn-borde" onClick={onEstudio}>Estudio de competencia</button>
      </div>
      <SeguimientoLote id={f.predio} />

      <Seccion titulo="Semáforo" extra={<span className={`etiqueta ${a.semaforo.general === "verde" ? "lima" : a.semaforo.general === "rojo" ? "riesgo" : "aviso"}`}>{a.semaforo.general}</span>}>
        <ul className="semaforo">
          {a.semaforo.items.map((i: any) => (
            <li key={i.categoria}><Luz luz={i.luz} /><div><b>{i.categoria}</b><span>{i.lectura}</span></div></li>
          ))}
        </ul>
      </Seccion>

      <Seccion titulo="Qué se puede construir">
        <div className="escenarios">
          {esc.map((e: any, k: number) => (
            <div key={k} className={`escenario ${k === 1 ? "base" : ""}`}>
              <div className="nombre">{e.escenario.replace(/\s*\(.*\)/, "")}</div>
              <div className="detalle-norma">{e.escenario.match(/\((.*)\)/)?.[1]}</div>
              {e.disponible ? (
                <>
                  <div className="unidades">{num(e.unidades)}<small> und</small></div>
                  <div className="linea"><span>Construible</span><b>{m2(e.area_construible_m2)}</b></div>
                  <div className="linea"><span>Vendible</span><b>{m2(e.area_vendible_m2)}</b></div>
                  <div className="linea"><span>Pisos</span><b>{num(e.pisos_sobre_rasante)}{e.limitado_por_altura ? "*" : ""}</b></div>
                  <div className="linea"><span>Parqueaderos</span><b>{num(e.parqueaderos)}</b></div>
                  <div className="linea"><span>Sótanos</span><b>{num(e.sotanos_aprox)}</b></div>
                  <div className="linea"><span>IC · viv/ha</span><b>{num(e.indice_construccion, 1)} · {num(e.densidad_viv_ha)}</b></div>
                  <div className="nota">limita: {e.limita}</div>
                </>
              ) : <div className="nota">Sin norma</div>}
            </div>
          ))}
        </div>
        <div className="nota">{a.cabida.supuestos.area_unidad_m2} m²/unidad · 80 % vendible · IO {a.cabida.supuestos.indice_ocupacion} · {a.cabida.nota}</div>
      </Seccion>

      <PanelFachada id={f.predio} />

      <Panel3D id={f.predio} ver3D={ver3D} google3D={google3D} />

      <PanelTopografia id={f.predio} />

      <PanelCabida id={f.predio} anteMapa={anteMapa} />

      <Seccion titulo="Norma: POT 2014 y proyecto POT 2026">
        <div className="etiquetas">
          {f.norma?.codigo && <span className="etiqueta">{f.norma.codigo}{b26?.codigo_2026 ? ` → ${b26.codigo_2026}` : ""}</span>}
          {f.norma?.uso_del_suelo && <span className="etiqueta">{f.norma.uso_del_suelo}</span>}
          {f.norma?.altura_max_pisos && <span className="etiqueta">Altura {f.norma.altura_max_pisos} pisos</span>}
        </div>
        {b26?.disponible ? (
          <table className="tabla">
            <thead><tr><th></th><th>2014</th><th>2026</th><th>Cambio</th></tr></thead>
            <tbody>
              <tr><td>Índice de construcción</td><td>{num(b26.frente_a_2014.indice_construccion.pot2014, 1)}</td><td><b>{num(b26.frente_a_2014.indice_construccion.pot2026, 1)}</b></td><td><Cambio v={b26.frente_a_2014.indice_construccion.cambio} /></td></tr>
              <tr><td>Densidad viv/ha</td><td>{num(b26.frente_a_2014.densidad_viv_ha.pot2014)}</td><td><b>{num(b26.frente_a_2014.densidad_viv_ha.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.densidad_viv_ha.cambio} /></td></tr>
              <tr><td>Área construible</td><td>{m2(b26.frente_a_2014.area_construible_m2.pot2014)}</td><td><b>{m2(b26.frente_a_2014.area_construible_m2.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.area_construible_m2.cambio} /></td></tr>
              <tr><td>Viviendas</td><td>{num(b26.frente_a_2014.viviendas.pot2014)}</td><td><b>{num(b26.frente_a_2014.viviendas.pot2026)}</b></td><td><Cambio v={b26.frente_a_2014.viviendas.cambio} /></td></tr>
            </tbody>
          </table>
        ) : (
          <div className="cifras tres">
            <Cifra v={num(f.norma?.indice_construccion_base, 1)} k="IC base" />
            <Cifra v={num(f.norma?.indice_construccion_con_derechos, 1)} k="IC con derechos" />
            <Cifra v={num(f.norma?.densidad_max_viv_ha)} k="densidad viv/ha" />
          </div>
        )}
        {b26?.frente_a_2014?.lectura && <div className="sub"><b>{b26.frente_a_2014.lectura}</b></div>}
        {b26?.disponible === false && <div className="nota">{b26.motivo}</div>}
        {b26?.estado && <div className="nota">{b26.estado}</div>}
      </Seccion>

      <Seccion titulo="Área útil y cesiones">
        <div className="cifras">
          <Cifra v={m2(a.area_util.area_afectada_m2)} k="área afectada" />
          <Cifra v={m2(a.area_util.area_util_m2)} k="área útil" />
          <Cifra v={m2(a.cesiones.espacio_publico_suelo_m2)} k={`cesión de suelo (${a.cesiones.pct_del_lote ?? "—"} %)`} />
          <Cifra v={m2(a.cesiones.equipamiento_construido_m2)} k="equipamiento construido" />
        </div>
        {[...a.area_util.proteccion, ...a.area_util.amenaza_alta].length > 0 && (
          <div className="etiquetas">{[...a.area_util.proteccion.map((p: any) => `${p.tipo}: ${m2(p.m2)}`), ...a.area_util.amenaza_alta.map((p: any) => `Amenaza alta ${p.tipo}: ${m2(p.m2)}`)].map((t) => <span key={t} className="etiqueta riesgo">{t}</span>)}</div>
        )}
        <div className="nota">{a.cesiones.regla}. {a.cesiones.nota}</div>
      </Seccion>

      <Seccion titulo={`Usos · ${a.usos.area_de_actividad}`} abierta={false}>
        <div className="usos">
          {(a.usos.usos ?? []).map((u: any) => <span key={u.actividad} className={`uso ${u.estado === "permitido" ? "si" : u.estado === "condicionado" ? "talvez" : "no"}`}>{u.actividad}</span>)}
        </div>
        <div className="nota"><span className="uso si mini">permitido</span> <span className="uso talvez mini">condicionado</span> <span className="uso no mini">no permitido</span> · {a.usos.nota}</div>
      </Seccion>

      {a.valor_residual && (
        <Seccion titulo="Valor residual rápido (indicativo)">
          {a.valor_residual.disponible === false ? <div className="sub">{a.valor_residual.motivo}</div> : (
            <>
              <div className="cifras">
                <Cifra v={a.valor_residual.valor_residual_legible} k="residual estático (techo teórico)" />
                <Cifra v={millones(a.valor_residual.valor_residual_m2)} k="por m² de lote" />
                <Cifra v={millones(a.valor_residual.valor_suelo_referencia_m2)} k="referencia catastral $/m²" />
                <Cifra v={millones(a.valor_residual.precio_m2_venta_supuesto)} k="precio de venta supuesto $/m²" />
              </div>
              <div className="nota">{a.valor_residual.nota}</div>
              <div className="nota aviso-datos">Es un cálculo estático: no descuenta el tiempo de ventas, la financiación ni los costos de tu constructora, y suele quedar muy por encima de lo pagable. Para decidir, usa “Números del proyecto” en el anteproyecto (flujo de caja, TIR y valor máximo con la tesis de tu comité).</div>
            </>
          )}
        </Seccion>
      )}

      {d?.encontrado && (
        <Seccion titulo="Mercado y proyectos a 1,5 km" abierta={false}>
          <div className="cifras">
            <Cifra v={num(d.mercado_1500m.apartamentos_en_venta)} k="apartamentos en venta" />
            <Cifra v={millones(d.mercado_1500m.precio_m2_mediana)} k="precio por m² típico" />
            <Cifra v={num(d.mercado_1500m.pedidos_compradores_90d)} k="compradores buscando (90 d)" />
            <Cifra v={millones(d.mercado_1500m.presupuesto_mediana)} k="presupuesto típico" />
          </div>
          <ul className="lista">
            {d.proyectos_nuevos_1500m.slice(0, 8).map((p: any) => <li key={p.id}><span className="n">{p.nombre}</span><span className="sub">{p.constructora} · desde {millones(p.precio_desde)} · {num(p.distancia_m)} m</span></li>)}
          </ul>
        </Seccion>
      )}

      <Seccion titulo="¿Cómo llegar al dueño?" abierta={false}>
        {!contacto && <button className="btn btn-borde" onClick={async () => setContacto(await (await fetch(`/api/datos?tipo=contacto&id=${encodeURIComponent(f.predio)}`)).json())}>Ver señales de venta y ruta de contacto</button>}
        {contacto?.encontrado && (
          <>
            <div className="cifras">
              <Cifra v={contacto.senales_de_venta.probabilidad_venta ?? "—"} k="probabilidad de venta" />
              <Cifra v={contacto.titular_probable} k="titular probable" />
            </div>
            {contacto.senales_de_venta.senales && (
              <ul className="lista">{contacto.senales_de_venta.senales.map((x: any, i: number) => <li key={i}><span className="n" style={{ color: x.efecto === "favorable" ? "#3f8f4a" : x.efecto === "riesgo" ? "#c0392b" : undefined }}>{x.señal}</span><span className="sub">{x.lectura}</span></li>)}</ul>
            )}
            <ol className="pasos">{contacto.rutas_de_contacto.map((r: any, i: number) => <li key={i}><b>{r.paso}:</b> {r.como}</li>)}</ol>
            <div className="nota">{contacto.aviso_legal}</div>
          </>
        )}
      </Seccion>

      {f.aviso_pot && <div className="alerta">{f.aviso_pot}</div>}
      <div className="nota legal">{a.aviso_legal}</div>
    </>
  );
}

/* ───────────── Anteproyecto esquemático (planos, 3D, Excel) ───────────── */
const NOMBRES_CAPA: Record<string, string> = { "A-MURO": "Muros", "A-MURO-INT": "Muros interiores", "A-RELLENO-MURO": "Relleno de muros", "A-PUERTA": "Puertas", "A-VENTANA": "Ventanas",
  "A-MOBILIARIO": "Mobiliario", "A-ESCALERA": "Escaleras", "A-ASCENSOR": "Ascensores", "A-DUCTO": "Ductos", "A-ESPACIO": "Nombres de espacios", "A-APTO": "Apartamentos",
  "A-CIRCULACION": "Circulaciones", "A-COTA": "Cotas", "A-TEXTO": "Textos", "A-NIVEL": "Niveles", "A-LOTE": "Lote", "A-RETIRO": "Retiros", "A-PARQUEO": "Parqueaderos",
  "A-RAMPA": "Rampa", "A-DEPOSITO": "Depósitos", "A-TECNICO": "Cuartos técnicos", "A-CORTE": "Corte", "A-FACHADA": "Fachada", "A-TERRENO": "Terreno",
  "A-PLANCHA": "Marco", "A-ROTULO": "Rótulo", "A-TABLA": "Tablas" };

function VisorPlanchas({ qs, planchas, onCerrar }: { qs: string; planchas: any[]; onCerrar: () => void }) {
  const [n, setN] = useState(1);
  const [svg, setSvg] = useState<string>("");
  const [vista, setVista] = useState({ k: 1, x: 0, y: 0 });
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const caja = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  useEffect(() => { setSvg(""); fetch(`/api/cabida?${qs}&formato=svg&plancha=${n}&ancho=2400`).then((r) => r.text()).then(setSvg); setVista({ k: 1, x: 0, y: 0 }); }, [n, qs]);
  const capas = [...new Set([...svg.matchAll(/data-capa="([^"]+)"/g)].map((x) => x[1]))];
  const p = planchas[n - 1];
  const rueda = (e: React.WheelEvent) => {
    const b = caja.current!.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    const k2 = Math.min(12, Math.max(0.5, vista.k * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
    setVista({ k: k2, x: mx - ((mx - vista.x) * k2) / vista.k, y: my - ((my - vista.y) * k2) / vista.k });
  };
  const css = [...ocultas].map((c) => `.lienzo-planos g[data-capa="${c}"]{display:none}`).join("");
  return (
    <div className="modal-3d completo">
      <div className="caja-3d con-capas">
        <div className="cabeza-3d">
          <b>Plancha {n}/{planchas.length} · {p?.titulo}</b><span>Escala 1:{p?.escala} · arrastra para moverte, rueda para acercar</span>
          <button onClick={() => setVista({ k: 1, x: 0, y: 0 })} title="Ajustar a la pantalla">⤢</button>
          <button onClick={() => setN(Math.max(1, n - 1))} disabled={n <= 1} title="Anterior">‹</button>
          <button onClick={() => setN(Math.min(planchas.length, n + 1))} disabled={n >= planchas.length} title="Siguiente">›</button>
          <button onClick={onCerrar} title="Cerrar">✕</button>
        </div>
        <div className="cuerpo-planos">
          <div ref={caja} className="lienzo-planos" onWheel={rueda}
            onPointerDown={(e) => { arrastre.current = { x: e.clientX, y: e.clientY, vx: vista.x, vy: vista.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
            onPointerMove={(e) => { const a = arrastre.current; if (a) setVista({ ...vista, x: a.vx + e.clientX - a.x, y: a.vy + e.clientY - a.y }); }}
            onPointerUp={() => (arrastre.current = null)}>
            <style>{css}</style>
            {svg ? <div className="hoja" style={{ transform: `translate(${vista.x}px, ${vista.y}px) scale(${vista.k})` }} dangerouslySetInnerHTML={{ __html: svg }} />
              : <div className="cargando-panel"><span className="giro" />Dibujando la plancha…</div>}
          </div>
          <div className="capas-planos">
            <b>Capas</b>
            {capas.map((c) => <label key={c}><input type="checkbox" checked={!ocultas.has(c)} onChange={() => { const o = new Set(ocultas); o.has(c) ? o.delete(c) : o.add(c); setOcultas(o); }} /> {NOMBRES_CAPA[c] ?? c}</label>)}
          </div>
        </div>
        <div className="miniaturas-planchas">{planchas.map((x) => <button key={x.numero} className={x.numero === n ? "on" : ""} onClick={() => setN(x.numero)}>{x.numero}. {x.titulo}</button>)}</div>
      </div>
    </div>
  );
}

/* ───────────── Números del proyecto (prefactibilidad financiera) ───────────── */
const mill = (v?: number | null) => (v == null ? "—" : `$${Math.round(v / 1e6).toLocaleString("es-CO")} M`);
function GraficoFlujo({ flujo }: { flujo: any[] }) {
  if (!flujo?.length) return null;
  const W = 560, H = 170, P = 8;
  const max = Math.max(...flujo.map((f) => Math.abs(f.neto)), ...flujo.map((f) => Math.abs(f.acumulado)), 1);
  const x = (i: number) => P + (i / Math.max(1, flujo.length - 1)) * (W - 2 * P), y = (v: number) => H / 2 - (v / max) * (H / 2 - P);
  const bw = Math.max(1.5, (W - 2 * P) / flujo.length - 1);
  const linea = flujo.map((f, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(f.acumulado).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="grafico-flujo" role="img" aria-label="Flujo de caja mensual">
      <line x1={P} x2={W - P} y1={H / 2} y2={H / 2} stroke="#ccc" />
      {flujo.map((f, i) => <rect key={i} x={x(i) - bw / 2} y={Math.min(y(f.neto), H / 2)} width={bw} height={Math.abs(y(f.neto) - H / 2)} fill={f.neto >= 0 ? "#3f8f4a" : "#c0392b"} opacity="0.55" />)}
      <path d={linea} fill="none" stroke="#6c4de7" strokeWidth="2" />
      <text x={W - P} y={14} fontSize="10" textAnchor="end" fill="#6c4de7">acumulado</text>
      <text x={P} y={H - 4} fontSize="10" fill="#888">mes 0</text><text x={W - P} y={H - 4} fontSize="10" textAnchor="end" fill="#888">mes {flujo.length - 1}</text>
    </svg>
  );
}

function MezclaOptima({ qs, usar }: { qs: string; usar?: (m: any) => void }) {
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { setR(null); }, [qs]);
  async function buscar() {
    setCargando(true);
    try { setR(await (await fetch(`/api/mezcla?${qs}`)).json()); } catch (e) { setR({ error: (e as Error).message }); } finally { setCargando(false); }
  }
  const conPrecio = new URLSearchParams(qs).has("costo_lote");
  return (
    <div className="bloque-mezcla">
      <button className="btn btn-borde btn-bloque" disabled={cargando} onClick={buscar}>{cargando ? "Probando mezclas de apartamentos (hasta 1 minuto)…" : "Buscar la mezcla de apartamentos que más deja"}</button>
      {r?.error && <div className="error">{r.error}</div>}
      {r?.ranking && (
        <>
          <div className="nota"><b>{r.lectura}</b> Se probaron {r.evaluadas} mezclas ({r.edificios_distintos} edificios distintos); criterio: {r.criterio}.</div>
          <table className="tabla"><thead><tr><th>Mezcla construida</th><th>Viv.</th><th>{conPrecio ? "Utilidad" : "Máx. lote"}</th><th>TIR</th><th></th></tr></thead>
            <tbody>{r.ranking.map((x: any, i: number) => (
              <tr key={i} className={x.firma === r.actual?.firma ? "fila-actual" : ""}><td>{x.texto}{x.firma === r.actual?.firma ? " (actual)" : ""}</td><td>{x.unidades}</td>
                <td>{mill(conPrecio ? x.utilidad : x.valor_maximo_lote)}</td><td>{x.tir_ea_pct != null ? `${num(x.tir_ea_pct, 1)} %` : "—"}</td>
                <td>{usar && x.firma !== r.actual?.firma && <button className="btn-mini" onClick={() => usar(x.mezcla)}>Usar</button>}</td></tr>))}</tbody></table>
          <ul className="lista-simple">{r.advertencias.map((a: string) => <li key={a}>{a}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function PanelNumeros({ qs, usarMezcla, inicial, id, onGuardada }: { qs: string; usarMezcla?: (m: any, supuestos?: any) => void; inicial?: any; id?: string; onGuardada?: () => void }) {
  const [o, setO] = useState<any>(inicial ?? { costo_lote: "", precio_m2: "", absorcion_mes: "" });
  const [nombreV, setNombreV] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  async function guardarVersion() {
    setGuardando("Guardando…");
    const params = new URLSearchParams(q()); params.delete("id");
    const r = await (await fetch("/api/escenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, nombre: nombreV || `Versión ${new Date().toLocaleDateString("es-CO")}`, parametros: params.toString() }) })).json();
    setGuardando(r.version ? `Guardada: ${r.version.nombre}` : r.error ?? "No se pudo guardar"); if (r.version) { setNombreV(""); onGuardada?.(); }
  }
  const [f, setF] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { setF(null); }, [qs]);
  const q = () => {
    const x = new URLSearchParams(qs);
    if (o.costo_lote !== "") x.set("costo_lote", String(Number(o.costo_lote) * 1e6));
    if (o.precio_m2 !== "") x.set("precio_m2", String(Number(o.precio_m2) * 1e6));
    if (o.absorcion_mes !== "") x.set("absorcion_mes", String(o.absorcion_mes));
    return x.toString();
  };
  async function calcular() {
    setCargando(true);
    try { setF(await (await fetch(`/api/finanzas?${q()}`)).json()); } catch (e) { setF({ error: (e as Error).message }); } finally { setCargando(false); }
  }
  const campo = (k: string, t: string, ph: string, paso = 1) => (
    <div className="campo"><label>{t}</label><input className="entrada" type="number" step={paso} placeholder={ph} value={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.value })} /></div>);
  const R = f?.resultado, L = f?.lote;
  const color = f?.veredicto === "VA" ? "verde" : f?.veredicto === "VA CON AJUSTES" ? "amarillo" : f?.veredicto === "NO VA" ? "rojo" : "morado";
  return (
    <Seccion titulo="Números del proyecto (prefactibilidad)">
      <div className="nota">Presupuesto paramétrico según el perfil de la constructora, precios y velocidad de ventas de Galería, cronograma por torre, flujo de caja con fiducia y crédito constructor. Si no das el costo del lote, calcula el máximo que se puede pagar.</div>
      <div className="fila tres-col">{campo("costo_lote", "Costo del lote ($ millones)", "opcional")}{campo("precio_m2", "Precio m² ($ millones)", "mercado", 0.1)}{campo("absorcion_mes", "Ventas por mes (und.)", "mercado", 0.5)}</div>
      <button className="btn btn-primario btn-bloque" disabled={cargando} onClick={calcular}>{cargando ? "Calculando flujo, TIR y sensibilidades…" : f ? "Recalcular números" : "Calcular números"}</button>
      {f?.error && <div className="error">{f.error}</div>}
      {R && (
        <>
          <div className={`veredicto ${color}`}>
            <div><b>{f.veredicto === "VALOR MÁXIMO" ? "Valor máximo a pagar por el lote" : f.veredicto}</b>
              <span>{f.veredicto === "VALOR MÁXIMO" ? `${mill(L.valor_maximo)} · ${mill(L.por_m2_lote).replace(" M", " M/m²").replace("$", "$")} de lote` : f.razones.join(" · ")}</span></div>
            {f.veredicto !== "VALOR MÁXIMO" && <div className="vmax">Máximo: <b>{mill(L.valor_maximo)}</b></div>}
          </div>
          {f.alertas?.length > 0 && <ul className="alertas-num">{f.alertas.map((x: string) => <li key={x}>⚠ {x}</li>)}</ul>}
          <div className="cifras tres">
            <Cifra v={mill(R.ventas)} k="ventas" /><Cifra v={mill(R.utilidad)} k={`utilidad · margen ${num(R.margen_pct, 1)} %`} /><Cifra v={R.tir_ea_pct != null ? `${num(R.tir_ea_pct, 1)} %` : "—"} k="TIR efectiva anual" />
          </div>
          <div className="cifras tres">
            <Cifra v={mill(R.exposicion_maxima)} k="exposición máxima de caja" /><Cifra v={`${R.duracion_meses} meses`} k={`${R.meses_de_ventas} meses de ventas`} /><Cifra v={mill(f.presupuesto.costo_total)} k={`costo total · directo $${num(f.presupuesto.costo_directo_m2 / 1e6, 2)} M/m²`} />
          </div>
          <div className="nota">Valor máximo del lote = el menor entre: margen mínimo {mill(L.por_margen)}, TIR mínima {mill(L.por_tir)}, lote/ventas máximo {mill(L.por_lote_sobre_ventas)} · perfil {f.perfil.nombre}.</div>
          <h4 className="sub-h">Flujo de caja</h4>
          <GraficoFlujo flujo={f.flujo} />
          <table className="tabla"><thead><tr><th>Torre</th><th>Unid.</th><th>Lanza</th><th>Obra</th><th>Entrega</th><th>Escritura</th></tr></thead>
            <tbody>{f.cronograma.map((c: any) => <tr key={c.torre}><td>{c.torre}</td><td>{c.unidades}</td><td>mes {c.lanzamiento}</td><td>mes {c.inicio_obra}</td><td>mes {c.entrega}</td><td>mes {c.escrituracion}</td></tr>)}</tbody></table>
          <h4 className="sub-h">Sensibilidades (mismo costo de lote)</h4>
          <table className="tabla"><thead><tr><th>Escenario</th><th>Margen</th><th>TIR</th><th>Valor máx. lote</th></tr></thead>
            <tbody>{f.sensibilidades.map((x: any) => <tr key={x.escenario}><td>{x.escenario}</td><td>{num(x.margen_pct, 1)} %</td><td>{x.tir_ea_pct != null ? `${num(x.tir_ea_pct, 1)} %` : "—"}</td><td>{mill(x.valor_maximo_lote)}</td></tr>)}</tbody></table>
          <h4 className="sub-h">Precios por tipología (torre {f.producto.etapas[0]?.torre})</h4>
          <table className="tabla"><thead><tr><th>Tipología</th><th>Área</th><th>Precio m²</th><th>Precio</th></tr></thead>
            <tbody>{f.producto.etapas[0]?.tipologias.map((x: any) => <tr key={x.tipologia}><td>{x.tipologia}</td><td>{num(x.area_promedio_m2, 1)} m²</td><td>{mill(x.precio_m2)}</td><td>{mill(x.precio_unidad)}</td></tr>)}</tbody></table>
          <details className="avanzado"><summary>Comparables de Galería ({f.mercado.comparables} a {f.mercado.radio_m / 1000} km) · supuestos</summary>
            <table className="tabla"><thead><tr><th>Proyecto</th><th>Estr.</th><th>$/m²</th><th>Área</th><th>Ventas/mes</th></tr></thead>
              <tbody>{f.mercado.lista.map((c: any) => <tr key={c.proyecto}><td>{c.proyecto}</td><td>{c.estrato}</td><td>{num(c.precio_m2 / 1e6, 1)} M</td><td>{c.area_m2}</td><td>{num(c.ventas_mes, 1)}</td></tr>)}</tbody></table>
            <ul className="lista-simple">{f.supuestos.map((x: string) => <li key={x}>{x}</li>)}</ul>
          </details>
          <MezclaOptima qs={q()} usar={usarMezcla ? (x) => usarMezcla(x, o) : undefined} />
          {id && <div className="guardar-version"><input className="entrada" placeholder="Nombre de la versión (p. ej. 'Mezcla 1A, lote a 8.000')" value={nombreV} onChange={(e) => setNombreV(e.target.value)} />
            <button className="btn btn-borde" onClick={guardarVersion}>Guardar versión</button>{guardando && <span className="nota">{guardando}</span>}</div>}
          <div className="acciones"><a className="btn btn-primario" href={`/api/comite?${q()}`} target="_blank" rel="noreferrer">Carpeta para comité (PDF)</a><a className="btn btn-borde" href={`/api/finanzas?${q()}&formato=xlsx`}>Excel de prefactibilidad</a></div>
        </>
      )}
    </Seccion>
  );
}

function Versiones({ id, refresco, abrir }: { id: string; refresco: number; abrir: (parametros: string) => void }) {
  const [vs, setVs] = useState<any[]>([]);
  const cargar = () => fetch(`/api/escenarios?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => setVs(j.versiones ?? [])).catch(() => {});
  useEffect(() => { cargar(); }, [id, refresco]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!vs.length) return null;
  const borrar = async (vid: number) => { await fetch(`/api/escenarios?vid=${vid}`, { method: "DELETE" }); cargar(); };
  const filas: [string, (r: any) => string][] = [
    ["Fecha", (v) => new Date(v.creado_en).toLocaleDateString("es-CO", { day: "numeric", month: "short" })], ["Mezcla", (v) => v.resultado.mezcla], ["Norma", (v) => v.resultado.escenario_norma],
    ["Torres · pisos", (v) => `${v.resultado.torres} · ${v.resultado.pisos}`], ["Viviendas", (v) => String(v.resultado.unidades)], ["Ventas", (v) => mill(v.resultado.ventas)],
    ["Costo del lote", (v) => (v.resultado.costo_lote != null ? mill(v.resultado.costo_lote) : "—")], ["Utilidad", (v) => mill(v.resultado.utilidad)],
    ["Margen", (v) => `${num(v.resultado.margen_pct, 1)} %`], ["TIR", (v) => (v.resultado.tir_ea_pct != null ? `${num(v.resultado.tir_ea_pct, 1)} %` : "—")],
    ["Máx. por el lote", (v) => mill(v.resultado.valor_maximo_lote)], ["Veredicto", (v) => v.resultado.veredicto], ["Perfil", (v) => v.resultado.perfil],
  ];
  const mejor = Math.max(...vs.map((v) => v.resultado.valor_maximo_lote ?? 0));
  return (
    <Seccion titulo={`Versiones guardadas (${vs.length})`} abierta>
      <div className="tabla-scroll"><table className="tabla tabla-versiones">
        <thead><tr><th></th>{vs.map((v) => <th key={v.id} className={v.resultado.valor_maximo_lote === mejor ? "mejor" : ""}>{v.nombre}</th>)}</tr></thead>
        <tbody>{filas.map(([t, f]) => <tr key={t}><td>{t}</td>{vs.map((v) => <td key={v.id}>{f(v)}</td>)}</tr>)}
          <tr><td></td>{vs.map((v) => <td key={v.id}><button className="btn-mini" onClick={() => abrir(v.parametros)}>Abrir</button> <button className="btn-mini gris" onClick={() => borrar(v.id)}>Borrar</button></td>)}</tr></tbody>
      </table></div>
      <div className="nota">Cada versión guarda los parámetros y una foto de los resultados con el perfil de ese momento. Al abrirla se recalcula con los datos de hoy.</div>
    </Seccion>
  );
}

function PanelCabida({ id, anteMapa }: { id: string; anteMapa?: (fc: any | null) => void }) {
  const [o, setO] = useState<any>({ escenario: "base", estrato: "", pisos_plataforma: 0, crujia_m: 7.6, estudio: 0, a1: 20, a2: 55, a3: 25, retiro_frontal_m: "", retiro_lateral_m: "", separacion_torres_m: "" });
  const [m, setM] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [ver, setVer] = useState<"3d" | "planchas" | null>(null);
  const [refresco, setRefresco] = useState(0);
  const [numIni, setNumIni] = useState<any>(null);
  useEffect(() => { setM(null); setVer(null); setNumIni(null); anteMapa?.(null); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const qs = () => {
    const mezcla = [["estudio", o.estudio], ["1A", o.a1], ["2A", o.a2], ["3A", o.a3]].filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}:${v}`).join(",");
    const q: Record<string, string> = { id, escenario: o.escenario, pisos_plataforma: String(o.pisos_plataforma), crujia_m: String(o.crujia_m), mezcla };
    for (const k of ["estrato", "retiro_frontal_m", "retiro_lateral_m", "separacion_torres_m"]) if (o[k] !== "" && o[k] != null) q[k] = String(o[k]);
    return new URLSearchParams(q).toString();
  };
  function abrirVersion(parametros: string) {
    const q = new URLSearchParams(parametros), g = (k: string, d: any = "") => (q.get(k) !== null && q.get(k) !== "" ? Number(q.get(k)) : d);
    const mz: Record<string, number> = {}; for (const x of (q.get("mezcla") ?? "").split(",").filter(Boolean)) { const [t, v] = x.split(":"); mz[t] = Number(v); }
    const nuevo = { ...o, escenario: q.get("escenario") ?? "base", estrato: g("estrato"), pisos_plataforma: g("pisos_plataforma", 0), crujia_m: g("crujia_m", 7.6),
      estudio: mz.estudio ?? 0, a1: mz["1A"] ?? 0, a2: mz["2A"] ?? 0, a3: mz["3A"] ?? 0, retiro_frontal_m: g("retiro_frontal_m"), retiro_lateral_m: g("retiro_lateral_m"), separacion_torres_m: g("separacion_torres_m") };
    setO(nuevo);
    setNumIni({ costo_lote: q.get("costo_lote") ? Number(q.get("costo_lote")) / 1e6 : "", precio_m2: q.get("precio_m2") ? Number(q.get("precio_m2")) / 1e6 : "", absorcion_mes: q.get("absorcion_mes") ?? "" });
    generar(new URLSearchParams({ ...Object.fromEntries(q.entries()), id }).toString());
  }
  async function generar(consulta?: string) {
    setCargando(true);
    try { const j = await (await fetch(`/api/cabida?${consulta ?? qs()}`)).json(); setM(j); if (j.disponible && j.mapa) anteMapa?.(j.mapa); }
    catch (e) { setM({ disponible: false, mensaje: (e as Error).message }); } finally { setCargando(false); }
  }
  const campo = (k: string, t: string, paso = 1, ph = "") => (
    <div className="campo"><label>{t}</label><input className="entrada" type="number" step={paso} placeholder={ph} value={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.value === "" ? "" : Number(e.target.value) })} /></div>);
  const r = m?.resumen;
  const sumaMezcla = Number(o.estudio || 0) + Number(o.a1 || 0) + Number(o.a2 || 0) + Number(o.a3 || 0);
  return (
    <Seccion titulo="Anteproyecto esquemático (planos, 3D y Excel)">
      <div className="nota">Implanta torres según la norma del municipio, distribuye apartamentos con muros, puertas, ventanas y amoblamiento, dimensiona el punto fijo (NSR-10), arma el primer piso y los sótanos, y entrega planchas DXF y PDF con rótulo, modelo 3D georreferenciado y cuadro de áreas en Excel.</div>
      <div className="campo"><label>Escenario de norma</label>
        <div className="segmento">{[["conservador", "Conservador"], ["base", "Base"], ["maximo", "Máximo"]].map(([k, t]) => <button key={k} className={o.escenario === k ? "on" : ""} onClick={() => setO({ ...o, escenario: k })}>{t}</button>)}</div>
      </div>
      <div className="campo"><label>Mezcla de apartamentos (%) {sumaMezcla !== 100 && <span className="nota">· suma {sumaMezcla} %, se normaliza</span>}</label>
        <div className="fila cuatro">{campo("estudio", "Apartaestudio")}{campo("a1", "1 alcoba")}{campo("a2", "2 alcobas")}{campo("a3", "3 alcobas")}</div>
      </div>
      <div className="fila">{campo("estrato", "Estrato (parqueaderos)", 1, "automático")}{campo("pisos_plataforma", "Pisos de plataforma")}</div>
      <details className="avanzado"><summary>Ajustes avanzados (por defecto, la norma del municipio)</summary>
        <div className="fila">{campo("retiro_frontal_m", "Retiro frontal (m)", 0.5, "norma")}{campo("retiro_lateral_m", "Retiro lateral (m)", 0.5, "norma")}</div>
        <div className="fila">{campo("separacion_torres_m", "Separación entre torres (m)", 0.5, "norma")}{campo("crujia_m", "Profundidad de apartamento (m)", 0.1)}</div>
      </details>
      <Versiones id={id} refresco={refresco} abrir={abrirVersion} />
      <button className="btn btn-primario btn-bloque" disabled={cargando} onClick={() => generar()}>{cargando ? "Diseñando el anteproyecto…" : m ? "Recalcular anteproyecto" : "Generar anteproyecto"}</button>
      {m && !m.disponible && <div className="error">{m.mensaje}</div>}
      {r && (
        <>
          <div className="cifras tres">
            <Cifra v={`${r.torres} torres`} k={`${r.pisos_totales} pisos · ${num(r.altura_m, 1)} m`} />
            <Cifra v={num(r.unidades)} k={`viviendas · ${r.aptos_por_piso} por piso`} />
            <Cifra v={`${r.aprovechamiento_pct} %`} k="de lo que permite la norma" />
          </div>
          <div className="cifras tres">
            <Cifra v={m2(r.area_vendible_m2)} k={`vendibles · eficiencia ${r.eficiencia_planta_pct} %`} />
            <Cifra v={`${r.sotanos} sótanos`} k={`${num(r.parqueaderos_dibujados)} parqueaderos (norma ${num(r.parqueaderos_exigidos)})`} />
            <Cifra v={`${r.punto_fijo.escaleras} esc. · ${r.punto_fijo.ascensores} asc.`} k={r.punto_fijo.a_prueba_de_humo ? "escalera a prueba de humo" : "punto fijo"} />
          </div>
          <div className="nota">{r.por_tipologia.map((x: any) => `${x.tipologia}: ${x.unidades} (${x.pct} %, ${num(x.area_promedio_m2, 1)} m²)`).join(" · ")}</div>
          <div className="nota">Norma: {m.norma.fuente}. Retiros: frontal {m.norma.frontal} m, lateral {m.norma.lateral} m, fondo {m.norma.fondo} m, entre torres {m.norma.entre_torres} m. Equipamiento {num(r.obligaciones.equipamiento_en_sitio_m2)} m² en sitio · {r.obligaciones.viviendas_adaptables} viviendas adaptables.</div>
          <div className="acciones">
            <button className="btn btn-primario" onClick={() => setVer("planchas")}>Ver planos ({m.planchas.length} planchas)</button>
            <button className="btn btn-primario" onClick={() => setVer("3d")}>Ver en 3D</button>
            <button className="btn btn-borde" onClick={() => anteMapa?.(m.mapa)}>Ver en el mapa</button>
          </div>
          <div className="nota">En el mapa: torres en 3D y la planta tipo por tipología (<span style={{ color: "#f2c94c" }}>■</span> estudio <span style={{ color: "#56ccf2" }}>■</span> 1 alc. <span style={{ color: "#6fcf97" }}>■</span> 2 alc. <span style={{ color: "#f2994a" }}>■</span> 3 alc.); clic en un apartamento para ver su área.</div>
          <table className="tabla">
            <thead><tr><th>Tipología</th><th>Unidades</th><th>Área prom.</th><th>Mezcla</th></tr></thead>
            <tbody>{r.por_tipologia.map((x: any) => <tr key={x.clave}><td>{x.tipologia}</td><td>{x.unidades}</td><td>{num(x.area_promedio_m2, 1)} m²</td><td>{x.pct} %</td></tr>)}
              <tr><td><b>Total</b></td><td><b>{r.unidades}</b></td><td colSpan={2}>{m2(r.area_vendible_m2)} vendibles</td></tr></tbody>
          </table>
          <table className="tabla">
            <tbody>
              <tr><td>Construido sobre rasante</td><td>{m2(r.area_construida_sobre_rasante_m2)}</td></tr>
              <tr><td>Construible según norma</td><td>{m2(r.area_construible_norma_m2)} ({r.aprovechamiento_pct} %)</td></tr>
              <tr><td>Índices resultantes</td><td>IC {num(r.indice_construccion, 2)} · IO {num(r.indice_ocupacion, 2)}</td></tr>
              <tr><td>Área común por piso</td><td>{m2(r.area_comun_por_piso_m2)}</td></tr>
              <tr><td>Sótanos</td><td>{r.sotanos} · {m2(r.area_sotanos_m2)} · {r.depositos} depósitos</td></tr>
              <tr><td>Rampa</td><td>{Math.round(r.rampa.pendiente * 100)} % · {num(r.rampa.largo_m, 1)} m</td></tr>
            </tbody>
          </table>
          <div className="acciones">
            <a className="btn btn-primario" href={`/api/cabida?${qs()}&formato=zip`}>Descargar todo (ZIP)</a>
          </div>
          <PanelNumeros key={JSON.stringify(numIni)} inicial={numIni ?? undefined} id={id} onGuardada={() => setRefresco((x) => x + 1)} qs={qs()} usarMezcla={(x, sup) => { const nuevo = { ...o, estudio: x.estudio, a1: x["1A"], a2: x["2A"], a3: x["3A"] }; setO(nuevo); if (sup) setNumIni({ ...sup }); setM(null); anteMapa?.(null); }} />
          <div className="acciones">
            <a className="btn btn-borde" href={`/api/cabida?${qs()}&formato=pdf`}>Planchas PDF</a>
            <a className="btn btn-borde" href={`/api/cabida?${qs()}&formato=dxf`}>Planos DXF</a>
            <a className="btn btn-borde" href={`/api/cabida?${qs()}&formato=dxf3d`}>Modelo 3D DXF</a>
            <a className="btn btn-borde" href={`/api/cabida?${qs()}&formato=xlsx`}>Excel de áreas</a>
          </div>
          <div className="nota">{m.aviso} Para DWG: abrir el DXF en AutoCAD o BricsCAD y guardar como DWG.</div>
        </>
      )}
      {ver === "3d" && m?.disponible && <Anteproyecto3D escena={m.escena} onCerrar={() => setVer(null)} />}
      {ver === "planchas" && m?.disponible && <VisorPlanchas qs={qs()} planchas={m.planchas} onCerrar={() => setVer(null)} />}
    </Seccion>
  );
}

/* ───────────── Fachada (Google Street View) ───────────── */
function PanelFachada({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [giro, setGiro] = useState(0);
  useEffect(() => { setD(null); setGiro(0); fetch(`/api/fachada?id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setD).catch(() => setD({ disponible: false })); }, [id]);
  if (!d) return <Seccion titulo="Fachada (Street View)"><div className="cargando-panel"><span className="giro" />Buscando la vista de calle…</div></Seccion>;
  if (!d.disponible) return <Seccion titulo="Fachada (Street View)" abierta={false}><div className="nota">{d.motivo ?? "Sin vista de calle para este lote."}</div></Seccion>;
  const h = (d.heading + giro + 360) % 360;
  return (
    <Seccion titulo="Fachada (Street View)" extra={d.fecha ? <span className="nota">Imagen de {d.fecha}</span> : null}>
      <img className="fachada" src={`/api/fachada?id=${encodeURIComponent(id)}&img=1&heading=${h}`} alt="Vista de calle del lote" />
      <div className="acciones">
        <button className="btn btn-borde" onClick={() => setGiro(giro - 60)}>↶ Girar</button>
        <button className="btn btn-borde" onClick={() => setGiro(giro + 60)}>Girar ↷</button>
        <a className="btn btn-borde" href={d.abrir} target="_blank" rel="noreferrer">Abrir en Street View</a>
      </div>
      <div className="nota">{d.atribucion}. La imagen puede tener varios años: confírmela en visita.</div>
    </Seccion>
  );
}

/* ───────────── Topografía ───────────── */
function PerfilTerreno({ perfil, volumen }: { perfil: { d: number; z: number }[]; volumen?: number | null }) {
  if (perfil.length < 3) return null;
  const W = 560, H = 190, P = 34;
  const dMax = perfil[perfil.length - 1].d || 1;
  const zMin = Math.min(...perfil.map((p) => p.z)), zMaxT = Math.max(...perfil.map((p) => p.z));
  const zTop = zMaxT + (volumen ?? 0) + 2, zBot = zMin - 2;
  // Escala vertical igual a la horizontal cuando cabe (sin exagerar la pendiente); si no, se ajusta.
  const kx = (W - 2 * P) / dMax, kz = Math.min(kx, (H - 2 * P) / (zTop - zBot));
  const X = (d: number) => P + d * kx, Y = (z: number) => H - P - (z - zBot) * kz;
  const linea = perfil.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.z).toFixed(1)}`).join(" ");
  const media = perfil.reduce((s, p) => s + p.z, 0) / perfil.length;
  const exagerado = kz < kx * 0.999;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="perfil-svg" role="img" aria-label="Perfil del terreno">
      <path d={`${linea} L${X(dMax)},${H - P} L${X(0)},${H - P} Z`} fill="var(--terreno, #d9cbb0)" opacity="0.7" />
      <path d={linea} fill="none" stroke="#7a5c2e" strokeWidth="2" />
      {volumen ? <rect x={X(dMax * 0.2)} y={Y(media + volumen)} width={X(dMax * 0.8) - X(dMax * 0.2)} height={Y(media) - Y(media + volumen)} fill="#6c4de7" opacity="0.55" /> : null}
      <line x1={X(0)} x2={X(dMax)} y1={Y(media)} y2={Y(media)} stroke="#6c4de7" strokeDasharray="4 3" strokeWidth="1" />
      <text x={P} y={14} fontSize="11" fill="currentColor">{Math.round(zMaxT)} m s.n.m.</text>
      <text x={P} y={H - 8} fontSize="11" fill="currentColor">0 m</text>
      <text x={W - P} y={H - 8} fontSize="11" fill="currentColor" textAnchor="end">{Math.round(dMax)} m · {exagerado ? "altura exagerada" : "escala real"}</text>
    </svg>
  );
}

function PanelTopografia({ id }: { id: string }) {
  const [d, setD] = useState<any>(null);
  const [vol, setVol] = useState<number | null>(null);
  useEffect(() => {
    setD(null); setVol(null);
    fetch(`/api/analisis/topografia?id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setD).catch(() => setD({ disponible: false, motivo: "No se pudo calcular" }));
    fetch(`/api/analisis/volumen?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((v) => setVol(v?.volumenes?.find((x: any) => x.clave === "base")?.altura_m ?? null)).catch(() => {});
  }, [id]);
  if (!d) return <Seccion titulo="Topografía"><div className="cargando-panel"><span className="giro" />Leyendo el modelo del terreno…</div></Seccion>;
  if (!d.disponible) return <Seccion titulo="Topografía" abierta={false}><div className="nota">{d.motivo}</div></Seccion>;
  const mt = d.movimiento_tierras;
  return (
    <Seccion titulo="Topografía" extra={<span className="etiqueta">{d.clase}</span>}>
      <div className="cifras tres">
        <Cifra v={`${num(d.pendiente_pct, 1)} %`} k={`pendiente media${d.cae_hacia ? ` · cae hacia el ${d.cae_hacia}` : ""}`} />
        <Cifra v={`${num(d.desnivel_m, 1)} m`} k="desnivel en el lote" />
        <Cifra v={d.via ? d.via.lectura : "—"} k={d.via ? `frente a ${d.via.nombre}` : "relación con la vía"} />
      </div>
      <PerfilTerreno perfil={d.perfil ?? []} volumen={vol} />
      <div className="nota">Corte en la dirección de la pendiente; en morado, el edificio base sobre la plataforma a la cota media.</div>
      <ul className="lista-simple">
        <li>Pendiente máxima local: {num(d.pendiente_max_local_pct, 0)} %.</li>
        <li>{d.sotanos}</li>
        <li>Plataforma única a {num(mt.cota_plataforma_m, 1)} m: unos {num(mt.corte_m3)} m³ de corte y {num(mt.lleno_m3)} m³ de lleno (orden de magnitud).</li>
      </ul>
      <div className="nota">Fuente: {d.fuente.nombre} ({d.fuente.resolucion_m} m). {d.fuente.advertencia ?? ""} {d.aviso}</div>
    </Seccion>
  );
}

/* ───────────── Edificio posible en 3D ───────────── */
function lectura(pisos: number, e: any) {
  const p90 = e.pisos_p90 ?? e.pisos_mediana;
  if (pisos <= p90) return `Los ${pisos} pisos están dentro de lo que ya hay alrededor.`;
  if (e.pisos_max != null && pisos <= e.pisos_max) return `Los ${pisos} pisos sobresalen del entorno típico, aunque ya hay edificios de hasta ${e.pisos_max} pisos cerca.`;
  return `Con ${pisos} pisos sería el edificio más alto a la redonda: revise vistas, sombras y la reacción de vecinos.`;
}

function Panel3D({ id, ver3D, google3D }: { id: string; ver3D: (d: any, clave: string) => void; google3D: (d: any, clave: string) => void }) {
  const [clave, setClave] = useState("base");
  const [tipo, setTipo] = useState<"plataforma" | "torres">("plataforma");
  const [d, setD] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  const [ent, setEnt] = useState<any>(null);
  useEffect(() => { setEnt(null); fetch(`/api/analisis/entorno?id=${encodeURIComponent(id)}`).then((r) => r.json()).then(setEnt).catch(() => {}); }, [id]);
  async function cargar(t = tipo) {
    setCargando(true);
    try { const j = await (await fetch(`/api/analisis/volumen?id=${encodeURIComponent(id)}${t === "torres" ? "&ocupacion=0.3" : ""}`)).json(); setD(j); return j; }
    finally { setCargando(false); }
  }
  useEffect(() => { setD(null); }, [id]);
  const v = d?.volumenes?.find((x: any) => x.clave === clave);
  return (
    <Seccion titulo="Edificio posible en 3D">
      <div className="fila">
        <div className="campo"><label>Escenario</label>
          <div className="segmento">{[["conservador", "Conservador"], ["base", "Base"], ["maximo", "Máximo"]].map(([k, t]) => <button key={k} className={clave === k ? "on" : ""} onClick={() => { setClave(k); if (d) ver3D({ ...d, entorno: ent?.geojson }, k); }}>{t}</button>)}</div>
        </div>
        <div className="campo"><label>Tipología</label>
          <div className="segmento">{[["plataforma", "Plataforma"], ["torres", "Torres"]].map(([k, t]) => <button key={k} className={tipo === k ? "on" : ""} onClick={async () => { setTipo(k as any); if (d) { const j = await cargar(k as any); ver3D({ ...j, entorno: ent?.geojson }, clave); } }}>{t}</button>)}</div>
        </div>
      </div>
      {v && <div className="cifras tres"><Cifra v={`${v.pisos} pisos`} k={`${num(v.altura_m, 1)} m de altura`} /><Cifra v={m2(v.huella_m2)} k="huella" /><Cifra v={num(v.unidades)} k="unidades" /></div>}
      {ent && <div className="nota">Entorno a 150 m (catastro): la mitad de los predios tiene hasta {ent.pisos_mediana} pisos; el más alto, {ent.pisos_max}. {v ? lectura(v.pisos, ent) : ""}</div>}
      <div className="acciones">
        <button className="btn btn-primario" disabled={cargando} onClick={async () => ver3D({ ...(d ?? (await cargar())), entorno: ent?.geojson }, clave)}>{cargando ? "Calculando…" : "Ver en el mapa 3D"}</button>
        <a className="btn btn-borde" href={`/api/kmz?id=${encodeURIComponent(id)}${tipo === "torres" ? "&ocupacion=0.3" : ""}`}>Google Earth (KMZ)</a>
        <button className="btn btn-borde" disabled={cargando} onClick={async () => google3D(d ?? (await cargar()), clave)}>Vista fotorrealista</button>
      </div>
      <div className="nota">{d?.nota ?? "Volumen esquemático de lo que permite la norma (huella × pisos); no es un diseño arquitectónico."} {d?.tipologia ? `Tipología: ${d.tipologia}.` : ""}</div>
    </Seccion>
  );
}

/* ───────────── Comparar lotes ───────────── */
export function PanelComparar({ ids, quitar, abrir }: { ids: string[]; quitar: (id: string) => void; abrir: (id: string) => void }) {
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { if (ids.length >= 2) comparar(); else setR(null); }, [ids.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  async function comparar() {
    setCargando(true); setR(null);
    try { setR(await (await fetch("/api/analisis/comparar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lotes: ids.map((id) => ({ id })) }) })).json()); }
    finally { setCargando(false); }
  }
  if (ids.length < 2) return (
    <>
      <div className="pasos-guia">
        {[
          ["Elige un lote", "Haz clic en un predio del mapa y, en la ventana que aparece, pulsa “+ Comparar”.", ids.length >= 1],
          ["Agrega otro lote", "Repite con un segundo lote (puedes llevar hasta 5). Los verás en la bandeja de abajo del mapa.", ids.length >= 2],
          ["Mira la comparación", "Aparece aquí sola: unidades, semáforo, cambio POT 2026, cesiones y valor residual.", false],
        ].map(([t, d, hecho], i) => (
          <div key={i} className={`paso ${hecho ? "hecho" : ""}`}>
            <span className="numero">{hecho ? "✓" : i + 1}</span>
            <div><b>{t as string}</b><p>{d as string}</p></div>
          </div>
        ))}
      </div>
      {ids.length === 1 && <div className="etiquetas"><span className="etiqueta chip" onClick={() => abrir(ids[0])}>{ids[0]} <b onClick={(e) => { e.stopPropagation(); quitar(ids[0]); }}>×</b></span></div>}
    </>
  );
  const lotes = (r?.lotes ?? []).filter((l: any) => l.encontrado);
  const fila = (k: string, f: (l: any) => React.ReactNode) => <tr key={k}><td>{k}</td>{lotes.map((l: any) => <td key={l.predio}>{f(l)}</td>)}</tr>;
  return (
    <>
      <div className="etiquetas">{ids.map((id) => <span key={id} className="etiqueta chip" onClick={() => abrir(id)}>{id} <b onClick={(e) => { e.stopPropagation(); quitar(id); setR(null); }}>×</b></span>)}</div>
      {cargando && <div className="cargando-panel"><span className="giro" />Comparando {ids.length} lotes…</div>}
      {r?.error && <div className="error">{r.error}</div>}
      {lotes.length > 0 && (
        <div className="tarjeta" style={{ overflowX: "auto" }}>
          <table className="tabla comparacion">
            <thead><tr><th></th>{lotes.map((l: any) => <th key={l.predio} className="clicable" onClick={() => abrir(l.predio)}>{l.barrio}<div className="nota">{l.predio}</div></th>)}</tr></thead>
            <tbody>
              {fila("Semáforo", (l) => <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz={l.semaforo} />{l.semaforo}</span>)}
              {fila("Área lote", (l) => m2(l.area_lote_m2))}
              {fila("Área útil", (l) => m2(l.area_util_m2))}
              {fila("Tratamiento", (l) => l.tratamiento)}
              {fila("Unidades conservador", (l) => num(l.unidades.conservador))}
              {fila("Unidades base", (l) => <b>{num(l.unidades.base)}</b>)}
              {fila("Unidades máximo", (l) => num(l.unidades.maximo))}
              {fila("Pisos (base)", (l) => num(l.pisos_base))}
              {fila("Cambio POT 2026", (l) => <Cambio v={l.cambio_pot_2026} />)}
              {fila("Cesión de suelo", (l) => m2(l.cesion_espacio_publico_m2))}
              {fila("Valor residual $/m²", (l) => millones(l.valor_residual_m2))}
              {fila("Referencia $/m²", (l) => millones(l.valor_suelo_referencia_m2))}
            </tbody>
          </table>
        </div>
      )}
      {r?.destacados && (
        <div className="tarjeta">
          <h4>Destacados</h4>
          <div className="sub">Más unidades: <b>{r.destacados.mas_unidades}</b> · Mayor valor residual: <b>{r.destacados.mayor_valor_residual_m2}</b> · Mayor área útil: <b>{r.destacados.mayor_area_util}</b></div>
        </div>
      )}
    </>
  );
}

/* ───────────── Cartera ───────────── */
export function PanelCartera({ pintar, abrir }: { pintar: (l: any[]) => void; abrir: (id: string) => void }) {
  const [texto, setTexto] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [opts, setOpts] = useState({ nombre: "", tipo_vivienda: "NO VIS", area_unidad_m2: 65 });
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  async function analizar() {
    setCargando(true); setR(null);
    try {
      const body: any = { nombre: opts.nombre || undefined, tipo_vivienda: opts.tipo_vivienda, area_unidad_m2: opts.area_unidad_m2 };
      if (archivo) {
        if (/\.kmz$/i.test(archivo.name)) {
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await archivo.arrayBuffer());
          const k = Object.keys(zip.files).find((n) => /\.kml$/i.test(n));
          if (!k) throw new Error("El KMZ no trae un .kml");
          body.kml = await zip.files[k].async("string");
        } else body.kml = await archivo.text();
      } else {
        const { interpretarBusqueda } = await import("./comunes");
        body.lotes = texto.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => {
          const [ref, nombre] = l.split(/\s*[;|\t]\s*/);
          return { ...interpretarBusqueda(ref), nombre: nombre || ref };
        });
      }
      const j = await (await fetch("/api/analisis/cartera", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json();
      setR(j);
      if (!j.error) pintar(j.ranking.map((f: any) => ({ id: f.predio, lat: f.lat, lon: f.lon })));
    } catch (e) { setR({ error: (e as Error).message }); } finally { setCargando(false); }
  }
  return (
    <>
      <div className="tarjeta">
        <div className="campo"><label>Nombre de la cartera</label><input className="entrada" placeholder="p. ej. Lotes estructuración Q4" value={opts.nombre} onChange={(e) => setOpts({ ...opts, nombre: e.target.value })} /></div>
        <label className="soltar">
          <input type="file" accept=".kmz,.kml" hidden onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          <b>{archivo ? archivo.name : "Sube un KMZ / KML de Google Earth"}</b>
          <span className="nota">{archivo ? "Listo para analizar" : "Cada punto o polígono es un lote (hasta 250)"}</span>
        </label>
        {!archivo && (
          <div className="campo">
            <label>…o pega la lista (uno por línea: CBML, matrícula, dirección o coordenada; opcional “; nombre”)</label>
            <textarea className="entrada" rows={5} placeholder={"15090030008; Cristo Rey\n001-728976\n6.2032, -75.5826; Lote Google Maps"} value={texto} onChange={(e) => setTexto(e.target.value)} />
          </div>
        )}
        {archivo && <button className="btn btn-borde" onClick={() => setArchivo(null)}>Quitar archivo</button>}
        <div className="fila">
          <div className="campo"><label>Producto</label><div className="segmento">{["NO VIS", "VIS"].map((v) => <button key={v} className={opts.tipo_vivienda === v ? "on" : ""} onClick={() => setOpts({ ...opts, tipo_vivienda: v, area_unidad_m2: v === "VIS" ? 50 : 65 })}>{v}</button>)}</div></div>
          <div className="campo"><label>m² por unidad</label><input className="entrada" type="number" value={opts.area_unidad_m2} onChange={(e) => setOpts({ ...opts, area_unidad_m2: Number(e.target.value) })} /></div>
        </div>
      </div>
      <button className="btn btn-primario btn-bloque" disabled={cargando || (!archivo && !texto.trim())} onClick={analizar}>{cargando ? "Analizando lote por lote…" : "Analizar cartera"}</button>
      {r?.error && <div className="error">{r.error}</div>}
      {r && !r.error && (
        <>
          <div className="tarjeta destacada">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
              <div><h3 style={{ fontSize: 17 }}>{r.resumen.encontrados} de {r.resumen.lotes} lotes</h3><div style={{ fontSize: 12, opacity: 0.85 }}>{num(r.resumen.unidades_base_total)} unidades posibles en total</div></div>
              <div style={{ display: "flex", gap: 6 }}><a className="btn btn-primario" href={`/api/estudio/${r.id}/xlsx`}>⤓ Excel</a><a className="btn btn-borde" href={`/api/estudio/${r.id}/kmz`} title="KMZ con carpetas, volúmenes y recorrido para comité">Google Earth</a><a className="btn btn-borde" href={`/api/estudio/${r.id}/vivo`} title="Para Google Earth Pro: se actualiza sola cada 24 h">Cartera viva</a></div>
            </div>
            <div className="cifras tres">
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="verde" />{r.resumen.verdes}</span>} k="verdes" />
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="amarillo" />{r.resumen.amarillos}</span>} k="amarillos" />
              <Cifra v={<span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz="rojo" />{r.resumen.rojos}</span>} k="rojos" />
            </div>
          </div>
          <div className="tarjeta" style={{ overflowX: "auto" }}>
            <table className="tabla">
              <thead><tr><th>#  Lote</th><th>Pts</th><th>Und base</th><th>POT 2026</th><th>$/m² resid.</th></tr></thead>
              <tbody>{r.ranking.map((f: any, i: number) => (
                <tr key={f.predio + i} className="clicable" onClick={() => abrir(f.predio)}>
                  <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><Luz luz={f.semaforo} />{i + 1}. {f.nombre}</span><div className="nota">{f.carpeta ? `${f.carpeta} · ` : ""}{f.barrio} · {m2(f.englobe?.area_lotes_m2 ?? f.area_lote_m2)}{f.englobe ? ` · englobe de ${f.englobe.predios} predios` : ""}</div>{f.notas && <div className="nota" style={{ fontStyle: "italic" }}>“{f.notas}”</div>}</td>
                  <td>{f.puntaje}</td><td>{num(f.unidades.base)}</td><td><Cambio v={f.cambio_pot_2026} /></td><td>{millones(f.valor_residual_m2)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {r.no_encontrados?.length > 0 && <div className="alerta">No encontrados: {r.no_encontrados.join(", ")}</div>}
          <div className="nota">{r.metodo}</div>
        </>
      )}
    </>
  );
}

/* ───────────── Zona dibujada ───────────── */
export function PanelZona({ vertices, dibujar, borrar, onEstudio }: { vertices: [number, number][]; dibujar: () => void; borrar: () => void; onEstudio: () => void }) {
  const [r, setR] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  async function analizar() {
    setCargando(true); setR(null);
    try { setR(await (await fetch("/api/analisis/zona", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ poligono: vertices }) })).json()); }
    finally { setCargando(false); }
  }
  return (
    <>
      <div className="tarjeta">
        <div className="sub">{vertices.length >= 3 ? `Zona de ${vertices.length} vértices lista.` : "Dibuja la zona en el mapa (mínimo 3 puntos)."}</div>
        <div className="acciones">
          <button className="btn btn-oscuro" onClick={dibujar}>✎ Dibujar zona</button>
          {vertices.length > 0 && <button className="btn btn-borde" onClick={() => { borrar(); setR(null); }}>Borrar</button>}
        </div>
      </div>
      <button className="btn btn-primario btn-bloque" disabled={vertices.length < 3 || cargando} onClick={analizar}>{cargando ? "Analizando la zona…" : "Analizar zona"}</button>
      {r?.error && <div className="error">{r.error}</div>}
      {r && !r.error && (
        <>
          <div className="tarjeta destacada">
            <h3 style={{ fontSize: 17 }}>{num(r.area_zona_ha, 1)} ha · {num(r.suelo.predios)} predios</h3>
            <div className="cifras">
              <Cifra v={num(r.suelo.lotes_con_potencial)} k="lotes con potencial" />
              <Cifra v={m2(r.suelo.area_lotes_m2)} k="área de lotes" />
            </div>
          </div>
          <Seccion titulo="Norma">
            <div className="cifras">
              <Cifra v={m2(r.norma.area_construible_2014_m2)} k="construible POT 2014" />
              <Cifra v={num(r.norma.viviendas_2014)} k="viviendas POT 2014" />
              {r.norma.pot_2026_preliminar && <Cifra v={m2(r.norma.pot_2026_preliminar.area_construible_m2)} k="construible proyecto 2026" />}
              {r.norma.pot_2026_preliminar && <Cifra v={<Cambio v={r.norma.pot_2026_preliminar.cambio_area_construible} />} k="cambio de aprovechamiento" />}
            </div>
            <div className="etiquetas">{(r.suelo.tratamientos ?? []).map((t: any) => <span key={t.tratamiento} className="etiqueta">{t.tratamiento} · {t.predios}</span>)}</div>
          </Seccion>
          <Seccion titulo="Competencia (Galería)">
            {r.competencia_galeria ? (
              <div className="cifras">
                <Cifra v={num(r.competencia_galeria.proyectos)} k="proyectos" />
                <Cifra v={num(r.competencia_galeria.ventas_mes, 1)} k="unidades vendidas al mes" />
                <Cifra v={`${num(r.competencia_galeria.oferta_disponible)} + ${num(r.competencia_galeria.oferta_por_lanzar)}`} k="oferta + por lanzar" />
                <Cifra v={num(r.competencia_galeria.meses_inventario, 1)} k="meses de inventario" />
                <Cifra v={millones(r.competencia_galeria.precio_m2_mediana)} k="precio por m² mediano" />
              </div>
            ) : <div className="sub">Sin proyectos de Galería ubicados dentro de la zona.</div>}
          </Seccion>
          {r.mercado_usados && (
            <Seccion titulo="Mercado de usados (Fynder)">
              <div className="cifras">
                <Cifra v={num(r.mercado_usados.apartamentos_en_venta)} k="apartamentos en venta" />
                <Cifra v={millones(r.mercado_usados.precio_m2_mediana)} k="precio por m² típico" />
                <Cifra v={num(r.mercado_usados.compradores_90d)} k="compradores buscando (90 d)" />
                <Cifra v={millones(r.mercado_usados.presupuesto_mediano)} k="presupuesto típico" />
              </div>
            </Seccion>
          )}
          <button className="btn btn-borde btn-bloque" onClick={onEstudio}>Hacer estudio de competencia con esta zona</button>
        </>
      )}
    </>
  );
}

/* ───────────── POT 2026: cambio y novedades ───────────── */
export function PanelPot({ abrir, verCapa }: { abrir: (id: string, lon?: number, lat?: number) => void; verCapa: () => void }) {
  const [agrupar, setAgrupar] = useState<"barrio" | "poligono">("barrio");
  const [r, setR] = useState<any>(null);
  const [nov, setNov] = useState<any>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => { fetch("/api/analisis/novedades?dias=90").then((x) => x.json()).then(setNov).catch(() => {}); }, []);
  async function cargar(a = agrupar) {
    setCargando(true);
    try { setR(await (await fetch("/api/analisis/cambio_pot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agrupar: a, limite: 12 }) })).json()); }
    finally { setCargando(false); }
  }
  useEffect(() => { cargar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = r?.resumen;
  return (
    <>
      <div className="explica-pot">
        <p><b>¿Qué es?</b> El Concejo de Medellín aprobó el 5 de noviembre de 2026 la revisión del POT (Proyecto de Acuerdo 104 de 2026). Cambia el índice de construcción, la densidad y los derechos que se pueden comprar en cada polígono.</p>
        <p><b>¿Por qué importa?</b> Un lote vale por lo que se puede construir en él: si su norma sube, vale más; si baja, vale menos. Aquí ves quién gana y quién pierde.</p>
        <p className="nota">Cifras del proyecto de acuerdo v3 (julio de 2026), preliminares hasta que se publique el texto final y la cartografía. No incluye la Zona 1.</p>
      </div>
      {s && (
        <div className="cifras">
          <Cifra v={<span style={{ color: "#3f8f4a" }}>{num(s.predios_que_suben)}</span>} k="predios suben su índice" />
          <Cifra v={<span style={{ color: "#c0392b" }}>{num(s.predios_que_bajan)}</span>} k="predios bajan su índice" />
          <Cifra v={<span style={{ color: s.m2_construibles_netos >= 0 ? "#3f8f4a" : "#c0392b" }}>{s.m2_construibles_netos >= 0 ? "+" : ""}{num(s.m2_construibles_netos / 1e6, 1)} M m²</span>} k="área construible base (neto)" />
          <Cifra v={<span style={{ color: s.viviendas_netas >= 0 ? "#3f8f4a" : "#c0392b" }}>{s.viviendas_netas >= 0 ? "+" : ""}{num(s.viviendas_netas)}</span>} k="viviendas por densidad (neto)" />
        </div>
      )}
      <div className="acciones">
        <div className="segmento" style={{ flex: 1 }}>{(["barrio", "poligono"] as const).map((v) => <button key={v} className={agrupar === v ? "on" : ""} onClick={() => { setAgrupar(v); cargar(v); }}>{v === "barrio" ? "Por barrio" : "Por polígono"}</button>)}</div>
        <button className="btn btn-oscuro" onClick={verCapa}>🗺 Colorear el mapa</button>
      </div>
      {cargando && <div className="cargando-panel"><span className="giro" />Comparando POT 2014 y 2026…</div>}
      {r && !r.error && (
        <>
          <Seccion titulo="Donde más sube el aprovechamiento">
            <table className="tabla"><thead><tr><th>{agrupar === "barrio" ? "Barrio" : "Polígono"}</th><th>Predios</th><th>m² extra</th><th>Cambio</th></tr></thead>
              <tbody>{r.mas_ganan.map((g: any) => <tr key={g.grupo}><td>{g.grupo}</td><td>{num(g.predios)}</td><td>{num(g.diferencia_m2)}</td><td><Cambio v={g.cambio} /></td></tr>)}</tbody></table>
          </Seccion>
          {r.mas_pierden.length > 0 && (
            <Seccion titulo="Donde baja" abierta={false}>
              <table className="tabla"><thead><tr><th>{agrupar === "barrio" ? "Barrio" : "Polígono"}</th><th>Predios</th><th>m²</th><th>Cambio</th></tr></thead>
                <tbody>{r.mas_pierden.map((g: any) => <tr key={g.grupo}><td>{g.grupo}</td><td>{num(g.predios)}</td><td>{num(g.diferencia_m2)}</td><td><Cambio v={g.cambio} /></td></tr>)}</tbody></table>
            </Seccion>
          )}
          <Seccion titulo="Lotes que más ganan (≥ 1.000 m²)">
            <ul className="lista">{r.lotes_que_mas_ganan.map((l: any) => (
              <li key={l.id} className="clicable" onClick={() => abrir(l.id, Number(l.lon), Number(l.lat))}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span className="n">{l.barrio}</span><b style={{ color: "#3f8f4a" }}>+{num(l.diferencia_m2)} m²</b></div>
                <span className="sub">{m2(l.area_lote)} · IC {num(l.ic_2014, 1)} → {num(l.ic_2026, 1)} · {l.codigo_2026}</span>
              </li>))}</ul>
          </Seccion>
          <div className="nota">{r.nota} {r.estado}</div>
        </>
      )}
      <Seccion titulo={`Novedades normativas${nov?.novedades ? ` (${nov.novedades.length})` : ""}`} abierta={false}>
        {nov?.ultima_revision && <div className="nota">Última revisión del monitor: {nov.ultima_revision}</div>}
        <ul className="lista">{(nov?.novedades ?? []).slice(0, 25).map((n: any) => (
          <li key={n.url}><a href={n.url} target="_blank" className="n">{n.titulo}</a><span className="sub">{n.publicado} · relevancia {n.relevancia}</span></li>
        ))}</ul>
      </Seccion>
    </>
  );
}

/* ───────────── Estudio de competencia (resultado) y proyecto ───────────── */
export function ResultadoEstudio({ e }: { e: any }) {
  const mz = e.metricas_zona ?? {};
  const i9 = e.paso9_insumos_recomendacion ?? {};
  const pr = e.paso4_territorio?.predio;
  return (
    <>
      <div className="tarjeta destacada">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 17 }}>{e.estudio}</h3>
            <div style={{ fontSize: 12, opacity: 0.85 }}>Galería corte {e.corte_galeria ?? "—"}{pr?.tratamiento ? ` · ${pr.tratamiento}` : ""}</div>
          </div>
          <a className="btn btn-primario" href={`/api/estudio/${e.id}/xlsx`}>⤓ Excel</a>
        </div>
        <div className="cifras">
          <Cifra v={num(mz.proyectos_en_zona)} k="proyectos en la zona" />
          <Cifra v={num(mz.ventas_mes_zona_promedio_semestre, 1)} k="unidades vendidas al mes" />
          <Cifra v={`${num(mz.oferta_disponible)} + ${num(mz.oferta_por_lanzar)}`} k="oferta actual + por lanzar" />
          <Cifra v={num(mz.meses_de_inventario_con_futura, 1)} k="meses de inventario (con futura)" />
        </div>
      </div>
      {e.paso5_proyectos_a_consultar?.ubicacion_aproximada && <div className="alerta">{e.paso5_proyectos_a_consultar.ubicacion_aproximada}</div>}
      <div className="tarjeta">
        <h4>Competencia directa</h4>
        <table className="tabla">
          <thead><tr><th>Proyecto</th><th>$/m²</th><th>Und/mes</th><th>Vendido</th><th>Oferta</th></tr></thead>
          <tbody>
            {(e.paso8_tabla_resumen ?? []).map((x: any) => (
              <tr key={x.proyecto}>
                <td title={x.proyecto}>{x.proyecto}<div className="nota" style={{ fontWeight: 400 }}>{x.zona} · {x.constructor}</div></td>
                <td>{millones(x.precio_m2)}</td><td>{num(x.ventas_mes_promedio_semestre, 1)}</td>
                <td>{pct(x.pct_vendido)}<div className="barra-pct" style={{ marginTop: 3 }}><i style={{ width: pct(x.pct_vendido) }} /></div></td>
                <td>{num(x.oferta_actual)}<span className="nota"> +{num(x.oferta_futura)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tarjeta">
        <h4>Insumos para recomendar</h4>
        <div className="cifras">
          <Cifra v={i9.area_promedio_objetivo ? `${num(i9.area_promedio_objetivo, 1)} m²` : "—"} k="área promedio objetivo" />
          <Cifra v={`${millones(i9.precio_m2_objetivo_rango?.[0])}–${millones(i9.precio_m2_objetivo_rango?.[1])}`} k="precio por m² objetivo" />
          <Cifra v={num(i9.ritmo_ventas_referencia_mes, 1)} k="ritmo de referencia (und/mes)" />
          <Cifra v={num(i9.unidades_posibles_por_norma)} k="unidades posibles (POT 2014)" />
          {i9.norma_pot_2026_preliminar && <Cifra v={num(i9.norma_pot_2026_preliminar.con_derechos?.unidades_estimadas ?? i9.norma_pot_2026_preliminar.unidades_estimadas)} k="unidades proyecto 2026 (con derechos)" />}
        </div>
        {i9.entrega_predominante && <div className="sub">Entrega predominante en la zona: <b>{i9.entrega_predominante}</b></div>}
      </div>
      <div className="nota">La redacción del territorio, las recomendaciones y la conclusión se completan desde Claude y salen en el Excel.</div>
    </>
  );
}

export function FichaProyecto({ d }: { d: any }) {
  const p = d.proyecto;
  return (
    <>
      <div className="titulo"><h2>{p.nombre}</h2><div className="sub">{p.constructora} · {p.barrio ? `${p.barrio}, ` : ""}{p.municipio}</div></div>
      <div className="tarjeta">
        <h4>Producto</h4>
        <div className="cifras">
          <Cifra v={millones(p.precio_desde)} k="precio desde" /><Cifra v={millones(p.precio_m2_desde)} k="precio por m² desde" />
          <Cifra v={`${m2(p.area_min)} – ${m2(p.area_max)}`} k="áreas" /><Cifra v={p.entrega ?? "—"} k="entrega" />
        </div>
      </div>
      {d.aviso_ubicacion && <div className="alerta">{d.aviso_ubicacion}</div>}
      <div className="tarjeta">
        <h4>Competencia a 1,5 km ({d.competencia_1500m.length})</h4>
        <ul className="lista">{d.competencia_1500m.map((c: any) => <li key={c.id}><span className="n">{c.nombre}</span><span className="sub">{c.constructora} · desde {millones(c.precio_desde)} · a {num(c.distancia_m)} m</span></li>)}</ul>
      </div>
      <div className="nota">{d.atribucion}</div>
    </>
  );
}

/* ───────────── Mi constructora (ADN constructivo) ───────────── */
type CampoADN = [string, string, string?, number?]; // ruta, etiqueta, unidad, escala (millones = 1e6)
const BLOQUES_ADN: [string, string, CampoADN[]][] = [
  ["diseno", "Sistema y diseño", [["diseno.crujia_m", "Profundidad de apartamento", "m"], ["diseno.pasillo_m", "Ancho de pasillo", "m"], ["diseno.altura_piso_m", "Altura piso a piso", "m"],
    ["diseno.altura_primer_piso_m", "Altura primer piso", "m"], ["diseno.largo_max_torre_m", "Largo máximo de torre", "m"], ["diseno.eficiencia_minima_pct", "Eficiencia mínima de planta", "%"],
    ["diseno.plataforma_pisos", "Pisos de plataforma", "pisos"], ["diseno.parqueo_privados_viv", "Parqueaderos privados por vivienda", "und"], ["diseno.parqueo_visitantes_viv", "Visitantes por vivienda", "und"]]],
  ["costos", "Costos", [["costos.directo_m2_sotano", "Directo sótanos", "M/m²", 1e6], ["costos.directo_m2_plataforma", "Directo plataforma", "M/m²", 1e6], ["costos.urbanismo_m2_lote_libre", "Urbanismo (lote libre)", "M/m²", 1e6],
    ["costos.diseno_estudios_pct", "Diseños y estudios", "% directo"], ["costos.interventoria_pct", "Interventoría", "% directo"], ["costos.gerencia_pct", "Gerencia", "% directo"],
    ["costos.honorarios_construccion_pct", "Honorarios de construcción", "% directo"], ["costos.imprevistos_pct", "Imprevistos", "% directo"], ["costos.reembolsables_pct", "Reembolsables y pólizas", "% directo"],
    ["costos.licencias_impuestos_pct", "Licencias e impuestos", "% directo"], ["costos.ventas_publicidad_pct", "Ventas y publicidad", "% ventas"], ["costos.fiducia_pct", "Fiducia", "% ventas"],
    ["costos.sala_ventas_fijo", "Sala de ventas", "M", 1e6], ["costos.compensacion_m2_equipamiento", "Compensación equipamiento", "M/m²", 1e6], ["costos.incremento_costo_anual_pct", "Inflación de costos", "% anual"]]],
  ["ventas", "Ventas", [["ventas.cuota_inicial_pct", "Cuota inicial", "%"], ["ventas.preventa_equilibrio_pct", "Punto de equilibrio", "% preventa"], ["ventas.meses_preventa_antes_obra", "Preventa mínima antes de obra", "meses"],
    ["ventas.incremento_precio_anual_pct", "Incremento de precios", "% anual"], ["ventas.precio_parqueadero_adicional", "Parqueadero adicional", "M", 1e6]]],
  ["obra", "Ritmo de obra", [["obra.dias_por_piso", "Ciclo de estructura", "días/piso"], ["obra.meses_preliminares", "Preliminares", "meses"], ["obra.meses_por_sotano", "Por sótano", "meses"],
    ["obra.meses_acabados", "Acabados", "meses"], ["obra.meses_entre_etapas", "Entre etapas (torres)", "meses"], ["obra.meses_escrituracion", "Escrituración tras entrega", "meses"]]],
  ["financiacion", "Financiación", [["financiacion.credito_constructor_pct_directo", "Crédito constructor", "% directo"], ["financiacion.tasa_ea", "Tasa del crédito", "% E.A."], ["financiacion.tasa_descuento_ea", "Tasa de descuento", "% E.A."]]],
  ["comite", "Comité de inversión", [["comite.margen_minimo_pct", "Margen mínimo", "% ventas"], ["comite.tir_minima_ea", "TIR mínima", "% E.A."], ["comite.lote_max_sobre_ventas_pct", "Lote máximo", "% ventas"]]],
];
const leer = (o: any, ruta: string) => ruta.split(".").reduce((x, k) => x?.[k], o);
const escribir = (o: any, ruta: string, v: any) => { const c = structuredClone(o); const ks = ruta.split("."); let x = c; ks.slice(0, -1).forEach((k) => (x = x[k])); x[ks[ks.length - 1]] = v; return c; };

export function PanelConstructora() {
  const [d, setD] = useState<any>(null);
  const [p, setP] = useState<any>(null);
  const [estado, setEstado] = useState<string | null>(null);
  useEffect(() => { fetch("/api/constructora").then((r) => r.json()).then((j) => { setD(j); setP(j.perfil); }); }, []);
  if (!p) return <div className="cargando-panel"><span className="giro" />Cargando el perfil…</div>;
  const ref = d.referencia;
  async function guardar(restablecer = false) {
    setEstado("Guardando…");
    const r = await (await fetch("/api/constructora", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ perfil: p, restablecer }) })).json();
    if (r.perfil) { setP(r.perfil); setD({ ...d, usa_referencia: false }); setEstado(`Guardado. El anteproyecto y los números de ${r.perfil.nombre} ya usan este perfil.`); } else setEstado(r.error ?? "No se pudo guardar");
  }
  const campo = ([ruta, et, u, k]: CampoADN) => {
    const v = leer(p, ruta), vr = leer(ref, ruta), dif = v !== vr;
    return (
      <div className="campo" key={ruta}><label>{et}{u ? <span className="unidad"> · {u}</span> : null}</label>
        <input className={`entrada ${dif ? "editado" : ""}`} type="number" step="any" value={k ? v / k : v} title={`Referencia: ${k ? vr / k : vr}`}
          onChange={(e) => setP(escribir(p, ruta, e.target.value === "" ? 0 : Number(e.target.value) * (k ?? 1)))} />
      </div>
    );
  };
  const mezcla = (p.diseno.mezcla ?? []) as any[];
  const pctDe = (t: string) => mezcla.find((x) => x.tipologia === t)?.pct ?? 0;
  const ponerMezcla = (t: string, v: number) => setP(escribir(p, "diseno.mezcla", [...["estudio", "1A", "2A", "3A"].map((k) => ({ tipologia: k, pct: k === t ? v : pctDe(k) }))].filter((x) => x.pct > 0)));
  return (
    <>
      <div className={`aviso-adn ${d.usa_referencia ? "ref" : "propio"}`}>
        {d.usa_referencia ? <><b>Usando la referencia de mercado.</b> Ajusta los valores con los de tu constructora y guárdalos: el anteproyecto y los números de todos los usuarios de <b>{d.constructora_id ?? "tu equipo"}</b> pasarán a usarlos.</>
          : <><b>Perfil de {p.nombre}.</b> Lo comparten los usuarios de {d.constructora_id}. Los campos resaltados son distintos a la referencia.</>}
      </div>
      <Seccion titulo="Identidad">
        <div className="fila">
          <div className="campo"><label>Nombre de la constructora</label><input className="entrada" value={p.id === "referencia" ? "" : p.nombre} placeholder="p. ej. Constructora XYZ" onChange={(e) => setP({ ...p, nombre: e.target.value })} /></div>
          <div className="campo"><label>Sistema constructivo</label>
            <select className="entrada" value={p.sistema} onChange={(e) => setP({ ...p, sistema: e.target.value })}>
              <option value="muros_vaciados">Muros vaciados (formaleta industrializada)</option><option value="aporticado">Aporticado en concreto</option>
              <option value="mamposteria_estructural">Mampostería estructural</option><option value="prefabricado">Prefabricado</option></select></div>
        </div>
      </Seccion>
      <Seccion titulo="Mezcla de producto (%)">
        <div className="fila cuatro">{["estudio", "1A", "2A", "3A"].map((t) => <div className="campo" key={t}><label>{t === "estudio" ? "Apartaestudio" : t.replace("A", " alc.")}</label>
          <input className="entrada" type="number" value={pctDe(t)} onChange={(e) => ponerMezcla(t, Number(e.target.value))} /></div>)}</div>
      </Seccion>
      <Seccion titulo="Costo directo por m² construido según altura">
        <table className="tabla"><thead><tr><th>Hasta (pisos)</th><th>$ millones / m²</th><th>Referencia</th></tr></thead>
          <tbody>{p.costos.directo_m2_por_altura.map((x: any, i: number) => (
            <tr key={i}><td><input className="entrada" type="number" value={x.hasta_pisos} onChange={(e) => setP(escribir(p, "costos.directo_m2_por_altura", p.costos.directo_m2_por_altura.map((y: any, j: number) => j === i ? { ...y, hasta_pisos: Number(e.target.value) } : y)))} /></td>
              <td><input className="entrada" type="number" step="0.05" value={x.valor / 1e6} onChange={(e) => setP(escribir(p, "costos.directo_m2_por_altura", p.costos.directo_m2_por_altura.map((y: any, j: number) => j === i ? { ...y, valor: Number(e.target.value) * 1e6 } : y)))} /></td>
              <td className="nota">{(ref.costos.directo_m2_por_altura[i]?.valor ?? 0) / 1e6}</td></tr>))}</tbody></table>
      </Seccion>
      {BLOQUES_ADN.map(([k, t, campos]) => <Seccion key={k} titulo={t} abierta={k === "comite" || k === "costos"}><div className="fila tres-col">{campos.map(campo)}</div></Seccion>)}
      <Seccion titulo="Notas">
        <textarea className="entrada" rows={3} value={p.notas ?? ""} onChange={(e) => setP({ ...p, notas: e.target.value })} placeholder="Fuente de los costos, obras de referencia, fecha de actualización…" />
      </Seccion>
      <div className="acciones">
        <button className="btn btn-primario" onClick={() => guardar(false)}>Guardar perfil</button>
        <button className="btn btn-borde" onClick={() => setP({ ...ref, id: p.id, nombre: p.nombre })}>Volver a la referencia</button>
      </div>
      {estado && <div className="nota">{estado}</div>}
      <div className="nota">Próximamente: cargar los apartamentos tipo de la constructora desde sus planos (DXF) para que el anteproyecto los use.</div>
    </>
  );
}

/* ───────────── Seguimiento de lotes (negociaciones) ───────────── */
const ESTADOS_LOTE: [string, string][] = [["identificado", "Identificado"], ["en_estudio", "En estudio"], ["contacto", "Contacto iniciado"], ["oferta", "Oferta enviada"],
  ["negociacion", "En negociación"], ["promesa", "Promesa firmada"], ["comprado", "Comprado"], ["descartado", "Descartado"]];
const fechaCorta = (d: any) => (d ? new Date(d).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "UTC" }) : "");

function SeguimientoLote({ id }: { id: string }) {
  const [s, setS] = useState<any>(undefined);
  const [e, setE] = useState<any>({});
  const [nota, setNota] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const cargar = () => fetch(`/api/seguimiento?id=${encodeURIComponent(id)}`).then((r) => r.json()).then((j) => { setS(j.seguimiento); setE(j.seguimiento ? aEdicion(j.seguimiento) : {}); }).catch(() => setS(null));
  useEffect(() => { setS(undefined); setMsg(null); cargar(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  function aEdicion(x: any) {
    const m = (v: any) => (v != null ? Number(v) / 1e6 : "");
    return { estado: x.estado, prioridad: x.prioridad, precio_pedido: m(x.precio_pedido), precio_ofertado: m(x.precio_ofertado), precio_acordado: m(x.precio_acordado),
      responsable: x.responsable ?? "", proxima_accion: x.proxima_accion ?? "", proxima_fecha: x.proxima_fecha ? String(x.proxima_fecha).slice(0, 10) : "", motivo_descarte: x.motivo_descarte ?? "" };
  }
  async function enviar(cambios: any) {
    setMsg("Guardando…");
    const r = await (await fetch("/api/seguimiento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, ...cambios }) })).json();
    if (r.seguimiento) { setS(r.seguimiento); setE(aEdicion(r.seguimiento)); setNota(""); setMsg("Guardado"); } else setMsg(r.error ?? "No se pudo guardar");
  }
  const guardar = () => {
    const p = (v: any) => (v === "" || v == null ? null : Number(v) * 1e6);
    enviar({ estado: e.estado, prioridad: Number(e.prioridad), precio_pedido: p(e.precio_pedido), precio_ofertado: p(e.precio_ofertado), precio_acordado: p(e.precio_acordado),
      responsable: e.responsable, proxima_accion: e.proxima_accion, proxima_fecha: e.proxima_fecha, motivo_descarte: e.motivo_descarte, ...(nota.trim() ? { nota } : {}) });
  };
  if (s === undefined) return null;
  if (!s) return (
    <div className="seg-vacio"><span>¿Lo está mirando tu equipo?</span><button className="btn btn-borde" onClick={() => enviar({ estado: "identificado" })}>+ Agregar a negociaciones</button></div>
  );
  const campo = (k: string, t: string, tipo = "number", ph = "") => <div className="campo"><label>{t}</label><input className="entrada" type={tipo} placeholder={ph} value={e[k]} onChange={(ev) => setE({ ...e, [k]: ev.target.value })} /></div>;
  return (
    <Seccion titulo="Seguimiento de la negociación" extra={<span className={`etiqueta estado-${s.estado}`}>{s.estado_nombre}</span>}>
      <div className="fila">
        <div className="campo"><label>Estado</label><select className="entrada" value={e.estado} onChange={(ev) => setE({ ...e, estado: ev.target.value })}>{ESTADOS_LOTE.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="campo"><label>Prioridad</label><select className="entrada" value={e.prioridad} onChange={(ev) => setE({ ...e, prioridad: ev.target.value })}><option value={1}>Alta</option><option value={2}>Media</option><option value={3}>Baja</option></select></div>
      </div>
      <div className="fila tres-col">{campo("precio_pedido", "Precio pedido ($ M)")}{campo("precio_ofertado", "Nuestra oferta ($ M)")}{campo("precio_acordado", "Precio acordado ($ M)")}</div>
      <div className="fila">{campo("proxima_accion", "Próxima acción", "text", "p. ej. enviar oferta formal")}{campo("proxima_fecha", "Fecha", "date")}</div>
      <div className="fila">{campo("responsable", "Responsable del equipo", "text", "quién lleva el lote")}{e.estado === "descartado" ? campo("motivo_descarte", "Motivo del descarte", "text") : <div />}</div>
      <div className="campo"><label>Nota (queda en el historial)</label><textarea className="entrada" rows={2} value={nota} onChange={(ev) => setNota(ev.target.value)} placeholder="Qué pasó, qué se acordó…" /></div>
      <div className="nota aviso-datos">No escribas nombres, teléfonos ni correos de propietarios (Ley 1581): los teléfonos, correos y cédulas se borran solos.</div>
      <div className="acciones"><button className="btn btn-primario" onClick={guardar}>Guardar seguimiento</button>{msg && <span className="nota">{msg}</span>}</div>
      {s.eventos?.length > 0 && (
        <ul className="historial">{s.eventos.map((v: any, i: number) => <li key={i}><span className="fecha">{fechaCorta(v.fecha)}</span><span className={`tipo ${v.tipo}`}>{v.texto}</span>{v.usuario && <span className="quien">{String(v.usuario).split("@")[0]}</span>}</li>)}</ul>
      )}
    </Seccion>
  );
}

export function PanelNegociaciones({ pintar, abrir }: { pintar: (l: any[]) => void; abrir: (id: string, lon?: number, lat?: number) => void }) {
  const [d, setD] = useState<any>(null);
  const [ver, setVer] = useState<"activos" | "todos">("activos");
  useEffect(() => { fetch("/api/seguimiento").then((r) => r.json()).then((j) => { setD(j); pintar(j.lotes ?? []); }).catch(() => setD({ lotes: [] })); return () => pintar([]); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="cargando-panel"><span className="giro" />Cargando negociaciones…</div>;
  const lotes = (d.lotes as any[]).filter((l) => ver === "todos" || !["comprado", "descartado"].includes(l.estado));
  const vencidas = lotes.filter((l) => l.vencida).length;
  const enJuego = lotes.filter((l) => ["oferta", "negociacion", "promesa"].includes(l.estado)).reduce((s, l) => s + (l.precio_ofertado ?? l.precio_pedido ?? 0), 0);
  if (!d.lotes.length) return (
    <div className="vacio-neg"><b>Aún no hay lotes en seguimiento.</b><span>Abre cualquier lote en el mapa y usa “+ Agregar a negociaciones”. Aquí verás todos los lotes de tu equipo por estado, con precios, próximas acciones y su valor máximo según la última versión guardada.</span></div>
  );
  return (
    <>
      <div className="cifras tres">
        <Cifra v={String(lotes.length)} k={ver === "activos" ? "lotes activos" : "lotes en total"} />
        <Cifra v={String(vencidas)} k="próximas acciones vencidas" />
        <Cifra v={mill(enJuego)} k="en oferta o negociación" />
      </div>
      <div className="segmento">{[["activos", "Activos"], ["todos", "Todos (incluye comprados y descartados)"]].map(([k, t]) => <button key={k} className={ver === k ? "on" : ""} onClick={() => setVer(k as any)}>{t}</button>)}</div>
      {ESTADOS_LOTE.map(([k, t]) => {
        const ls = lotes.filter((l) => l.estado === k);
        if (!ls.length) return null;
        return (
          <Seccion key={k} titulo={`${t} (${ls.length})`}>
            <div className="tarjetas-neg">{ls.map((l) => (
              <button key={l.predio} className={`tarjeta-neg ${l.vencida ? "vencida" : ""} prio-${l.prioridad}`} onClick={() => abrir(l.predio, l.lon, l.lat)}>
                <div className="t1"><b>{l.barrio ?? l.predio}</b><span>{l.municipio} · {num(l.area_lote)} m²</span></div>
                <div className="t2">
                  {l.precio_pedido != null && <span>Piden {mill(l.precio_pedido)}</span>}
                  {l.precio_ofertado != null && <span>Ofertamos {mill(l.precio_ofertado)}</span>}
                  {l.precio_acordado != null && <span>Acordado {mill(l.precio_acordado)}</span>}
                  {l.ultima_version?.valor_maximo_lote != null && <span className="vmax">Máx. {mill(Number(l.ultima_version.valor_maximo_lote))}</span>}
                  {l.brecha_pct != null && <span className={l.brecha_pct > 0 ? "malo" : "bueno"}>{l.brecha_pct > 0 ? `piden ${num(l.brecha_pct, 0)} % sobre el máximo` : `${num(-l.brecha_pct, 0)} % bajo el máximo`}</span>}
                </div>
                {(l.proxima_accion || l.proxima_fecha) && <div className="t3">{l.vencida ? "⚠ " : "→ "}{l.proxima_accion ?? "Próxima acción"}{l.proxima_fecha ? ` · ${fechaCorta(l.proxima_fecha)}` : ""}{l.responsable ? ` · ${l.responsable}` : ""}</div>}
              </button>))}</div>
          </Seccion>
        );
      })}
      <div className="acciones"><a className="btn btn-borde" href="/api/seguimiento/excel">Descargar Excel de negociaciones</a></div>
    </>
  );
}
