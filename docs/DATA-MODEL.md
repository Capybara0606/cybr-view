# DATA-MODEL.md

> Modelo de datos de CYBR VIEW.
> Fuente de verdad: **Firebase Realtime Database**.
> Este documento es la referencia normativa del esquema. Los arboles de datos son
> denormalizados (RTDB no tiene joins); se diseñan según los **patrones de acceso**.

---

## 1. Convenciones

- Raíz versionada: `cybrview/v1/...` para permitir migrar por versión de esquema.
- Keys: las genera RTDB (`push()` → `.key`) o el Web. Nunca depender de `nodeId` de Premiere como key de comentario.
- Todo datetime se guarda en **epoch ms** (número). RTDB no tiene `serverTimestamp`; usar `Date.now()` + offset de `.info/serverTimeOffset`.
- IDs: `projectId`, `versionId`, `commentId` = `.key` de la referencia.
- Se incluyen SIEMPRE `createdAt`/`updatedAt`/`createdBy`.
- Indices estáticos (`indexOn`) en reglas (ver `FIREBASE-RULES.md`).

---

## 2. Árbol general

```
cybrview/v1/
├── projects/{projectId}
│   ├── meta/                       { name, client, status, createdAt, updatedAt }
│   ├── versions/{versionId}        { ...version }
│   │   ├── meta/                   { ... }
│   │   ├── comments/{commentId}    { ...comment }
│   │   ├── markersIndex/           { commentId: { time, timeCode } }  (índice ligero para CEP/overlay)
│   │   └── approvals/              { uid: { approvedAt, note } }
│   └── sequences/{sequenceId}      { ...sequenceLink }
│
├── users/{uid}                     { uid, name, email, role, avatar }
├── presence/{key}                  { uid, name, role, versionId, at }
└── audit/{id}                      { action, actor, target, at }   (registro de aprobaciones/finalizaciones)
```

---

## 3. Entidades (detalle de campos)

### 3.1 project — `projects/{projectId}/meta`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `name` | string | Nombre del proyecto de KIRU. |
| `client` | string | Nombre del cliente. |
| `status` | enum | `active | archived`. |
| `ownerUid` | string | Editor propietario / responsable. |
| `createdAt` / `updatedAt` | number (ms) | Timestamps. |

### 3.2 version — `projects/{projectId}/versions/{versionId}/meta`
> Se comparte vía `/review/:versionId`. Es la unidad de revisión.
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `number` | number | Número de versión (1, 2, 3…). |
| `orderCode` | string | Display `01`, `02`, `03` (label editorial). |
| `title` | string | Título corto. |
| `videoUrl` | string | **URL configurable** del video (MP4). NO Firebase. |
| `videoSource` | enum | `url | drive | s3 | b2 | cloudflare_stream | mux | vimeo` (fase 8: multi-proveedor). |
| `posterUrl` | string | Poster/thumbnail opcional. |
| `duration` | number | Duración en segundos (se extrae del `<video>`). |
| `fps` | number | FPS de la línea (23.98, 25, 29.97, 50, 59.94, 60). |
| `timecodeType` | enum | `NDF | DF` (también se deriva de `fps`). |
| `status` | enum | `draft | review | approved | rejected`. |
| `approved` | boolean | Resultado de la aprobación. |
| `approvedAt` | number | Timestamp de aprobación. |
| `approvedBy` | string | Nombre/uid de quien aprobó. |
| `createdBy` | string | Editor que la sube. |
| `createdAt` / `updatedAt` | number | Timestamps. |

### 3.3 comment — `projects/{projectId}/versions/{versionId}/comments/{commentId}`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `authorUid` | string | Autor (cliente o editor). |
| `authorName` | string | Nombre para mostrar. |
| `authorRole` | enum | `client | editor`. |
| `body` | string | Texto del comentario. |
| `time` | number | **Segundos** (ancla real; playhead/`<video>`). |
| `timeCode` | string | Display `00:00:12:12` (ver `TIMECODE.md`). |
| `frame` | number | Frame dentro del segundo (para exactitud). |
| `fps` | number | FPS usada para el display. |
| `parentId` | string | Si es respuesta, el `commentId` padre (nullable). |
| `status` | enum | `open | resolved`. |
| `resolvedBy` | string | Quién lo resolvió (opcional). |
| `resolvedAt` | number | Timestamp de resolución (opcional). |
| `createdAt` / `updatedAt` | number | Timestamps. |
| `edited` | boolean | Si fue editado (para mostrar *editado*). |

**Índice de tiempo (para overlay / orden):** dentro de `markersIndex/{commentId}` se guarda
`{ time, timeCode }` para pintar marcas en la barra temporal sin cargar todos los cuerpos.

### 3.4 sequenceLink — `projects/{projectId}/sequences/{sequenceId}`
> Vínculo entre una **secuencia de Premiere** y una **versión de revisión**.
> ⚠️ La secuencia y sus marcadores SON de Premiere. CYBR VIEW solo guarda el mapeo.
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `versionId` | string | `versions/{id}` vinculada. |
| `projectName` | string | Nombre del proyecto de Premiere. |
| `sequenceName` | string | Nombre de la secuencia. |
| `sequenceNodeId` | string | `nodeId` de la secuencia en Premiere (identificador estable dentro de la sesión; se vuelve a mapear si cambia). |
| `fps` | number | `RealFPS` de la secuencia. |
| `timecodeType` | enum | `NDF | DF` de la secuencia. |
| `boundAt` | number | Timestamp del enlace. |

### 3.5 user — `users/{uid}`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `uid` | string | Id de Auth. |
| `name` | string | Nombre. |
| `email` | string | Correo. |
| `role` | enum | `client | editor`. |
| `color` | string | Color de identidad del autor (para diferenciar en UI). |

### 3.6 presence — `presence/{key}`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `uid` | string | Usuario conectado. |
| `name` | string | Nombre. |
| `role` | enum | `client | editor`. |
| `versionId` | string | Versión que está viendo. |
| `at` | number | Heartbeat (ms). |

> Usado para "x editor está conectado" y para borrar al desconectarse (`.info/connected`).

### 3.7 audit — `audit/{id}`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| `action` | enum | `approve | reject | resolve | comment | bind_sequence | ...`. |
| `actorUid` | string | Quién. |
| `actorName` | string | Para mostrar. |
| `target` | string | `versions/{id}` o `comments/{id}`. |
| `at` | number | Timestamp. |

---

## 4. Patrones de acceso (por qué está así)

| Acción | Lectura/selección | Path |
|--------|-------------------|------|
| Abrir versión (`/review/:id`) | 1 versión | `versions/{id}/meta` |
| Ver comentarios de una versión | Todos (o paginado por tiempo) | `versions/{id}/comments` |
| Pintar overlay de marcas | Solo índices | `versions/{id}/markersIndex` |
| Ver vínculo secuencia↔versión (CEP) | Por `sequenceNodeId` | `sequences/{seq}` |
| Presencia | Conjunto de presencia | `presence/` |

> **Razón de las dos vistas de comentario:** el overlay (marcas en la barra temporal)
> solo necesita `time` + `timeCode`, no el cuerpo. `markersIndex` evita cargar los textos
> de todos los comentarios solo para dibujar las marcas. Al abrir un comentario concreto,
> se lee el cuerpo completo por `commentId`.

---

## 5. Consideraciones RTDB

- **32MB max por nodo:** los comentarios se separan por versión, no uno solo gigante. Paginar por tiempo si una versión acumula miles de comentarios.
- **Escrituras frecuentes en comentarios → banda ancha RTDB:** se dosifica. `status` y `time` son pequeños; `body` es el único campo grande.
- **`indexOn`** para `comments` por `parentId`, `status`, `time` y `authorUid`; para `markersIndex` por `time`. Ver `FIREBASE-RULES.md`.
- **Sin joins:** si una UI necesita nombre+body+time a la vez, se lee `comments/{id}` completo (denormalizar `authorName` y `time` en el comentario evita una segunda lectura).

## 6. Migración / versionado

- `cybrview/v1/` permite evolucionar a `v2/` sin tocar datos en producción.
- Nada de borrar nodos activos hasta confirmar la fase.
- Se documenta todo cambio de esquema como ADR en `DECISIONS.md` y se actualiza `DATA-MODEL.md`.
