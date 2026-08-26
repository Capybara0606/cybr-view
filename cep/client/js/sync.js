/**
 * CYBR VIEW — sync module for CEP panel (FASE 10).
 * Manages realtime subscriptions and state for the panel.
 * Pure data layer — no DOM.
 */
(function () {
  'use strict';

  var fb = window.CYBRFirebase;

  var state = {
    user: null,
    projects: [],
    versions: [],
    comments: [],
    selectedProjectId: null,
    selectedVersionId: null,
    connected: false,
    loading: false,
    error: null,
  };

  var subs = [];

  function notify() {
    subs.forEach(function (fn) { fn(state); });
  }

  function subscribe(fn) {
    subs.push(fn);
    fn(state);
    return function () {
      subs = subs.filter(function (s) { return s !== fn; });
    };
  }

  /* ---------- AUTH ---------- */

  function initAuth() {
    fb.onAuthStateChanged(function (user) {
      state.user = user;
      state.error = null;
      notify();
      if (user) loadProjects();
    });
  }

  function signIn(email, password) {
    state.loading = true;
    state.error = null;
    notify();
    return fb.signIn(email, password).catch(function (err) {
      state.loading = false;
      state.error = 'AUTH_FAILED: ' + (err.message || err.code);
      notify();
      throw err;
    }).then(function () {
      state.loading = false;
      notify();
    });
  }

  function signOut() {
    state.user = null;
    state.projects = [];
    state.versions = [];
    state.comments = [];
    state.selectedProjectId = null;
    state.selectedVersionId = null;
    notify();
    return fb.signOut();
  }

  /* ---------- PROJECTS / VERSIONS ---------- */

  var commentsUnsub = null;

  function loadProjects() {
    state.loading = true;
    state.error = null;
    notify();
    fb.getProjects().then(function (projects) {
      state.projects = projects;
      state.loading = false;
      notify();
    }).catch(function (err) {
      state.loading = false;
      state.error = 'PROJECTS_LOAD_FAILED: ' + (err.message || err.code);
      notify();
    });
  }

  function selectProject(projectId) {
    state.selectedProjectId = projectId;
    state.selectedVersionId = null;
    state.versions = [];
    state.comments = [];
    state.loading = true;
    state.error = null;
    detachComments();
    notify();
    fb.getVersions(projectId).then(function (versions) {
      state.versions = versions;
      state.loading = false;
      notify();
    }).catch(function (err) {
      state.loading = false;
      state.error = 'VERSIONS_LOAD_FAILED: ' + (err.message || err.code);
      notify();
    });
  }

  function selectVersion(versionId) {
    state.selectedVersionId = versionId;
    state.comments = [];
    state.loading = true;
    state.error = null;
    detachComments();
    notify();
    attachComments();
  }

  /* ---------- COMMENTS (REALTIME) ---------- */

  function attachComments() {
    if (!state.selectedProjectId || !state.selectedVersionId) return;
    commentsUnsub = fb.listenComments(
      state.selectedProjectId,
      state.selectedVersionId,
      function (comments) {
        state.comments = comments;
        state.loading = false;
        notify();
      }
    );
  }

  function detachComments() {
    if (commentsUnsub) {
      commentsUnsub();
      commentsUnsub = null;
    }
  }

  /* ---------- CONNECTION ---------- */

  function initConnection() {
    fb.onConnection(function (connected) {
      state.connected = connected;
      notify();
    });
  }

  /* ---------- PUBLIC API ---------- */

  window.CYBRSync = {
    subscribe: subscribe,
    getState: function () { return state; },
    initAuth: initAuth,
    initConnection: initConnection,
    signIn: signIn,
    signOut: signOut,
    selectProject: selectProject,
    selectVersion: selectVersion,
    loadProjects: loadProjects,
  };
})();
