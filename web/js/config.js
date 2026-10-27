/**
 * CYBR VIEW — configuración resuelta (un único punto de entrada).
 * Nada de secretos: solo credenciales WEB (públicas) + urls de video.
 */
import { resolve } from './config/environment.js?v=20261027-release1';

export const CONFIG = resolve();
