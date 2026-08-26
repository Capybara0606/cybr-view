# SYNC-SPEC.md

> Contrato de **sincronización en tiempo real** entre la Web, la Realtime Database y el CEP.
> Firebase RTDB es el único canal de difusión. No hay conexión directa Web↔CEP.

---

## 1. Principios

- **Firebase = fuente de verdad.** Web y CEP son **réplicas** que se suscriben.
- **Direccionalidad:** todo cambio (comentario, resolución, aprobación, marcador) se escribe
  a RTDB y se difunde. El cliente "envía" al editor y viceversa por el mismo árbol.
- **Offline:** si un cliente/editor se desconecta, los cambios se **encolan** (local) y se
  sincronizan al reconectar. Realtime Database lo hace de forma nativa (reautenticación/detached).
- **Sin CRDT:** para comentarios y estado basta con **last-write-wins** + `updatedAt` para
  resolver conflictos simples (ADR-007).

---

## 2. Canales de suscripción

| Runtime | Nodos que suscribe | Modo |
|---------|--------------------|-------|
| **Web** | `versions/{id}/meta`, `versions/{id}/comments`, `versions/{id}/markersIndex`, `presence/` | `onValue`/`onChildAdded` |
| **CEP (panel)** | `versions/{id}/comments`, `versions/{id}/markersIndex`, `projects/{id}/meta`, `presence/` | `onValue`/`onChildAdded` |

- **Suscripción por `onValue`** (nodo completo) para el estado.
- **`onChildAdded` para nuevas llegadas** si hay muchos comentarios (evitar cargar todo el arbol de golpe).
- **`markersIndex`** es el canal "ligero" para el overlay de la Web y para que el CEP sepa
  dónde están las marcas.

---

## 3. Contrato de mensajes

### 3.1 Comentario
```json
{
  "authorUid": "uid",
  "authorName": "Cliente A",
  "authorRole": "client",
  "body": "El fondo a 00:00:05 queda oscuro, subir un poco.",
  "time": 5.12,
  "frame": 3,
  "timeCode": "00:00:05:03",
  "fps": 25,
  "parentId": null,
  "status": "open",
  "createdAt": 1720000000000,
  "updatedAt": 1720000000000
}
```

### 3.2 Estado / resolución
```json
{
  "status": "resolved",
  "resolvedBy": "Editor KIRU",
  "resolvedAt": 1720001000000,
  "updatedAt": 1720001000000
}
```

### 3.3 Aprobación de versión (en `versions/{id}/meta` o `approvals/{uid}`)
```json
{
  "status": "approved",
  "approved": true,
  "approvedBy": "Cliente A",
  "approvedAt": 1720002000000
}
```

### 3.4 Marcador (CEP → RTDB, via `markersIndex`)
```json
{
  "time": 5.12,
  "timeCode": "00:00:05:03"
}
```

> Los marcadores realmente se crean en Premiere; `markersIndex` en RTDB es un espejo ligero
> para la Web (overlay) y para no duplicar. El **naming** en Premiere `CYBR::<commentId>`
> hace que `commentId ↔ marker` sea reversible.

---

## 4. Conflicto / concurrencia

| Caso | Estrategia |
|------|------------|
| Dos editores resuelven el mismo comentario | `last-write-wins` + `updatedAt`. No hay condiciones raras (estado booleano). |
| Editor y cliente editan un comentario a la vez | Solo el **autor** puede editar su comentario (ver `comments.js` / reglas). |
| Cliente aprueba mientras el editor va por la mitad | La aprobación es independiente de los comentarios (estado de versión). |
| Comentarios que se crean casi simultáneos con el mismo `time` | `commentId` distinto (clave `push`), sin colisión. |

- **`updatedAt`** se usa como tie-breaker. Se escribe en cada mutación.
- **`authorUid`** identifica al propietario → el resto no puede pisar sus campos.

## 5. Presencia / estado de conexión

- Cada runtime escribe su entrada en `presence/{key}` con `at = Date.now()` (heartbeat).
- El nodo `.info/connected` de Firebase informa de la conexión real → al desconectar, se borra
  la presencia o se marca `offline`.
- Permite al editor ver "3 personas viendo", y al cliente ver "El editor está en línea".
- Heartbeat periódico para limpiar sesiones fantasma (entradas viejas).

---

## 6. Offline / reconexión

- RTDB tiene **offline persistence** (`database` con `keepSynced()` en los nodos críticos).
- **Web:** `firebase.database().ref('...').keepSynced()` en los nodos que se lean con frecuencia
  (evita re-descargas al reconectar).
- **CEP:** manejar los eventos `connected` y re-suscribirse; al reconectar, re-sincronizar
  `markersIndex` con los marcadores reales de Premiere (para evitar duplicados o faltantes).
- **Cola offline:** los cambios escritos en local al desconectar se envían al reconectar de forma
  automática (comportamiento nativo de RTDB). Visualmente se muestra un estado `OFFLINE` /
  `SYNCING` en la UI.

---

## 7. Secuencia de pasos (ejemplo de flujo)

### Web → CEP
1. Cliente escribe comentario con `time` (s). `state.js` escribe a `.../comments/{pushKey}`.
2. RTDB difunde `onChildAdded`.
3. `sync.js` (CEP) recibe el comentario, lo pinta en el panel y dispara `setPlayhead(time)`
   y crea el marcador (si está configurado auto).

### CEP → Web
1. Editor resuelve comentario desde el panel → `sync.js` escribe `status: resolved`.
2. RTDB difunde `onChildChanged`.
3. `comments.js` (Web) muestra el comentario como resuelto.

---

## 8. Implementación por fases

| Fase | Qué se sincroniza |
|------|-------------------|
| 2 | Versión (meta) + login. |
| 3 | Comentarios (crear/responder/resolver), `markersIndex`. |
| 4 | Aprobación de versión + presencia. |
| 5/6 | CEP ↔ Premiere: playhead + marcadores. |
| 7 | Secuencia↔versión + timecodes. |
