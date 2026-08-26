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
      try {
        var existing = findMarkerById(markers, c.id);
        if (existing) {
          existing.startTime = makeTime(safe);
          existing.comments = c.body || '';
          updated++;
        } else {
          var m = markers.createMarker(safe);
          m.name = 'cybr:' + c.id;
          m.comments = c.body || '';
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
