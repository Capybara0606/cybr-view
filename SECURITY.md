# SECURITY — CYBR VIEW

> Documento de seguridad y modelo de acceso. La seguridad real vive en **Firebase**,
> no en botones ocultos, rutas de frontend ni validaciones del navegador.

---

## 1. Modelo de acceso

| Rol | Cuenta | Acceso |
|-----|--------|--------|
| **EDITOR** | Sí (Firebase Authentication, email/password) | Crear proyectos/versiones, publicar revisiones, gestionar comentarios, resolver, **revocar** links. Dashboard. |
| **CLIENTE** | **No** (sin cuenta) | Accede por un **review link** único. Reproduce, comenta, responde (y resuelve si la config lo permite). Solo esa revisión. |

- El cliente **no** ve el dashboard, **no** accede a otros proyectos/versiones, **no** modifica
  proyectos ni consulta información privada.
- No hay roles empresariales, pagos ni OAuth innecesario.

## 2. Review tokens

- El enlace de revisión usa un **token aleatorio** (no un `id` simple):
  ```
  /review/<token>   (ej. #/review/7f9c2a…)
  ```
- Token: 96 bits (`crypto.getRandomValues`), no secuencial, no guessable.
- El token **identifica la revisión sin exponer** projectId/versionId en la URL.
- En producción el mapeo `token → { projectId, versionId, status }` vive en RTDB:
  `cybrview/v1/tokens/{token}`.

## 3. Revocación

- Estados: **`ACTIVE`** / **`REVOKED`**.
- El editor revoca/activa un link desde el dashboard.
- Un token `REVOKED` → la review muestra **`REVIEW ACCESS DENIED`** y **no** revela información
  del proyecto.

## 4. Reglas de Firebase (fuente de la verdad)

- La seguridad **existe en las reglas de RTDB** (`database.rules.json`), no en el JS.
- **Editor** (`auth != null`): lectura/escritura completa.
- **Cliente** (sin auth): solo lee/escribe los comentarios de su revisión **si el token está
  `active`**, usando el **token en el path**:
  ```
  cybrview/v1/reviews/{token}/comments/{commentId}
  cybrview/v1/tokens/{token}          -> { projectId, versionId, status }
  ```
- Un usuario no autorizado **no** puede leer/escribir `reviews/{otroToken}` (las reglas
  comparan el token del path con su `status`).
- Desplegar con: `firebase deploy --only database`.

## 5. Autenticación del editor

- **Firebase Authentication** (proveedor **Email/Password**). No se implementa auth propio.
- Rutas: `#/login` (editor) · `#/dashboard` (requiere auth) · `#/review/:token` (público por token).
- Habilitar en consola: `Authentication → Sign-in method → Email/Password → Enable`.

## 6. Estado actual / limitaciones (honestidad)

- El **código** de acceso (router, tokens, revocación, login, dashboard, auth) está implementado
  y **probable en modo local/DEV** (sin Firebase).
- **Pendiente de activar en producción** (requiere tu cuenta Firebase, no automatizable aquí):
  1. Habilitar **Email/Password** en Authentication.
  2. Crear el **usuario editor** (Authentication → Users → Add user).
  3. **Desplegar las reglas** (`database.rules.json` → `firebase deploy --only database`).
  4. Ajustar el path de comentarios al modelo **token-scoped** (`reviews/{token}/comments`).
- En modo local/DEV (sin config de Firebase) la auth se **simula** y los datos viven en
  `localStorage` (solo para desarrollo). Esto **no** es seguridad real.

## 7. Checklist antes de clientes reales

- [ ] Reglas desplegadas (no en modo test).
- [ ] Authentication Email/Password habilitado y usuario editor creado.
- [ ] Comentarios en path token-scoped.
- [ ] Tokens ≥ 96 bits y revocables.
- [ ] Sin secretos en el frontend (solo config web pública de Firebase).
