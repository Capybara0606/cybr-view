/**
 * CYBR VIEW — Firebase layer for CEP panel (FASE 12.1).
 * Uses Firebase compat SDK (gstatic builds in vendor/).
 * Projects live at cybrview/v1/projects/{projectId}/versions/{versionId}.
 * Tokens at cybrview/v1/tokens/{token} (for review links).
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

  var PROJECTS_BASE = 'cybrview/v1/projects';
  var TOKENS_BASE = 'cybrview/v1/tokens';

  var app = null;
  var db = null;
  var auth = null;
  var connected = false;
  var initError = null;

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

  function currentUser() { return auth ? auth.currentUser : null; }

  /* ---------- CONNECTION ---------- */

  var connListeners = [];
  function notifyConnection(val) { connListeners.forEach(function (fn) { fn(val); }); }

  function onConnection(cb) {
    connListeners.push(cb);
    cb(connected);
    return function () { connListeners = connListeners.filter(function (fn) { return fn !== cb; }); };
  }

  /* ---------- PROJECTS READ ---------- */

  function listenProjects(cb) {
    var ref = db.ref(PROJECTS_BASE);
    var handler = function (snap) {
      var val = snap.val();
      if (!val) { cb([]); return; }
      var projects = Object.keys(val).map(function (pid) {
        var p = val[pid];
        var versions = p.versions ? Object.keys(p.versions).map(function (vid) {
          return Object.assign({ id: vid, name: p.versions[vid].name || vid }, p.versions[vid]);
        }) : [];
        return { id: pid, name: p.name || pid, client: p.client || '', versions: versions };
      });
      cb(projects);
    };
    ref.on('value', handler);
    return function () { ref.off('value', handler); };
  }

  /* ---------- PROJECTS WRITE ---------- */

  function createProject(data) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    var ref = db.ref(PROJECTS_BASE).push();
    return ref.set(data).then(function () { return ref.key; });
  }

  function updateProject(projectId, patch) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    return db.ref(PROJECTS_BASE + '/' + projectId).update(patch);
  }

  /* ---------- VERSIONS WRITE ---------- */

  function createVersion(projectId, data) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    var ref = db.ref(PROJECTS_BASE + '/' + projectId + '/versions').push();
    return ref.set(data).then(function () { return ref.key; });
  }

  function updateVersion(projectId, versionId, patch) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    return db.ref(PROJECTS_BASE + '/' + projectId + '/versions/' + versionId).update(patch);
  }

  /* ---------- TOKENS ---------- */

  function setReviewToken(token, data) {
    if (!auth || !auth.currentUser) return Promise.reject(new Error('NOT_AUTHENTICATED'));
    return db.ref(TOKENS_BASE + '/' + token).set(data);
  }

  /* ---------- COMMENTS ---------- */

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
    listenProjects: listenProjects,
    createProject: createProject,
    updateProject: updateProject,
    createVersion: createVersion,
    updateVersion: updateVersion,
    setReviewToken: setReviewToken,
    listenComments: listenComments,
    updateComment: updateComment,
  };
})();
