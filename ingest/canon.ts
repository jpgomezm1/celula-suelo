// Normalización de campos de cada fuente a claves canónicas.
// Regla: lo que no se puede leer con certeza queda null; nunca se inventa.

import { fixText } from "./text";

export type Props = Record<string, unknown>;

/** Lectura insensible a mayúsculas: get(p, "AREA_M2", "area_m2"). */
export function get(p: Props, ...keys: string[]): unknown {
  for (const k of keys) {
    for (const [pk, v] of Object.entries(p)) {
      if (pk.toLowerCase() === k.toLowerCase() && v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
  }
  return null;
}

export function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = fixText(String(v)).trim();
  return s === "" ? null : s;
}

/** Número en formato colombiano o con unidades: "3,5" → 3.5 · "12 pisos" → 12 · "300 V/H" → 300 · "60%" → 0.6. */
export function num(v: unknown, { ceroEsNull = false } = {}): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) && !(ceroEsNull && v === 0) ? v : null;
  const s = String(v).trim();
  // "1.234,5" → "1234.5" · "3,5" → "3.5" · "3.5" → "3.5"
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const m = norm.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = Number(m[0]);
  if (s.includes("%")) n = n / 100;
  if (!Number.isFinite(n) || (ceroEsNull && n === 0)) return null;
  return n;
}

/** Grado de amenaza/riesgo a partir de cualquier texto de la entidad. */
export function gradoAmenaza(p: Props): string | null {
  const texto = Object.values(p).filter((v) => typeof v === "string").join(" ").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/no mitigable/.test(texto)) return "No mitigable";
  if (/\balt[oa]\b/.test(texto)) return "Alta";
  if (/\bmedi[oa]\b/.test(texto)) return "Media";
  if (/\bbaj[oa]\b/.test(texto)) return "Baja";
  if (/condicion de riesgo|zona de riesgo|riesgo/.test(texto)) return "Condición de riesgo";
  return null;
}

export function tipoAmenaza(p: Props, defecto: string | null = null): string | null {
  const texto = Object.values(p).filter((v) => typeof v === "string").join(" ").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/torrencial|avenida/.test(texto)) return "avenidas_torrenciales";
  if (/inunda/.test(texto)) return "inundacion";
  if (/masa|desliza|remocion|rmrm/.test(texto)) return "movimientos_masa";
  return defecto;
}

/** Atributos originales, sin campos de geometría ni personales, con textos reparados. */
const PERSONAL = /matric|telefon|celular|propietari|contacto|email|cedula|documento|direccion|created_user|last_edit/i;
export function originales(p: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(p)) {
    const key = k.toLowerCase();
    if (/^(shape|st_|se_anno|geom$|globalid)/.test(key) || PERSONAL.test(key)) continue;
    if (v === null || v === "" || v === " ") continue;
    out[key] = typeof v === "string" ? fixText(v) : v;
  }
  return out;
}

export const dane = (codigoMun: unknown): string | null => {
  const s = String(codigoMun ?? "").replace(/\D/g, "");
  if (!s) return null;
  return s.length >= 5 ? s.slice(0, 5) : `05${s.padStart(3, "0")}`;
};
