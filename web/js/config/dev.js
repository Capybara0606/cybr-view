/**
 * CYBR VIEW — entorno de DESARROLLO.
 * Firebase VACÍO -> la app corre en modo LOCAL/DEV (datos en localStorage).
 * Videos de demostración: samples públicos (servidos con Range/CORS).
 */
export default {
  identity: {
    product: 'CYBR VIEW',
    company: 'KIRU',
    tagline: 'VIDEO REVIEW // SYSTEM',
    version: '0.9.0',
  },

  meta: { project: 'MULTIMONEY', version: 'V01', status: 'SENT_FOR_REVIEW', fps: 25 },

  video: { url: '', poster: '', fps: 25, timecodeType: 'NDF' },

  review: { projectId: 'cybr_demo', version: '01' },

  // Firebase desactivado en dev (modo local). Rellenar para usar RTDB.
  firebase: {
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  // URLs de video de demostración (un solo lugar -> no hardcodear en varios archivos).
  demo: {
    videoV01: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    videoV02: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    videoV03: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    videoShorts: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  },
};
