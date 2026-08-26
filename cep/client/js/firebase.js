/**
 * CYBR VIEW — Firebase layer for CEP panel (FASE 10).
 * Uses Firebase compat SDK (gstatic builds in vendor/).
 * Handles: init, auth, read projects/versions, realtime comments.
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
  var listeners = [];

  /* ---------- INIT ---------- */

  function init() {
    if (app) return;
    app = firebase.initializeApp(FIREBASE_CONFIG);
    db = app.database();
    auth = app.auth();

    db.ref('.info/connected').on('value', function (snap) {
      connected = snap.val() === true;
      notifyConnection(connected);
    });
  }

  /* ---------- AUTH ---------- */

  function signIn(email, password) {
    return auth.signInWithEmailAndPassword(email, password);
  }

  function signOut() {
    return auth.signOut();
  }

  function onAuthStateChanged(cb) {
    return auth.onAuthStateChanged(cb);
  }

  function currentUser() {
    return auth.currentUser;
  }

  /* ---------- CONNECTION ---------- */

  var connListeners = [];

  function notifyConnection(val) {
    connListeners.forEach(function (fn) { fn(val); });
  }

  function onConnection(cb) {
    connListeners.push(cb);
    if (connected !== null) cb(connected);
    return function () {
      connListeners = connListeners.filter(function (fn) { return fn !== cb; });
    };
  }

  /* ---------- DATA READS ---------- */

  /** Read all projects. Returns array of { id, name, client, status }. */
  function getProjects() {
    return db.ref('cybrview/v1/projects').once('value').then(function (snap) {
      var val = snap.val();
      if (!val) return [];
      return Object.keys(val).map(function (k) {
        var meta = val[k].meta || {};
        return { id: k, name: meta.name || k, client: meta.client || '', status: meta.status || 'active' };
      });
    });
  }

  /** Read versions for a project. Returns array of { id, name, number, status, fps, ... }. */
  function getVersions(projectId) {
    return db.ref('cybrview/v1/projects/' + projectId + '/versions').once('value').then(function (snap) {
      var val = snap.val();
      if (!val) return [];
      return Object.keys(val).map(function (k) {
        var meta = val[k].meta || {};
        return {
          id: k,
          name: meta.title || meta.name || k,
          number: meta.number || 0,
          orderCode: meta.orderCode || '',
          status: meta.status || 'draft',
          fps: meta.fps || 25,
          videoUrl: meta.videoUrl || '',
        };
      });
    });
  }

  /* ---------- REALTIME COMMENTS ---------- */

  /** Listen to comments for a version. Returns unsubscribe function. */
  function listenComments(projectId, versionId, cb) {
    var ref = db.ref('cybrview/v1/projects/' + projectId + '/versions/' + versionId + '/comments');
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

  /* ---------- PUBLIC API ---------- */

  window.CYBRFirebase = {
    init: init,
    signIn: signIn,
    signOut: signOut,
    onAuthStateChanged: onAuthStateChanged,
    currentUser: currentUser,
    onConnection: onConnection,
    getProjects: getProjects,
    getVersions: getVersions,
    listenComments: listenComments,
  };
})();
