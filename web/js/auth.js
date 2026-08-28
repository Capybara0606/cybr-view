/**
 * CYBR VIEW — autenticación del editor (FASE 6).
 * Usa Firebase Authentication (email/password). En modo local/DEV (sin config de
 * Firebase) simula una sesión de editor local para poder probar el dashboard.
 */
import { configured, signInWithEmail, signOutUser, onAuthState } from './firebase.js?v=20260827';

const KEY = 'cybrview:editor:authed';
const listeners = new Set();

function currentLocalUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}

function notify(user) {
  listeners.forEach((fn) => fn(user));
}

export function useRealAuth() {
  return configured;
}

export async function signIn(email, password) {
  if (configured) {
    return signInWithEmail(email, password);
  }
  // modo local/DEV: acepta cualquier email/password y marca sesión local
  if (!email || !password) throw new Error('EMAIL_REQUIRED');
  localStorage.setItem(KEY, JSON.stringify({ email }));
  notify({ email });
  return { user: { email } };
}

export async function signOut() {
  if (configured) return signOutUser();
  localStorage.removeItem(KEY);
  notify(null);
}

export function onAuth(cb) {
  if (configured) return onAuthState(cb);
  listeners.add(cb);
  cb(currentLocalUser());
  return () => listeners.delete(cb);
}
