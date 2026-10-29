(() => {
  const base = 'cybrview/v1';
  const tokens = ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(48));
  const [old, fresh, draft, revoked, other] = tokens;
  const version = (name, token, status = 'SENT_FOR_REVIEW', accessStatus = 'active') => ({
    name, accessToken: token, accessStatus, status, videoUrl: `https://video.test/${name}.mp4`, fps: 25, createdAt: name === 'V01' ? 1 : 2,
  });
  const projects = {
    p1: { name: 'Proyecto cliente', versions: { v1: version('V01', old), v2: version('V02', fresh), v3: version('V03', draft, 'DRAFT'), v4: version('Revocada', revoked, 'SENT_FOR_REVIEW', 'revoked') } },
    p2: { name: 'Proyecto privado ajeno', versions: { v1: version('Otro cliente', other) } },
  };
  const data = { cybrview: { v1: { projects, tokens: {}, reviews: {} } } };
  for (const [pid, p] of Object.entries(projects)) for (const [vid, v] of Object.entries(p.versions)) {
    data.cybrview.v1.tokens[v.accessToken] = { projectId: pid, versionId: vid, status: v.accessStatus, reviewStatus: v.status, projectName: p.name, versionName: v.name, videoUrl: v.videoUrl, fps: v.fps };
    data.cybrview.v1.reviews[v.accessToken] = { comments: { c1: { body: `Comentario ${v.name}`, time: vid === 'v1' ? 3 : 8, timeCode: '00:03.00', status: 'open' } } };
  }
  const listeners = new Map(); let editor = false; let authCallback; let pushId = 0;
  const clone = (v) => v == null ? null : structuredClone(v);
  const get = (path) => path.split('/').filter(Boolean).reduce((v, k) => v?.[k], data) ?? null;
  const put = (path, value) => {
    const parts = path.split('/').filter(Boolean), key = parts.pop(); let node = data;
    for (const part of parts) node = node[part] ||= {};
    if (value === null) delete node[key]; else node[key] = clone(value);
  };
  const emit = (path) => {
    for (const [key, handlers] of listeners) if (key === path || key.startsWith(`${path}/`) || path.startsWith(`${key}/`)) {
      for (const cb of handlers) queueMicrotask(() => cb({ val: () => clone(get(key)) }));
    }
  };
  window.__reads = []; window.__writes = [];
  window.__holdWrites = false;
  const heldWrites = [];
  window.__releaseWrites = () => { window.__holdWrites = false; heldWrites.splice(0).forEach((resolve) => resolve()); };
  window.__fixture = { tokens, get: (path) => clone(get(path)),
    set: (path, value) => { put(path, value); emit(path); },
    editor: (active) => { editor = active; authCallback?.(active ? { email: 'editor@test.invalid' } : null); },
  };
  function ref(path = '') {
    const read = () => {
      window.__reads.push(path);
      if (!editor && path.startsWith(`${base}/projects`)) throw new Error('PERMISSION_DENIED_PRIVATE_CATALOG');
      return { val: () => path === '.info/connected' ? true : clone(get(path)) };
    };
    async function write(value, patch = false) {
      if (!editor && !path.includes('/reviews/')) throw new Error('PERMISSION_DENIED');
      window.__writes.push({ path, value: clone(value) });
      if (window.__holdWrites && path.includes('/reviews/')) await new Promise((resolve) => heldWrites.push(resolve));
      if (patch) for (const [key, v] of Object.entries(value)) { const target = path ? `${path}/${key}` : key; put(target, v); emit(target); }
      else { put(path, value); emit(path); }
    }
    return { key: path.split('/').pop(), child: (key) => ref(`${path}/${key}`),
      push: () => ref(`${path}/new${++pushId}`), once: async () => read(),
      on: (_, cb, error) => {
        try { const snapshot = read(); if (!listeners.has(path)) listeners.set(path, new Set()); listeners.get(path).add(cb); queueMicrotask(() => cb(snapshot)); }
        catch (err) { error?.(err); }
      },
      off: (_, cb) => listeners.get(path)?.delete(cb), set: (value) => write(value),
      update: (value) => write(value, true), remove: () => write(null),
    };
  }
  window.firebase = { initializeApp: () => ({ database: () => ({ ref }), auth: () => ({
    onAuthStateChanged: (cb) => { authCallback = cb; cb(editor ? { email: 'editor@test.invalid' } : null); return () => {}; },
  }) }) };
})();
