/**
 * CYBR VIEW — panel logic (FASE 10).
 * Firebase connection, auth, project/version selection, realtime comments.
 * CSInterface for Premiere bridge (diagnostic buttons kept from Phase 9).
 */
(function () {
  'use strict';

  var fb = window.CYBRFirebase;
  var sync = window.CYBRSync;

  /* --- DOM refs --- */
  var authPanel   = document.getElementById('auth-panel');
  var mainPanel   = document.getElementById('main-panel');
  var authForm    = document.getElementById('auth-form');
  var authEmail   = document.getElementById('auth-email');
  var authPass    = document.getElementById('auth-pass');
  var authError   = document.getElementById('auth-error');
  var selProject  = document.getElementById('sel-project');
  var selVersion  = document.getElementById('sel-version');
  var commentList = document.getElementById('comment-list');
  var emptyState  = document.getElementById('empty-state');
  var countEl     = document.getElementById('comments-count');
  var sysStatus   = document.getElementById('sys-status');
  var sysUser     = document.getElementById('sys-user');
  var sysProject  = document.getElementById('sys-project');
  var sysVersion  = document.getElementById('sys-version');
  var connDot     = document.getElementById('conn-dot');
  var btnLogout   = document.getElementById('btn-logout');

  /* --- INIT --- */
  fb.init();
  fb.initConnection();
  sync.initAuth();

  /* --- AUTH --- */
  authForm.addEventListener('submit', function (e) {
    e.preventDefault();
    authError.textContent = '';
    sync.signIn(authEmail.value.trim(), authPass.value).catch(function () {
      authError.textContent = 'INVALID CREDENTIALS';
    });
  });

  btnLogout.addEventListener('click', function () {
    sync.signOut();
  });

  /* --- SELECTORS --- */
  selProject.addEventListener('change', function () {
    var id = selProject.value;
    if (id) sync.selectProject(id);
  });

  selVersion.addEventListener('change', function () {
    var id = selVersion.value;
    if (id) sync.selectVersion(id);
  });

  /* --- RENDER COMMENTS --- */
  function renderComments(comments) {
    commentList.innerHTML = '';
    if (!comments.length) {
      emptyState.style.display = '';
      commentList.appendChild(emptyState);
    } else {
      emptyState.style.display = 'none';
      comments.forEach(function (c) {
        var card = document.createElement('div');
        card.className = 'comment-card';

        var tc = document.createElement('div');
        tc.className = 'comment-tc';
        tc.textContent = '[' + (c.timeCode || '00:00.00') + ']';

        var meta = document.createElement('div');
        meta.className = 'comment-meta';
        var author = document.createElement('span');
        author.className = 'comment-author';
        author.textContent = 'USER // ' + (c.authorName || 'UNKNOWN');
        var status = document.createElement('span');
        status.className = 'comment-status s-' + (c.status || 'open');
        status.textContent = 'STATUS // ' + (c.status || 'OPEN').toUpperCase();
        meta.appendChild(author);
        meta.appendChild(status);

        var body = document.createElement('div');
        body.className = 'comment-body';
        body.textContent = c.body || '';

        card.appendChild(tc);
        card.appendChild(meta);
        if (c.body) card.appendChild(body);
        commentList.appendChild(card);
      });
    }
    countEl.textContent = String(comments.length).padStart(2, '0');
  }

  /* --- STATE SUBSCRIPTION --- */
  sync.subscribe(function (s) {
    /* auth */
    if (s.user) {
      authPanel.style.display = 'none';
      mainPanel.style.display = '';
      sysUser.textContent = s.user.email || s.user.uid;
    } else {
      authPanel.style.display = '';
      mainPanel.style.display = 'none';
      sysUser.textContent = '—';
    }

    /* connection */
    connDot.className = 'conn-dot ' + (s.connected ? 'is-online' : 'is-offline');
    sysStatus.textContent = s.connected ? 'CONNECTED' : 'OFFLINE';
    sysStatus.className = 'val ' + (s.connected ? 'status-ok' : 'status-err');

    /* projects */
    if (s.projects.length && !selProject.options.length || selProject.options.length <= 1) {
      selProject.innerHTML = '<option value="">— SELECT PROJECT —</option>';
      s.projects.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (s.selectedProjectId === p.id) opt.selected = true;
        selProject.appendChild(opt);
      });
    }

    /* versions */
    var hasVersions = s.versions.length > 0;
    selVersion.disabled = !hasVersions && !s.selectedProjectId;
    if (s.selectedProjectId && s.versions.length) {
      selVersion.innerHTML = '<option value="">— SELECT VERSION —</option>';
      s.versions.forEach(function (v) {
        var opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = (v.orderCode || v.number || '') + ' ' + v.name + ' [' + v.status + ']';
        if (s.selectedVersionId === v.id) opt.selected = true;
        selVersion.appendChild(opt);
      });
    }

    /* system */
    var proj = s.projects.find(function (p) { return p.id === s.selectedProjectId; });
    var ver  = s.versions.find(function (v) { return v.id === s.selectedVersionId; });
    sysProject.textContent = proj ? proj.name : '—';
    sysVersion.textContent = ver ? ver.name : '—';

    /* error */
    if (s.error) {
      sysStatus.textContent = s.error.split(':')[0];
      sysStatus.className = 'val status-err';
    }

    /* comments */
    renderComments(s.comments);
  });

})();
