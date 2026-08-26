/**
 * CYBR VIEW — ExtendScript bridge (FASE 11).
 * ES3. Sin red, sin Promise, sin fetch.
 * Lee/escribe datos de Premiere Pro y los retorna como JSON.stringify.
 */

/* ============================================================
   HELPERS
   ============================================================ */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatTC(seconds, fps) {
  var safeFps = fps > 0 ? fps : 25;
  var totalFrames = Math.round(seconds * safeFps);
  var f = totalFrames % Math.round(safeFps);
  var remain = Math.floor(totalFrames / Math.round(safeFps));
  var s = remain % 60;
  remain = Math.floor(remain / 60);
  var m = remain % 60;
  var h = Math.floor(remain / 60);
  return pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
}

function frameRound(seconds, fps) {
  var safeFps = fps > 0 ? fps : 25;
  return Math.round(seconds * safeFps) / safeFps;
}

function makeTime(seconds) {
  var t = new Time();
  t.seconds = seconds;
  return t;
}

function getSeq() {
  var p = app.project;
  if (!p) return null;
  return p.activeSequence || null;
}

function getFps() {
  var seq = getSeq();
  return seq ? (Number(seq.timebase) || 25) : 25;
}

/* ============================================================
   READ (from Phase 9)
   ============================================================ */

function cybr_getProject() {
  try {
    var p = app.project;
    if (!p) return JSON.stringify({ error: 'No hay proyecto abierto' });
    return JSON.stringify({
      name: p.name || '(sin nombre)',
      filePath: p.fileName || '(sin ruta)',
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer proyecto: ' + e.message });
  }
}

function cybr_getActiveSequence() {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    return JSON.stringify({
      nodeId: seq.nodeId || '',
      name: seq.name || '(sin nombre)',
      fps: Number(seq.timebase) || 25,
      duration: (seq.end && seq.end.seconds !== undefined) ? Number(seq.end.seconds) : 0,
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer secuencia: ' + e.message });
  }
}

function cybr_getCurrentTime() {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var pos = seq.getPlayerPosition();
    var seconds = (pos && pos.seconds !== undefined) ? Number(pos.seconds) : 0;
    var fps = getFps();
    return JSON.stringify({
      seconds: seconds,
      timecode: formatTC(seconds, fps),
      fps: fps,
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer tiempo: ' + e.message });
  }
}

/* ============================================================
   SEEK
   ============================================================ */

function cybr_seekTo(seconds) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var fps = getFps();
    var safe = frameRound(seconds, fps);
    seq.setPlayerPosition(makeTime(safe));
    return JSON.stringify({ ok: true, seconds: safe, timecode: formatTC(safe, fps) });
  } catch (e) {
    return JSON.stringify({ error: 'Error al buscar: ' + e.message });
  }
}

/* ============================================================
   MARKERS
   ============================================================ */

function cybr_getAllMarkers() {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var markers = seq.markers;
    var result = [];
    for (var i = 0; i < markers.numMarkers; i++) {
      var m = markers[i];
      if (!m) continue;
      var name = m.name || '';
      if (name.indexOf('cybr:') !== 0) continue;
      var commentId = name.substring(5);
      var pos = m.startTime ? Number(m.startTime.seconds) : 0;
      result.push({
        commentId: commentId,
        seconds: pos,
        timecode: formatTC(pos, getFps()),
        text: m.comments || '',
      });
    }
    return JSON.stringify({ ok: true, markers: result });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer markers: ' + e.message });
  }
}

function cybr_createMarker(commentId, seconds, text) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var fps = getFps();
    var safe = frameRound(seconds, fps);
    var markers = seq.markers;
    var existing = findMarkerById(markers, commentId);
    if (existing) {
      existing.startTime = makeTime(safe);
      existing.comments = text || '';
      return JSON.stringify({ ok: true, action: 'updated', commentId: commentId, seconds: safe });
    }
    var m = markers.createMarker(safe);
    m.name = 'cybr:' + commentId;
    m.comments = text || '';
    return JSON.stringify({ ok: true, action: 'created', commentId: commentId, seconds: safe });
  } catch (e) {
    return JSON.stringify({ error: 'Error al crear marker: ' + e.message });
  }
}

function cybr_updateMarker(commentId, seconds, text) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var fps = getFps();
    var safe = frameRound(seconds, fps);
    var markers = seq.markers;
    var existing = findMarkerById(markers, commentId);
    if (!existing) {
      return cybr_createMarker(commentId, seconds, text);
    }
    existing.startTime = makeTime(safe);
    existing.comments = text || '';
    return JSON.stringify({ ok: true, action: 'updated', commentId: commentId, seconds: safe });
  } catch (e) {
    return JSON.stringify({ error: 'Error al actualizar marker: ' + e.message });
  }
}

function cybr_removeMarker(commentId) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var markers = seq.markers;
    var existing = findMarkerById(markers, commentId);
    if (!existing) return JSON.stringify({ ok: true, action: 'not_found', commentId: commentId });
    existing.delete();
    return JSON.stringify({ ok: true, action: 'deleted', commentId: commentId });
  } catch (e) {
    return JSON.stringify({ error: 'Error al eliminar marker: ' + e.message });
  }
}

function cybr_syncAll(markersJson) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var fps = getFps();
    var markers = seq.markers;
    var incoming = JSON.parse(markersJson);
    var incomingIds = {};
    var created = 0, updated = 0, deleted = 0, errors = 0;

    for (var i = 0; i < incoming.length; i++) {
      var c = incoming[i];
      incomingIds[c.id] = true;
      var safe = frameRound(c.time || 0, fps);
      var statusPrefix = (c.status === 'resolved') ? '[RESOLVED] ' : '';
      var markerText = statusPrefix + (c.body || '');
      try {
        var existing = findMarkerById(markers, c.id);
        if (existing) {
          existing.startTime = makeTime(safe);
          existing.comments = markerText;
          updated++;
        } else {
          var m = markers.createMarker(safe);
          m.name = 'cybr:' + c.id;
          m.comments = markerText;
          created++;
        }
      } catch (err) {
        errors++;
      }
    }

    var toDelete = [];
    for (var j = 0; j < markers.numMarkers; j++) {
      var mk = markers[j];
      if (!mk) continue;
      var mkName = mk.name || '';
      if (mkName.indexOf('cybr:') !== 0) continue;
      var mkId = mkName.substring(5);
      if (!incomingIds[mkId]) toDelete.push(mk);
    }
    for (var d = 0; d < toDelete.length; d++) {
      try { toDelete[d].delete(); deleted++; } catch (err) { errors++; }
    }

    return JSON.stringify({ ok: true, created: created, updated: updated, deleted: deleted, errors: errors });
  } catch (e) {
    return JSON.stringify({ error: 'Error en sync: ' + e.message });
  }
}

function findMarkerById(markers, commentId) {
  var target = 'cybr:' + commentId;
  for (var i = 0; i < markers.numMarkers; i++) {
    var m = markers[i];
    if (m && m.name === target) return m;
  }
  return null;
}

/* ============================================================
   EXPORT PROXY (FASE 13) — render MP4 vía cola AME con progreso
   ============================================================ */

var _export = { status: 'idle', progress: 0, message: '', error: '', outputPath: '', jobID: '' };

function _ppro_onProgress(jobID, progress) {
  _export.status = 'rendering';
  var pct = 0;
  if (typeof progress === 'object' && progress !== null && progress.percent !== undefined) {
    pct = Number(progress.percent);
  } else if (typeof progress === 'number') {
    pct = Number(progress);
  }
  _export.progress = isNaN(pct) ? _export.progress : pct;
}

function _ppro_onComplete(jobID) {
  _export.status = 'complete';
  _export.progress = 100;
  _export.message = 'RENDER_COMPLETE';
}

function _ppro_onError(jobID, msg) {
  _export.status = 'error';
  _export.error = String(msg || 'RENDER_ERROR');
}

function cybr_bindEncoder() {
  if (_export.bound) return;
  try { app.enableQE(); } catch (e) {}
  app.encoder.bind('onEncoderJobProgress', _ppro_onProgress);
  app.encoder.bind('onEncoderJobComplete', _ppro_onComplete);
  app.encoder.bind('onEncoderJobError', _ppro_onError);
  _export.bound = true;
}

function cybr_getActiveSequenceInfo() {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var fps = getFps();
    return JSON.stringify({
      name: seq.name || '(sin nombre)',
      fps: fps,
      duration: (seq.end && seq.end.seconds !== undefined) ? Number(seq.end.seconds) : 0,
      timecode: formatTC((seq.end && seq.end.seconds !== undefined) ? Number(seq.end.seconds) : 0, fps),
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer secuencia: ' + e.message });
  }
}

function cybr_pickOutputFolder() {
  try {
    var folder = Folder.selectDialog('Elegir carpeta para el proxy MP4');
    if (!folder) return JSON.stringify({ ok: false, cancelled: true });
    return JSON.stringify({ ok: true, path: folder.fsName });
  } catch (e) {
    return JSON.stringify({ ok: false, error: 'Error al elegir carpeta: ' + e.message });
  }
}

function cybr_findPreset() {
  try {
    // 1) Preferir un preset CYBR del usuario (<<CYBR>> en el nombre) en las carpetas de usuario.
    // 2) Si no, cualquier preset H.264 en carpetas de usuario o de sistema.
    var userDirs = [
      '~/Documents/Adobe/Adobe Media Encoder/26.0/Presets',
      '~/Documents/Adobe/Adobe Media Encoder/25.0/Presets',
      '~/Documents/Adobe/Adobe Media Encoder/24.0/Presets',
      '~/Documents/Adobe/Adobe Media Encoder/23.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/17.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/16.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/15.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/14.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/12.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/11.0/Presets',
      '~/AppData/Roaming/Adobe/Common/AME/10.0/Presets',
    ];
    var sysDirs = [
      'C:/Program Files/Adobe/Adobe Media Encoder 2026/MediaIO/systempresets',
      'C:/Program Files/Adobe/Adobe Media Encoder 2025/MediaIO/systempresets',
      'C:/Program Files/Adobe/Adobe Media Encoder 2024/MediaIO/systempresets',
      'C:/Program Files/Adobe/Adobe Media Encoder 2023/MediaIO/systempresets',
    ];
    var allDirs = userDirs.concat(sysDirs);
    var tried = [];
    var cybrFound = '';
    var h264Found = '';

    for (var d = 0; d < allDirs.length; d++) {
      var root = new Folder(allDirs[d]);
      tried.push(allDirs[d]);
      if (!root.exists) continue;

      var walk = function (folder) {
        if (cybrFound) return;
        var files = folder.getFiles('*.epr');
        for (var f = 0; f < files.length; f++) {
          var name = files[f].name.toLowerCase();
          if (name.indexOf('cybr') !== -1) { cybrFound = files[f].fsName; return; }
          if (!h264Found && (name.indexOf('h264') !== -1 || name.indexOf('h.264') !== -1 || name.indexOf('match source') !== -1 || name.indexOf('high quality') !== -1)) {
            h264Found = files[f].fsName;
          }
        }
        var subs = folder.getFolders();
        for (var s = 0; s < subs.length; s++) {
          if (cybrFound) return;
          walk(subs[s]);
        }
      };
      walk(root);
    }

    return JSON.stringify({ preset: cybrFound || h264Found, tried: tried });
  } catch (e) {
    return JSON.stringify({ preset: '', error: e.message });
  }
}

function cybr_startExport(presetPath, outputPath) {
  try {
    var seq = getSeq();
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    if (!presetPath) return JSON.stringify({ error: 'NO_PRESET' });
    var preset = new File(presetPath);
    if (!preset.exists) return JSON.stringify({ error: 'PRESET_NOT_FOUND' });
    if (!outputPath) return JSON.stringify({ error: 'NO_OUTPUT' });

    cybr_bindEncoder();
    _export.status = 'queued';
    _export.progress = 0;
    _export.error = '';
    _export.message = '';
    _export.outputPath = outputPath;

    try { app.encoder.launchEncoder(); } catch (e) {}

    var jobID = app.encoder.encodeSequence(seq, outputPath, preset.fsName, app.encoder.ENCODE_ENTIRE, 0);
    _export.jobID = String(jobID);
    return JSON.stringify({ ok: true, jobID: String(jobID) });
  } catch (e) {
    _export.status = 'error';
    _export.error = 'Error al exportar: ' + e.message;
    return JSON.stringify({ error: _export.error });
  }
}

function cybr_getExportState() {
  return JSON.stringify(_export);
}

function cybr_resetExport() {
  _export = { status: 'idle', progress: 0, message: '', error: '', outputPath: '', jobID: '' };
  return JSON.stringify({ ok: true });
}
