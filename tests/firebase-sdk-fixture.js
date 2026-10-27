(() => {
  const token = 'a'.repeat(48);
  const base = 'cybrview/v1';
  const data = {
    [`${base}/tokens/${token}`]: { projectId: 'project_live', versionId: 'v02', status: 'active', projectName: 'Proyecto publicado', versionName: 'V02', videoUrl: 'https://video.test/fixture.mp4', fps: 25, reviewStatus: 'SENT_FOR_REVIEW' },
    [`${base}/reviews/${token}/comments`]: { c1: { body: 'Comentario remoto', time: 3, timeCode: '00:03.00', status: 'open' } },
  };
  window.__writes = []; window.__failWrites = false; window.__db = data;
  const listeners = new Map();
  const read = (path) => {
    if (path === '.info/connected') return true;
    if (data[path] !== undefined) return data[path];
    const split = path.lastIndexOf('/');
    return data[path.slice(0, split)]?.[path.slice(split + 1)] ?? null;
  };
  const snap = (path) => ({ val: () => structuredClone(read(path)) });
  function ref(path) {
    async function write(value, patch = false, remove = false) {
      window.__writes.push({ path, value, patch, remove, failed: window.__failWrites });
      if (window.__failWrites) throw new Error('NETWORK_FAILED');
      const split = path.lastIndexOf('/'), parent = path.slice(0, split), id = path.slice(split + 1);
      if (data[parent] && typeof data[parent] === 'object') {
        if (remove) delete data[parent][id];
        else data[parent][id] = patch ? { ...read(path), ...value } : value;
      } else if (remove) delete data[path];
      else data[path] = patch ? { ...read(path), ...value } : value;
      for (const [key, handlers] of listeners) if (key === path || key === parent) handlers.forEach((cb) => cb(snap(key)));
    }
    return { child: (id) => ref(`${path}/${id}`),
      once: async () => snap(path),
      on: (_, cb) => { if (!listeners.has(path)) listeners.set(path, new Set()); listeners.get(path).add(cb); cb(snap(path)); },
      off: (_, cb) => listeners.get(path)?.delete(cb),
      set: (v) => write(v), update: (v) => write(v, true), remove: () => write(null, false, true),
    };
  }
  window.firebase = { initializeApp: () => ({
    database: () => ({ ref }), auth: () => ({ onAuthStateChanged: (cb) => { cb(null); return () => {}; } }),
  }) };
})();
