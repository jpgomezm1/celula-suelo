# Acceso automatizado a datos de La Galería Inmobiliaria: hallazgos para la sesión con Conaltura

Fecha de la investigación: 2026-11-10. Fuentes: solo páginas públicas y búsqueda web. No se inició sesión ni se exploraron áreas privadas.

Convención usada en este documento:
- **[OBSERVADO]**: lo vi en una página o PDF público (con URL).
- **[INFERIDO]**: es mi lectura o deducción. No está escrito en ninguna fuente.

---

## Resumen y recomendación

1. **[OBSERVADO]** La empresa correcta es **La Galería Inmobiliaria Ltda.** (NIT 830.006.392-0, Bogotá), con dominio `lagaleriainmobiliaria.com`. **Ojo:** `galeriainmobiliaria.com.co` es otra empresa, una inmobiliaria de arriendos de Bucaramanga, y `galeriainmobiliaria.com` es un dominio estacionado. La plataforma de suscriptores se llamaba **SIGA** y hoy redirige a **G.A.I.N.** (`gain.lagaleriainmobiliaria.com`).
2. **[OBSERVADO]** En el sitio público no se ofrece **API, feed de datos, conector BI ni exportación masiva**. Tampoco se publican **términos y condiciones de uso** de la plataforma. Los únicos textos legales públicos son una política de tratamiento de datos personales (Ley 1581) y un **"Comunicado importante"** sobre divulgación de datos.
3. **[OBSERVADO]** Ese comunicado dice que la información es **"confidencial y para uso exclusivo interno de quienes lo contratan directamente y son afiliados"**. También dice que cualquier divulgación o publicación **"requiere autorización previa"**.
4. **[INFERIDO]** Cargar el Excel exportado en una herramienta **interna** de Conaltura parece compatible con el "uso exclusivo interno". El riesgo aparece si la herramienta o sus resultados salen de Conaltura: terceros, proveedores con acceso, socios o publicaciones. Nada público habla de acceso automatizado (bots o scraping), pero el contrato privado de suscripción puede decir algo. Hay que pedirlo.

**Recomendación:**
- **Ahora:** opción (a), un **export manual mensual con carga estandarizada** en la herramienta. Es de bajo riesgo y se puede hacer este mes.
- **En paralelo:** opción (b), **pedirle por escrito a La Galería un feed o entrega de datos** (Excel o CSV por correo o SFTP, API o base de datos) dentro del contrato. Junto con eso, pedir **autorización escrita** para el uso interno automatizado.
- **Opción (c), automatizar el navegador con la sesión del usuario y el código 2FA:** solo con autorización escrita de La Galería. Sin esa autorización es frágil por el 2FA y tiene riesgo contractual.

---

## 1. La Galería Inmobiliaria: producto, cobertura y frecuencia

**Sitio oficial [OBSERVADO]:** https://www.lagaleriainmobiliaria.com/

- Se describe como firma de investigación de mercado, análisis y consultoría inmobiliaria. Sus clientes son constructoras, bancos, entidades del Estado y proveedores industriales.
- **Frecuencia:** la plataforma *"recopila mensualmente el censo de vivienda nueva en las principales ciudades del país"*. Hay un censo mensual sala por sala.
- **Cobertura:** el sitio dice "4 Países · 20+ Ciudades · 80+ Municipios": Colombia, Panamá, República Dominicana y Guatemala. Otra sección menciona solo 3 países. Medellín aparece entre las ciudades.
- **Servicios listados:**
  - Análisis Estratégico de Lotes (AEL)
  - Análisis Estratégico de Proyectos (AEP), que *"Permite entender de forma integral el comportamiento de un proyecto activo frente a su competencia directa"*
  - Competitividad, que *"Monitorea y compara el desempeño de proyectos de forma rápida y precisa."*
  - Mesa de Trabajo
  - Estudio Personalizado (ciudad, zona, subzona o polígonos)
  - Usados (estratos 4, 5 y 6)
  - Industrial: *"una amplia base de datos donde podrán segmentar y clasificar las zonas con mayor demanda"*
  - Comercio y Oficinas
  - Informe Estratégico (trimestral)
  - Estudio de Apartaestudios (anual, Bogotá)
  - Ranking
  - Estructuración de Proyectos
  - Vivienda en Renta Institucional
- **Plataforma:** el sitio la llama "SIGA – Sistema de Información del Mercado Inmobiliario". El enlace "G.A.I.N." del menú lleva a `https://siga.lagaleriainmobiliaria.com/sesion/?next=/`, que responde **301** hacia `https://gain.lagaleriainmobiliaria.com/sesion/?next=/`.
- **"Soportes", "Coordenadas", fichas de proyecto o informes de zona:** **no aparecen** con esos nombres en las páginas públicas.
  - **[INFERIDO]** "Soportes" probablemente es un nombre interno de un reporte o export dentro de G.A.I.N.
  - **[INFERIDO]** "Coordenadas" puede confundirse con **Coordenada Urbana**, que es de Camacol y no de La Galería. Conviene aclararlo en la sesión.
- **API, feed, export masivo, conector BI o licenciamiento de datos:** **no se mencionan** en ninguna página pública revisada.
- **Página de login de G.A.I.N. [OBSERVADO]:** pide "Ingresa con tu usuario y contraseña". No enlaza términos y condiciones, ayuda ni API. El código de un solo uso (2FA) no aparece en la página pública. **[INFERIDO]** El código probablemente se pide después de la contraseña. No lo verifiqué.
- **robots.txt [OBSERVADO]:** `lagaleriainmobiliaria.com/robots.txt` y `gain.lagaleriainmobiliaria.com/robots.txt` devuelven **404**. No hay reglas publicadas. **[INFERIDO]** Que falte un robots.txt no autoriza nada. El área de G.A.I.N. está detrás de login y la rigen el contrato y el comunicado.

---

## 2. Cláusulas legales encontradas, con citas textuales

### 2.1 "Comunicado importante": política de divulgación de datos [OBSERVADO]

URL: https://lagaleriainmobiliaria.com/wp-content/uploads/2024/03/Comunicado-autorizacion-de-datos-LGI.pdf. Está enlazado en el pie del sitio como "Política de Divulgación de Datos" y lo firma la Gerencia General de La Galería Inmobiliaria Ltda. La ruta sugiere marzo de 2024.

> "Es fundamental para nosotros subrayar que esta información que incluye cifras, tendencias y análisis sectoriales, es confidencial y para uso exclusivo interno de quienes lo contratan directamente y son afiliados a La Galería Inmobiliaria."

> "Por lo tanto, queremos recordarle que cualquier divulgación o publicación de esta información en cualquier medio o plataforma, incluidas redes sociales, requiere autorización previa por parte nuestra."

> "Si en algún momento considera oportuno compartir o utilizar algún dato generado por nuestra empresa, le invitamos cordialmente a ponerse en contacto con nuestro equipo para obtener la autorización necesaria a través del correo mercadeo@lagaleríainmobiliaria.com o a través de su consultor."

**Lectura [INFERIDO]:**
- **Uso interno de Conaltura:** está permitido de forma expresa ("uso exclusivo interno de quienes lo contratan").
- **Herramienta interna:** subir los datos a una herramienta propia de Conaltura cabe dentro del uso interno, con dos condiciones. La herramienta debe ser accesible solo para personal de Conaltura. Si la opera o aloja un tercero (desarrollador, nube, consultor), debe haber confidencialidad y conviene confirmarlo con La Galería.
- **Requiere autorización:** compartir con terceros, publicar o redistribuir. Esto incluye, por ejemplo, socios de fiducia, bancos, inversionistas o informes externos.
- **Frase ambigua:** "compartir **o utilizar** algún dato" puede leerse de forma amplia. Por eso conviene tener **autorización escrita** del uso que se planea.

### 2.2 Aviso en la página de login de G.A.I.N. [OBSERVADO]

URL: https://gain.lagaleriainmobiliaria.com/sesion/?next=/

> "La información se usará con fines estadísticos."
> "La Galería Inmobiliaria no se responsabiliza por usos distintos a los indicados."
> "Al acceder, usted acepta el tratamiento de sus datos conforme a la Ley 1581 de 2012 y normas concordantes."

### 2.3 Política de tratamiento de datos personales [OBSERVADO]

URL: https://lagaleriainmobiliaria.com/wp-content/uploads/2023/10/Politica_Tratamiento_Datos_Personales_-6-10-2023.pdf (actualización del 6 de octubre de 2023, vigente desde el 24 de marzo de 2017).

Cubre **datos personales** (habeas data) y **no** el uso de los datos de mercado por parte de los clientes. Fragmentos relevantes:

> "i) Transmitir y/o transferir las bases de datos a Gerpro SAS y a otras empresas vinculadas."

> "LA GALERÍA INMOBILIARIA no procederá a vender, licenciar, transmitir, o divulgar las Bases de Datos Personales, salvo que: (i) exista autorización expresa para hacerlo; [...]"

**[INFERIDO]** Esta política aplica si el export trae datos personales, por ejemplo nombres o teléfonos de contactos de sala de ventas. En ese caso Conaltura también debe tratarlos conforme a la Ley 1581.

### 2.4 Lo que NO se encontró [OBSERVADO]

- No hay términos y condiciones, términos de uso ni licencia de la plataforma G.A.I.N. o SIGA publicados.
- No hay ninguna cláusula pública sobre **acceso automatizado, bots, scraping, robots** ni **límites de descarga**.
- **[INFERIDO]** Esas reglas, si existen, están en el **contrato o la orden de servicio de la membresía** de Conaltura, o en términos que se aceptan dentro de la plataforma. Hay que pedirlos.

### 2.5 Marco legal colombiano relevante [INFERIDO, no es asesoría legal]

- **Contrato:** el contrato de suscripción y el comunicado son la base principal. Incumplirlos puede llevar a la suspensión del acceso o a una reclamación contractual.
- **Bases de datos:** en Colombia las bases de datos pueden protegerse como compilaciones (Ley 23 de 1982 y Decisión Andina 351 de 1993).
- **Ley 1273 de 2009 (delitos informáticos, art. 269A, acceso abusivo):** apunta a accesos sin autorización o *"en contra de la voluntad de quien tenga el legítimo derecho a excluirlo"*. Automatizar la sesión propia sin permiso no es lo mismo que un acceso no autorizado. Aun así, si el proveedor lo prohíbe de forma expresa, el riesgo sube. Conviene validarlo con el abogado de Conaltura.

---

## 3. Alternativas con datos parecidos

### Camacol – Coordenada Urbana [OBSERVADO]

Fuente: https://camacol.co/sites/default/files/2024-10/Que_es_Coordenada_Urbana.pdf

- Es un censo mensual georreferenciado de las 19 regionales de Camacol (incluye Antioquia): *"La información se obtiene mediante una operación estadística mensual que recolecta, consolida, valida, procesa, analiza y difunde datos de los proyectos inmobiliarios desarrollados en las 19 regionales de Camacol en el país."*
- **Acceso:** *"El acceso completo a la información se realiza mediante una suscripción paga que permite el ingreso a la plataforma web (https://ww2.coordenadaurbana.com/) para consultar bases de datos con el detalle de los proyectos, reportes e informes de coyuntura y dos grandes módulos denominados Coordenada Analítika y GEOanálisis."*
- **Tableros Power BI:** Coordenada Analítika tiene *"9 tableros"* en Power BI. GEOanálisis son 5 aplicativos en ArcGIS.
- **Bases a la medida:** *"Coordenada Urbana permite el desarrollo de bases de datos, tableros o informes personalizados de acuerdo con las necesidades de información de los usuarios."* Contacto: ppenuela@camacol.org.co.
- **Diccionario de variables:** Camacol publica un diccionario de la base de proyectos para clientes, la versión 4 del 29/07/2026, con base Proyectos, Etapas y Tipos y variables mensuales de avance comercial: https://camacol.co/sites/default/files/descargables/Diccionario%20de%20variables_base%20de%20datos%20CU_Clientes_V4.pdf.
  - **[INFERIDO]** Que exista ese diccionario indica que Camacol entrega **bases de datos tabulares** a clientes. Eso facilita la integración.
  - Su "Condiciones de uso" solo dice: *"La Cámara Colombiana de la Construcción procura que los datos suministrados en el censo de Coordenada Urbana [...] mantenga altos estándares de calidad."* No trae cláusulas de redistribución.
- **API:** no se encontró ninguna API pública documentada.
- **[INFERIDO]** Conaltura probablemente es afiliada a Camacol Antioquia. Puede valer la pena comparar o complementar fuentes.

### DANE – Censo de Edificaciones (CEED) [OBSERVADO]

- Es una operación oficial **trimestral** con microdatos descargables en https://microdatos.dane.gov.co (catálogo CEED). Ficha metodológica: https://www.dane.gov.co/files/operaciones/CEED/DSO-CEED-FME-001_V12.pdf
- Es gratuita y de uso abierto, pero **no tiene el nivel de proyecto ni de sala de ventas** ni precios o ritmo de ventas comparables. Sirve como contexto macro y no reemplaza a La Galería.

### Portales (Fincaraíz, Ciencuadras, Metrocuadrado) [OBSERVADO o INFERIDO]

- Publican informes periódicos, y Ciencuadras usa a La Galería como aliada.
- **No se encontró ninguna API pública** de datos de proyectos.
- **[INFERIDO]** Raspar portales de terceros tiene sus propios riesgos de términos de uso. No se recomienda como sustituto.

---

## 4. Opciones para que Conaltura automatice, ordenadas por seguridad legal y esfuerzo

| # | Opción | Seguridad legal | Esfuerzo | Comentario |
|---|--------|-----------------|----------|------------|
| a | **Export manual mensual + carga en la herramienta**: plantilla fija, carpeta compartida, validador de columnas, importador idempotente | **Alta** [INFERIDO]: es uso interno, como dice el comunicado | Bajo: unos 15 a 30 min al mes de una persona | Se puede hacer de inmediato. Hay que fijar el formato del "Soportes" para que el parser no se rompa. Se puede reducir a "arrastrar el archivo" o "reenviar a un correo" que la herramienta procesa. |
| b | **Pedir a La Galería feed, API, entrega programada o integración BI** dentro del contrato | **La más alta**: queda autorizado por escrito | Medio: negociación más integración | Sirve cualquier canal: Excel o CSV programado por correo o SFTP, acceso a base de datos, API o "Estudio Personalizado" recurrente. Pedir que el permiso de uso interno y de herramientas o terceros quede en el contrato. **[INFERIDO]** Puede tener costo adicional. |
| c | **Automatizar el navegador sobre la sesión del usuario** (Playwright o similar, con el código 2FA ingresado por una persona o leído del correo) | **Media-baja sin permiso** [INFERIDO]: no hay prohibición pública, pero sí riesgo contractual o de bloqueo de cuenta. **Alta con permiso escrito.** | Medio-alto, con mantenimiento continuo | Se rompe cada vez que cambie la UI o el flujo 2FA. Leer el código del buzón de forma automática equivale a saltarse un control de seguridad del proveedor, y **no se recomienda sin autorización expresa**. Es mejor una ejecución semiasistida, donde el humano mete el código. |
| d1 | **Mejorar la opción a con un "buzón de ingesta"**: el director reenvía el Excel a un correo o carpeta y la herramienta lo procesa solo | Alta | Bajo | Es la "automatización" más rápida sin tocar G.A.I.N. |
| d2 | **Complementar o comparar con Coordenada Urbana (Camacol)** | Alta (si se contrata) | Medio | Camacol ofrece de forma pública bases a la medida y Power BI. Sirve como palanca de negociación o como segunda fuente. |
| d3 | **Pedirle a La Galería que el consultor asignado envíe el export cada mes** | Alta | Muy bajo | Opción intermedia mientras se negocia la b. |

**Orden sugerido:** a/d1 ya → b en paralelo (correo formal esta semana) → c solo si La Galería la autoriza por escrito y no ofrece la b.

---

## 5. Preguntas para la sesión de mañana

### Para Conaltura (director de mercadeo y quien administre el contrato)

1. ¿Tienen a mano el **contrato u orden de servicio de la membresía** con La Galería? ¿Incluye términos de uso, cláusulas de confidencialidad, de uso de herramientas automáticas o de entrega de datos?
2. Al entrar a G.A.I.N., ¿hay que aceptar términos y condiciones? ¿Los pueden descargar o hacer captura?
3. ¿Qué es exactamente el reporte **"Soportes"**? ¿Qué columnas trae, si es por proyecto, por tipología o por mes, si es un Excel con varias hojas y si trae datos personales de contactos? ¿Pueden compartir un ejemplo?
4. ¿Cuántos estudios o "Soportes" exportan al mes, de qué zonas y con qué frecuencia real de actualización?
5. ¿Cómo llega el código 2FA (correo, SMS o app)? ¿A qué buzón? ¿Cuántos usuarios tiene la membresía?
6. ¿Tienen un **consultor asignado** en La Galería? ¿Quién es?
7. ¿Quiénes usarán la herramienta interna? ¿Solo empleados de Conaltura o también terceros (consultores, socios, fiducia, bancos)?
8. ¿Dónde se alojará la herramienta y quién la opera? Esto define si un tercero queda con acceso a los datos.
9. ¿Son afiliados a **Camacol Antioquia** o tienen acceso a **Coordenada Urbana**? Esto también aclara si "Coordenadas" se refiere a Coordenada Urbana.
10. ¿Qué decisiones alimenta la herramienta (precios, absorción, lotes)? Así se prioriza qué campos se necesitan.

### Para La Galería Inmobiliaria (vía consultor o mercadeo@lagaleriainmobiliaria.com)

1. ¿Ofrecen **API, feed de datos, entrega programada (Excel o CSV por correo o SFTP) o conexión a Power BI** para suscriptores? ¿Con qué costo?
2. ¿Nos **autorizan por escrito** a cargar los exports de G.A.I.N. en una herramienta interna de Conaltura, de acceso restringido a sus empleados?
3. Si un proveedor de tecnología de Conaltura aloja u opera la herramienta, ¿basta un acuerdo de confidencialidad con él?
4. ¿Permiten la **automatización de la descarga** con la cuenta propia del usuario (script o navegador)? ¿Hay límites de frecuencia o volumen?
5. ¿Hay términos de uso de G.A.I.N. distintos del "Comunicado importante" de divulgación? ¿Nos los pueden enviar?
6. ¿El formato de "Soportes" es estable? ¿Avisan cuando cambian columnas?
7. ¿Hay un diccionario de variables o metodología del censo (definiciones de oferta, ventas, precio, rotación)?
8. ¿Pueden incluir cuentas de servicio o un usuario técnico sin 2FA interactivo para integraciones?
9. ¿En qué fecha de cada mes queda publicado el corte del censo de Medellín y del Valle de Aburrá?

---

## Fuentes

- Sitio oficial: https://www.lagaleriainmobiliaria.com/
- Login G.A.I.N.: https://gain.lagaleriainmobiliaria.com/sesion/?next=/ (redirige desde https://siga.lagaleriainmobiliaria.com/sesion/?next=/)
- Comunicado de divulgación: https://lagaleriainmobiliaria.com/wp-content/uploads/2024/03/Comunicado-autorizacion-de-datos-LGI.pdf
- Política de datos personales: https://lagaleriainmobiliaria.com/wp-content/uploads/2023/10/Politica_Tratamiento_Datos_Personales_-6-10-2023.pdf
- Empresa distinta, no confundir: https://galeriainmobiliaria.com.co/ (inmobiliaria de Bucaramanga)
- Camacol, "¿Qué es Coordenada Urbana?": https://camacol.co/sites/default/files/2024-10/Que_es_Coordenada_Urbana.pdf
- Camacol, diccionario de variables CU, clientes V4: https://camacol.co/sites/default/files/descargables/Diccionario%20de%20variables_base%20de%20datos%20CU_Clientes_V4.pdf
- DANE CEED: https://www.dane.gov.co/files/operaciones/CEED/DSO-CEED-FME-001_V12.pdf y https://microdatos.dane.gov.co
- Uso de datos de La Galería por terceros (contexto): Observatorio Hábitat Bogotá, https://observatorio.habitatbogota.gov.co/ ; Ciencuadras, https://www.ciencuadras.com/blog/wp-content/uploads/2026/08/Informe-I-semestre-2026.pdf
