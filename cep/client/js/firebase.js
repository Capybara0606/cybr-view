/**
 * CYBR VIEW — Firebase layer for CEP panel (FASE 11).
 * Uses Firebase compat SDK (gstatic builds in vendor/).
 * Reads projects/versions from tokens path (web writes tokens, not projects).
 * Comments live at cybrview/v1/reviews/{token}/comments.
 */
(function () {
  'use strict';

  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAy3LyON30SpQBW9uPN28_3Lr833VHmFFU',
    authDomain: 'cybr-view.firebaseapp.com',
    databaseURL: 'https://cybr-view-default-rtdb.firebaseio.com',
    projectId: 'cybr-view',
    storageBucket: 'cybr-view.firebasestorage.app',
    messagingSenderId: '1088646833360',
    appId: '1:1088646833360:web:25c7f0a447564c5729aad5',
  };

  var app = null;
  var db = null;
  var auth = null;
  var connected = false;
  var initError = null;

  /* ---------- INIT ---------- */

  function init() {
    if (app) return;
    try {
      app = firebase.initializeApp(FIREBASE_CONFIG);
      db = app.database();
      auth = app.auth();

      db.ref('.info/connected').on('value', function (snap) {
        connected = snap.val() === true;
        notifyConnection(connected);
      });
    } catch (e) {
      initError = e.message || String(e);
    }
  }

  function getInitError() { return initError; }

  /* ---------- AUTH ---------- */

  function signIn(email, password) {
    if (!auth) return Promise.reject(new Error('Firebase not initialized: ' + (initError || 'unknown')));
    return auth.signInWithEmailAndPassword(email, password);
  }

  function signOut() {
    if (!auth) return Promise.resolve();
    return auth.signOut();
  }

  function onAuthStateChanged(cb) {
    if (!auth) { cb(null); return function () {}; }
    return auth.onAuthStateChanged(cb);
  }

  function currentUser() {
    return auth ? auth.currentUser : null;
  }

  /* ---------- CONNECTION ---------- */

  var connListeners = [];

  function notifyConnection(val) {
    connListeners.forEach(function (fn) { fn(val); });
  }

  function onConnection(cb) {
    connListeners.push(cb);
    cb(connected);
    return function () {
      connListeners = connListeners.filter(function (fn) { return fn !== cb; });
    };
  }

  /* ---------- DATA READS (from tokens) ---------- */

  /**
   * Read all tokens, derive unique projects.
   * Each token has: { projectId, projectName, versionId, versionName, status, fps, videoUrl, reviewStatus }
   */
  function getProjects() {
    return db.ref('cybrview/v1/tokens').once('value').then(function (snap) {
      var val = snap.val();
      if (!val) return [];
      var seen = {};
      var projects = [];
      Object.keys(val).forEach(function (token) {
        var t = val[token];
        if (!t || !t.projectId) return;
        if (seen[t.projectId]) return;
        seen[t.projectId] = true;
        projects.push({
          id: t.projectId,
          name: t.projectName || t.projectId,
          client: '',
          status: 'active',
        });
      });
      return projects;
    });
  }

  /**
   * Read all tokens for a projectId, return unique versions.
   */
  function getVersions(projectId) {
    return db.ref('cybrview/v1/tokens').once('value').then(function (snap) {
      var val = snap.val();
      if (!val) return [];
      var seen = {};
      var versions = [];
      Object.keys(val).forEach(function (token) {
        var t = val[token];
        if (!t || t.projectId !== projectId) return;
        if (seen[t.versionId]) return;
        seen[t.versionId] = true;
        versions.push({
          id: t.versionId,
          name: t.versionName || t.versionId,
          number: 0,
          orderCode: '',
          status: t.reviewStatus || 'draft',
          fps: t.fps || 25,
          videoUrl: t.videoUrl || '',
          token: token,
        });
      });
      return versions;
    });
  }

  /**
   * Find the token for a specific project+version combination.
   */
  function findToken(projectId, versionId) {
    return db.ref('cybrview/v1/tokens').once('value').then(function (snap) {
      var val = snap.val();
      if (!val) return null;
      var best = null;
      Object.keys(val).forEach(function (token) {
        var t = val[token];
        if (t && t.projectId === projectId && t.versionId === versionId) {
          best = token;
        }
      });
      return best;
    });
  }

  /* ---------- REALTIME COMMENTS (via reviews/{token}) ---------- */

  function listenComments(token, cb) {
    var ref = db.ref('cybrview/v1/reviews/' + token + '/comments');
    var handler = function (snap) {
      var val = snap.val();
      var list = val ? Object.keys(val).map(function (k) {
        return Object.assign({ id: k }, val[k]);
      }) : [];
      list.sort(function (a, b) { return (a.time || 0) - (b.time || 0); });
      cb(list);
    };
    ref.on('value', handler);
    return function () { ref.off('value', handler); };
  }

  /* ---------- WRITE (bidirectional sync) ---------- */

  function updateComment(token, commentId, patch) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    return db.ref('cybrview/v1/reviews/' + token + '/comments/' + commentId).update(patch);
  }

  /* ---------- PUBLIC API ---------- */

  window.CYBRFirebase = {
    init: init,
    getInitError: getInitError,
    signIn: signIn,
    signOut: signOut,
    onAuthStateChanged: onAuthStateChanged,
    currentUser: currentUser,
    onConnection: onConnection,
    getProjects: getProjects,
    getVersions: getVersions,
    findToken: findToken,
    listenComments: listenComments,
    updateComment: updateComment,
  };
})();
