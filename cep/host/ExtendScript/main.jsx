/**
 * CYBR VIEW — ExtendScript bridge (FASE 9).
 * ES3. Sin red, sin Promise, sin fetch.
 * Solo lee datos de Premiere Pro y los retorna como JSON.stringify.
 */

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
    var p = app.project;
    if (!p) return JSON.stringify({ error: 'No hay proyecto abierto' });
    var seq = p.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    return JSON.stringify({
      nodeId: seq.nodeId || '',
      name: seq.name || '(sin nombre)',
      fps: Number(seq.timebase) || 25,
      duration: seq.end ? Number(seq.end) : 0,
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer secuencia: ' + e.message });
  }
}

function cybr_getCurrentTime() {
  try {
    var p = app.project;
    if (!p) return JSON.stringify({ error: 'No hay proyecto abierto' });
    var seq = p.activeSequence;
    if (!seq) return JSON.stringify({ error: 'No hay secuencia activa' });
    var pos = seq.getPlayerPosition();
    var seconds = pos ? Number(pos) : 0;
    var fps = Number(seq.timebase) || 25;
    return JSON.stringify({
      seconds: seconds,
      timecode: formatTC(seconds, fps),
      fps: fps,
    });
  } catch (e) {
    return JSON.stringify({ error: 'Error al leer tiempo: ' + e.message });
  }
}

function formatTC(seconds, fps) {
  var total = Math.floor(seconds);
  var h = Math.floor(total / 3600);
  var m = Math.floor((total % 3600) / 60);
  var s = total % 60;
  var f = Math.round((seconds - total) * fps);
  return pad(h) + ':' + pad(m) + ':' + pad(s) + ':' + pad(f);
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
