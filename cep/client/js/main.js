/**
 * CYBR VIEW — panel logic (FASE 12.1).
 * Firebase connection, auth, project/version creation, realtime comments.
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

  /* --- CREATE PROJECT + VERSION --- */
  var btnCreate = document.getElementById('btn-create-project');
  var createResult = document.getElementById('create-result');
  var createReviewLink = document.getElementById('create-review-link');
  var btnCopyLink = document.getElementById('btn-copy-link');

  var DEPLOYED_BASE = 'https://capybara0606.github.io/cybr-view';

  if (btnCreate) {
    btnCreate.addEventListener('click', function () {
      var projectName = document.getElementById('create-project-name').value.trim();
      var clientName = document.getElementById('create-project-client').value.trim();
      var versionName = document.getElementById('create-version-name').value.trim();
      var videoUrl = document.getElementById('create-video-url').value.trim();
      var fps = parseInt(document.getElementById('create-fps').value, 10) || 25;

      if (!projectName) { _b('CREATE ERR: project name required'); return; }
      if (!versionName) { _b('CREATE ERR: version name required'); return; }

      _b('creating: ' + projectName + ' / ' + versionName);
      btnCreate.disabled = true;

      sync.createProject(projectName, clientName).then(function (projectId) {
        return sync.createVersion(projectId, versionName, videoUrl, fps);
      }).then(function (result) {
        btnCreate.disabled = false;
        var link = DEPLOYED_BASE + '#/review/' + result.token;
        createReviewLink.value = link;
        createResult.hidden = false;
        _b('created OK: token=' + result.token.substring(0, 8) + '...');

        document.getElementById('create-project-name').value = '';
        document.getElementById('create-project-client').value = '';
        document.getElementById('create-version-name').value = '';
        document.getElementById('create-video-url').value = '';
        document.getElementById('create-fps').value = '25';
      }).catch(function (err) {
        btnCreate.disabled = false;
        _b('CREATE ERR: ' + (err.message || err));
      });
    });
  }

  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', function () {
      var url = createReviewLink.value;
      if (!url) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          btnCopyLink.textContent = 'COPIED';
          setTimeout(function () { btnCopyLink.textContent = 'COPY'; }, 1200);
        });
      } else {
        window.prompt('Copy review link:', url);
      }
    });
  }

  /* --- EXPORT PROXY (FASE 13) --- */
  var btnRender = document.getElementById('btn-render-proxy');
  var btnFindPreset = document.getElementById('btn-find-preset');
  var exportPreset = document.getElementById('export-preset');
  var exportStatus = document.getElementById('export-status');
  var exportBar = document.getElementById('export-bar');
  var exportFill = document.getElementById('export-fill');
  var exportOut = document.getElementById('export-out');
  var exportPath = document.getElementById('export-path');

  var PRESET_KEY = 'cybrview:preset:path';
  if (exportPreset && localStorage.getItem(PRESET_KEY)) {
    exportPreset.value = localStorage.getItem(PRESET_KEY);
  }

  function setExportStatus(txt, cls) {
    if (exportStatus) {
      exportStatus.textContent = txt;
      exportStatus.className = 'val ' + (cls || '');
    }
  }

  if (btnFindPreset) {
    btnFindPreset.addEventListener('click', function () {
      _b('finding preset...');
      bridge.findPreset(function (res) {
        if (res && res.preset) {
          exportPreset.value = res.preset;
          localStorage.setItem(PRESET_KEY, res.preset);
          setExportStatus('PRESET FOUND', 'status-ok');
          _b('preset: ' + res.preset);
        } else {
          setExportStatus('NO PRESET — pega la ruta al .epr', 'status-err');
          _b('no preset found: ' + JSON.stringify(res));
        }
      });
    });
  }

  if (btnRender) {
    btnRender.addEventListener('click', function () {
      if (!bridge.available()) { setExportStatus('PREMIERE NOT AVAILABLE', 'status-err'); return; }
      if (bridge.encoderStatus) {
        bridge.encoderStatus(function (st) {
          if (st) _b('encoder: ' + JSON.stringify(st));
        });
      }
      bridge.getActiveSequenceInfo(function (seq) {
        if (!seq || seq.error) { setExportStatus('NO SECUENCIA ACTIVA', 'status-err'); _b(seq && seq.error); return; }
        setExportStatus('SELECCIONA CARPETA...');
        bridge.pickOutputFolder(function (folder) {
          if (!folder || !folder.ok) {
            if (folder && folder.cancelled) setExportStatus('CANCELADO');
            else setExportStatus('ERROR CARPETA', 'status-err');
            return;
          }
          addExportName(seq, folder);
        });
      });
    });
  }

  function addExportName(seq, folder) {
    var preset = (exportPreset && exportPreset.value.trim()) || '';
    var sep = (folder.path && folder.path.indexOf('/') !== -1) ? '/' : '\\';
    var out = folder.path + sep + 'CYBR_' + (seq.name || 'proxy').replace(/[^a-zA-Z0-9_\-]/g, '_') + '.mp4';
    if (!preset) {
      bridge.findPreset(function (res) {
        handleExport((res && res.preset) || '', out);
      });
    } else {
      handleExport(preset, out);
    }
  }

  function handleExport(preset, out) {
    if (!preset) { setExportStatus('FALTA PRESET .epr', 'status-err'); _b('no preset'); return; }
    setExportStatus('INICIANDO RENDER...');
    _b('export: ' + out);
    exportBar.hidden = false;
    exportFill.style.width = '0%';
    bridge.exportProxy(preset, out, function (res) {
      if (res && res.ok) {
        _b('jobID=' + res.jobID);
        pollExport();
      } else {
        setExportStatus('ERROR AL INICIAR', 'status-err');
        _b('export ERR: ' + (res && (res.error || JSON.stringify(res))));
      }
    });
  }

  function pollExport() {
    bridge.getExportState(function (s) {
      if (!s) { setExportStatus('SIN ESTADO', 'status-err'); return; }
      if (s.status === 'complete') {
        exportFill.style.width = '100%';
        setExportStatus('COMPLETADO', 'status-ok');
        exportPath.value = s.outputPath || '';
        exportOut.hidden = false;
        focusVideoUrl();
        return;
      }
      if (s.status === 'error') {
        setExportStatus('ERROR: ' + (s.error || ''), 'status-err');
        _b('export ERR: ' + s.error);
        return;
      }
      if (s.status === 'canceled') {
        setExportStatus('CANCELADO', 'status-warn');
        return;
      }
      if (s.status === 'queued' && !s.queued) {
        setExportStatus('JOB ENVIADO — pulsa Start Queue en Media Encoder si no avanza');
        setTimeout(pollExport, 800);
        return;
      }
      var pct = Math.max(0, Math.min(100, Number(s.progress || 0)));
      exportFill.style.width = pct + '%';
      setExportStatus('RENDERIZANDO ' + Math.round(pct) + '%');
      setTimeout(pollExport, 500);
    });
  }

  function focusVideoUrl() {
    var v = document.getElementById('create-video-url');
    if (v) { v.focus(); v.placeholder = 'Pega aquí el enlace de Google Drive'; }
  }

  /* --- STATE SUBSCRIPTION --- */
  var lastProjectSig = '';
  var lastVersionSig = '';
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

    var projSig = s.projects.map(function (p) { return p.id; }).join(',');
    if (projSig !== lastProjectSig) {
      lastProjectSig = projSig;
      selProject.innerHTML = '<option value="">— SELECT PROJECT —</option>';
      s.projects.forEach(function (p) {
        var opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name + (p.client ? ' (' + p.client + ')' : '');
        if (s.selectedProjectId === p.id) opt.selected = true;
        selProject.appendChild(opt);
      });
      if (!s.projects.length) selProject.innerHTML = '<option value="">— NO PROJECTS —</option>';
    }

    var verSig = (s.selectedProjectId || '') + '|' + s.versions.map(function (v) { return v.id; }).join(',');
    if (verSig !== lastVersionSig) {
      lastVersionSig = verSig;
      selVersion.innerHTML = '<option value="">— SELECT VERSION —</option>';
      if (s.selectedProjectId && s.versions.length) {
        s.versions.forEach(function (v) {
          var opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = (v.name || '') + ' [' + (v.status || 'draft') + ']';
          if (s.selectedVersionId === v.id) opt.selected = true;
          selVersion.appendChild(opt);
        });
      } else if (s.selectedProjectId) {
        selVersion.innerHTML = '<option value="">— NO VERSIONS —</option>';
      }
    }
    selVersion.disabled = !s.selectedProjectId || !s.versions.length;

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
