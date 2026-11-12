// Caché en memoria por instancia (10 min) para consultas que se repiten al probar muchas variantes del mismo lote.
const cache = new Map<string, { t: number; v: Promise<any> }>();
export function memo<T>(clave: string, fn: () => Promise<T>, ttl = 600_000): Promise<T> {
  const c = cache.get(clave);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = fn().catch((e) => { cache.delete(clave); throw e; });
  cache.set(clave, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}
