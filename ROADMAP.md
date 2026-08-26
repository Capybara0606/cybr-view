# CYBR VIEW — Roadmap

> Plan por fases. **No se avanza de fase sin terminar los criterios de aceptación de la fase anterior.**
> Cada fase termina con una entrada en `CHANGELOG.md`.

---

## FASE 0 — Arquitectura y documentación (COMPLETA)

**Objetivo:** dejar la base arquitectónica y de especificación lista, sin escribir
cerrar funcionalidad de producto.

**Entregables realizados en esta fase:**
- Raíz del proyecto `cybr-view/` (aislada de los proyectos existentes en la carpeta contenedora).
- `AGENTS.md`, `ARCHITECTURE.md`, `ROADMAP.md`, `CHANGELOG.md`.
- `docs/` con especificaciones: `DATA-MODEL.md`, `FIREBASE-RULES.md`, `TIMECODE.md`,
  `VIDEO-PIPELINE.md`, `CEP-ARCHITECTURE.md`, `SYNC-SPEC.md`, `DECISIONS.md`.
- Estructura de carpetas de `web/`, `cep/`, `shared/` (placeholder, sin lógica).

**Criterios de aceptación para salir de esta fase:**
- [x] Modelo de datos definido y coherente.
- [x] Contrato de comunicación Web ↔ Firebase ↔ CEP definido.
- [x] Registro de riesgos (R1..R12) y soluciones, con ADR.
- [x] Identidad visual / design tokens documentados.
- [x] Confirmación del usuario (aprobación de la fase).

---

## FASE 1 — Scaffold Web + Reproductor de video (COMPLETA)

**Alcance (solo web, sin Firebase todavía si no es imprescindible):**
- `web/index.html` con layout cyber-brutalista y tokens (`css/tokens.css`).
- `web/js/player.js`: reproducir/pausar, barra temporal, mostrar `timeCode`.
- `shared/constants.js`: tokens + enums, `version.status`.
- Router `/review/:id` (HTML nativo / hash) para poder abrir una versión.
- Config de video por **URL configurable** (variable / data). Sin subida de archivos.

**Fuera de alcance:** coments, auth, Firebase persistente, CEP.

**Criterios de aceptación:**
- [x] Se abre el enlace de una versión con un video (URL) y funciona play/pause/seek.
- [x] El timecode display se calcula a partir de segundos + fps (ver `docs/TIMECODE.md`).
- [x] La estética cumple los tokens (negro, verde KIRU, monoespaciada, labels uppercase).

> **Nota de alcance (FASE 1):** el enrutado `/review/:id`, la lectura de comentarios y
> Firebase no se implementan aquí (pertenecen a la FASE 2/3). La URL del video se
> centraliza en `web/js/config.js`. La lane de marcadores queda preparada pero sin
> lógica de comentarios.

---

## FASE 2 — Comentarios con timecode (memoria) (COMPLETA)

> **Ajuste pedido por el usuario:** la FASE 2 se implementó como **sistema de comentarios
> en memoria / local state** (sin Firebase). El bloque "Firebase" del roadmap original se
> traslada a una fase posterior. Firebase llega cuando se indique.

**Alcance realizado:**
- Panel `/02 COMMENTS` con composer que pausa y captura `currentTime` al enfocar.
- Registros con timecode `[MM:SS.CC]`, autor, estado y texto.
- Click en comentario / marker → seek al timestamp exacto.
- Comentario activo + navegación PREV / NEXT + RESOLVE / REOPEN.
- Markers en la timeline posicionados proporcionalmente a la duración.
- Atajos: Space (play/pausa), ←/→ (seek), C (crear comentario).
- Todo en `state.js` (memoria). Sin Firebase, Auth, CEP, Premiere, proyectos ni versiones.

**Criterios de aceptación de la FASE 2 (redefinida):**
- [x] Crear comentario con timecode exacto capturado al enfocar.
- [x] Click en comentario/marker salta al timestamp.
- [x] Navegación anterior/siguiente y resolución funcionan.
- [ ] Persistencia / Firebase (se difiere a fase posterior).

---

## FASE 3 — Comentarios en Web + Firebase (COMPLETA)

> **Ajuste pedido por el usuario:** la FASE 3 se implementó con **Firebase Realtime
> Database** (listeners realtime, sin polling). El panel `/02` del FASE 2 ya existía; en
> esta fase se sustituyó el almacenamiento local por Firebase (con fallback local/DEV si
> no hay config). La persistencia en el roadmap original (FASE 2b — Firebase) queda cubierta
> aquí; ver también ADR-009/010/011.

**Alcance realizado:**
- Módulo `firebase.js` (SDK modular v9+, importmap, sin build): `createComment`,
  `listenToComments` (realtime), `updateComment`, `deleteComment`, `onConnection`.
- `state.js` como adaptador Firebase↔memoria (fallback LOCAL/DEV).
- Acciones en UI: crear/resolver/reabrir/**eliminar** comentario.
- Indicador de backend (`modbar` + `status`): LOCAL/DEV vs FIREBASE ONLINE/OFFLINE.
- Config central con placeholders de Firebase + namespace `review.projectId`/`version`.

**Criterios de aceptación de la FASE 3 (redefinida):**
- [x] Crear/leer comentarios en RTDB con listeners realtime (2 pestañas → sync).
- [x] Crear, resolver, reabrir y eliminar comentarios.
- [~] Sincronización real probada **al conectar tu project de Firebase** (config vacía
      = modo local/DEV). Pasos en `config.js` y `docs/FIREBASE-RULES.md`.
- [x] Documentado que las reglas son SOLO de desarrollo.

---

## FASE 2b — Firebase RTDB + Autenticación [PRÓXIMA]

**Alcance:**
- Inicialización SDK modular + `config.js` (gitignore) + `.gitignore`.
- Estructura inicial en RTDB: `projects/{id}`, `versions/{id}`, `comments/{id}`.
- `docs/FIREBASE-RULES.md` desplegado (lectura roles, escritura roles).
- Auth: cliente (invitado o anónimo de solo lectura) + editor (email/password o token).
- Implementar el "estado/store"/`state.js` con suscripciones.

**Criterios de aceptación:**
- Crear/leer una versión en RTDB desde el web.
- Reglas activas: cliente sin sesión → lectura sola; editor → escritura.
- Enlace a versión sobrevive recarga (enrutado correcto).

---

> **Nota (sin fase propia):** la parte de *comentarios en web* se entregó en dos tramos —
> el panel `/02` + markers/timecode (ver "FASE 2 — Comentarios con timecode") y la
> persistencia (ver "FASE 3 — Comentarios en Web + Firebase"). No es una fase aparte.

---

## FASE 4 — Projects / Versions / Comments (COMPLETA)

**Alcance:**
- Estructura `PROJECT → VERSION → COMMENTS`. Comentarios por versión (nunca mezclados).
- Selectores `/01 PROJECT`, `/02 VERSION` (chips V01/V02/V03), `/03 REVIEW` (status).
- El cambio de versión actualiza **video + comentarios + markers + metadata**.
- Datos locales (persistidos) con `data.js` + `session.js`; adaptador `firebase.js` listo.
- Proyectos de ejemplo: MULTIMONEY (V01/V02/V03) y SHORTS (V01).

**Criterios de aceptación:**
- [x] Cambiar de versión cambia video, comentarios, markers y metadata.
- [x] V01 muestra solo comentarios de V01; V02 solo los de V02 (sin mezclar).
- [x] Selector de proyecto y de versión funcionan.
- [x] Identidad CYBR VIEW conservada. Sin auth/CEP/Premiere.

---

## FASE 5 — Aprobación de versión + presencia en tiempo real

**Alcance:**
- Botón de **aprobar versión** (cliente) y de marcar como preliminar (editor).
- `versions/{id}/status` (`draft | review | approved | rejected`) + historial.
- Indicador de "presencia" (`presence/`) y contador de quién está mirando.

**Criterios de aceptación:**
- Aprobar no puede reescribirse por error sin control; queda rastro de quién apobó y cuándo.
- Se ve en tiempo real (de un navegador a otro).

---

## FASE 6 — CEP Panel (esqueleto + conexión)

**Alcance:**
- `cep/CSXS/manifest.xml` + `cep/index.html` + `cep/css/panel.css`.
- `cep/js/main.js` + `sync.js` (suscripción Firebase vía SDK).
- Instalación y método de despliegue (`INSTALL.txt`).
- Login del editor (token / email-password) sin service account.

**Criterios de aceptación:**
- El panel aparece en `Window > Extensions` y se ve el listado de versiones/proyectos.
- El panel lee comentarios de Firebase y los muestra en tiempo real.
- `PlayerDebugMode` documentado para desarrollo.

---

## FASE 7 — ExtendScript: playhead + marcadores (el puente a Premiere)

**Alcance:**
- `cep/jsx/main.jsx`: `getActiveSequence`, `getPlayerPosition`, `setPlayerPosition`.
- `cep/jsx/markers.jsx`: `createMarker(time)`, `updateMarker`, `removeMarker`, `listMarkers`.
- Enlace `seqId ↔ versionId` (`sequences/{seqId}`).
- Click en comentario → `setPlayerPosition(timeSeconds)`.
- Crear marcador automático con naming `CYBR::<commentId>`.
- Sincronización de ida y vuelta: resolver desde Premiere → Firebase; nuevo comentario → marcador.

**Criterios de aceptación:**
- Clic en un comentario del panel mueve el playhead en Premiere al segundo exacto.
- Se crea marcador con el nombre enlazado al comentario (sin duplicados).
- Los cambios (resolver/crear) se propagan a la Web en tiempo real.

---

## FASE 8 — Vinculación secuencia↔versión + timecodes de Premiere

**Alcance:**
- Definir con qué secuencia de Premiere corresponde cada versión (por `nodeId`).
- Manejo de `RealFPS` de Premiere vs `fps` de la versión; conversión timecode.
- Detección de marcadores existentes que ya corresponden a un comentario (idempotencia).

**Criterios de aceptación:**
- El mapeo secuencia↔versión es estable y sobrevive a reinicios de Premiere.
- Los marcadores creados no se duplican al volver de borrar o recargar.
- El timecode display concuerda con el de Premiere.

---

## FASE 9 — Video desde Drive (proxy de revisión, ≤ 160 MB)

**Alcance:**
- **Regla oficial:** `MAX_VIDEO_SIZE_MB = 160` (constante central en `shared/constants.js`).
  CYBR VIEW nunca considera válido un proxy de revisión **> 160 MB**.
- Proxy de revisión en **Google Drive**: MP4 · H.264 · AAC · 1080p (720p aceptable).
  El **master** permanece fuera de CYBR VIEW.
- El navegador carga el proxy **directamente** desde la URL de Drive configurada.
  **Sin servidor intermedio de video** (sin Node.js / Vercel / Cloudflare Worker /
  streaming backend / transcodificación).
- Validación de tamaño: preferir validar metadatos antes de reproducir; si no es fiable
  desde el navegador, documentar + mensaje en UI + validar en el flujo de subida/preparación.

**Criterios de aceptación:**
- Todo video de revisión ≤ 160 MB y con la spec MP4/H.264/AAC.
- La URL de Drive se sirve directo (Range/seek) o se documenta la limitación conocida
  (`Cross-Origin-Resource-Policy: same-site`, ver ARCHITECTURE §7).
- Sin servidor de video intermedio en la arquitectura.

---

## FASE 10 — Endurecimiento, seguridad y release

**Alcance:**
- Revisión de reglas RTDB, revisión de `config.js` (secretos).
- Manejo de errores de red, desconexión, cache offline.
- Microinteracciones de estado y pulido UX (cyber-brutalist).
- Subir a hosting y distribución de la extensión (firma / zsync).
- Tests manuales E2E de todo el flujo cliente ↔ editor.

**Criterios de aceptación:**
- Flujo completo `cliente → firebase → CEP → Premiere` funciona sin escalada manual.
- No se exponen secretos; reglas protegen por rol.
- Despliegue reproducible y documentado.

---

## Fase futura (opcional / post-release)
- Integración con Adobe Premiere PPRO múltiples secuencias simultáneas.
- Notificaciones (email/desktop) al editor cuando hay comentarios nuevos.
- Comparación de versiones (v1 vs v2) y diferencia visual.
- Historial/auditoría de aprobación y cambios.
