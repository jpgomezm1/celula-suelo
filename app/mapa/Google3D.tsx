"use client";
// Vista 3D fotorrealista de Google (Maps JavaScript API, librería maps3d) con el volumen del edificio posible.
// Requiere NEXT_PUBLIC_GOOGLE_MAPS_KEY con "Maps JavaScript API" y "Map Tiles API" habilitadas (tiene costo por uso).
import { useEffect, useRef, useState } from "react";

const LLAVE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
let cargando: Promise<any> | null = null;
function cargarGoogle(): Promise<any> {
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve((window as any).google);
  cargando ??= new Promise((ok, mal) => {
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${LLAVE}&v=beta&loading=async&libraries=maps3d`;
    s.async = true; s.onload = () => ok((window as any).google); s.onerror = () => mal(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(s);
  });
  return cargando;
}

export const google3dDisponible = !!LLAVE;

export function Google3D({ centro, lote, volumen, altura = 0, titulo, onCerrar, rango = 420, completo = false }: {
  centro: { lat: number; lon: number }; lote?: any; volumen?: any; altura?: number; titulo: string; onCerrar: () => void; rango?: number; completo?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!LLAVE) return;
    let mapa: any;
    (async () => {
      try {
        const google = await cargarGoogle();
        const { Map3DElement, Polygon3DElement } = await google.maps.importLibrary("maps3d");
        mapa = new Map3DElement({ center: { lat: centro.lat, lng: centro.lon, altitude: 0 }, range: rango, tilt: 62, heading: 25, mode: "HYBRID" });
        const anillo = (g: any) => (g?.type === "MultiPolygon" ? g.coordinates[0][0] : g?.coordinates?.[0]) ?? [];
        if (lote) {
          const contorno = new Polygon3DElement({ altitudeMode: "CLAMP_TO_GROUND", fillColor: "rgba(242,169,0,0.18)", strokeColor: "#f2a900", strokeWidth: 3 });
          contorno.outerCoordinates = anillo(lote).map(([lng, lat]: number[]) => ({ lat, lng }));
          mapa.append(contorno);
        }
        if (volumen) {
          const v = new Polygon3DElement({ altitudeMode: "RELATIVE_TO_GROUND", fillColor: "rgba(108,77,231,0.62)", strokeColor: "#ffffff", strokeWidth: 2, extruded: true, drawsOccludedSegments: true });
          v.outerCoordinates = anillo(volumen).map(([lng, lat]: number[]) => ({ lat, lng, altitude: altura }));
          mapa.append(v);
        }
        ref.current?.replaceChildren(mapa);
      } catch (e) { setError((e as Error).message); }
    })();
    return () => { mapa?.remove?.(); };
  }, [centro.lat, centro.lon, altura, rango]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`modal-3d ${completo ? "completo" : ""}`} onClick={completo ? undefined : onCerrar}>
      <div className="caja-3d" onClick={(e) => e.stopPropagation()}>
        <div className="cabeza-3d"><b>{titulo}</b><span>{completo ? "Arrastra para mover · clic derecho o Ctrl + arrastrar para girar · rueda para acercar" : "Vista fotorrealista de Google · volumen esquemático de la norma"}</span><button onClick={onCerrar} title="Volver al mapa">✕</button></div>
        {!LLAVE ? (
          <div className="sin-llave">
            <h3>Falta activar la vista fotorrealista de Google</h3>
            <ol>
              <li>En Google Cloud, crea un proyecto con facturación activa.</li>
              <li>Habilita <b>Maps JavaScript API</b> y <b>Map Tiles API</b>.</li>
              <li>Crea una llave de API restringida al dominio <code>celula-suelo.vercel.app</code>.</li>
              <li>Agrégala en Vercel como <code>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> y vuelve a desplegar.</li>
            </ol>
            <p className="nota">Mientras tanto: usa el 3D del mapa (botón “3D”) o descarga el KMZ y ábrelo en Google Earth, que ya trae el 3D fotorrealista sin costo.</p>
          </div>
        ) : error ? <div className="error" style={{ margin: 20 }}>{error}</div> : <div ref={ref} className="lienzo-3d"><div className="cargando-panel"><span className="giro" />Cargando la vista 3D de Google…</div></div>}
      </div>
    </div>
  );
}
