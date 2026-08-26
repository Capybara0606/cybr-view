# CYBR VIEW — VIDEO REVIEW // SYSTEM

Plataforma profesional de **revisión de videos** creada por **KIRU**.

Un cliente revisa una versión de video desde el navegador y deja comentarios amarrados a un
*timecode*; el editor los ve en tiempo real y (a futuro) dentro de Adobe Premiere Pro.

```
CLIENTE ──► CYBR VIEW WEB ──► FIREBASE ──► (a futuro) CEP PANEL ──► PREMIERE PRO
```

---

## 1. Qué es CYBR VIEW

- **Cliente**: abre un *review link* (sin cuenta), reproduce el video, comenta, responde,
  resuelve y **aprueba** versiones.
- **Editor**: entra autenticado a un dashboard, gestiona proyectos/versiones, publica
  revisiones, resuelve comentarios y revoca links.
- **Firebase Realtime Database** es la fuente de verdad de los comentarios.
- **Google Drive** almacena los videos (proxies de revisión); el navegador los carga directo.

## 2. Arquitectura

| Superficie | Tecnología |
|-----------|------------|
| Frontend | HTML · CSS · **Vanilla JS (ES Modules)** — estático en **GitHub Pages** |
| Datos / realtime | Firebase **Realtime Database** + **Authentication** |
| Video | Google Drive (URL por versión, servido directo con Range/CORS) |
| (a futuro) Editor | CEP Panel + ExtendScript dentro de Premiere Pro |

Rutas (hash): `#/login` · `#/dashboard` (editor) · `#/review/:token` (cliente).

Ver `ARCHITECTURE.md` y `docs/` para el detalle completo.

## 3. Firebase

- **Realtime Database**: comentarios por versión en
  `cybrview/v1/projects/{projectId}/versions/{versionId}/comments/{commentId}`.
- **Authentication**: email/password para el editor.
- **Seguridad**: las reglas viven en `database.rules.json` (editor `auth != null`; cliente por
  `reviews/{token}` si el token está `active`). Ver `SECURITY.md`.
- La config web (pública) está en `web/js/config/prod.js`.

## 4. Google Drive

- Los videos **no** se suben al repo ni a Firebase. Cada versión apunta a una **URL de Drive**
  en `version.videoUrl`.
- Para archivos grandes, el proxy de `deploy/worker/worker.js` (Cloudflare Worker) sirve el
  MP4 con `inline` + `Range` + `CORS` (elimina las cabeceras de Google que bloquean el
  navegador: `Cross-Origin-Resource-Policy: same-site`, etc.).

## 5. Límite de 160 MB

- **Regla oficial:** `MAX_VIDEO_SIZE_MB = 160` (en `shared/constants.js`). CYBR VIEW **nunca**
  considera válido un proxy de revisión **> 160 MB**.
- Spec recomendada: **MP4 · H.264 · AAC · 1080p** (720p aceptable). El **master** queda fuera.
- Ver `AGENTS.md §10` y `ARCHITECTURE.md §7`.

## 6. Desarrollo local

```bash
cd cybr-view
node server.js          # sirve web/ en http://localhost:3000
```

Abrí `http://localhost:3000/?env=dev` → corre en **modo local/DEV** (datos en localStorage,
auth simulada). Sin `?env` usa la config de **producción**.

Sin Node, también puedes servir `web/` con cualquier servidor estático (p. ej. `npx serve web`).

## 7. Deployment

GitHub Pages publica `web/` automáticamente (workflow `.github/workflows/deploy.yml`, rama `main`).

1. Creá un repo con `cybr-view/` como raíz y subí a `main`.
2. En `Settings → Pages → Source: GitHub Actions`.
3. URL pública: `https://USUARIO.github.io/REPO/`.

Ver `DEPLOYMENT.md` para el paso a paso completo.

## 8. Configuración

- **`web/js/config/prod.js`** — credenciales web de Firebase + URLs de video.
- **`web/js/config/dev.js`** — entorno de desarrollo (Firebase vacío → modo local).
- `?env=dev` fuerza el entorno de desarrollo.
- Habilitá en Firebase: `Realtime Database` (reglas) y `Authentication → Email/Password`.

## 9. Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| "SYSTEM OFFLINE" | Firebase no conecta (realtime) | Verificar red/CORS; la base debe estar accesible (HTTP 200 en `.firebaseio.com/.json`). |
| Video no carga (NO SIGNAL) | URL sin Range/CORS, o >160 MB, o Drive bloquea (`Cross-Origin-Resource-Policy`) | Usar el proxy Worker o un MP4 ≤160 MB con Range+CORS. |
| Login falla | Proveedor Email/Password no habilitado | Firebase → Authentication → Sign-in method → Email/Password. |
| "REVIEW ACCESS DENIED" | Token inválido o revocado | Revisar el enlace o reactivarlo desde el dashboard. |
| Comentarios no sincronizan | Reglas en modo test o listener no conectado | Desplegar `database.rules.json` (`firebase deploy --only database`). |
