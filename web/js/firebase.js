/**
 * CYBR VIEW — capa de datos Firebase (RTDB + Auth) — SDK compat v10 (gstatic).
 * Los builds oficiales de gstatic se cargan en index.html (firebase-app/database/auth-compat).
 * Si la config de Firebase está vacía -> `configured` false y la app corre local.
 *
 * Estructura: cybrview/v1/projects/{projectId}/versions/{versionId}/comments/{commentId}
 */
import { CONFIG } from './config.js?v=20260826';

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

const PROJECTS_BASE = 'cybrview/v1/projects';

function projectPath(projectId) {
  return `${PROJECTS_BASE}/${projectId}`;
}

function versionPath(projectId, versionId) {
  return `${PROJECTS_BASE}/${projectId}/versions/${versionId}`;
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

/* ---------- PROJECTS CRUD ---------- */

export async function createProject(data) {
  const d = await db();
  const ref = d.ref(PROJECTS_BASE).push();
  await ref.set(data);
  return ref.key;
}

export async function updateProject(projectId, patch) {
  const d = await db();
  await d.ref(projectPath(projectId)).update(patch);
}

export async function deleteProject(projectId) {
  const d = await db();
  const ref = d.ref(projectPath(projectId));
  const snap = await ref.once('value');
  const data = snap.val();
  await ref.remove();
  if (data && data.versions) {
    const updates = {};
    Object.keys(data.versions).forEach((vid) => {
      const tok = data.versions[vid] && data.versions[vid].accessToken;
      if (tok) {
        updates[`cybrview/v1/tokens/${tok}`] = null;
        updates[`cybrview/v1/reviews/${tok}`] = null;
      }
    });
    if (Object.keys(updates).length) await d.ref().update(updates);
  }
}

/** Listener realtime del catálogo de proyectos. Devuelve unsubscribe. */
export function listenProjects(callback) {
  if (!configured) { callback(null); return () => {}; }
  let unsub = null;
  db().then((d) => {
    const ref = d.ref(PROJECTS_BASE);
    const cb = (snap) => callback(snap.val());
    ref.on('value', cb);
    unsub = () => ref.off('value', cb);
  }).catch(() => callback(null));
  return () => { if (unsub) unsub(); };
}

/* ---------- VERSIONS CRUD ---------- */

export async function createVersion(projectId, data) {
  const d = await db();
  const ref = d.ref(versionPath(projectId)).push();
  await ref.set(data);
  return ref.key;
}

export async function updateVersion(projectId, versionId, patch) {
  const d = await db();
  await d.ref(versionPath(projectId, versionId)).update(patch);
}

export async function deleteVersion(projectId, versionId) {
  const d = await db();
  await d.ref(versionPath(projectId, versionId)).remove();
}

/* ---------- SEED (write demo projects if empty) ---------- */

export async function seedIfEmpty(projects) {
  const d = await db();
  const projectSnap = await d.ref(PROJECTS_BASE).once('value');
  if (projectSnap.val()) return false;
  const tree = {};
  const commentWrites = {};
  projects.forEach((p) => {
    tree[p.id] = {
      name: p.name, client: p.client || '', createdAt: p.createdAt, updatedAt: p.updatedAt,
      versions: {},
    };
    (p.versions || []).forEach((v) => {
      tree[p.id].versions[v.id] = {
        name: v.name, videoUrl: v.videoUrl, fps: v.fps, status: v.status,
        accessToken: v.accessToken, accessStatus: v.accessStatus,
        createdAt: v.createdAt, updatedAt: v.updatedAt,
      };
      (v.comments || []).forEach((c) => {
        if (!v.accessToken) return;
        commentWrites[`cybrview/v1/reviews/${v.accessToken}/comments/${c.id}`] = c;
      });
    });
  });
  await d.ref(PROJECTS_BASE).set(tree);
  const keys = Object.keys(commentWrites);
  if (keys.length) await d.ref().update(commentWrites);
  return true;
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
