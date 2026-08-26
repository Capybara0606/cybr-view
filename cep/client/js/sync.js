/**
 * CYBR VIEW — sync module for CEP panel (FASE 12.1).
 * Manages realtime subscriptions and state for the panel.
 * Projects/versions from Firebase RTDB (cybrview/v1/projects/).
 * Comments from reviews/{token}.
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
    lastReviewLink: null,
  };

  var subs = [];
  var projectUnsub = null;
  var commentsUnsub = null;

  function notify() { subs.forEach(function (fn) { fn(state); }); }

  function subscribe(fn) {
    subs.push(fn);
    fn(state);
    return function () { subs = subs.filter(function (s) { return s !== fn; }); };
  }

  /* ---------- AUTH ---------- */

  function initAuth() {
    fb.onAuthStateChanged(function (user) {
      if (user) {
        state.user = user;
        state.error = null;
        notify();
        startProjectListener();
      } else {
        state.user = null;
        state.projects = [];
        state.versions = [];
        state.comments = [];
        state.selectedProjectId = null;
        state.selectedVersionId = null;
        state.selectedToken = null;
        stopProjectListener();
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
        startProjectListener();
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
    state.lastReviewLink = null;
    stopProjectListener();
    notify();
    return fb.signOut();
  }

  /* ---------- PROJECTS (realtime from Firebase) ---------- */

  function startProjectListener() {
    if (projectUnsub) return;
    projectUnsub = fb.listenProjects(function (projects) {
      state.projects = projects;
      if (state.selectedProjectId && !projects.find(function (p) { return p.id === state.selectedProjectId; })) {
        state.selectedProjectId = null;
        state.selectedVersionId = null;
        state.selectedToken = null;
        state.versions = [];
        state.comments = [];
      }
      if (state.selectedProjectId) {
        var proj = projects.find(function (p) { return p.id === state.selectedProjectId; });
        state.versions = proj ? proj.versions : [];
        if (state.selectedVersionId && !state.versions.find(function (v) { return v.id === state.selectedVersionId; })) {
          state.selectedVersionId = null;
          state.selectedToken = null;
          state.comments = [];
        }
      }
      notify();
    });
  }

  function stopProjectListener() {
    if (projectUnsub) { projectUnsub(); projectUnsub = null; }
  }

  function selectProject(projectId) {
    state.selectedProjectId = projectId;
    state.selectedVersionId = null;
    state.selectedToken = null;
    var proj = state.projects.find(function (p) { return p.id === projectId; });
    state.versions = proj ? proj.versions : [];
    state.comments = [];
    detachComments();
    notify();
  }

  function selectVersion(versionId) {
    state.selectedVersionId = versionId;
    state.comments = [];
    state.loading = true;
    state.error = null;
    detachComments();
    notify();

    var ver = state.versions.find(function (v) { return v.id === versionId; });
    if (ver && ver.accessToken) {
      state.selectedToken = ver.accessToken;
      attachComments(ver.accessToken);
    } else {
      state.loading = false;
      state.error = 'NO_TOKEN';
      notify();
    }
  }

  /* ---------- CREATE PROJECT / VERSION ---------- */

  function generateToken() {
    var bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }

  function createProject(name, client) {
    var now = Date.now();
    return fb.createProject({ name: name, client: client || '', createdAt: now, updatedAt: now }).then(function (id) {
      if (!state.projects.find(function (p) { return p.id === id; })) {
        state.projects.push({ id: id, name: name, client: client || '', versions: [] });
      }
      state.selectedProjectId = id;
      state.selectedVersionId = null;
      state.versions = [];
      state.comments = [];
      notify();
      return id;
    });
  }

  function createVersion(projectId, name, videoUrl, fps) {
    var now = Date.now();
    var token = generateToken();
    var data = {
      name: name,
      videoUrl: videoUrl || '',
      fps: fps || 25,
      status: 'DRAFT',
      accessToken: token,
      accessStatus: 'active',
      createdAt: now,
      updatedAt: now,
    };
    return fb.createVersion(projectId, data).then(function (id) {
      var proj = state.projects.find(function (p) { return p.id === projectId; });
      if (proj && !proj.versions.find(function (v) { return v.id === id; })) {
        proj.versions.push({ id: id, name: name, status: 'DRAFT', accessToken: token, fps: fps || 25, videoUrl: videoUrl || '' });
      }
      return fb.setReviewToken(token, {
        projectId: projectId,
        versionId: id,
        status: 'active',
        projectName: proj ? proj.name : '',
        versionName: name,
        videoUrl: videoUrl || '',
        fps: fps || 25,
        reviewStatus: 'DRAFT',
      }).then(function () {
        state.selectedProjectId = projectId;
        state.selectedVersionId = id;
        state.selectedToken = token;
        state.lastReviewLink = token;
        detachComments();
        attachComments(token);
        notify();
        return { id: id, token: token };
      });
    });
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
    if (commentsUnsub) { commentsUnsub(); commentsUnsub = null; }
  }

  /* ---------- BIDIRECTIONAL SYNC ---------- */

  function resolveComment(commentId) {
    if (!state.selectedToken || !commentId) return Promise.reject(new Error('NO_TOKEN'));
    return fb.updateComment(state.selectedToken, commentId, { status: 'resolved', updatedAt: Date.now() });
  }

  function reopenComment(commentId) {
    if (!state.selectedToken || !commentId) return Promise.reject(new Error('NO_TOKEN'));
    return fb.updateComment(state.selectedToken, commentId, { status: 'open', updatedAt: Date.now() });
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
    createProject: createProject,
    createVersion: createVersion,
    resolveComment: resolveComment,
    reopenComment: reopenComment,
  };
})();
