/**
 * CYBR VIEW — resolución de entorno (FASE 5.5).
 * Selecciona dev o prod. Por defecto PROD; dev vía  ?env=dev
 */
import dev from './dev.js';
import prod from './prod.js';

const envs = { dev, prod };

export function resolve() {
  let search = '';
  try {
    search = (typeof location !== 'undefined' && location.search) || '';
  } catch {
    search = '';
  }
  const wanted = new URLSearchParams(search).get('env');
  const selected = wanted && envs[wanted] ? wanted : 'prod';
  return { ...envs[selected], env: selected };
}
