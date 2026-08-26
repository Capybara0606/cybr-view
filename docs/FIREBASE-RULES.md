# FIREBASE-RULES.md

> Reglas de seguridad de Firebase **Realtime Database** para CYBR VIEW.
> Objetivo: el cliente solo lee; el editor lee y escribe sobre su proyecto/versión.
> Respetar el modelo de `DATA-MODEL.md` (árbol `cybrview/v1/...`).

---

## ⚠️ ESTADO ACTUAL (MVP web — FASE 5.5)

- Estas reglas son de **DESARROLLO / demo**. Hoy la base de datos se puede dejar en
  **modo test** (`"read": true, "write": true`), lo que significa que **cualquiera con la
  URL puede leer y escribir**. Es deliberado para el MVP sin Authentication.
- **Antes de uso con clientes reales hay que:** conectar **Firebase Authentication** y
  aplicar reglas por `auth.token.role` (`client` / `editor`), como se detalla abajo.
- Mientras tanto, la UI indica claramente `reglas DE DESARROLLO`. No se presume producción.

## 1. Modelo de roles

| Rol | Acceso |
|-----|--------|
| **Anónimo / invitado** | Lectura de una **versión concreta** (enlace compartido). No escribe. |
| **Editor** (`role=editor`) | Lee todo su proyecto. Escribe comentarios/estado/cambio de `sequenceLink`. No edita `users` ajenos. |
| **Cliente** (`role=client`) | Lee su versión. Escribe comentarios, respuestas y aprueba su versión. No toca el esquema de la secuencia. |
| **Admin** | Omnipresente (para soporte KIRU). |

> Nota: para una revisión abierta por link conviene una regla de **lectura pública de un
> nodo acotado** (`version.publicLink = true` de forma controlada), sin dar acceso a
> escribir ni a otros proyectos. Esto evita exigir login al cliente para abrir el enlace.

---

## 2. Estructura de reglas (esqueleto)

```json
{
  "rules": {
    "cybrview": {
      "v1": {
        ".read": false,
        ".write": false,

        "projects": {
          ".read": "auth != null && (auth.token.role === 'editor' || auth.token.role === 'admin')",
          ".write": "auth != null && (auth.token.role === 'editor' || auth.token.role === 'admin')",

          "$projectId": {
            ".read": "data.child('meta/ownerUid').val() === auth.uid || auth.token.role === 'admin'",
            ".write": "auth.token.role === 'editor' || auth.token.role === 'admin'",

            "versions": {
              "$versionId": {

                ".read": "auth != null && data.child('meta/publicLink').val() === true || (auth.token.role === 'editor' || auth.token.role === 'admin')",

                "comments": {
                  "$commentId": {
                    ".read": "data.exists() || newData.exists()",
                    ".write": "auth != null && (auth.uid === data.child('authorUid').val() || auth.uid === newData.child('authorUid').val()) && (auth.token.role === 'editor' || auth.token.role === 'admin' || auth.token.role === 'client')"
                  }
                },
                "markersIndex": {
                  "$commentId": {
                    ".read": true,
                    ".write": "auth != null && (auth.token.role === 'editor' || auth.token.role === 'admin')"
                  }
                }
              }
            },

            "sequences": {
              "$seqId": {
                ".read": "auth != null && (auth.token.role === 'editor' || auth.token.role === 'admin')",
                ".write": "auth != null && (auth.token.role === 'editor' || auth.token.role === 'admin')"
              }
            }
          }
        },

        "users": {
          "$uid": {
            ".read": "auth != null && auth.uid === $uid || auth.token.role === 'admin'",
            ".write": "auth != null && auth.uid === $uid"
          }
        },

        "presence": {
          ".read": "auth != null",
          ".write": "auth != null && (auth.uid === data.child('uid').val() || auth.uid === newData.child('uid').val())"
        },

        "audit": {
          ".read": "auth != null && auth.token.role === 'editor' || auth.token.role === 'admin'",
          ".write": "auth != null"
        }
      }
    }
  }
}
```

> ⚠️ **Aviso:** este es un **esqueleto de referencia** (FASE 0). Debe refinarse en la
> **FASE 2** cuando esté la implementación real: validación de campos por reglas, límite
> de `body` (`newData.child('body').val().length < 4000`), y un control estricto de
> `publicLink` para no exponer versiones ajenas. No desplegarlo tal cual sin probar en
> un proyecto de Firebase de prueba.

---

## 3. Reglas clave

### 3.1 Lectura pública de una versión (enlace compartido)
Un cliente que recibe `/review/:versionId` debe poder leer sin login. Se expone solo el nodo
`versions/{id}` (meta + comments + markersIndex) del proyecto correcto, y SOLO si el editor
marcó `meta/publicLink = true`. Todos los niveles por encima (proyecto, otras versiones,
playlists) quedan `false`.

### 3.2 Escritura de comentarios (cliente y editor)
- Solo el autor (`authorUid === uid`) edita su comentario.
- Nadie borra de otro, salvo admin.
- `status` (open/resolved) puede cambiarlo editor o el propio autor-cliente.

### 3.3 `sequenceLink` y `markersIndex` (CEP)
- Solo el **editor** lee/escribe el vínculo secuencia↔versión y el índice de marcas.
- El cliente nunca puede escribir `markersIndex` ni `sequences`.

### 3.4 Validación con `validate`
```json
"validate": "newData.hasChildren(['authorUid','authorName','body','time','timeCode','createdAt'])"
```
Además:
- `body` es string y no vacío.
- `time` es número ≥ 0.
- `parentId` opcional; si existe, debe apuntar a un comentario hermano (`status` de la respuesta solo puede ser `open`).

---

## 4. Autenticación y claims

- Se usan **custom claims** en Auth para `role`: el SDK de Admin asigna
  `claims.role = 'editor' | 'client' | 'admin'`.
- En el web: `signInWithEmailAndPassword` (editor) o acceso anónimo (lectura del link).
- En el CEP: **token temporal de editor** emitido desde el web (ver `CEP-ARCHITECTURE.md`),
  nunca credenciales de servicio.

---

## 5. Índices (`indexOn`)

```json
{
  "rules": {
    "cybrview": {
      "v1": {
        "projects": {
          "$projectId": {
            "versions": {
              "$versionId": {
                "comments": {
                  ".indexOn": ["parentId", "status", "time", "authorUid"]
                },
                "markersIndex": {
                  ".indexOn": ["time"]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

---

## 6. Checklist antes de producción (FASE 9)

- [ ] Sin regla `.read/.write` global a `true`.
- [ ] `body` con límite y validación.
- [ ] `publicLink` controlado (no expone proyectos ajenos).
- [ ] Custom claims de `role` propios.
- [ ] `version` no editable por el cliente en campos críticos (`fps`, `timecodeType`, `videoUrl`).
- [ ] Sin exposición de secretos en `config.js` (claves públicas de Firebase no son secretos,
      pero nunca versionar credenciales de servicio).
