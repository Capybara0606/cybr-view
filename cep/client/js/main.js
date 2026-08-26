/**
 * CYBR VIEW — panel logic (FASE 11).
 * Firebase connection, auth, project/version selection, realtime comments.
 * Click comment → seek Premiere + marker sync.
 */
(function () {
  'use strict';

  var _log = document.getElementById('boot-log');
  function _b(msg) { _log.textContent += '\n> ' + msg; _log.scrollTop = _log.scrollHeight; }

  var fb = window.CYBRFirebase;
  var sync = window.CYBRSync;
  var bridge = window.CYBRBridge;

  _b('bridge: ' + (bridge && bridge.available() ? 'PREMIERE CONNECTED' : 'STANDALONE'));

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
  try {
    fb.init();
    var initErr = fb.getInitError();
    if (initErr) { _b('FB INIT ERROR: ' + initErr); authError.textContent = initErr; }
    else { _b('fb.init(): OK'); }
  } catch (e) { _b('fb.init() EXCEPTION: ' + e.message); }

  try { sync.initConnection(); _b('initConnection(): OK'); } catch (e) { _b('initConn ERR: ' + e); }
  try { sync.initAuth(); _b('initAuth(): OK'); } catch (e) { _b('initAuth ERR: ' + e); }

  /* --- AUTH FORM --- */
  authForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = authEmail.value.trim();
    var pass = authPass.value;
    _b('submit: ' + email);
    authError.textContent = '';
    sync.signIn(email, pass).catch(function (err) {
      _b('signIn ERR: ' + (err.message || err));
      authError.textContent = err.message || 'AUTH FAILED';
    });
  });

  btnLogout.addEventListener('click', function () { sync.signOut(); });

  /* --- SELECTORS --- */
  selProject.addEventListener('change', function () {
    if (selProject.value) sync.selectProject(selProject.value);
  });
  selVersion.addEventListener('change', function () {
    if (selVersion.value) sync.selectVersion(selVersion.value);
  });

  /* --- SEEK ON COMMENT CLICK --- */
  function onCommentClick(seconds) {
    if (!bridge.available()) {
      _b('Premiere not available — cannot seek');
      return;
    }
    bridge.seekTo(seconds, function (res) {
      if (res.error) _b('seek ERR: ' + res.error);
      else _b('seek OK: ' + res.timecode);
    });
  }

  /* --- RESOLVE / REOPEN (writes to Firebase, listener re-renders) --- */
  function onResolve(commentId, currentStatus) {
    var action = currentStatus === 'resolved' ? 'reopen' : 'resolve';
    var promise = currentStatus === 'resolved'
      ? sync.reopenComment(commentId)
      : sync.resolveComment(commentId);
    promise.then(function () {
      _b(action + ' OK: ' + commentId);
    }).catch(function (err) {
      _b(action + ' ERR: ' + (err.message || err));
    });
  }

  /* --- MARKER SYNC --- */
  var lastSyncedVersion = null;
  var syncDebounce = null;

  function syncMarkers(comments) {
    if (!bridge.available()) return;
    clearTimeout(syncDebounce);
    syncDebounce = setTimeout(function () {
      bridge.syncAll(comments, function (res) {
        if (res.error) _b('marker sync ERR: ' + res.error);
        else _b('markers: +' + res.created + ' ~' + res.updated + ' -' + res.deleted);
      });
    }, 300);
  }

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
        card.setAttribute('data-id', c.id);
        card.setAttribute('data-time', String(c.time || 0));

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

        var actions = document.createElement('div');
        actions.className = 'comment-actions';
        var btnResolve = document.createElement('button');
        btnResolve.className = 'btn btn-sm comment-btn-resolve';
        btnResolve.textContent = c.status === 'resolved' ? 'REOPEN' : 'RESOLVE';
        btnResolve.setAttribute('data-comment-id', c.id);
        btnResolve.setAttribute('data-status', c.status || 'open');
        btnResolve.addEventListener('click', function (ev) {
          ev.stopPropagation();
          onResolve(c.id, c.status || 'open');
        });
        actions.appendChild(btnResolve);

        card.appendChild(tc);
        card.appendChild(meta);
        if (c.body) card.appendChild(body);
        card.appendChild(actions);

        card.addEventListener('click', function () {
          onCommentClick(c.time || 0);
        });

        commentList.appendChild(card);
      });
    }
    countEl.textContent = String(comments.length).padStart(2, '0');
    syncMarkers(comments);
  }

  /* --- STATE SUBSCRIPTION --- */
  sync.subscribe(function (s) {
    if (s.user) {
      authPanel.style.display = 'none';
      mainPanel.style.display = '';
      sysUser.textContent = s.user.email || s.user.uid;
    } else {
      authPanel.style.display = '';
      mainPanel.style.display = 'none';
      sysUser.textContent = '—';
    }

    connDot.className = 'conn-dot ' + (s.connected ? 'is-online' : 'is-offline');
    sysStatus.textContent = s.connected ? 'CONNECTED' : 'OFFLINE';
    sysStatus.className = 'val ' + (s.connected ? 'status-ok' : 'status-err');

    if (s.projects.length && selProject.options.length <= 1) {
      selProject.innerHTML = '<option value="">— SELECT PROJECT —</option>';
      s.projects.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        if (s.selectedProjectId === p.id) opt.selected = true;
        selProject.appendChild(opt);
      });
    }

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

    var proj = s.projects.find(function (p) { return p.id === s.selectedProjectId; });
    var ver  = s.versions.find(function (v) { return v.id === s.selectedVersionId; });
    sysProject.textContent = proj ? proj.name : '—';
    sysVersion.textContent = ver ? ver.name : '—';

    if (s.error) {
      sysStatus.textContent = s.error.split(':')[0];
      sysStatus.className = 'val status-err';
    }

    renderComments(s.comments);
  });

})();
