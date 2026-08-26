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

function commentsPath(token) {
  return `cybrview/v1/reviews/${token}/comments`;
}

function tokenPath(token) {
  return `cybrview/v1/tokens/${token}`;
}

/** Listener realtime de los comentarios de una revisión (por token). Devuelve unsubscribe. */
export async function listenComments(token, callback) {
  const d = await db();
  const ref = d.ref(commentsPath(token));
  const cb = (snap) => callback(snap.val());
  ref.on('value', cb);
  return () => ref.off('value', cb);
}

export async function createComment(token, comment) {
  const d = await db();
  const { id, ...payload } = comment;
  await d.ref(commentsPath(token)).child(id).set(payload);
}

export async function updateComment(token, id, patch) {
  const d = await db();
  await d.ref(commentsPath(token)).child(id).update(patch);
}

export async function deleteComment(token, id) {
  const d = await db();
  await d.ref(commentsPath(token)).child(id).remove();
}

/** Escribe el mapeo del token (para las reglas: tokens/{token}.status). Solo editor (auth). */
export async function setReviewToken(token, data) {
  const d = await db();
  await d.ref(tokenPath(token)).set(data);
}

/** Lee el mapeo del token (cliente): { projectId, versionId, status, ...meta }. */
export async function getReviewToken(token) {
  const d = await db();
  const snap = await d.ref(tokenPath(token)).once('value');
  return snap.val();
}

/** El cliente (sin auth, con token activo) registra la aprobación. */
export async function setReviewApproval(token, data) {
  const d = await db();
  await d.ref(`cybrview/v1/reviews/${token}/approval`).set(data);
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
