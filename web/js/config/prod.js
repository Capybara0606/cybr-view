/**
 * CYBR VIEW — entorno de PRODUCCIÓN (GitHub Pages).
 *
 * ⚠️ COMPLETA ESTO con TU proyecto de Firebase (credenciales WEB, son públicas).
 * La seguridad real la dan las REGLAS de Realtime Database (ver docs/FIREBASE-RULES.md).
 * NUNCA pongas aquí service accounts, private keys ni credenciales de servidor.
 *
 * Para que la app use Firebase: rellena firebase.* (al menos apiKey, databaseURL, projectId)
 * y activa RTDB con reglas de desarrollo. Sin esto, la app corre en modo LOCAL/DEV.
 *
 * Videos: apunta cada versión a TU fuente (para los renders grandes usa el proxy de
 * Cloudflare Worker descrito en DEPLOYMENT.md -> deploy/worker/worker.js).
 */
export default {
  identity: {
    product: 'CYBR VIEW',
    company: 'KIRU',
    tagline: 'VIDEO REVIEW // SYSTEM',
    version: '0.6.0',
  },

  meta: { project: 'MULTIMONEY', version: 'V01', status: 'WAITING FOR REVIEW', fps: 25 },

  video: { url: '', poster: '', fps: 25, timecodeType: 'NDF' },

  review: { projectId: 'cybr_demo', version: '01' },

  // ★ Credenciales WEB de Firebase (públicas). Proyecto: cybr-view — RTDB en modo test.
  firebase: {
    apiKey: 'AIzaSyAy3LyON30SpQBW9uPN28_3Lr833VHmFFU',
    authDomain: 'cybr-view.firebaseapp.com',
    databaseURL: 'https://cybr-view-default-rtdb.firebaseio.com',
    projectId: 'cybr-view',
    storageBucket: 'cybr-view.firebasestorage.app',
    messagingSenderId: '1088646833360',
    appId: '1:1088646833360:web:25c7f0a447564c5729aad5',
  },

  // URLs de video. Sustituye por tus URLs reales (Drive con confirm=t -> Range/CORS OK).
  demo: {
    videoV01: 'https://drive.google.com/uc?export=download&id=1zUEtgcPj6BI0TP6vCMMnn1Tid9d3PC_p',
    videoV02: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    videoV03: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    videoShorts: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
};
