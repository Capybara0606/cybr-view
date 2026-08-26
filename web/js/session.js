/**
 * CYBR VIEW — sesión de revisión (FASE 5.5).
 * Mantiene el proyecto y la versión activa. Los COMENTARIOS de la versión activa:
 *   - en Firebase RTDB (realtime) si está configurado;
 *   - en localStorage si no (modo local/DEV).
 * Expone una "tienda" que consume el panel /comments (subscribe/add/setStatus/remove).
 */
import { defaultData, load, save } from './data.js';
import { configured, listenComments, createComment, updateComment, deleteComment } from './firebase.js';

const toComments = (val) => (val ? Object.keys(val).map((k) => ({ ...val[k], id: k })) : []);

export function createSession() {
  let tree = load() || defaultData();
  let projectId = tree[0]?.id || null;
  let versionId = tree[0]?.versions[0]?.id || null;
  const useRemote = configured;

  const commentsSubs = new Set();
  const selectSubs = new Set();
  let mirror = [];
  let unsub = null;

  const currentProject = () => tree.find((p) => p.id === projectId) || null;
  const currentVersion = () => {
    const p = currentProject();
    return p?.versions.find((v) => v.id === versionId) || p?.versions[0] || null;
  };
  const localComments = () => currentVersion()?.comments || [];

  const notify = () => commentsSubs.forEach((fn) => fn(mirror));
  const notifySelect = () => selectSubs.forEach((fn) => fn({ project: currentProject(), version: currentVersion() }));

  function applyMirror(arr) {
    mirror = arr;
    notify();
  }

  async function attach() {
    if (unsub) {
      unsub();
      unsub = null;
    }
    const v = currentVersion();
    if (!v) {
      applyMirror([]);
      return;
    }
    if (useRemote) {
      try {
        unsub = await listenComments(projectId, v.id, (val) => applyMirror(toComments(val)));
      } catch {
        applyMirror(localComments());
      }
    } else {
      applyMirror(localComments());
    }
  }

  function persistLocal() {
    try {
      save(tree);
    } catch {
      /* noop */
    }
  }

  function localMutate(fn) {
    const v = currentVersion();
    if (!v) return;
    fn(v);
    persistLocal();
  }

  const optimisticAdd = (data) => applyMirror([data, ...mirror.filter((c) => c.id !== data.id)]);
  const optimisticPatch = (id, patch) => applyMirror(mirror.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const optimisticRemove = (id) => applyMirror(mirror.filter((c) => c.id !== id));

  async function selectProject(id) {
    projectId = id;
    const p = currentProject();
    versionId = p?.versions[0]?.id || null;
    notifySelect();
    await attach();
  }
  async function selectVersion(id) {
    if (id && id !== versionId) {
      versionId = id;
      notifySelect();
      await attach();
    }
  }

  function vid() {
    return currentVersion()?.id;
  }

  attach();
  return {
    getProjects: () => tree,
    getProject: currentProject,
    getVersion: currentVersion,
    getComments: () => mirror,
    selectProject,
    selectVersion,
    onSelect: (fn) => selectSubs.add(fn),

    /* ---- tienda para el panel de comentarios ---- */
    get: () => mirror,
    count: () => mirror.length,
    find: (id) => mirror.find((c) => c.id === id) || null,
    sortedByTime: () => [...mirror].sort((a, b) => a.time - b.time),
    subscribe(fn) {
      commentsSubs.add(fn);
      fn(mirror);
      return () => commentsSubs.delete(fn);
    },

    async add(data) {
      if (useRemote) {
        try {
          await createComment(projectId, vid(), data);
        } catch {
          localMutate((v) => { v.comments = [data, ...v.comments]; });
        }
        optimisticAdd(data);
      } else {
        localMutate((v) => { v.comments = [data, ...v.comments]; });
        applyMirror(localComments());
      }
    },
    async setStatus(id, status) {
      const patch = { status, updatedAt: Date.now() };
      if (useRemote) {
        try {
          await updateComment(projectId, vid(), id, patch);
        } catch {
          localMutate((v) => { v.comments = v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)); });
        }
        optimisticPatch(id, patch);
      } else {
        localMutate((v) => { v.comments = v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)); });
        applyMirror(localComments());
      }
    },
    async remove(id) {
      if (useRemote) {
        try {
          await deleteComment(projectId, vid(), id);
        } catch {
          localMutate((v) => { v.comments = v.comments.filter((c) => c.id !== id); });
        }
        optimisticRemove(id);
      } else {
        localMutate((v) => { v.comments = v.comments.filter((c) => c.id !== id); });
        applyMirror(localComments());
      }
    },
  };
}
