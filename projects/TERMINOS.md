# Términos de uso y robots.txt — portales de vivienda nueva

Caso evaluado: recolección pequeña, con límite de velocidad y con atribución, de datos **públicos** de proyectos nuevos (nombre del proyecto, constructora, ubicación, rangos de precio, áreas, fecha de entrega) para análisis de mercado **interno** de una proptech.

Lectura hecha el 2026-11-10 con GET simples (curl), pocas páginas por sitio. Este documento resume lo que dicen los textos; no es concepto jurídico.

## Resumen

| Sitio | Veredicto | Condición clave | Fecha de lectura | URL |
|---|---|---|---|---|
| Zonario | **PERMITIDO** (no hay términos de uso publicados) | Citar «Zonario, zonario.co» con la fecha del corte y enlace a la página de origen; no tocar `/inversionistas/` ni `/api/` | 2026-11-10 | https://www.zonario.co/que-es-zonario · https://www.zonario.co/llms.txt · https://www.zonario.co/robots.txt |
| Fincaraíz | **PROHIBIDO** | Los T&C prohíben expresamente "scraping, bots, crawlers, extracción masiva de datos" y la reutilización comercial; las bases de datos no pueden explotarse "sin autorización previa y escrita" | 2026-11-10 | https://www.fincaraiz.com.co/informacion#terminos-y-condiciones · https://www.fincaraiz.com.co/robots.txt |
| La Haus | **PROHIBIDO** | Los T&C prohíben expresamente "scraping", "crawling", robots y spiders para "recopilar, copiar o extraer contenido", y cualquier explotación del Contenido "tenga o no fines comerciales" sin consentimiento previo y expreso | 2026-11-10 | https://www.lahaus.com/terminos-y-condiciones · https://www.lahaus.com/robots.txt |

---

## 1. Zonario

### Términos de uso
No encontré una página de términos y condiciones ni un aviso legal:
- El pie de página solo enlaza a "¿Qué es Zonario?" (`/que-es-zonario`) y "Preguntas frecuentes" (`/#faqs`).
- `/terminos`, `/terminos-y-condiciones`, `/terminos-de-uso`, `/legal`, `/aviso-legal`, `/privacidad`, `/politica-de-privacidad`, `/politica-privacidad` y `/tratamiento-de-datos` devuelven 404.
- Ninguna URL del `sitemap.xml` (2.282 URLs) contiene "termin", "legal", "condic", "privac" ni "uso".

Textos relevantes que sí publica:

- Pie de página (todas las páginas): «© 2026 Zonario. Todos los derechos reservados.»
- https://www.zonario.co/que-es-zonario, sección «Cómo citar a Zonario»: «Usa «Zonario, zonario.co» con la fecha de los datos y enlaza la página de la que sale la cifra. Las cifras cambian con cada actualización.»
- https://www.zonario.co/llms.txt, sección «Cómo citar»: «Cita «Zonario, zonario.co» con la fecha de los datos (hoy: 17 de octubre de 2026) y enlaza la página de la que sale la cifra. Las cifras de precio y área cambian con cada corte; no las repitas sin esa fecha.»
- llms.txt también publica datos abiertos con licencia explícita: «Datos abiertos (CSV, CC BY-SA 4.0): Por barrio (sector catastral) · Por UPZ» (conectividad de Bogotá, `/datos/*.csv`). Esa licencia cubre solo esos CSV, no las fichas de proyectos.
- Origen de los datos (`/que-es-zonario`): «Revisa nueve portales (FincaRaíz, Metrocuadrado, Ciencuadras, Estrenar Vivienda, La Haus, Tu360 Inmobiliario, Properati, Vivendo e Informe Inmobiliario) y también las páginas de las constructoras». También: «Se actualiza dos veces al mes, los días 1 y 16.»

### robots.txt (https://www.zonario.co/robots.txt)
```
User-Agent: *
Allow: /
Disallow: /inversionistas/
Disallow: /api/
```
Hay un bloque idéntico para GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-User, Claude-SearchBot, PerplexityBot, Google-Extended, CCBot y otros. Declara `Sitemap: https://www.zonario.co/sitemap.xml`. No tiene `Crawl-delay`.

### Veredicto: PERMITIDO
Zonario no publica términos que regulen el acceso automatizado ni la reutilización. Su robots.txt permite todo salvo `/inversionistas/` y `/api/`, y el sitio pide una forma concreta de cita. Hay dos reservas que salen del propio texto:
- «Todos los derechos reservados» reserva el derecho de autor sobre el sitio, así que reproducirlo en bloque no está cubierto.
- Zonario dice que sus fichas salen en parte de Fincaraíz y La Haus, cuyos términos prohíben la extracción. Ninguno de los textos leídos dice qué pasa con esos datos después de que Zonario los muestra.

---

## 2. Fincaraíz

### Términos y condiciones
URL: https://www.fincaraiz.com.co/informacion#terminos-y-condiciones. La página se arma con JavaScript; el texto se leyó del bundle que la página carga (`/_next/static/chunks/pages/fincaraiz/informacion-875c8b627c019ca6b920.js`). En el texto descargado no encontré una fecha de versión.

Título: «TÉRMINOS Y CONDICIONES GENERALES DE USO Y CONTRATACIÓN — www.fincaraiz.com.co»

- Aplicación: «El acceso, registro o uso del Portal implican la aceptación plena de los siguientes términos y condiciones. Si el Usuario no está de acuerdo con alguna disposición, debe abstenerse de usar el Portal.» El titular es EDITORA URBANA LTDA, NIT 800.229.663-1.
- **5. Derechos y obligaciones del Usuario**: «Abstenerse de realizar actividades de scraping, bots, crawlers, extracción masiva de datos, reutilización comercial de anuncios, imágenes, contactos o cualquier información publicada.»
- 5. (consecuencia): «El incumplimiento de estas obligaciones faculta a FINCARAÍZ para suspender la prestación del servicio, resolver el contrato y exigir las indemnizaciones a que haya lugar, conforme a la ley.»
- **14. Propiedad intelectual y licencia de contenidos**: «El diseño, marcas, bases de datos, software y demás elementos del Portal son propiedad de FINCARAÍZ o de EDITORA URBANA LTDA. El uso del Portal no otorga al Usuario licencia alguna sobre estos elementos, que no podrán reproducirse, transformarse ni explotarse sin autorización previa y escrita.»
- Términos «Para Inmobiliarias» y «Para Particulares», en la misma página: «No realizar cualquier acción que imponga una carga desproporcionada o desmesurada sobre la infraestructura de este Sitio.»
- **20. Modificación y vigencia**: «Estos Términos y Condiciones vinculan a las partes desde que el Usuario los acepta al registrarse o al usar el Portal […]»
- **21. Ley aplicable**: leyes de la República de Colombia.

### robots.txt (https://www.fincaraiz.com.co/robots.txt)
- El archivo tiene unas 3.500 líneas de «Bad bots» (tomadas de la lista apache-ultimate-bad-bot-blocker) con `Disallow: /`. Entre ellos están `Scrapy`, `RedesScrapy`, `PyCurl`, `Go-http-client`, `Zyte`, `80legs`, `AhrefsBot` y `SemrushBot-SA`.
- Para `User-agent: *`:
```
Disallow: /fbapps/
Disallow: /superadmin/
Disallow: /wsdl/
Disallow: /sitio/admin/
Disallow: /voy/a/tener/suerte
Disallow: /apps/
Disallow: /mobile/
Disallow: /sitio/?mid=propiedades*
Disallow: /sitio/index.php?mid=propiedades*
Disallow: /venta/*-y-*
Disallow: /proyectos/*-y-*
Disallow: /proyectos-vivienda/*-y-*
Disallow: /alquiler/*-y-*
Disallow: /alquiler-temporal/*-y-*
Disallow: /arriendo/*-y-*
Disallow: /arriendo-temporal/*-y-*
```
- Declara sitemaps de proyectos, por ejemplo `/sitemaps/projects-1-sitemap.xml` y `/sitemaps/projects-vis-1-sitemap.xml`. No tiene `Crawl-delay`.
- robots.txt no bloquea las páginas de proyectos para `*`, pero los T&C prohíben el scraping por contrato, cualquiera sea el user-agent.

### Veredicto: PROHIBIDO
La sección 5 prohíbe expresamente el scraping, los bots, los crawlers y la extracción masiva, y también la reutilización comercial de «cualquier información publicada». La sección 14 prohíbe explotar las bases de datos sin autorización previa y escrita. El texto no exceptúa la recolección pequeña ni el uso interno.

---

## 3. La Haus

### Términos y condiciones
URL: https://www.lahaus.com/terminos-y-condiciones. Título: «TÉRMINOS Y CONDICIONES GENERALES — Versión 23 de abril de 2025».

- **3. CONDICIONES DE USO DE LA PLATAFORMA**: «Sin limitar lo anterior, el Usuario reconoce que son usos prohibidos de la Plataforma, y por ende acepta abstenerse en cualquier momento de realizar cualquiera de las conductas a continuación enlistadas:» La lista incluye:
  - «Usar técnicas de "scraping", "crawling", robots, spiders u otros mecanismos automáticos para acceder, recopilar, copiar o extraer contenido de la Plataforma.»
  - «Reproducir, duplicar, copiar, vender, revender, explotar o usar comercialmente la Plataforma o sus Servicios sin autorización expresa.»
  - «Interferir o intentar interferir con el funcionamiento normal de la Plataforma, sus servidores o redes […]»
- **7. OBLIGACIONES DE LOS USUARIOS**, numeral 2: «El Usuario que haga uso de los Servicios, incluidas todas las características y funcionalidades asociadas con éste, acuerdan no archivar, descargar, reproducir, distribuir, modificar, transmitir, mostrar, exhibir, ejecutar, reproducir, duplicar, publicar, otorgar licencias, crear obras derivadas basadas en los Servicios, u ofrecer en venta información obtenida de los Servicios.»
- **9. PROPIEDAD INTELECTUAL E INDUSTRIAL**: «[…] todo el software, bases de datos, códigos, desarrollo, hardware, materiales, información, comunicación, textos, gráficos […] (el "Contenido") disponibles en la Plataforma, son de titularidad de LaHaus o de terceros que han licenciado sus derechos […]» También: «LaHaus otorga al Usuario una licencia no exclusiva, limitada, temporal e intransferible que le autoriza a acceder a los Servicios de Computación en la Nube y utilizar la Plataforma.» Y: «Queda prohibida cualquier forma reproducción, distribución, modificación comunicación pública, transformación, y en general, cualquier acto de explotación, tenga o no fines comerciales, de la Plataforma y el Contenido, sin el consentimiento previo y expreso de LaHaus.»
- **11. INFORMACIÓN DE INMUEBLES, PRECIOS Y VALORES** (sobre la calidad del dato): «[…] los precios […] son meramente indicativos conforme a la información remitida por el Desarrollador y por tanto no constituyen una oferta comercial al público.»

### robots.txt (https://www.lahaus.com/robots.txt)
```
User-agent: *
Disallow: /admin
Disallow: /real_estate_attachments
Disallow: /dashboard
Disallow: /user_tasks
Disallow: /hubspot_integration
Disallow: /search
Disallow: /buscar
Disallow: /email_existence
Disallow: /popup
Disallow: /recommendations
Disallow: /real_estates_recommendations
Disallow: /sign_up_quizes
Disallow: /users
Disallow: /facebook-authentication
Disallow: /marketing_integrations/trovit*
Disallow: /landings
Disallow: /*?*~*
Disallow: /real_estate_brochure/*
Disallow: /lanzamientos/reservas/new*
Disallow: /api/*
```
Bloquea por completo (`Disallow: /`) a dotbot, rogerbot, Bleriot, Qwantify y Yandex. No tiene `Crawl-delay`.

### Veredicto: PROHIBIDO
La sección 3 prohíbe expresamente cualquier mecanismo automático para «acceder, recopilar, copiar o extraer contenido». La sección 9 prohíbe la explotación del Contenido «tenga o no fines comerciales», así que el uso interno tampoco queda cubierto. La sección 7.2 prohíbe además «archivar» y «descargar» información obtenida de los Servicios.

---

## Cómo los usamos

### Zonario (PERMITIDO): reglas operativas
1. **Respetar robots.txt**: no pedir nada bajo `/inversionistas/` ni `/api/`. Volver a leer robots.txt al inicio de cada corrida y respetar cualquier `Disallow` nuevo.
2. **Límite de velocidad**: máximo 1 petición cada 3–5 segundos, en secuencia (sin concurrencia), con reintentos en backoff exponencial ante 429/5xx, y parar ante bloqueos o 403.
3. **Frecuencia**: el sitio se actualiza los días 1 y 16. Correr como máximo dos veces al mes, después de cada corte, y descargar solo las fichas nuevas o modificadas (usar `sitemap.xml` y `llms.txt` como índice en vez de rastrear todo el sitio).
4. **Identificarse**: usar un User-Agent honesto con el nombre del bot y un contacto genérico, sin hacerse pasar por un navegador.
5. **Atribución**: en todo análisis o reporte, citar «Zonario, zonario.co» con la fecha del corte (por ejemplo, «datos al 17 de octubre de 2026») y el enlace a la página de origen de la cifra.
6. **Solo los campos del alcance**: nombre, constructora, ubicación, precio desde o rangos, áreas, estado y fecha de entrega. No recoger datos personales ni fotos.
7. **No republicar en bloque**: el uso es interno. No exponer el dataset ni las fichas en un producto público, y no redistribuir en bloque contenido «Todos los derechos reservados». Los CSV CC BY-SA 4.0 se pueden reutilizar respetando atribución y compartir-igual.
8. **Fuente de origen**: Zonario declara que agrega datos de Fincaraíz y La Haus, entre otros portales. Al usar una ficha de Zonario, no seguir los enlaces a esos portales para completar datos de forma automática.
9. **Revisión**: volver a revisar este archivo si Zonario publica términos de uso (vigilar el pie de página y `/que-es-zonario`).

### Fincaraíz (PROHIBIDO)
- No hacer recolección automatizada (scripts, bots, crawlers, Scrapy, curl en lote), ni siquiera pequeña o con límite de velocidad.
- No reutilizar comercialmente su contenido sin autorización previa y escrita de EDITORA URBANA LTDA.
- Alternativas: pedir autorización o licencia de datos por escrito (servicio.cliente@fincaraiz.com.co), consultar a mano casos puntuales sin almacenar en bloque, o ir a la fuente primaria, que son las páginas de las propias constructoras, revisando sus términos.

### La Haus (PROHIBIDO)
- No usar mecanismos automáticos para acceder, recopilar, copiar o extraer contenido, ni archivar o descargar información de los Servicios. La prohibición rige con o sin fines comerciales.
- Alternativas: pedir consentimiento previo y expreso a LaHaus (por ejemplo, un acuerdo de datos o alianza con constructoras), o ir a la fuente primaria (constructoras).

### Reglas comunes
- Guardar en este archivo la fecha de lectura de cada sitio y volver a leer términos y robots.txt cada 6 meses o antes de ampliar el alcance.
- Si un sitio cambia sus términos o su robots.txt, suspender la recolección hasta reevaluar.
- Este análisis se limita al texto de términos y robots.txt. Antes de escalar o de publicar cualquier producto derivado, consultar asesoría legal (incluido el régimen colombiano de derechos de autor y bases de datos).
