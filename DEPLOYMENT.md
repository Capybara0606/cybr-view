# DEPLOYMENT — CYBR VIEW MVP

> Guía para publicar CYBR VIEW como **web estática** en **GitHub Pages** usando
> **Firebase Realtime Database** (solo datos) y **Google Drive** (solo video).
>
> Arquitectura de producción:
> `GitHub → GitHub Pages → CYBR VIEW WEB → Firebase RTDB → (video) → Google Drive`.

---

## 0. Estructura del repo

```
cybr-view/
├── web/                     <- FRONTEND ESTÁTICO (lo que se publica)
│   ├── index.html
│   ├── css/  js/  js/config/
├── .github/workflows/deploy.yml   <- deploy automático a Pages
├── deploy/worker/worker.js        <- proxy Cloudflare (opcional, video Drive grande)
├── docs/  DEPLOYMENT.md  AGENTS.md ...
```

- **`web/`** es el único artefacto que publica GitHub Pages.
- El resto (docs, workflows, server.js) no se publica, pero sí va al repo.

---

## 1. Crear el repositorio en GitHub

1. Crea un repo en GitHub (público o privado). Recomendado: hacer que **`cybr-view/` sea la raíz del repo** (copia el contenido de `cybr-view/` al root del repo).
2. Si prefieres meter `cybr-view/` como subcarpeta de un monorepo, entonces el workflow debe usar `path: cybr-view/web`.

## 2. Subir el proyecto

```bash
cd cybr-view
git init
git add .
git commit -m "CYBR VIEW MVP web"
git branch -M main
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

> ⚠️ NO subir `web/media/` (videos) — está en `.gitignore`. El video va fuera del repo.

## 3. Activar GitHub Pages

**Opción A — Automática (recomendada):** el workflow `.github/workflows/deploy.yml` se encarga al hacer push a `main`. Ve a:

```
Settings → Pages → Source: "GitHub Actions"
```

**Opción B — Manual:** en `Settings → Pages`, elige `Deploy from a branch`, rama `main`, carpeta `/` (root) — *no sirve para el workflow; usa la A si subiste el workflow*.

> Si usas el workflow (Opción A), verás el job "Deploy CYBR VIEW to GitHub Pages" en Actions.

## 4. Branch / carpeta correcta

- Branch: `main`.
- Carpeta a servir: **`web`** (artefacto del workflow), o `/` si el repo solo contiene `web/`.
- El workflow ya publica `path: web`. **Cambia a `cybr-view/web`** solo si `cybr-view/` está dentro de un monorepo.

## 5. Obtener la URL pública

Tras el deploy, la URL será:

```
https://USUARIO.github.io/REPO/
```

Si `REPO = cybr-view` y está en el root:

```
https://USUARIO.github.io/cybr-view/
```

> La app usa **rutas relativas** y un **import map** (CDN), así que funciona tanto en la
> raíz del dominio como bajo `/cybr-view/`. No depende de localhost ni de Node.js.

## 6. Configurar Firebase (solo datos)

1. En `console.firebase.google.com` crea un proyecto.
2. Selecciona **Realtime Database** → **"Start in test mode"** (reglas de desarrollo).
3. `Configuración del proyecto → Tus apps → Web` → copia la **config web** (apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId).
4. Pégala en **`web/js/config/prod.js`** (bloque `firebase`). Se sube al repo: son credenciales WEB públicas, no son secretas.
5. La seguridad real la dan las **REGLAS** (ver `docs/FIREBASE-RULES.md`).

**Reglas actuales:** solo de desarrollo (modo test) → cualquiera con acceso puede leer/escribir datos.
**⚠️ ANTES DE USO CON CLIENTES REALES** hay que conectar **Firebase Authentication** y escribir reglas por rol (cliente/editor). Sin eso, el MVP es de demostración.

## 7. Configurar el video (Google Drive)

- El video **no va al repo ni a Firebase**. Es una **URL externa** por versión (`version.videoUrl`).
- Configurela en `web/js/config/prod.js` → bloque `demo.videoV01..` (o directamente en los datos).

**Conclusión técnica sobre Google Drive (ya probada):**

| Tamaño del MP4 | `https://drive.google.com/uc?export=download&id=ID` |
|---|---|
| **< ~100 MB** | ✅ Funciona: probado → `206 Partial`, `video/mp4`, `Accept-Ranges: bytes`, `Access-Control-Allow-Origin: *`. Play y **seek** OK. |
| **> ~100 MB** (renders 4K/5 GB+) | ❌ Google muestra el aviso "no se puede analizar el archivo en busca de virus" (HTML) y el enlace es inestable/atado a la IP-sesión. **No** sirve como fuente estable de `<video>` con seek. |

**Solución (coste mínimo, guarda el video en Drive):** desplegar el **proxy** `deploy/worker/worker.js` en **Cloudflare Workers** (gratuito): pide el archivo a `drive.usercontent.google.com`, añade `confirm=t` y normaliza `video/mp4` + `Range` + `CORS`.

```
Video en Drive (compartido "Anyone with the link")
        │
        ▼
https://TU-WORKER.workers.dev/FILE_ID   ← se pone en version.videoUrl
        │
        ▼
CYBR VIEW <video>  (play + seek + timecode)
```

> Si el proxy de Drive fallara, sube un **proxy de revisión** (MP4 720–1080p, `+faststart`)
> a cualquier bucket con Range+CORS (Backblaze B2 / R2 / S3) y apunta `videoUrl` a él.
> Es la opción más robusta si el ancho de banda/costes de Drive no compensan.

> **Notas de despliegue del Worker (probado):**
> - Desplegar con `npx wrangler deploy --config wrangler.toml` desde una **carpeta limpia**
>   (sin un `wrangler.jsonc` en carpetas padre; uno corrupto puede interferir).
> - El `worker.js` ya fuerza `cross-origin-resource-policy: cross-origin` + `inline` y
>   elimina las cabeceras de Google (`same-site`, COEP, CSP sandbox, Set-Cookie) que
>   Chrome bloquea en cross-site.

## 8. Probar la aplicación

- Abre la URL pública. Cambia de proyecto y de versión (cambian video/estado/comentarios).
- Reproduce el video: play/pause/seek/timeline/timecode/fullscreen.
- Crea un comentario → se guarda en Firebase.
- Abre la URL en **otro dispositivo/navegador** → el comentario aparece **automáticamente** (realtime).
- Haz click en un comentario/marker → salta al timecode.
- Resolver/reabrir/eliminar comentario.

---

## Qué está probado / qué no (honestidad)

**Probado (dev/local, `?env=dev`):**
- Navegación de proyectos/versiones; aislamiento de comentarios por versión.
- Reproductor: play/pause/seek/frame/volumen/fullscreen/timeline/timecode.
- Comentarios: crear/responder/resolver/eliminar; click → saltar al timecode; markers.

**No probado aquí (requiere tus credenciales/proyecto):**
- **Firebase realtime real** (crear/recibir/resolver a través de RTDB): requiere configurar
  tu proyecto + reglas. El código RTDB está implementado; la verificación E2E con dos
  dispositivos es tuya al añadir la config y publicar.
- **Google Drive con renders 5 GB+**: solo el proxy de Cloudflare Worker puede intentarlo;
  pruébalo con tu archivo real. El enlace directo solo se validó con un MP4 pequeño público
  (206 + Range + CORS).

## Limitaciones actuales

- **Sin autenticación**: hoy cualquiera puede escribir; no hay roles ni usuarios.
- **Reglas de RTDB en modo test**: inseguras para clientes reales.
- **Revisión multi-dispositivo**: funciona con Firebase conectado; en local solo en un navegador.
- **Sincronización de playhead/estado entre dispositivos**: pendiente (FASE futura).
- **Video grande**: requiere el proxy de CDN/Worker; el enlace directo de Drive no es fiable.

## PWA / Rendimiento

- No es PWA por ahora (no hace falta para el MVP).
- Carga inicial ligera: Vanilla JS + CSS, sin frameworks. El SDK de Firebase se carga por
  CDN (esm.sh) solo cuando se importa (config con credenciales).
- Ícono (favicon) inline SVG, sin peticiones externas.
