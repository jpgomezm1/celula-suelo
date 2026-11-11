// Repara textos con doble codificación (UTF-8 leído como Latin-1: "Ã¡reas" → "áreas").
export function fixText(s: string): string {
  if (!/[ÃÂ][\u0080-ÿ]/.test(s)) return s.trim();
  const repaired = Buffer.from(s, "latin1").toString("utf8");
  return (repaired.includes("�") ? s : repaired).trim();
}
