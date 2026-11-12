"use client";
// Ventana emergente al hacer clic en un lote del mapa: lo esencial y accesos rápidos.
import { useEffect, useState } from "react";
import { Cambio, COLOR_LUZ, m2, millones, num } from "./comunes";

export function PopupLote({ id, onFicha, onComparar, enComparacion }: { id: string; onFicha: () => void; onComparar: () => void; enComparacion: boolean }) {
  const [r, setR] = useState<any>(null);
  const [agregado, setAgregado] = useState(enComparacion);
  useEffect(() => { fetch(`/api/analisis/resumen?id=${encodeURIComponent(id)}`).then((x) => x.json()).then(setR).catch(() => setR({ encontrado: false })); }, [id]);
  if (!r) return <div className="pop"><div className="pop-cargando"><span className="giro" /> Analizando el lote…</div></div>;
  if (!r.encontrado) return <div className="pop"><b>Sin información de este predio.</b></div>;
  const luz = COLOR_LUZ[r.semaforo] ?? COLOR_LUZ.gris;
  return (
    <div className="pop">
      <div className="pop-cabeza">
        <div>
          <div className="pop-sobre">{r.municipio}{r.tratamiento ? ` · ${r.tratamiento}` : ""}</div>
          <div className="pop-titulo">{r.barrio ?? r.municipio}</div>
          <div className="pop-sub">{m2(r.area_lote_m2)} · {r.id}</div>
        </div>
        <span className="pop-semaforo" style={{ background: luz }} title={`Semáforo ${r.semaforo}`} />
      </div>

      {r.pot_2026 && !r.pot_2026.sin_dato && (
        <div className={`pop-pot ${String(r.pot_2026.cambio).startsWith("-") ? "baja" : r.pot_2026.cambio === "+0 %" ? "igual" : "sube"}`}>
          <b>POT 2026</b> <Cambio v={r.pot_2026.cambio} /> área construible
          <div>{m2(r.pot_2026.construible_2014)} → <b>{m2(r.pot_2026.construible_2026)}</b> · IC {num(r.pot_2026.ic_2014, 1)} → {num(r.pot_2026.ic_2026, 1)}</div>
        </div>
      )}
      {r.pot_2026?.sin_dato && <div className="pop-pot igual">POT 2026: sin tabla legible para este polígono</div>}

      <div className="pop-cifras">
        <div><b>{num(r.unidades.base)}</b><span>unidades</span></div>
        <div><b>{num(r.pisos_base)}</b><span>pisos</span></div>
        <div><b>{num(r.unidades.maximo)}</b><span>con derechos</span></div>
        <div><b>{millones(r.valor_suelo_m2)}</b><span>suelo $/m²</span></div>
      </div>
      {r.alertas?.length > 0 && <div className="pop-alertas">⚠ {r.alertas.join(" · ")}</div>}

      <div className="pop-botones">
        <button className="btn btn-primario" onClick={onFicha}>Ver ficha completa</button>
        <button className="btn btn-borde" disabled={agregado} onClick={() => { onComparar(); setAgregado(true); }}>{agregado ? "✓ En comparación" : "+ Comparar"}</button>
        <a className="btn btn-borde" href={`/api/ficha?id=${encodeURIComponent(r.id)}`} target="_blank">PDF</a>
      </div>
    </div>
  );
}
