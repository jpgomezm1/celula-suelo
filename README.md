# Inteligencia de suelo · v0.3

> **Guía completa:** [`public/como-funciona.html`](public/como-funciona.html), publicada en `/como-funciona.html` del despliegue.
> **MCP:** `https://celula-suelo.vercel.app/api/mcp` con `Authorization: Bearer <MCP_TOKEN>` (15 herramientas, entre ellas `oportunidades_por_perfil` y `estudio_competencia`).
> **Workspace:** `/mapa` con `APP_USER` / `APP_PASSWORD`. Variables: copia `.env.example` como `.env.local`.


Inteligencia de suelo, proyectos sobre planos y mercado para **17 municipios**:
- **Valle de Aburrá:** Medellín, Envigado, Sabaneta, Itagüí, La Estrella, Caldas, Bello, Copacabana, Girardota y Barbosa.
- **Oriente cercano:** Rionegro, El Retiro, La Ceja, Guarne, Marinilla, El Carmen de Viboral y La Unión.

Cada dato guarda su fuente, la fecha de captura y su tipo: oficial, anunciado, digitalizado o inferencia.

## Capas

| Capa | Fuente | Cómo se actualiza |
|---|---|---|
| Catastro (predios, construcciones) | GeoMedellín, IDEM (AMVA), GeoAntioquia, Cornare | `npm run refresh:suelo` (mensual) |
| Norma (tratamientos, altura, índice, densidad) | Servicios municipales; Girardota digitalizada en `data/normas/` | Ídem + `npm run normas` |
| Amenazas, protección, valor del suelo, licencias | GeoMedellín, IDEM, Cornare WFS | Ídem |
| Mercado (avisos, pedidos, cambios de precio, índice) | Fynder: vistas `celula_export` con rol de solo lectura | Cron diario de Vercel `/api/cron/fynder` |
| Proyectos sobre planos | Zonario (permitido; ver `projects/TERMINOS.md`) | `npm run refresh:proyectos` (semanal) |

**Estado de la norma por municipio:** está en la tabla `municipio.cobertura` y la consulta la herramienta `cobertura`.
- **Itagüí, La Estrella, Caldas y Copacabana:** la capa pública de tratamientos es de un POT derogado. La ficha lo advierte y no calcula potencial.
- **Oriente:** no publica polígonos de tratamiento.

## Comandos

```bash
npm run db:schema                         # db/schema.sql (y db/schema_mercado.sql, db/municipios.sql, db/cobertura.sql)
npm run ingest -- --grupo valle           # suelo por grupo: suelo | medellin | valle | oriente | <dane>
npm run ingest -- --grupo medellin --reanudar
npm run normas                            # carga data/normas/*.csv
npm run perfil                            # recalcula parcel_profile (vista materializada)
npm run sync:fynder                       # Fynder → célula
npm run proyectos:zonario && npm run proyectos:resolver
npm run comparar:prefactibilidad          # traducción TS vs Python de Fynder (debe dar 0 %)
npm run verificar                         # 20 predios por grupo contra la fuente en vivo + conteos + privacidad
npm run build && npm run start -- -p 3077 && npm run probar
```

Variables (`.env.local` y Vercel):
- `DATABASE_URL`: Neon `celula-suelo`.
- `FYNDER_READ_URL`: rol `celula_reader`, solo vistas, endpoint de solo lectura.
- `MCP_TOKEN`, `APP_PASSWORD` (mapa), `CRON_SECRET`.

## Salidas

- **MCP** `/api/mcp` (token bearer). Herramientas: `cobertura`, `ficha_predio`, `buscar_lotes`, `mercado_zona`, `buscar_proyectos`, `ficha_proyecto`, `constructora`, `prefactibilidad_lote`, `oportunidades`, `fuentes`.
- **Workspace** `/mapa` (clave `APP_PASSWORD`):
  - Predios coloreados por potencial, proyectos y avisos de Fynder.
  - Ficha lateral y oportunidades por municipio.
- **Teselas vectoriales** `/api/tiles/{predios|proyectos|avisos}/{z}/{x}/{y}`.

Conectar a Claude Code:
```bash
claude mcp add --transport http celula-suelo https://<dominio>/api/mcp --header "Authorization: Bearer <MCP_TOKEN>"
```

## Advertencias

- **Inferencias.** `potencial_preliminar`, el área construible, las viviendas máximas, la prefactibilidad y las oportunidades son cálculos propios para priorizar. No son estudios de cabida ni avalúos.
- **Prefactibilidad.** Es el modelo `comite-de-tierras` de Fynder, traducido línea por línea y verificado contra el Python con diferencia de 0 %.
- **Fynder.** Los precios son de oferta, no de cierre. Las coordenadas suelen ser el centro del barrio. La demanda sale de pedidos de compradores en WhatsApp.
- **Zonario.** Se usa con atribución ("Zonario, zonario.co"). Agrega datos de portales que prohíben la extracción, así que la reutilización comercial queda sujeta a revisión legal. Fincaraíz y La Haus están descartados porque sus términos lo prohíben.
- **Datos personales.** No se ingieren: ni matrícula, ni teléfonos, ni nombres de agentes, ni textos de pedidos. `npm run verificar` lo comprueba.
