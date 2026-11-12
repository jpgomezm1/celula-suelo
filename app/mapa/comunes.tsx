"use client";
// Formatos y piezas visuales compartidas del workspace.

export const millones = (v?: number | null) => (v ? `$${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: v < 1e8 ? 2 : 0 })} M` : "—");
export const m2 = (v?: number | null) => (v || v === 0 ? `${Math.round(v).toLocaleString("es-CO")} m²` : "—");
export const num = (v?: number | null, d = 0) => (v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : Number(v).toLocaleString("es-CO", { maximumFractionDigits: d }));
export const pct = (v?: number | null) => (v === null || v === undefined ? "—" : `${Math.round(v * 100)}%`);

export const COLOR_LUZ: Record<string, string> = { verde: "#3f8f4a", amarillo: "#f2a900", rojo: "#c0392b", gris: "#b5b5bd" };

export function Cifra({ v, k, grande }: { v: React.ReactNode; k: string; grande?: boolean }) {
  return <div className="cifra"><div className="v" style={grande ? { fontSize: 24 } : undefined}>{v}</div><div className="k">{k}</div></div>;
}

export function Luz({ luz, tam = 10 }: { luz: string; tam?: number }) {
  return <i style={{ width: tam, height: tam, borderRadius: "50%", background: COLOR_LUZ[luz] ?? COLOR_LUZ.gris, display: "inline-block", flex: "none" }} />;
}

export function Cambio({ v }: { v?: string | null }) {
  if (!v) return <span className="nota">—</span>;
  const color = v.startsWith("+") && v !== "+0 %" ? "#3f8f4a" : v.startsWith("-") ? "#c0392b" : "var(--texto-2)";
  return <b style={{ color }}>{v}</b>;
}

export function Seccion({ titulo, children, extra, abierta = true }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode; abierta?: boolean }) {
  return (
    <details className="tarjeta seccion" open={abierta}>
      <summary><h4>{titulo}</h4>{extra}</summary>
      <div className="cuerpo">{children}</div>
    </details>
  );
}

export function Vacio({ icono, titulo, texto }: { icono: string; titulo: string; texto: string }) {
  return <div className="vacio"><div className="icono">{icono}</div><b>{titulo}</b>{texto}</div>;
}

/** Interpreta lo que escribe el usuario: coordenada, CBML, id, matrícula o dirección. */
export function interpretarBusqueda(q: string): Record<string, any> | null {
  const t = q.trim();
  if (!t) return null;
  const coord = t.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  if (coord) return Math.abs(Number(coord[1])) < 20 ? { lat: Number(coord[1]), lon: Number(coord[2]) } : { lat: Number(coord[2]), lon: Number(coord[1]) };
  if (/^\d{11}$/.test(t)) return { cbml: t };
  if (/^\d{5}:/.test(t)) return { id: t };
  if (/^(\d{3}[a-z]?\s*-\s*)?\d{4,8}$/i.test(t)) return { matricula: t };
  return { direccion: t };
}
