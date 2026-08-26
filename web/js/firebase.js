/**
 * CYBR VIEW — capa de datos Firebase Realtime Database (FASE 5.5).
 * SDK modular v9+ cargado por importmap (esm.sh), import dinámico (sin build).
 * Si la config de Firebase está vacía -> `configured` false y la app corre local.
 *
 * Estructura: cybrview/v1/projects/{projectId}/versions/{versionId}/comments/{commentId}
 *
 * ⚠️ Reglas de RTDB = DESARROLLO. No aptas para producción hasta conectar Auth.
 */
import { CONFIG } from './config.js';

const fireConfig = CONFIG.firebase || {};

/** true => se usa RTDB. false => modo LOCAL/DEV. */
export const configured = Boolean(fireConfig.apiKey && fireConfig.databaseURL && fireConfig.projectId);

let dbPromise = null;

async function ensureDatabase() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const { initializeApp } = await import('firebase/app');
      const { getDatabase } = await import('firebase/database');
      return getDatabase(initializeApp({ ...fireConfig }));
    })().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function commentsPath(projectId, versionId) {
  return `cybrview/v1/projects/${projectId}/versions/${versionId}/comments`;
}

/** Listener realtime de los comentarios de una versión. Devuelve callback para desuscribir. */
export async function listenComments(projectId, versionId, callback) {
  const d = await ensureDatabase();
  const { ref, onValue } = await import('firebase/database');
  onValue(ref(d, commentsPath(projectId, versionId)), (snap) => callback(snap.val()));
}

/** Crea un comentario (id = clave del nodo). */
export async function createComment(projectId, versionId, comment) {
  const d = await ensureDatabase();
  const { ref, child, set } = await import('firebase/database');
  const { id, ...payload } = comment;
  await set(child(ref(d, commentsPath(projectId, versionId)), id), payload);
}

/** Actualiza campos de un comentario. */
export async function updateComment(projectId, versionId, id, patch) {
  const d = await ensureDatabase();
  const { ref, child, update } = await import('firebase/database');
  await update(child(ref(d, commentsPath(projectId, versionId)), id), patch);
}

/** Elimina un comentario. */
export async function deleteComment(projectId, versionId, id) {
  const d = await ensureDatabase();
  const { ref, child, remove } = await import('firebase/database');
  await remove(child(ref(d, commentsPath(projectId, versionId)), id));
}

/** Estado de conexión del backend (para la UI). */
export function onConnection(cb) {
  if (!configured) {
    cb({ backend: 'local', connected: null });
    return;
  }
  ensureDatabase()
    .then(async (d) => {
      const { ref, onValue } = await import('firebase/database');
      onValue(ref(d, '.info/connected'), (s) => cb({ backend: 'firebase', connected: s.val() === true }));
    })
    .catch(() => cb({ backend: 'firebase', connected: false }));
}
