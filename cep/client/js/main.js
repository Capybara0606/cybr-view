/**
 * CYBR VIEW — panel logic (FASE 9).
 * Inicializa CSInterface, conecta botones, muestra resultados.
 * Sin Firebase, sin comentarios, sin markers. Solo validacion de Premiere bridge.
 */
(function () {
  'use strict';

  var cs = new CSInterface();

  var elProject  = document.getElementById('val-project');
  var elSequence = document.getElementById('val-sequence');
  var elTime     = document.getElementById('val-time');
  var elStatus   = document.getElementById('val-status');

  function setStatus(text, cls) {
    elStatus.textContent = text;
    elStatus.className = 'module-value';
    if (cls) elStatus.classList.add(cls);
  }

  function evalSafe(script, cb) {
    cs.evalScript(script, function (raw) {
      try {
        cb(JSON.parse(raw));
      } catch (e) {
        cb({ error: 'Respuesta invalida del panel' });
      }
    });
  }

  /* --- GET PROJECT --- */
  document.getElementById('btn-project').addEventListener('click', function () {
    setStatus('QUERY...', '');
    evalSafe('cybr_getProject()', function (d) {
      if (d.error) {
        elProject.textContent = d.error;
        elProject.className = 'module-value status-err';
        setStatus('ERROR', 'status-err');
      } else {
        elProject.textContent = d.name;
        elProject.className = 'module-value';
        setStatus('CONNECTED', 'status-ok');
      }
    });
  });

  /* --- GET SEQUENCE --- */
  document.getElementById('btn-sequence').addEventListener('click', function () {
    setStatus('QUERY...', '');
    evalSafe('cybr_getActiveSequence()', function (d) {
      if (d.error) {
        elSequence.textContent = d.error;
        elSequence.className = 'module-value status-err';
        setStatus('NO SEQUENCE', 'status-warn');
      } else {
        elSequence.textContent = d.name + ' (' + d.fps + ' fps)';
        elSequence.className = 'module-value';
        setStatus('CONNECTED', 'status-ok');
      }
    });
  });

  /* --- GET TIME --- */
  document.getElementById('btn-time').addEventListener('click', function () {
    setStatus('QUERY...', '');
    evalSafe('cybr_getCurrentTime()', function (d) {
      if (d.error) {
        elTime.textContent = '00:00:00:00';
        elTime.className = 'module-value mono status-err';
        setStatus('NO SEQUENCE', 'status-warn');
      } else {
        elTime.textContent = d.timecode;
        elTime.className = 'module-value mono';
        setStatus('CONNECTED', 'status-ok');
      }
    });
  });

  /* --- init --- */
  setStatus('STANDBY', '');
})();
