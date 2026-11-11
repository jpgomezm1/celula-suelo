// Cliente mínimo de Croma (api.croma.run). La llave va en CROMA_API_KEY; nunca en el código.
export async function croma<T = any>(ruta: string, cuerpo: unknown, intentos = 3): Promise<T> {
  const key = process.env.CROMA_API_KEY;
  if (!key) throw new Error("Falta CROMA_API_KEY");
  for (let i = 1; ; i++) {
    const res = await fetch(`https://api.croma.run${ruta}`, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 429 || res.status >= 500) {
      if (i >= intentos) throw new Error(`Croma ${ruta}: HTTP ${res.status}`);
      const espera = Number(res.headers.get("retry-after") ?? 2 ** i) * 1000;
      await new Promise((r) => setTimeout(r, espera));
      continue;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(`Croma ${ruta}: ${json?.error?.code ?? res.status} ${json?.error?.message ?? ""}`);
    return json.data as T;
  }
}

export type FolioActo = {
  id: string; registration_number: string; annotation_number: number; filed_on: string; act_code: number; act: string;
  instrument: string | null; value_cop: number | null; parties_from: number | null; parties_to: number | null; folio_opened_on: string | null;
};

/** Historia de un folio. Medellín tiene dos oficinas de registro (001 Sur, 01N Norte): se prueban ambas. */
export async function historiaFolio(matricula: string, circulos: string[]) {
  for (const c of circulos) {
    const registro = `${c}-${matricula}`;
    const d = await croma<{ found: boolean; as_of: string; annotations: FolioActo[] }>(
      "/co/igac-transactions/folio-history/v1", { registration_number: registro });
    if (d.found) return { registro, encontrado: true, datos_hasta: d.as_of, actos: d.annotations };
  }
  return { registro: null, encontrado: false, datos_hasta: null, actos: [] as FolioActo[] };
}
