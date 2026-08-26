/**
 * CYBR VIEW — sesión de revisión (FASE 12.1).
 * Catálogo de proyectos/versiones en Firebase RTDB.
 * Comentarios: Firebase RTDB (realtime) si está configurado; localStorage si no.
 * Expone una "tienda" que consume el panel /comments (subscribe/add/setStatus/remove).
 */
import { defaultData, load, save, refreshVideoUrls, findByToken, generateToken } from './data.js';
import {
  configured,
  listenComments, createComment, updateComment, deleteComment,
  onConnection, setReviewToken, getReviewToken, setReviewApproval,
  createProject as fbCreateProject, createVersion as fbCreateVersion,
  updateVersion as fbUpdateVersion, updateProject as fbUpdateProject,
  listenProjects, seedIfEmpty,
} from './firebase.js';
import { canTransition } from './status.js';

const toComments = (val) => (val ? Object.keys(val).map((k) => ({ ...val[k], id: k })) : []);

/** Convierte el snapshot de Firebase (objeto) a array de proyectos con versiones. */
function snapshotToTree(val) {
  if (!val) return [];
  return Object.keys(val).map((pid) => {
    const p = val[pid];
    const versions = p.versions ? Object.keys(p.versions).map((vid) => ({
      ...p.versions[vid],
      id: vid,
      comments: p.versions[vid].comments || [],
    })) : [];
    return { id: pid, name: p.name || pid, client: p.client || '', createdAt: p.createdAt, updatedAt: p.updatedAt, versions };
  });
}

export function createSession() {
  const useRemote = configured;
  let tree = useRemote ? [] : (load() || defaultData());
  if (!useRemote) refreshVideoUrls(tree);
  let projectId = tree[0]?.id || null;
  let versionId = tree[0]?.versions[0]?.id || null;

  const commentsSubs = new Set();
  const selectSubs = new Set();
  const projectSubs = new Set();
  let mirror = [];
  let unsub = null;
  let unsubProjects = null;
  let remoteProject = null;
  let remoteVersion = null;
  let seeded = false;

  const currentProject = () => remoteProject || tree.find((p) => p.id === projectId) || null;
  const currentVersion = () => {
    if (remoteVersion) return remoteVersion;
    const p = tree.find((x) => x.id === projectId);
    return p?.versions.find((v) => v.id === versionId) || p?.versions[0] || null;
  };
  const localComments = () => currentVersion()?.comments || [];

  const notify = () => commentsSubs.forEach((fn) => fn(mirror));
  const notifySelect = () => selectSubs.forEach((fn) => fn({ project: currentProject(), version: currentVersion() }));
  const notifyProjects = () => projectSubs.forEach((fn) => fn(tree));

  function applyMirror(arr) {
    mirror = arr;
    notify();
  }

  async function attach() {
    if (unsub) { unsub(); unsub = null; }
    const v = currentVersion();
    if (!v) { applyMirror([]); return; }
    if (useRemote) {
      try { unsub = await listenComments(v.accessToken, (val) => applyMirror(toComments(val))); }
      catch { applyMirror(localComments()); }
    } else {
      applyMirror(localComments());
    }
  }

  function persistLocal() {
    try { save(tree); } catch { /* noop */ }
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

  /* ---------- Firebase project catalog listener ---------- */

  function startProjectListener() {
    if (!useRemote || unsubProjects) return;
    unsubProjects = listenProjects((val) => {
      tree = snapshotToTree(val);
      if (tree.length && !seeded) {
        seeded = true;
      }
      if (projectId && !tree.find((p) => p.id === projectId)) {
        projectId = tree[0]?.id || null;
        versionId = tree[0]?.versions[0]?.id || null;
      }
      notifyProjects();
      notifySelect();
      attach();
    });
  }

  async function ensureSeed() {
    if (!useRemote || seeded) return;
    const demo = defaultData();
    const wrote = await seedIfEmpty(demo).catch(() => false);
    if (wrote) seeded = true;
  }

  /* ---------- project/version selection ---------- */

  async function selectProject(id) {
    remoteProject = null;
    remoteVersion = null;
    projectId = id;
    const p = currentProject();
    versionId = p?.versions[0]?.id || null;
    notifySelect();
    await attach();
  }

  async function selectVersion(id) {
    if (id && id !== versionId) {
      remoteProject = null;
      remoteVersion = null;
      versionId = id;
      notifySelect();
      await attach();
    }
  }

  /* ---------- tokens ---------- */

  function tok() { return currentVersion()?.accessToken; }

  function tokenMeta(p, v) {
    return {
      projectId: p.id,
      versionId: v.id,
      status: v.accessStatus,
      projectName: p.name,
      versionName: v.name,
      videoUrl: v.videoUrl,
      fps: v.fps,
      reviewStatus: v.status,
    };
  }

  function syncAllTokens() {
    if (!useRemote) return;
    tree.forEach((p) => {
      (p.versions || []).forEach((v) => {
        setReviewToken(v.accessToken, tokenMeta(p, v)).catch(() => {});
      });
    });
  }

  function resolveToken(token) { return findByToken(tree, token); }

  function setAccessStatus(token, status) {
    const found = findByToken(tree, token);
    if (!found) return false;
    if (useRemote) {
      fbUpdateVersion(found.project.id, found.version.id, { accessStatus: status, updatedAt: Date.now() }).catch(() => {});
      setReviewToken(token, { ...tokenMeta(found.project, found.version), status }).catch(() => {});
    } else {
      found.version.accessStatus = status;
      found.version.updatedAt = Date.now();
      persistLocal();
    }
    return true;
  }

  /* ---------- CREATE project / version ---------- */

  async function addProject(name, client) {
    const now = Date.now();
    const data = { name, client: client || '', createdAt: now, updatedAt: now };
    if (useRemote) {
      const id = await fbCreateProject(data);
      projectId = id;
      notifyProjects();
      notifySelect();
      return id;
    }
    const id = 'proj_' + Date.now();
    tree.push({ id, name, client: client || '', createdAt: now, updatedAt: now, versions: [] });
    projectId = id;
    persistLocal();
    notifyProjects();
    notifySelect();
    return id;
  }

  async function addVersion(projectIdRef, name, videoUrl, fps) {
    const now = Date.now();
    const token = generateToken();
    const data = {
      name, videoUrl: videoUrl || '', fps: fps || 25, status: 'DRAFT',
      accessToken: token, accessStatus: 'active',
      createdAt: now, updatedAt: now, comments: [], activity: [],
      approvedAt: null, approvedBy: null,
    };
    if (useRemote) {
      const id = await fbCreateVersion(projectIdRef, data);
      await setReviewToken(token, {
        projectId: projectIdRef, versionId: id, status: 'active',
        projectName: (tree.find((p) => p.id === projectIdRef) || {}).name || '',
        versionName: name, videoUrl: videoUrl || '', fps: fps || 25, reviewStatus: 'DRAFT',
      }).catch(() => {});
      projectId = projectIdRef;
      versionId = id;
      notifyProjects();
      notifySelect();
      await attach();
      return { id, token };
    }
    const vid = 'V' + Date.now();
    const p = tree.find((x) => x.id === projectIdRef);
    if (p) {
      p.versions.push({ ...data, id: vid });
      versionId = vid;
      persistLocal();
    }
    notifyProjects();
    notifySelect();
    await attach();
    return { id: vid, token };
  }

  async function editVersion(projectIdRef, versionIdRef, patch) {
    if (useRemote) {
      await fbUpdateVersion(projectIdRef, versionIdRef, { ...patch, updatedAt: Date.now() });
      const v = currentVersion();
      if (v && v.id === versionIdRef) Object.assign(v, patch, { updatedAt: Date.now() });
    } else {
      const p = tree.find((x) => x.id === projectIdRef);
      const v = p?.versions.find((x) => x.id === versionIdRef);
      if (v) { Object.assign(v, patch, { updatedAt: Date.now() }); persistLocal(); }
    }
    notifyProjects();
    notifySelect();
  }

  async function editProject(projectIdRef, patch) {
    if (useRemote) {
      await fbUpdateProject(projectIdRef, { ...patch, updatedAt: Date.now() });
    } else {
      const p = tree.find((x) => x.id === projectIdRef);
      if (p) { Object.assign(p, patch, { updatedAt: Date.now() }); persistLocal(); }
    }
    notifyProjects();
  }

  /* ---------- review status ---------- */

  function logActivity(version, type, extra = {}) {
    version.activity = version.activity || [];
    version.activity.push({ type, at: Date.now(), ...extra });
    if (version.activity.length > 100) version.activity = version.activity.slice(-100);
  }

  function setReviewStatus(versionIdArg, to, author) {
    for (const p of tree) {
      const v = (p.versions || []).find((x) => x.id === versionIdArg);
      if (!v) continue;
      if (!canTransition(v.status, to)) return { ok: false, reason: 'TRANSITION_NOT_ALLOWED' };
      const prev = v.status;
      v.status = to;
      v.updatedAt = Date.now();
      if (to === 'APPROVED') {
        v.approvedAt = Date.now();
        v.approvedBy = author;
        v.reviewId = v.accessToken;
      }
      const type = {
        APPROVED: 'review_approved',
        SENT_FOR_REVIEW: prev === 'CHANGES_REQUESTED' ? 'review_reopened' : 'review_sent',
        CHANGES_REQUESTED: 'review_changes_requested',
        ARCHIVED: 'review_archived',
      }[to] || `review_${to.toLowerCase()}`;
      logActivity(v, type, { by: author });
      if (useRemote) {
        fbUpdateVersion(p.id, v.id, { status: v.status, updatedAt: v.updatedAt, approvedAt: v.approvedAt, approvedBy: v.approvedBy, reviewId: v.reviewId }).catch(() => {});
      }
      persistLocal();
      notifySelect();
      return { ok: true, version: v };
    }
    return { ok: false, reason: 'NOT_FOUND' };
  }

  function approveActive(author) {
    if (useRemote && remoteVersion) {
      const now = Date.now();
      remoteVersion.status = 'APPROVED';
      remoteVersion.approvedAt = now;
      remoteVersion.approvedBy = author;
      remoteVersion.reviewId = remoteVersion.accessToken;
      setReviewApproval(remoteVersion.accessToken, { approvedAt: now, approvedBy: author, reviewId: remoteVersion.accessToken }).catch(() => {});
      notifySelect();
      return { ok: true, version: remoteVersion };
    }
    const v = currentVersion();
    return setReviewStatus(v?.id, 'APPROVED', author);
  }

  async function openReview(token) {
    if (useRemote) {
      const node = await getReviewToken(token).catch(() => null);
      if (!node) return { ok: false, reason: 'invalid' };
      if (node.status !== 'active') return { ok: false, reason: 'revoked' };
      remoteProject = { id: node.projectId, name: node.projectName };
      remoteVersion = {
        id: node.versionId, name: node.versionName, videoUrl: node.videoUrl,
        fps: node.fps, status: node.reviewStatus || 'SENT_FOR_REVIEW',
        accessToken: token, approvedAt: node.approvedAt || null, approvedBy: node.approvedBy || null,
      };
      projectId = node.projectId;
      versionId = node.versionId;
      notifySelect();
      await attach();
      return { ok: true, project: remoteProject, version: remoteVersion };
    }
    const found = findByToken(tree, token);
    if (!found) return { ok: false, reason: 'invalid' };
    if (found.version.accessStatus !== 'active') return { ok: false, reason: 'revoked' };
    projectId = found.project.id;
    versionId = found.version.id;
    notifySelect();
    await attach();
    return { ok: true, project: found.project, version: found.version };
  }

  /* ---------- boot ---------- */

  if (useRemote) {
    ensureSeed().then(() => startProjectListener());
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
    onProjects: (fn) => { projectSubs.add(fn); fn(tree); return () => projectSubs.delete(fn); },
    resolveToken,
    openReview,
    setAccessStatus,
    setReviewStatus,
    approveActive,
    syncAllTokens,
    onConnection,
    addProject,
    addVersion,
    editProject,
    editVersion,

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
        try { await createComment(tok(), data); }
        catch { localMutate((v) => { v.comments = [data, ...v.comments]; }); }
        optimisticAdd(data);
      } else {
        localMutate((v) => { v.comments = [data, ...v.comments]; });
        applyMirror(localComments());
      }
      logActivity(currentVersion(), data.parentId ? 'reply_created' : 'comment_created', { by: data.authorName, commentId: data.id });
      persistLocal();
    },
    async setStatus(id, status) {
      const patch = { status, updatedAt: Date.now() };
      if (useRemote) {
        try { await updateComment(tok(), id, patch); }
        catch { localMutate((v) => { v.comments = v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)); }); }
        optimisticPatch(id, patch);
      } else {
        localMutate((v) => { v.comments = v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)); });
        applyMirror(localComments());
      }
      logActivity(currentVersion(), status === 'resolved' ? 'comment_resolved' : 'comment_reopened', { commentId: id });
      persistLocal();
    },
    async remove(id) {
      if (useRemote) {
        try { await deleteComment(tok(), id); }
        catch { localMutate((v) => { v.comments = v.comments.filter((c) => c.id !== id); }); }
        optimisticRemove(id);
      } else {
        localMutate((v) => { v.comments = v.comments.filter((c) => c.id !== id); });
        applyMirror(localComments());
      }
    },
  };
}
