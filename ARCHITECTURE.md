# CYBR VIEW — Architecture

> **PRODUCT:** CYBR VIEW
> **BRAND:** KIRU
> **TAGLINE:** VIDEO REVIEW // SYSTEM
>
> Documento de arquitectura de la **FASE 0**. Define la visión completa del sistema.
> La implementación se hará por fases según `ROADMAP.md`.

---

## 1. Resumen ejecutivo

CYBR VIEW conecta a un **cliente** (revisando un video en el navegador) con un **editor**
(trabajando dentro de Adobe Premiere Pro), usando **Firebase Realtime Database** como
única fuente de verdad. El comentario del cliente queda amarrado a un *timecode*; cuando
el editor abre la extensión, ve esos comentarios en tiempo real y, con un clic, mueve el
playhead al instante exacto y crea marcadores en el timeline.

El sistema define **tres superficies** que comparten un mismo modelo de datos:
la **Web** (cliente), el **CEP Panel** (editor) y **Firebase** (núcleo).

## 2. Diagramas de flujo

### 2.1 Alta arquitectura
```
[CLIENTE] --link--> [CYBR VIEW WEB] ----(lectura/escritura)----+
                                                            |
                                                            v
                                                      [ FIREBASE ]
                                              (Realtime + Auth + Rules)
                                                            ^
                                                            |
[EDITOR] ----------> [CYBR VIEW CEP PANEL] ----(lectura/escritura)----+
                                  |  evalScript / JSON
                                  v
                          [ ExtendScript .jsx ]
                                  v
                      [ ADOBE PREMIERE PRO ]
          (playhead · timecode · marcadores · secuencia activa)
```

### 2.2 Flujo de revisión (cliente)
1. El editor comparte un enlace `/review/:reviewId` (una "versión" de video).
2. El cliente abre el enlace → la Web carga la **versión** y su **video** (URL configurable).
3. El cliente reproduce / pausa. Al escribir un comentario, se captura el **timecode actual**
   (`time` en segundos + `timeCode` display + `frame` + `fps`).
4. El comentario se escribe en Firebase → llega en tiempo real al CEP del editor.
5. El cliente puede **responder**, **resolver** y **aprobar** la versión.

### 2.3 Flujo del editor (CEP)
1. El editor autentica el panel y selecciona una **secuencia** de Premiere ligada a una **versión**.
2. El panel se suscribe a los comentarios de esa versión.
3. Al aparecer un comentario: clic → `setPlayerPosition(time)` (mueve el playhead).
4. Botón "crear marcador" (o automático) → `sequence.markers.createMarker(time)` con un
   nombre/identificador que enlaza al `commentId`.
5. Resolver / responder desde Premiere → se escribe de vuelta a Firebase.

## 3. Componentes y responsabilidades

| Componente | Responsabilidad | Tecnología | Runtime |
|------------|-----------------|------------|---------|
| **Web app** | Entrada del cliente. Reproducir video, crear/ver/resolver/responder comentarios, saltar a timecode, aprobar versión. | HTML/CSS/Vanilla JS (ES Modules) + Firebase web SDK | Navegador |
| **Router** | Resolver `/review/:id` y cargar la versión correcta. | Vanilla JS | Navegador |
| **Player** | Abstraer `<video>`: play/pause, seek, reportar tiempo (polling del `timeupdate`), resolver `timeCode` display. | Vanilla JS + HTML `<video>` | Navegador |
| **State/store** | Caché local + suscripción en tiempo real a Firebase. Estado de comentarios por versión. | Vanilla JS | Navegador |
| **Firebase RTDB** | Fuente de verdad. Persistencia y difusión en tiempo real. Reglas de seguridad. | Firebase Realtime Database | Servicio |
| **Firebase Auth** | Identidad de editores y clientes. | Firebase Authentication | Servicio |
| **CEP Panel** | UI del editor dentro de Premiere. Muestra comentarios, dispara playhead/marcadores. | CEP (HTML/CSS/JS) | Adobe CEF |
| **ExtendScript bridge** | Puente entre el panel (JS moderno) y Premiere (ExtendScript ES3). | `*.jsx` + `CSInterface.evalScript` | Premiere |
| **Shared** | Constantes de identidad/tokens, enums, shape de entidades. | JS | Copiado a ambos |

## 4. Superficies y despliegue

| Superficie | Ruta | Despliegue |
|------------|------|-----------|
| Web (cliente) | `cybr-view/web/` | Hosting estático (Netlify/Firebase Hosting) con soporte HTTPS y rutas `/review/:id` |
| CEP Panel | `cybr-view/cep/` | Copiar a `%APPDATA%\Adobe\CEP\extensions\` (Win) o `~/Library/Application Support/Adobe/CEP/extensions/` (Mac). Requiere `PlayerDebugMode` o firma. |
| Firebase | — | Proyecto de Firebase (RTDB + Auth + Rules) |

> **Separación importante:** la Web y el CEP son artefactos **independientes**. El CEP no
> depende de la Web ni al revés; ambos solo dependen de Firebase. Esto permite desplegar
> y versionar cada superficie por separado.

## 5. Modelo de datos — vista de arquitectura

La fuente única de detalle es `docs/DATA-MODEL.md`. Resumen de entidades:

- **Project** `projects/{projectId}` — proyecto de un cliente de KIRU. Contiene `meta`.
- **Version** `projects/{projectId}/versions/{versionId}` — una versión de video revisable.
  Es la entidad que se comparte (`/review/:versionId`). Guarda `videoUrl`, `status`,
  `approved`, `fps`, `frameRate`, orden `/01..`.
- **Sequence** `projects/{projectId}/sequences/{sequenceId}` — vínculo entre una
  secuencia de Premiere (por `nodeId`) y una versión de revisión.
  > ⚠️ La secuencia y sus marcadores SON de Premiere; CYBR VIEW nunca los duplica.
  > Solo guarda el mapeo.
- **Comment** `projects/{projectId}/versions/{versionId}/comments/{commentId}` —
  comentario con `time` (segundos), `timeCode` (string), `frame`, `fps`, `parentId`
  (respuestas), `status` (`open|resolved`), autor, timestamps. Accesible por índice de
  tiempo (para listar ordenado) y por id (selección/seek).

Los comentarios se guardan **bajo la versión** por un motivo: cada revisión es una
"línea de tiempo" independiente; la v1 y la v2 no comparten comentarios.

## 6. El contrato de comunicación Web ↔ CEP (vía Firebase)

No existe canal directo Web↔CEP. Todo pasa por RTDB. El contrato es:

**Lecturas/escrituras del Web:**
- LEE `versions/{versionId}` + `versions/{versionId}/comments`.
- ESCRIBE comentarios, respuestas, `status`, `approved`.

**Lecturas/escripciones del CEP:**
- LEE los mismos nodos (tiempo real, `onValue`/`onChildAdded`).
- ESCRIBE `status`, respuestas, resolución, y enlaza `sequences/{sequenceId}`.

**Nodo de presencia / estado:**
- `presence/` para indicar quién está conectado (viewport de seguridad/UX).

### 6.1 Acceso y seguridad (FASE 6)

- **Cliente:** sin cuenta. Entra por `#/review/:token` (token aleatorio, revocable). No ve el
  dashboard ni otros proyectos/versiones.
- **Editor:** autenticado con Firebase Authentication (email/password). Dashboard con revocación
  de links.
- **Seguridad en RTDB** (`database.rules.json`): editor `auth != null`; cliente por
  `reviews/{token}` solo si `tokens/{token}.status == 'active'`. Ver `SECURITY.md`.

### 6.2 Estados de revisión y aprobación (FASE 7)

Máquina de estados de una **versión** (`web/js/status.js`):

```
DRAFT ──► SENT_FOR_REVIEW ──► CHANGES_REQUESTED ──► SENT_FOR_REVIEW ──► APPROVED ──► ARCHIVED
  │                              ▲                                                    │
  └──────────────────────────────┘                                                    └─ (terminal)
   (también DRAFT ─► ARCHIVED)
```

- Transiciones validadas (`canTransition`); no se permiten saltos absurdos.
- **Aprobación** (cliente): `SENT_FOR_REVIEW → APPROVED` con confirmación; registra
  `approvedAt`, `approvedBy`, `reviewId` (= token) y **no borra los comentarios** (historial).
- **Activity log** básico por versión: `comment_created`, `comment_resolved`, `comment_reopened`,
  `reply_created`, `review_approved`, `review_reopened`, etc.

## 7. Pipeline de video (proxy de revisión en Drive)

El video **no** se almacena en Firebase ni en el repositorio. CYBR VIEW recibe solo un
**proxy de revisión** ligero; el **master** permanece fuera del sistema.

- **Almacenamiento:** Google Drive. **Máximo oficial: 160 MB** (`MAX_VIDEO_SIZE_MB = 160`
  en `shared/constants.js`). Un archivo **> 160 MB nunca es un video válido de revisión**.
- **Especificación:** MP4 · H.264 · AAC · 1080p (720p aceptable).
- **Entrega:** el `<video>` carga **directamente** la URL de Drive configurada por versión
  (`version.videoUrl`). **No hay servidor intermedio de video** (sin Node.js, Vercel,
  Cloudflare Worker, backend de streaming custom ni servidor de transcodificación).
- **Range/seek:** el host debe servir `Accept-Ranges` y `video/mp4` (para el *seek* del
  reproductor). Se valida con `curl -I`.
- **Validación de tamaño:** preferir validar metadatos antes de reproducir si es posible.
  Si el navegador no puede saber el tamaño remoto de forma fiable antes de cargar, **no**
  añadir un chequeo frágil en cliente; documentar el requisito + mensaje claro en UI +
  validar en el flujo de subida/preparación cuando exista.

> ⚠️ **Limitación conocida (verificada empíricamente):** el servidor de descarga de Google
> Drive añade cabeceras (`Cross-Origin-Resource-Policy: same-site`, `Cross-Origin-Embedder-Policy`,
> `Content-Security-Policy: sandbox`, `Set-Cookie`) que **pueden bloquear** la reproducción
> cross-origin del `<video>` en Chrome (error `ERR_BLOCKED_BY_RESPONSE`). Para que la entrega
> "directa desde Drive" funcione en producción, esta limitación debe resolverse (ajuste de
> compartición en Drive o una solución de cabeceras). Se documenta para no asumir que funciona
> sin verificar.

## 8. Arquitectura del CEP (a futuro)

La estructura estándar CEP es la que ya usan otros proyectos de la carpeta contenedora
(`PremiereCleanup`): `manifest.xml` + `index.html` + `hostscript.jsx` + `CSInterface.js`.

Puntos clave documentados en `docs/CEP-ARCHITECTURE.md`:
- `manifest.xml` con `<Host Name="PPRO">` y rango de versiones; `RequiredRuntime` CSXS.
- El panel usa `CSInterface.evalScript()` para invocar funciones `*.jsx`.
- ExtendScript es **ES3** sin `fetch` ni `Promise`: la comunicación con Firebase se hace
  **desde el lado JS del panel** (que sí tiene acceso a red), no desde el `.jsx`.
- El `.jsx` solo: leer secuencia activa, mover playhead, crear/leer/borrar marcadores.
- `CSInterface.js` se descarga y se incluye (debe ir junto al panel, no desde CDN).

## 9. Riesgos técnicos y soluciones (resumen)

| # | Riesgo | Impacto | Solución propuesta |
|---|--------|---------|--------------------|
| R1 | **Google Drive** como fuente de video | Alto | Solo **proxies de revisión ≤ 160 MB** (`MAX_VIDEO_SIZE_MB`). Drive sirve con `Range`/CORS para archivos pequeños; para cross-origin puede bloquear por `Cross-Origin-Resource-Policy: same-site` (ver §7). No introducir servidor de video intermedio. |
| R2 | **Reproducción MP4 / códecs** | Medio | Usar MP4 H.264/AAC (compatible con la mayoría). MOV/ProRes no reproducibles en navegador. Asegurar **Range requests** para el seek. `crossOrigin` solo si se usa canvas/analytics. |
| R3 | **CORS** en video | Medio | Exigir `Access-Control-Allow-Origin` en host/CDN; probar con `curl -I`. Para Firebase RTDB REST, el CORS funciona. |
| R4 | **Autoplay de navegador** | Bajo | Autoplay con audio requiere gesto del usuario o *muted*. La Web es guiada por click, así que se evita. |
| R5 | **Firebase (proyecto/config)** | Medio | Config clara, SDK modular, `.gitignore` para `config.js`, reglas por rol. |
| R6 | **Realtime Database** límites | Medio | Cada nodo ≤ 32MB; usar lecturas sobrias (solo paths necesarios), `indexOn` en reglas, evitar listados enormes. RTDB es ideal para timeline, no para reportes. |
| R7 | **Sincronización / escrituras concurrentes** | Alto | Optimista + `last-write-wins` con `updatedAt` (no hay `serverTimestamp` en RTDB; usar `.info/serverTimeOffset`). Autores distintos → clave por author para evitar pisar respuestas. |
| R8 | **CEP (sandbox CEF)** | Alto | `manifest.xml` correcto, `CSP` del panel, flags `file://`, `PlayerDebugMode` para desarrollo, firma/despliegue para producción. El panel no debe exigir build si se quiere despliegue directo. |
| R9 | **ExtendScript** | Alto | ES3, sin red, callbacks asíncronos, `app.project.activeSequence` puede ser null. Función central `evalScript` única con `JSON`. Strings de retorno con límites (`$.writeln`). |
| R10 | **Timecode / fps (drop-frame vs non-drop)** | Alto | Guardar tiempo en **segundos** (anchor real de playhead y de `<video>`). `timeCode` display se calcula desde segundos + `fps` (23.976/25/29.97/59.94). Preferir `timecodeType` fijo. Ver `docs/TIMECODE.md`. |
| R11 | **Marcadores de Premiere** | Alto | El id del marcador se asocia al `commentId` (naming `CYBR::<commentId>`). Detectar duplicados antes de crear; actualizar/borrar al resolver. El marcador pertenece a la secuencia, no al proyecto. |
| R12 | **CORS de Firebase desde CEF** | Medio | El panel (CEF) hace fetch/websocket a Firebase; verificar CSP y `--allow-file-access`. En Auth, el popup puede fallar dentro de CEF → usar email/password o token de editor emitido por la Web. |

## 10. Decisiones de arquitectura (índice de ADRs)

| ID | Decisión | Alternativa | Estado |
|----|----------|-------------|--------|
| ADR-001 | **RTDB sobre Firestore** | Firestore | Aceptada. Mejor para timeline en tiempo real + lecturas sobrias por nodo (sin coste de queries). |
| ADR-002 | **Comentarios bajo la Versión** | Comentarios a nivel Proyecto | Aceptada. Aisla cada revisión; la línea de tiempo cambia entre versiones. |
| ADR-003 | **Timecode en segundos + display string** | Solo string | Aceptada. Todo motor/programático usa segundos (playhead/`<video>`); el string es solo para mostrar. |
| ADR-004 | **Video fuera de Firebase** | Subir video a Firebase Storage | Aceptada. El video es pesado y externo; Firebase es solo estado/meta. URL configurable → CDN. |
| ADR-005 | **CEP se une a Firebase sin build** | Empujar build/prebuild en CEP | Aceptada. El panel usa `shared/` por copia; evita toolchain obligatoria para la extensión. |
| ADR-006 | **Auth del CEP = token de editor del Web** | Service account en el panel | Aceptada. Nunca exponer credenciales de servicio en el cliente. El panel autentica con token efímero. |
| ADR-007 | **sincronización last-write-wins + `updatedAt`** | CRDT / txn pesadas | Aceptada. Suficiente para comentarios y estado; evita complejidad. |
| ADR-008 | **Español UI / inglés código** | Todo inglés o todo español | Aceptada. UI del cliente en es-ES; identificadores internos en inglés. |
| ADR-009 | **Comentarios en árbol versionado** (sin UI de versions todavía) | Árbol aplanado | Aceptada. Se usa `versions/{version}` como espacio de nombres (config). |
| ADR-010 | **Campos del comentario alineados al DATA-MODEL** (`authorName`/`body`/`timeCode`) | `author`/`text`/`timecode` | Aceptada. Coherencia con el esquema canónico. |
| ADR-011 | **Firebase modular vía importmap (sin build)** | Bundler / SDK clásico | Aceptada. ESM dinámico solo si hay config; sin toolchain para el web. |
| ADR-012 | **Proyectos/versiones en local (localStorage)** | Firebase ya en esta fase | Aceptada. Grafo `projects/versions/comments` local; `firebase.js` listo para migrar. |
| ADR-013 | **Store de comentarios segmentado por versión** | Store global | Aceptada. Cada versión tiene sus comentarios; nunca se mezclan. |
| ADR-014 | **Entornos config (dev/prod) sin build** | Build/env en node | Aceptada. `web/js/config/{dev,prod}.js`; `?env=dev` o prod por defecto. |
| ADR-015 | ~~Video Drive vía proxy Cloudflare Worker~~ | Migrar a otro CDN | **Superada** por ADR-017 (entrega directa, sin servidor intermedio). |
| ADR-016 | **Firebase solo para comentarios** | Firebase para todo | Aceptada. GitHub Pages estático; Drive guarda video. |
| ADR-017 | **Proxy de revisión ≤ 160 MB, servido directo desde Drive (sin servidor de video intermedio)** | Servidor/proxy de video (Node/Vercel/Worker/transcode) | Aceptada. `MAX_VIDEO_SIZE_MB = 160`; MP4/H.264/AAC/1080p; el navegador carga la URL de Drive directamente; el master queda fuera. |
| ADR-018 | **Acceso por review token (cliente sin cuenta) + editor autenticado** | IDs simples / auth para el cliente | Aceptada. Cliente entra por `#/review/:token` (token aleatorio de 96 bits, revocable). Editor usa Firebase Authentication (email/password). La seguridad está en las reglas de RTDB (`database.rules.json` / `SECURITY.md`). |
| ADR-020 | **Estados de revisión + approval + activity log** | Estados libres | Aceptada. Máquina de estados (`DRAFT → SENT_FOR_REVIEW → CHANGES_REQUESTED → SENT_FOR_REVIEW → APPROVED → ARCHIVED`); aprobación registra `approvedAt/approvedBy/reviewId`; los comentarios se conservan como historial; log de actividad básico. |

Cada ADR con su detalle en `docs/DECISIONS.md`.

## 11. Principios no negociables

- **Firebase es la fuente de verdad.** Web y CEP solo cache-an localmente.
- **Todo se anima con segundos** (`version.fps`, `comment.time`); nada de operar con strings de timecode.
- **El video es un proxy de revisión externo (Drive), ≤ 160 MB**, servido directo; el master no entra en CYBR VIEW.
- **Sin frameworks en la Web** (Vanilla JS). Sin toolchain obligatoria.
- **Sin servidor intermedio de video** (Node/Vercel/Cloudflare Worker/transcodificación).
- **Seguridad por rol:** cliente y editor no tienen los mismos permisos (reglas RTDB).
- **Estética cyber-brutalista KIRU** con los tokens definidos en `AGENTS.md`.
