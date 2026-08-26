# DECISIONS.md — Registro de Decisiones (ADR)

> Todo cambio de arquitectura importante de CYBR VIEW se documenta aquí como ADR.
> Estado: `propuesta | aceptada | superada | rechazada`.

---

## ADR-001 — RTDB sobre Firestore
- **Estado:** aceptada
- **Contexto:** necesitamos difundir comentarios/playhead en tiempo real y lecturas por nodo acotado.
- **Decisión:** usar Firebase **Realtime Database**.
- **Alternativa:** Firestore (mejor queries y escalado de docs grandes, pero costo por consulta y estructura más orientada a colecciones).
- **Consecuencias:** lecturas por path (sin joins), `indexOn`, nodo ≤ 32MB, y **sin `serverTimestamp`** (usar `Date.now()` + offset `.info/serverTimeOffset`). Ventaja: la difusión en tiempo real es nativa y fina.

## ADR-002 — Comentarios bajo la Versión, no bajo el Proyecto
- **Estado:** aceptada
- **Contexto:** cada versión (v1, v2) tiene su propia línea de tiempo; los timecodes cambian.
- **Decisión:** anidar `versions/{id}/comments/{id}`.
- **Alternativa:** `projects/{id}/comments/{id}` (menos anidado pero confunde entre versiones).
- **Consecuencias:** aislar revisión por versión; los comentarios de una v1 no se mezclan con v2.

## ADR-003 — Tiempo en segundos + timecode display
- **Estado:** aceptada
- **Contexto:** el playhead y el `<video>` operan en segundos, pero el humano quiere `00:00:05;12`.
- **Decisión:** guardar **siempre** `time` (segundos), `timeCode` (solo display), `frame`, `fps`. Todo ello junto en el comentario.
- **Alternativa:** guardar solo string de timecode (fragil, no se puede operar).
- **Consecuencias:** facilita `setPlayerPosition` y `createMarker` en segundos; el timecode es un derivado.

## ADR-004 — Video fuera de Firebase (URL configurable)
- **Estado:** aceptada
- **Contexto:** el video pesa y no cabe ni en coste ni en rendimiento en Firebase. Se quiere multi-proveedor.
- **Decisión:** `version.videoUrl` + `version.videoSource`; adaptador `videoSource`.
- **Alternativa:** subir a Firebase Storage (directo, pero abandono de multi-proveedor y coste).
- **Consecuencias:** necesitamos CORS/Range del proveedor; Google Drive no es fiable como CDN (ver `VIDEO-PIPELINE.md`). A favor: sin re-subida, elegir el mejor CDN.

## ADR-005 — El CEP se une a Firebase sin build
- **Estado:** aceptada
- **Contexto:** el panel (CEF) no debe depender de una toolchain de construcción obligatoria si se quiere desplegar directo.
- **Decisión:** `shared/` se resuelve por **copia**, y el panel usa scripts clásicos concatenados (o archivos individuales) en lugar de módulos ESM si el CEF no los soporta.
- **Alternativa:** bundler (Webpack/Vite) para el panel → más limpio pero más complejidad de despliegue.
- **Consecuencias:** mantener el panel autocontenido; si se opta por módulos, el build es opcional.

## ADR-006 — El CEP autentica con token de editor (no con service account)
- **Estado:** aceptada
- **Contexto:** una credencial de servicio incrustada en el panel sería un riesgo de seguridad (se distribuye con la extensión).
- **Decisión:** el editor inicia sesión en la **Web** (email/password) y obtiene un **token efímero** (emitido por el Web o por una Cloud Function) que usa el panel para `signInWithCustomToken` / o login email/password in-panel.
- **Alternativa:** service account en el panel (descartada por seguridad) ; popup OAuth (frágil en CEF).
- **Consecuencias:** flujo de login algo más manual para el editor (copiar token) pero seguro.

## ADR-007 — Sincronización last-write-wins + `updatedAt`
- **Estado:** aceptada
- **Contexto:** no se necesita un CRDT para comentarios/estado; serían sobre-ingeniería.
- **Decisión:** por cada mutación escribir `updatedAt`; el último escribidor gana cuando hay conflicto de mismo campo.
- **Alternativa:** transacciones por nodo / CRDT (más robusto pero más complejo).
- **Consecuencias:** no hay conflictos destructivos en flujo normal porque el **autor** es el único que edita su comentario, y el estado (open/resolved) solo lo toca quien debe.

## ADR-008 — Español en la UI del cliente, inglés en el código
- **Estado:** aceptada
- **Contexto:** KIRU trabaja en español; los identificadores y nombres de módulo se estandarizan en inglés para desarrollo.
- **Decisión:** textos en español (`es-ES`); claves de datos, funciones y nombres de módulos en inglés (camelCase / snake_case).
- **Alternativa:** todo en inglés o todo en español.
- **Consecuencias:** UI clara para el cliente; código mantenible y neutro.

---

## ADR-009 — Comentarios en árbol versionado (sin UI de versiones todavía)
- **Estado:** aceptada
- **Contexto:** la FASE 3 pide los comentarios bajo `projects/{projectId}/comments`.
  El DATA-MODEL ya define `projects/{projectId}/versions/{versionId}/comments/{commentId}`.
- **Decisión:** adoptar el árbol **versionado** del DATA-MODEL; como aún no hay UI de
  proyectos/versiones, se fija un namespace de datos desde la config
  (`review.projectId`, `review.version`). Los comentarios viven en
  `cybrview/v1/projects/{projectId}/versions/{version}/comments/{commentId}`.
- **Alternativa:** árbol aplanado `projects/{id}/comments` (más simple, pero requiere
  migración al introducir versiones).
- **Consecuencias:** sin coste de migración futura. El campo `version` no es una feature
  todavía, solo un espacio de nombres.

## ADR-010 — Campos del comentario alineados al DATA-MODEL
- **Estado:** aceptada
- **Contexto:** el ejemplo de la FASE 3 usa `author`/`text`/`timecode`; el DATA-MODEL usa
  `authorName`/`body`/`timeCode`.
- **Decisión:** usar los campos del DATA-MODEL (`authorName`, `body`, `timeCode`,
  `authorRole`, `createdAt`, `updatedAt`).
- **Consecuencias:** coherencia con el esquema canónico; `timeCode` es un derivado de
  `time` (segundos). Ver `docs/TIMECODE.md`.

## ADR-011 — Firebase modular vía importmap (sin build)
- **Estado:** aceptada
- **Contexto:** el proyecto no usa build (Vanilla JS) y hay que cargar el SDK modular v9+.
- **Decisión:** cargar `firebase/app` y `firebase/database` por **importmap** desde CDN
  (`esm.sh`), con **import dinámico** que solo ocurre si la config de Firebase no está vacía
  (si está vacía, la app corre en local sin importar Firebase).
- **Consecuencias:** sin toolchain para el web; requiere red para el CDN. Para producción
  se recomienda un bundler (ver `VIDEO-PIPELINE`/`CEP-ARCHITECTURE`).

## ADR-012 — Proyectos/versiones en local (localStorage), Firebase más adelante
- **Estado:** aceptada
- **Contexto:** la FASE 4 introduce PROYECTOS, VERSIONES y COMENTARIOS segmentados por versión,
  pero el proyecto de Firebase aún no está conectado.
- **Decisión:** implementar el grafo `projects/{id}/versions/{id}/comments/{id}` con una capa
  local (`data.js` + `session.js`) persistida en **localStorage**. Se mantiene `firebase.js`
  (adaptador RTDB) preparado para conectarse en una fase posterior; entonces los comentarios/
  versiones migrarán a Firebase sin cambiar la interfaz.
- **Alternativa:** conectar Firebase ya en esta fase (no procede sin config real + reglas).
- **Consecuencias:** persistencia local (sobrevive recarga) pero no sincroniza entre
  navegadores; el adaptador RTDB queda listo para sustituir la capa local.

## ADR-013 — Store de comentarios segmentado por versión
- **Estado:** aceptada
- **Contexto:** cada comentario pertenece a una única versión y nunca se mezclan.
- **Decisión:** la tienda que consume el panel de comentarios (`session.store`) opera SIEMPRE
  sobre los comentarios de la **versión activa**; al cambiar de versión se recalcula y se
  notifica a los suscriptores (la UI redibuja lista, markers y compositor).
- **Consecuencias:** aislamiento garantizado entre versiones (verificado en tests).

## ADR-014 — Separación de entornos config (dev/prod) sin build
- **Estado:** aceptada
- **Contexto:** CYBR VIEW es estático (GitHub Pages) y no hay build.
- **Decisión:** `web/js/config/` con `dev.js` y `prod.js`; `web/js/config.js` resuelve con
  `?env=dev` (por defecto `prod`). Los vídeos y la config web de Firebase viven en un único
  lugar por entorno. Las credenciales son de **Firebase Web** (públicas), nunca de servidor.
- **Consecuencias:** centralización, sin hardcodear URL en múltiples archivos.

## ADR-015 — Video en Google Drive vía proxy (Cloudflare Worker)
- **Estado:** aceptada
- **Contexto:** los renders 4K/5 GB+ no se sirven bien desde el enlace directo de Drive
  (pantalla de "análisis de virus"/enlace por IP). El enlace directo `uc?export=download`
  solo es fiable para archivos < ~100 MB (probado: 206 + Range + CORS).
- **Decisión:** se mantiene el video en Drive y se sirve por un **proxy ligero**
  (`deploy/worker/worker.js`, Cloudflare Workers) que pide el archivo a
  `drive.usercontent.google.com`, añade `confirm=t` y fuerza `video/mp4` + Range + `CORS`.
  El `version.videoUrl` apunta al proxy. No se migra de proveedor automáticamente.
- **Alternativa documentada:** alojar un proxy de revisión en un bucket Range+CORS
  (Backblaze B2 / R2 / S3) si el ancho de banda de Drive no compensa.

## ADR-016 — Firebase solo para datos de la app (comentarios)
- **Estado:** aceptada
- **Contexto:** el MVP publica el frontend en GitHub Pages y no debe subir videos.
- **Decisión:** Firebase RTDB maneja **solo los comentarios** (realtime). Proyectos/versiones
  y catálogo viven en el frontend (config/seed); el video vive en Drive. No se almacena video
  en GitHub ni en Firebase.
- **Consecuencias:** GitHub Pages estático sin backend; Firebase es la fuente de verdad de los
  comentarios; las reglas son de desarrollo hasta conectar Authentication.> ADR mantenidos. Antes de agregar uno nuevo, leer `ARCHITECTURE.md` para mantener coherencia.
> Para **añadir** un ADR: copiar plantilla, asignar ID, actualizar el índice del `ARCHITECTURE.md`
> y reflejar en `CHANGELOG.md`.
