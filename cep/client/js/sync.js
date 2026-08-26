/**
 * CYBR VIEW — sync module for CEP panel (FASE 11).
 * Manages realtime subscriptions and state for the panel.
 * Reads projects/versions from tokens, comments from reviews/{token}.
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
    selectedToken: null,
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
      if (user) {
        state.user = user;
        state.error = null;
        notify();
        loadProjects();
      } else {
        state.user = null;
        notify();
      }
    });
  }

  function signIn(email, password) {
    state.loading = true;
    state.error = null;
    notify();
    return fb.signIn(email, password).then(function (cred) {
      state.loading = false;
      if (cred && cred.user) {
        state.user = cred.user;
        state.error = null;
        notify();
        loadProjects();
      }
    }).catch(function (err) {
      state.loading = false;
      state.error = 'AUTH_FAILED: ' + (err.message || err.code || String(err));
      notify();
      throw err;
    });
  }

  function signOut() {
    state.user = null;
    state.projects = [];
    state.versions = [];
    state.comments = [];
    state.selectedProjectId = null;
    state.selectedVersionId = null;
    state.selectedToken = null;
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
    state.selectedToken = null;
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

    var ver = state.versions.find(function (v) { return v.id === versionId; });
    if (ver && ver.token) {
      state.selectedToken = ver.token;
      attachComments(ver.token);
    } else {
      fb.findToken(state.selectedProjectId, versionId).then(function (token) {
        state.selectedToken = token;
        if (token) {
          attachComments(token);
        } else {
          state.loading = false;
          state.error = 'NO_TOKEN_FOUND';
          notify();
        }
      }).catch(function (err) {
        state.loading = false;
        state.error = 'TOKEN查找失败: ' + (err.message || err.code);
        notify();
      });
    }
  }

  /* ---------- COMMENTS (REALTIME) ---------- */

  function attachComments(token) {
    commentsUnsub = fb.listenComments(token, function (comments) {
      state.comments = comments;
      state.loading = false;
      notify();
    });
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
