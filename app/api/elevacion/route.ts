// Elevación del terreno (m s.n.m.) en un punto, para ubicar la cámara del 3D de Google: /api/elevacion?lat=…&lon=…
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return Response.json({ error: "lat y lon requeridos" }, { status: 400 });
  const llave = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (llave) {
    try {
      const j: any = await (await fetch(`https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lon}&key=${llave}`)).json();
      if (j.status === "OK") return Response.json({ elevacion_m: Math.round(Number(j.results[0].elevation)) }, { headers: { "cache-control": "private, max-age=86400" } });
    } catch { /* respaldo abajo */ }
  }
  return Response.json({ elevacion_m: 1500, aproximada: true });
}
