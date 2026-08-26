/**
 * CYBR VIEW — Premiere bridge (FASE 11).
 * CSInterface wrapper. Safe evalScript with JSON parse.
 */
(function () {
  'use strict';

  var cs = null;
  var available = false;

  function init() {
    try {
      if (typeof CSInterface !== 'undefined') {
        cs = new CSInterface();
        available = true;
      }
    } catch (e) {
      available = false;
    }
  }

  function evalScript(fn, args, cb) {
    if (!available || !cs) {
      if (cb) cb({ error: 'Premiere not available' });
      return;
    }
    var call = fn + '(';
    if (args !== undefined && args !== null) {
      if (typeof args === 'string') {
        call += "'" + args.replace(/'/g, "\\'") + "'";
      } else {
        call += args;
      }
    }
    call += ')';
    cs.evalScript(call, function (raw) {
      try {
        cb(JSON.parse(raw));
      } catch (e) {
        cb({ error: 'Invalid response: ' + raw });
      }
    });
  }

  function seekTo(seconds, cb) {
    evalScript('cybr_seekTo', String(seconds), cb);
  }

  function getActiveSequence(cb) {
    evalScript('cybr_getActiveSequence', null, cb);
  }

  function getCurrentTime(cb) {
    evalScript('cybr_getCurrentTime', null, cb);
  }

  function createMarker(commentId, seconds, text, cb) {
    var safeText = (text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var call = "cybr_createMarker('" + commentId + "'," + String(seconds) + ",'" + safeText + "')";
    if (!available || !cs) { if (cb) cb({ error: 'Premiere not available' }); return; }
    cs.evalScript(call, function (raw) {
      try { cb(JSON.parse(raw)); } catch (e) { cb({ error: 'Invalid response' }); }
    });
  }

  function updateMarker(commentId, seconds, text, cb) {
    var safeText = (text || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var call = "cybr_updateMarker('" + commentId + "'," + String(seconds) + ",'" + safeText + "')";
    if (!available || !cs) { if (cb) cb({ error: 'Premiere not available' }); return; }
    cs.evalScript(call, function (raw) {
      try { cb(JSON.parse(raw)); } catch (e) cb({ error: 'Invalid response' }); }
    });
  }

  function removeMarker(commentId, cb) {
    evalScript('cybr_removeMarker', "'" + commentId + "'", cb);
  }

  function syncAll(comments, cb) {
    var json = JSON.stringify(comments.map(function (c) {
      return { id: c.id, time: c.time || 0, body: c.body || '', status: c.status || 'open' };
    }));
    var safe = json.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    var call = "cybr_syncAll('" + safe + "')";
    if (!available || !cs) { if (cb) cb({ error: 'Premiere not available' }); return; }
    cs.evalScript(call, function (raw) {
      try { cb(JSON.parse(raw)); } catch (e) { cb({ error: 'Invalid response' }); }
    });
  }

  function getAllMarkers(cb) {
    evalScript('cybr_getAllMarkers', null, cb);
  }

  init();

  window.CYBRBridge = {
    available: function () { return available; },
    seekTo: seekTo,
    getActiveSequence: getActiveSequence,
    getCurrentTime: getCurrentTime,
    createMarker: createMarker,
    updateMarker: updateMarker,
    removeMarker: removeMarker,
    syncAll: syncAll,
    getAllMarkers: getAllMarkers,
  };
})();
