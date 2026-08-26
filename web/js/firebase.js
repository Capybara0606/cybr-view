/**
 * CYBR VIEW — capa de datos Firebase (RTDB + Auth) — SDK compat v10 (gstatic).
 * Los builds oficiales de gstatic se cargan en index.html (firebase-app/database/auth-compat).
 * Si la config de Firebase está vacía -> `configured` false y la app corre local.
 *
 * Estructura: cybrview/v1/projects/{projectId}/versions/{versionId}/comments/{commentId}
 */
import { CONFIG } from './config.js';

const fireConfig = CONFIG.firebase || {};

/** true => se usa RTDB/Auth. false => modo LOCAL/DEV. */
export const configured = Boolean(fireConfig.apiKey && fireConfig.databaseURL && fireConfig.projectId);

let appPromise = null;

function ensureApp() {
  if (!appPromise) {
    appPromise = Promise.resolve().then(() => {
      const fb = window.firebase;
      if (!fb || !fb.initializeApp) throw new Error('FIREBASE_SDK_NOT_LOADED');
      return fb.initializeApp({ ...fireConfig });
    });
  }
  return appPromise;
}

async function db() {
  const app = await ensureApp();
  return app.database();
}

function commentsPath(projectId, versionId) {
  return `cybrview/v1/projects/${projectId}/versions/${versionId}/comments`;
}

/** Listener realtime de los comentarios de una versión. Devuelve una función para desuscribir. */
export async function listenComments(projectId, versionId, callback) {
  const d = await db();
  const ref = d.ref(commentsPath(projectId, versionId));
  const cb = (snap) => callback(snap.val());
  ref.on('value', cb);
  return () => ref.off('value', cb);
}

export async function createComment(projectId, versionId, comment) {
  const d = await db();
  const { id, ...payload } = comment;
  await d.ref(commentsPath(projectId, versionId)).child(id).set(payload);
}

export async function updateComment(projectId, versionId, id, patch) {
  const d = await db();
  await d.ref(commentsPath(projectId, versionId)).child(id).update(patch);
}

export async function deleteComment(projectId, versionId, id) {
  const d = await db();
  await d.ref(commentsPath(projectId, versionId)).child(id).remove();
}

/** Estado de conexión del backend (para la UI). */
export function onConnection(cb) {
  if (!configured) {
    cb({ backend: 'local', connected: null });
    return;
  }
  db()
    .then((d) => {
      d.ref('.info/connected').on('value', (s) => cb({ backend: 'firebase', connected: s.val() === true }));
    })
    .catch(() => cb({ backend: 'firebase', connected: false }));
}

/* ---------- Firebase Authentication (editor) ---------- */

export async function signInWithEmail(email, password) {
  const app = await ensureApp();
  return app.auth().signInWithEmailAndPassword(email, password);
}

export async function signOutUser() {
  const app = await ensureApp();
  return app.auth().signOut();
}

export function onAuthState(cb) {
  if (!configured) {
    cb(null);
    return () => {};
  }
  ensureApp()
    .then((app) => app.auth().onAuthStateChanged(cb))
    .catch(() => cb(null));
  return () => {};
}
