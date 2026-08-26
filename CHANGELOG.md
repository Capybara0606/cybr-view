# CHANGELOG

> Bitácora de versiones de CYBR VIEW.
> Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/) y
> [Semantic Versioning](https://semver.org/lang/es/).
> Campos: `Added` · `Changed` · `Fixed` · `Removed`. Todo en orden cronológico desc.

---

## [0.9.0] — 2026-08-26

### Fixed
- **FASE 8 — Estabilización / auditoría.**
- **Memory leak de listeners Firebase**: `listenComments` ahora devuelve un `off()` y
  `session.attach()` lo invoca al cambiar de proyecto/versión (antes los listeners se
  acumulaban en cada cambio).
- Eliminado código muerto: export `padTime` (`time.js`) y `COMMENT_STATUS` (`status.js`).

### Added
- Estado de carga **`INITIALIZING REVIEW SYSTEM...`** (overlay) al arrancar.
- **`README.md`**: qué es, arquitectura, Firebase, Drive, límite 160 MB, desarrollo local,
  deployment, configuración y troubleshooting.

### Changed
- Versión `identity.version` → `0.9.0` (prod/dev); `meta.status` → `SENT_FOR_REVIEW`.

### Audited
- Responsive verificado en 1920/1440/1280/1024/768x1024/390/430 (sin overflow horizontal;
  player + comentarios visibles en móvil).
- Seguridad: sin secretos en el repo (solo la apiKey web pública de Firebase en `config/prod.js`).
- GitHub Pages desde instalación limpia (workflow `path: web`; `web/media/` ignorado en git).

---

## [0.8.0] — 2026-08-26

### Added
- **FASE 7 — Gestión completa de revisiones.**
- `web/js/status.js`: máquina de estados de revisión — `DRAFT → SENT_FOR_REVIEW →
  CHANGES_REQUESTED → SENT_FOR_REVIEW → APPROVED → ARCHIVED` con transiciones permitidas
  (sin saltos absurdos, validado con `canTransition`).
- `web/js/data.js`: seed con nuevos estados (`SENT_FOR_REVIEW`/`CHANGES_REQUESTED`/`DRAFT`);
  campos de versión `approvedAt`/`approvedBy`/`activity` (log); `reviewId` = token en aprobación.
  Clave de storage renovada (`v4`).
- `web/js/session.js`: `setReviewStatus` (valida transición), `approveActive` (registra
  approvedAt/approvedBy/reviewId y conserva comentarios), activity log básico
  (`comment_created`/`comment_resolved`/`comment_reopened`/`reply_created`/`review_approved`/
  `review_reopened`/…), cableado en add/setStatus.
- `web/js/comments.js`: **respuestas** (botón REPLY → `parentId` + tag `↳ REPLY`) y botón
  DELETE oculto para el cliente (`canDelete: false`).
- `web/js/app.js`: dashboard enriquecido (VERSION · REVIEW STATUS · OPEN/RESOLVED · LAST
  ACTIVITY + acciones PUBLISH/REQUEST CHANGES/REOPEN/APPROVE/ARCHIVE) y botón **APPROVE**
  del cliente con confirmación ("Approve this version?").
- `shared/constants.js`: `REVIEW_STATUS`, `REVIEW_TRANSITIONS`, `ACTIVITY_TYPES`.

### Changed
- El dashboard muestra el estado de revisión y contadores abiertos/resueltos + última actividad.

---

## [0.7.0] — 2026-08-26

### Added
- **FASE 6 — Acceso y seguridad (editor autenticado + cliente por review token).**
- `web/js/auth.js`: autenticación del editor. Usa **Firebase Authentication** (email/password)
  cuando hay config; en modo local/DEV simula una sesión de editor (para pruebas).
- `web/js/firebase.js`: añadido `signInWithEmail`, `signOutUser`, `onAuthState` + app única
  compartida entre database y auth.
- `web/js/data.js`: `generateToken()` (96 bits aleatorios) y campos `accessToken`/`accessStatus`
  (`active`/`revoked`) por versión + `findByToken(tree, token)`.
- `web/js/session.js`: `resolveToken(token)`, `openReview(token)` y `setAccessStatus(token, status)`.
- `web/js/app.js` (rehecho): **router por hash** con vistas `#/login`, `#/dashboard` (requiere
  auth) y `#/review/:token` (público). El cliente no ve selectores ni dashboard. Revocación desde
  el dashboard; token inválido/revocado → **`REVIEW ACCESS DENIED`**.
- `web/index.html`: vistas login / dashboard / review + logout + `firebase/auth` en el importmap.
- `web/css/app.css`: estilos de login, dashboard y acceso denegado.
- **`SECURITY.md`**: modelo de acceso, review tokens, revocación, reglas y limitaciones.
- **`database.rules.json`**: reglas de RTDB (editor `auth!=null`; cliente por `reviews/{token}`
  si `tokens/{token}.status == active`). Desplegar con `firebase deploy --only database`.

### Changed
- La review ya no muestra selectores de proyecto/versión (el editor gestiona desde el dashboard;
  el cliente solo ve su versión por token).

### Seguridad / honestidad
- La seguridad real está en **Firebase Rules** (no en JS/UI). El código está probado en **modo
  local/DEV**; para producción faltan (requiere tu cuenta Firebase): habilitar Email/Password,
  crear el usuario editor y desplegar las reglas (ver `SECURITY.md`).

---

## [0.6.1] — 2026-08-26

### Fixed (auditoría del video de Drive)
- **Video bloqueado en el navegador** (`ERR_BLOCKED_BY_RESPONSE.NotSameSite` / `Format error`).
  Causa raíz: el servidor de descarga de Google añade `Cross-Origin-Resource-Policy: same-site`,
  `Cross-Origin-Embedder-Policy: require-corp`, `Content-Security-Policy: sandbox` y `Set-Cookie`,
  que Chrome bloquea al cargar el video desde otro sitio. Fix: el proxy (`deploy/worker/worker.js`)
  construye cabeceras **limpias** (copia solo `content-range/content-length/last-modified/etag`) y
  fuerza `cross-origin-resource-policy: cross-origin` + `content-disposition: inline`.
- **Firebase SDK no cargaba**: las URLs de `esm.sh` eran incorrectas (`/firebase/app@…` → 404).
  Fix: `https://esm.sh/firebase@10.12.2/app` y `…/database` (verificado 200).
- **Inestabilidad del Worker (404 intermitente)**: un `wrangler.jsonc` corrupto en una carpeta
  padre (`Default Project/`) interfería con `wrangler`. Fix: desplegar desde una carpeta limpia
  con `npx wrangler deploy --config wrangler.toml`.

### Changed
- `deploy/worker/worker.js`: manejo de `OPTIONS` (preflight CORS) + cabeceras limpias.

---

## [0.6.0] — 2026-08-25

### Added
- **FASE 5.5 — MVP WEB PÚBLICO (static).**
  > Prepara la app para desplegar en **GitHub Pages** (frontend estático) con **Firebase RTDB**
  > (solo datos/comentarios) y **Google Drive** (solo video).
- **Separación de entornos:** `web/js/config/` con `dev.js` y `prod.js`; `web/js/config.js`
  resuelve vía `?env=dev` (por defecto `prod`). URLs de video y config web de Firebase
  centralizadas por entorno. Eliminado `config.example.js`.
- **`firebase.js` (rework):** listeners/comentarios por `(projectId, versionId)` y fallback
  a local en caso de error. `createComment/updateComment/deleteComment/listenComments/onConnection`.
- **`session.js` (rework):** comentarios de la versión activa en **Firebase realtime** cuando
  está configurado, o en localStorage si no (fallback). Actualización optimista + `onValue`.
- **`data.js`:** catálogo de proyectos/versiones con `videoUrl` desde `CONFIG.demo` (sin
  archivos de video en el repo; clave de storage renovada a `projects:v2`).
- **`deploy/worker/worker.js`:** proxy Cloudflare para servir video de Drive grande con
  Range+CORS (`confirm=t`).
- **`.github/workflows/deploy.yml`:** deploy automático de `web/` a GitHub Pages.
- **`DEPLOYMENT.md`:** guía paso a paso (repo, Pages, Firebase, video, pruebas) + limitaciones.
- `index.html`: favicon inline (SVG), sin peticiones externas.
- `app.js`: indicador de entorno y backend (`LOCAL // PROD` / `FIREBASE // ONLINE`).

### Changed
- `.gitignore`: ignora `web/media/` (no subir videos) y artefactos; la config web
  (`config/*.js`) ahora sí se versiona (son credenciales públicas).
- El reproductor ya no fuerza fallback al arrancar sin fuente (la fija la versión activa).

### docs
- `FIREBASE-RULES.md`: nota de **MVP/desarrollo** (reglas en modo test; exigen Auth antes de
  clientes reales).
- `ARCHITECTURE.md` / `DECISIONS.md`: ADR-014 (entornos), ADR-015 (video Drive→Worker),
  ADR-016 (Firebase solo comentarios).
- `DEPLOYMENT.md`: **prueba técnica de Drive** documentada (206 + Range + CORS para <100 MB;
  bloqueo para renders grandes).

### Seguridad / honestidad
- Las reglas de RTDB son de **desarrollo**; sin Authentication no son aptas para clientes reales.
- **No probado aquí:** Firebase realtime E2E con dos dispositivos (requiere tu proyecto +
  config) y video Drive de 5 GB (solo vía proxy Worker). Se documenta en `DEPLOYMENT.md`.

### Deployment (realizado)
- Sitio publicado en https://capybara0606.github.io/cybr-view/ (GitHub Pages, workflow automático).
- Config de Firebase (proyecto `cybr-view`, RTDB modo test) activada en `config/prod.js`.
- V01 de MULTIMONEY apunta al render 4K real en Drive vía
  `drive.usercontent.google.com/download?id=…&export=download&confirm=t` (verificado con probe:
  `206 Partial`, `video/mp4`, `Access-Control-Allow-Origin: *`, `Accept-Ranges: bytes`).
- **Solución sin infra adicional:** el enlace directo con `confirm=t` permite `<video>` con
  play/seek. El proxy `deploy/worker/worker.js` queda como *fallback robusto* por si Drive
  cambia su comportamiento.

---

## [0.5.0] — 2026-08-25

### Added
- **FASE 4 — Plataforma PROJECT → VERSION → COMMENTS.**
  > Convierte el sistema en una plataforma que maneja proyectos, versiones y comentarios.
  > Cada comentario pertenece a UNA sola versión (nunca se mezclan).
- `web/js/data.js`: modelo de datos local (proyectos → versiones → comentarios) + semilla
  de datos y persistencia en **localStorage** (sobrevive a la recarga).
- `web/js/session.js`: sesión de revisión — mantiene proyecto/versión activos y expone una
  "tienda" de comentarios **segmentada por versión** (add/setStatus/remove/subscribe/find/
  sortedByTime). Selección de proyecto y de versión, con notificación de cambio.
- `web/js/player.js` (extendido): nuevo `setSource(url)` para **cambiar de video** al
  cambiar de versión (rebusca el vídeo y recarga).
- `web/index.html`: secciones **`/01 PROJECT`** (selector de proyecto), **`/02 VERSION`**
  (chips V01/V02/V03), **`/03 REVIEW`** (status). El panel de comentarios pasa a `/04`.
- `web/css/app.css`: estilos de la fila de selectores, control `<select>`, chips de versión
  activos y estados.
- `web/js/app.js`: conecta reproductor + sesión + comentarios; puebla los selectores y actualiza
  video, comentarios, markers y metadata al cambiar de proyecto/versión.

### Changed
- El reproductor ahora toma la URL del video desde la **versión activa**, no ya desde un único
  `CONFIG.video.url`.
- Al cambiar de versión cambian juntos: **video · comentarios · markers · metadata/status**.

### Removed
- `web/js/state.js` (sustituido por `session.js` + `data.js`).

### Data
- Semilla: proyecto **MULTIMONEY** (V01 [tu render 4K], V02, V03) con comentarios distintos en
  V01 vs V02; y proyecto **SHORTS** (V01) para probar el selector de proyecto.
- Estructura alineada a `DATA-MODEL.md` (`projects/{id}/versions/{id}/comments/{id}`).
- Firebase RTDB queda como adaptador preparado (`firebase.js`) para una fase posterior; en esta
  fase los datos son locales (persistidos en localStorage).

---

## [0.4.0] — 2026-08-25

### Added
- **FASE 3 — Comentarios en Firebase Realtime Database.**
  > Ajuste del roadmap pedido por el usuario: la FASE 3 sustituye el almacenamiento local
  > por Firebase RTDB (más adelante); se conserva toda la interfaz.
- `web/js/firebase.js`: capa de datos RTDB con **SDK modular v9+** (ESM vía importmap,
  `esm.sh/firebase@10.12.2`, sin build). Exporta `configured`, `listenToComments`
  (**listener realtime, sin polling**), `createComment`, `updateComment`, `deleteComment`
  y `onConnection`.
- `web/js/state.js` (refactor): ahora es un **adaptador** que usa Firebase si está
  configurado o cae a **memoria (modo LOCAL/DEV)** si no. Mapea a los campos del
  DATA-MODEL (`authorName` / `body` / `timeCode`).
- `web/js/app.js` (async): arranca el store (Firebase o seed local), y pinta el estado
  del backend en la UI.
- `web/index.html`: `importmap` para Firebase + barra `modbar` (estado de almacenamiento).
- `web/css/app.css`: estilos del botón DELETE, barra de estado y estados del indicador
  (`is-online` / `is-degraded` / `is-local`).
- `comments.js`: nueva acción **DELETE** (con confirmación); campos renombrados a
  `authorName`/`body`/`timeCode`; usa `store.setStatus` y `store.remove`.
- Config central `config.js` con **placeholders** de Firebase (apiKey, authDomain,
  databaseURL, projectId, storageBucket, messagingSenderId, appId) + namespace
  `review.projectId` / `review.version`.

### Changed
- Estructura de datos: se adopta el árbol **versionado** del DATA-MODEL
  (`cybrview/v1/projects/{projectId}/versions/{version}/comments/{commentId}`) en vez
  del aplanado `projects/{pid}/comments`. Ver ADR-009.
- Comentario: campos `author`→`authorName`, `text`→`body`, `timecode`→`timeCode`
  (alineado al DATA-MODEL).

### Security
- **Las reglas de RTDB son de DESARROLLO.** Con `config.js` vacío la app corre en
  `STORAGE // LOCAL DEV` sin persistencia. Al conectar Firebase se indica
  `FIREBASE // ONLINE` y se recuerda que las reglas no son de producción
  (ver `docs/FIREBASE-RULES.md`). **No se usan credenciales reales.**

---

## [0.3.0] — 2026-08-25

### Added
- **FASE 2 — Sistema de comentarios con timecode (memoria / local state).**
  > Ajuste del roadmap pedido por el usuario: FASE 2 = comentarios en local; Firebase pasa a una fase posterior.
- `web/js/state.js`: tienda de comentarios **en memoria** (no persistente) con `add`,
  `setStatus`, `sortedByTime`, `subscribe` y generador de ids. Preparada para ser
  sustituida por Firebase en la FASE 3.
- `web/js/comments.js`: controlador del panel `/02 COMMENTS` — composer que **pausa el
  video y captura `currentTime` al enfocar** (muestra `[MM:SS.CC]`), envío (SEND /
  ⌘/Ctrl+Enter), render de registros (timecode, `USER //`, `STATUS //`, texto), **click
  para saltar al timestamp**, resolución (RESOLVE / REOPEN), navegación **◄ PREV / NEXT ►**
  con contador, comentario activo y sincronización de markers con el reproductor.
- `web/js/player.js` (extendido): API `seekTo/pause/play/getTime/setActiveMarker`,
  marcadores **clicables** en la timeline (posicionados proporcionalmente a la duración,
  con estados `is-active` e `is-resolved`), flechas ←/→ = seek ±1s, y guarda de teclado
  que respeta `input/textarea/button/contenteditable`.
- `web/js/time.js`: nuevo `formatCode(seconds)` → `MM:SS.CC` (p. ej. `00:34.27`) para
  los timecodes de comentario.
- `web/index.html`: layout de revisión en dos columnas (video + panel de comentarios),
  panel `/02 COMMENTS` con composer y lista, markers en la timeline.
- `web/css/app.css`: estilos del panel de comentarios, composer, registros (activo/
  resuelto), navegación y markers interactivos (responsive en ≤ 980px).
- `web/js/app.js`: bootstrap conecta reproductor + store + comentarios, siembra 5
  comentarios de prueba (00:05 / 00:12 / 00:34 / 01:18 / 01:45) y atajo **C**.

### Changed
- Atajos de teclado: `Space` play/pausa · `←`/`→` seek hacia atrás/adelante · `C` crear
  comentario (inactivos mientras se escribe texto).

---

## [0.2.0] — 2026-08-25

### Added
- **FASE 1 — Scaffold Web + Reproductor de video.**
- `web/index.html`: identidad (CYBR_VIEW / KIRU / VIDEO REVIEW // SYSTEM), topbar con
  nav (PROJECTS / REVIEWS / SYSTEM) e indicador `SYSTEM ONLINE`, sección `/01 VIDEO REVIEW`,
  metadata (PROJECT // · VERSION // · STATUS // READY · FPS //) y bloque VIDEO PLAYER.
- `web/css/app.css`: estética cyber-brutalista (rejilla técnica, bordes finos, labels
  uppercase monoespaciados, secciones `/01`, indicadores verdes, microanimaciones y
  focus accesible). Respeta los tokens de `css/tokens.css`.
- `web/css/tokens.css`: (ya existente) mantiene la paleta KIRU como fuente de estilo.
- `web/js/config.js`: **configuración central** — `VIDEO_URL`, poster, fps y metadata.
  La URL del video vive únicamente aquí (no duplicada). `config.js` está ignorado en git;
  se añade `config.example.js` como plantilla versionable.
- `web/js/time.js`: `formatTime` (HH:MM:SS) y `formatTimecode` (HH:MM:SS:FF), conservando
  la precisión decimal en segundos internamente (docs/TIMECODE.md).
- `web/js/player.js`: reproductor Vanilla JS con controles custom — PLAY/PAUSE,
  FRAME - / FRAME + (paso 1/fps), TIME (actuales / duración), VOLUMEN + MUTE,
  FULLSCREEN; timeline custom con regla de tiempo (tick labels), lane de marcadores
  preparada para la FASE 3, buscador con scrubber (click/drag/hover preview) y buffer.
  Añade atajos de teclado (Space, ←/→, F, M) y estados accesibles (aria, focus).
- `web/js/app.js`: bootstrap/enrutado — cargan metadata desde `config.js`, montan el
  reproductor y unen la navegación.

### Changed
- (Nada — refactor no aplicable en esta fase.)

---

## [0.1.0] — 2026-08-25

### Added
- **Fase 0 — Arquitectura y documentación.**
- Raíz del proyecto aislada en `cybr-view/` (no mezclada con los proyectos existentes
  de la carpeta contenedora: `kiru-site`, `cybr-audio-site`, `MotionCapy`, `PremiereCleanup`, etc.).
- `AGENTS.md`: identidad, stack, mapa de carpetas, design tokens, convenciones y reglas.
- `ARCHITECTURE.md`: visión completa, diagramas, componentes, modelo de datos,
  pipeline de video, arquitectura CEP, registro de riesgos (R1–R12) y ADR.
- `ROADMAP.md`: plan por fases (Fase 0..9 + futura) con criterios de aceptación.
- `docs/` con especificaciones técnicas:
  - `DATA-MODEL.md` — modelo de datos / esquema Firebase.
  - `FIREBASE-RULES.md` — reglas de seguridad Realtime Database.
  - `TIMECODE.md` — spec de timecode / fps / frames.
  - `VIDEO-PIPELINE.md` — fuentes de video, formatos, CORS, CDN.
  - `CEP-ARCHITECTURE.md` — arquitectura del panel CEP + ExtendScript.
  - `SYNC-SPEC.md` — contrato de sincronización en tiempo real.
  - `DECISIONS.md` — Registro de decisiones de arquitectura (ADR-001..008).
- Estructura de carpetas inicial de `web/`, `cep/` y `shared/` (placeholders, sin lógica
  de aplicación).

### Changed
- (Nada aún — primera versión.)

---

## [0.0.0] — 2026-08-25

### Added
- Revisión del directorio contenedor y detección de proyectos existentes.
- Decisión de crear CYBR VIEW como proyecto aislado (`cybr-view/`).
- Inicio del registro de versiones.
