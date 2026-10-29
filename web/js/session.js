/**
 * CYBR VIEW — sesión de revisión (FASE 12.1).
 * Catálogo de proyectos/versiones en Firebase RTDB.
 * Comentarios: Firebase RTDB (realtime) si está configurado; localStorage si no.
 * Expone una "tienda" que consume el panel /comments (subscribe/add/setStatus/remove).
 */
import { defaultData, load, save, refreshVideoUrls, findByToken, generateToken, normalizeVideoUrl } from './data.js?v=20261027-release1';
import {
  configured,
  listenComments, createComment, updateComment, deleteComment,
  onConnection, setReviewToken, getReviewToken, getReviewApproval, setReviewApproval,
  updateReviewTokens, listenReviewToken,
  createProject as fbCreateProject, createVersion as fbCreateVersion,
  updateVersion as fbUpdateVersion, updateProject as fbUpdateProject, deleteProject as fbDeleteProject,
  listenProjects, seedIfEmpty, cleanupBrokenVersions,
} from './firebase.js?v=20261029-versions1';
import { canTransition } from './status.js?v=20261027-release1';

import { isShared, reviewTokenUpdates, sharedVersions } from './review-catalog.js?v=20261029-versions1';

const toComments = (val) => (val ? Object.keys(val).map((k) => ({ ...val[k], id: k })) : []);

/** Convierte el snapshot de Firebase (objeto) a array de proyectos con versiones. */
function snapshotToTree(val) {
  if (!val) return [];
  return Object.keys(val).map((pid) => {
    const p = val[pid];
    const rawVersions = p.versions || {};
    let versions = [];
    Object.keys(rawVersions).forEach((vid) => {
      const vdata = rawVersions[vid];
      if (vid === 'undefined' && vdata && typeof vdata === 'object') {
        Object.keys(vdata).forEach((realVid) => {
          versions.push({
            ...vdata[realVid],
            id: realVid,
            name: vdata[realVid].name || realVid,
            comments: vdata[realVid].comments || [],
          });
        });
      } else {
        versions.push({
          ...vdata,
          id: vid,
          name: vdata.name || vid,
          comments: vdata.comments || [],
        });
      }
    });
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
  let reviewGeneration = 0;
  let attachGeneration = 0;
  let unsubToken = null;
  let reviewVersions = [];
  const reviewSubs = new Set();
  const tokenSyncSubs = new Set();
  const notifyTokenSync = (state) => tokenSyncSubs.forEach((fn) => fn(state));
  const notifyReview = (state) => reviewSubs.forEach((fn) => fn(state));
  let editorActive = false;
  let catalogGeneration = 0;
  let syncQueue = Promise.resolve();
  let lastSynced = '';

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
    const generation = ++attachGeneration;
    applyMirror([]);
    if (unsub) { unsub(); unsub = null; }
    const v = currentVersion();
    if (!v) { applyMirror([]); return; }
    if (useRemote) {
      if (!v.accessToken) { applyMirror([]); return; }
      try {
        const stop = await listenComments(v.accessToken, (val) => {
          if (generation !== attachGeneration) return;
          const list = toComments(val);
          applyMirror(list);
          const tp = tree.find((x) => x.id === (v.id && (remoteProject ? remoteProject.id : projectId)));
          const tv = tp?.versions.find((x) => x.id === v.id);
          if (tv) { tv.comments = list; }
          notifySelect();
        });
        if (generation === attachGeneration) unsub = stop; else stop();
      } catch { if (generation === attachGeneration) applyMirror([]); }
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
      if (!projectId || !tree.find((p) => p.id === projectId)) {
        projectId = tree[0]?.id || null;
        versionId = tree[0]?.versions[0]?.id || null;
      }
      notifyProjects();
      if (editorActive) syncAllTokens().catch((err) => console.error('[CYBR] Publicación de versiones pendiente', err));
      if (!remoteVersion) { notifySelect(); attach(); }
    });
  }

  async function ensureSeed() {
    if (!useRemote || seeded) return;
    await cleanupBrokenVersions();
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

  function syncAllTokens() {
    if (!useRemote || !editorActive) return Promise.resolve();
    const generation = catalogGeneration;
    const updates = reviewTokenUpdates(tree);
    const signature = JSON.stringify(updates);
    syncQueue = syncQueue.catch(() => {}).then(async () => {
      if (signature === lastSynced || !editorActive || generation !== catalogGeneration) return;
      notifyTokenSync('pending');
      try {
        if (Object.keys(updates).length) await updateReviewTokens(updates);
        lastSynced = signature;
        notifyTokenSync('ready');
      } catch (err) { notifyTokenSync('error'); throw err; }
    });
    return syncQueue;
  }

  function setEditorActive(active) {
    if (editorActive !== !!active) ++catalogGeneration;
    editorActive = !!active;
    if (editorActive) startProjectListener();
    else {
      if (unsubProjects) unsubProjects();
      unsubProjects = null;
      if (useRemote) tree = [];
      lastSynced = '';
    }
  }

  function resolveToken(token) { return findByToken(tree, token); }

  async function setAccessStatus(token, status) {
    const found = findByToken(tree, token);
    if (!found) return false;
    if (useRemote) {
      await fbUpdateVersion(found.project.id, found.version.id, { accessStatus: status, updatedAt: Date.now() });
      found.version.accessStatus = status;
      await syncAllTokens();
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
      if (!tree.find((p) => p.id === id)) {
        tree.push({ id, name, client: client || '', createdAt: now, updatedAt: now, versions: [] });
      }
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
    const vidUrl = normalizeVideoUrl(videoUrl || '');
    const data = {
      name, videoUrl: vidUrl, fps: fps || 25, status: 'DRAFT',
      accessToken: token, accessStatus: 'active',
      createdAt: now, updatedAt: now, comments: [], activity: [],
      approvedAt: null, approvedBy: null,
    };
    if (useRemote) {
      const id = await fbCreateVersion(projectIdRef, data);
      const projName = (tree.find((p) => p.id === projectIdRef) || {}).name || '';
      try {
        await setReviewToken(token, {
          projectId: projectIdRef, versionId: id, status: 'revoked',
          projectName: projName, versionName: name, videoUrl: '', fps: fps || 25, reviewStatus: 'DRAFT',
        });
      } catch (err) {
        console.error('[CYBR] setReviewToken FAILED', err);
        throw new Error('No se pudo registrar el enlace de revisión (token). Intenta de nuevo.');
      }
      const p = tree.find((x) => x.id === projectIdRef);
      if (p && !p.versions.find((x) => x.id === id)) {
        p.versions.push({ ...data, id, comments: [] });
      }
      projectId = projectIdRef;
      versionId = id;
      remoteProject = null;
      remoteVersion = null;
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

  async function deleteProject(projectIdRef) {
    if (useRemote) {
      await fbDeleteProject(projectIdRef);
    } else {
      tree = tree.filter((x) => x.id !== projectIdRef);
      persistLocal();
    }
    if (projectId === projectIdRef) {
      projectId = tree[0]?.id || null;
      versionId = tree[0]?.versions[0]?.id || null;
      remoteProject = null;
      remoteVersion = null;
    }
    notifyProjects();
    notifySelect();
  }

  /* ---------- review status ---------- */

  function logActivity(version, type, extra = {}) {
    version.activity = version.activity || [];
    version.activity.push({ type, at: Date.now(), ...extra });
    if (version.activity.length > 100) version.activity = version.activity.slice(-100);
  }

  async function setReviewStatus(versionIdArg, to, author) {
    for (const p of tree) {
      const v = (p.versions || []).find((x) => x.id === versionIdArg);
      if (!v) continue;
      if (!canTransition(v.status, to)) return { ok: false, reason: 'TRANSITION_NOT_ALLOWED' };
      const prev = v.status;
      const sharedAt = v.sharedAt || (['SENT_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'].includes(v.status) || to === 'SENT_FOR_REVIEW' ? Date.now() : null);
      const patch = { status: to, updatedAt: Date.now(), sharedAt };
      if (to === 'APPROVED') Object.assign(patch, { approvedAt: Date.now(), approvedBy: author, reviewId: v.accessToken });
      if (useRemote) await fbUpdateVersion(p.id, v.id, patch);
      v.sharedAt = sharedAt;
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
      if (useRemote) await syncAllTokens();
      persistLocal();
      notifySelect();
      return { ok: true, version: v };
    }
    return { ok: false, reason: 'NOT_FOUND' };
  }

  async function approveActive(author) {
    if (useRemote && remoteVersion) {
      const selected = remoteVersion;
      const now = Date.now();
      await setReviewApproval(selected.accessToken, { approvedAt: now, approvedBy: author, reviewId: selected.accessToken });
      if (selected !== remoteVersion) return { ok: true, version: selected };
      remoteVersion.status = 'APPROVED';
      remoteVersion.approvedAt = now;
      remoteVersion.approvedBy = author;
      remoteVersion.reviewId = remoteVersion.accessToken;
      notifySelect();
      return { ok: true, version: remoteVersion };
    }
    const v = currentVersion();
    return setReviewStatus(v?.id, 'APPROVED', author);
  }

  function closeReview() {
    ++reviewGeneration;
    ++attachGeneration;
    if (unsubToken) unsubToken();
    if (unsub) unsub();
    unsubToken = unsub = null;
    remoteProject = remoteVersion = null;
    reviewVersions = [];
    applyMirror([]);
  }

  async function openReview(token, expectedProjectId = null) {
    closeReview();
    const generation = reviewGeneration;
    if (useRemote) {
      const node = await getReviewToken(token).catch(() => null);
      if (generation !== reviewGeneration) return { ok: false, reason: 'superseded' };
      if (!node) return { ok: false, reason: 'invalid' };
      if (node.status !== 'active' || node.reviewStatus === 'DRAFT') return { ok: false, reason: 'revoked' };
      if (expectedProjectId && node.projectId !== expectedProjectId) return { ok: false, reason: 'invalid' };
      const approval = await getReviewApproval(token).catch(() => null);
      if (generation !== reviewGeneration) return { ok: false, reason: 'superseded' };
      remoteProject = { id: node.projectId, name: node.projectName };
      remoteVersion = {
        id: node.versionId, name: node.versionName, videoUrl: node.videoUrl,
        fps: node.fps, status: approval?.approvedAt ? 'APPROVED' : (node.reviewStatus || 'SENT_FOR_REVIEW'),
        accessToken: token, approvedAt: approval?.approvedAt || node.approvedAt || null, approvedBy: approval?.approvedBy || node.approvedBy || null,
      };
      projectId = node.projectId;
      versionId = node.versionId;
      reviewVersions = sharedVersions(node, token);
      notifySelect();
      await attach();
      const update = (value) => {
        if (generation !== reviewGeneration) return;
        if (!value || value.status !== 'active' || value.reviewStatus === 'DRAFT' || value.projectId !== projectId) {
          closeReview(); notifySelect(); notifyReview({ denied: true }); return;
        }
        reviewVersions = sharedVersions(value, token);
        notifyReview({ versions: reviewVersions });
      };
      const stop = await listenReviewToken(token, update, () => update(null));
      if (generation !== reviewGeneration) { stop(); return { ok: false, reason: 'superseded' }; }
      unsubToken = stop;
      return { ok: true, project: remoteProject, version: remoteVersion };
    }
    const found = findByToken(tree, token);
    if (!found) return { ok: false, reason: 'invalid' };
    if (!isShared(found.version)) return { ok: false, reason: 'revoked' };
    if (expectedProjectId && found.project.id !== expectedProjectId) return { ok: false, reason: 'invalid' };
    projectId = found.project.id;
    versionId = found.version.id;
    reviewVersions = found.project.versions.filter(isShared).map((v) => ({
      accessToken: v.accessToken, versionId: v.id, name: v.name, createdAt: v.createdAt,
    }));
    notifySelect();
    await attach();
    return { ok: true, project: found.project, version: found.version };
  }

  function findImportedReview(sourceToken) {
    if (useRemote) return null;
    return tree.find((p) => p.previewSource === sourceToken)?.versions[0]?.accessToken || null;
  }

  function importReview(sourceToken, snapshot) {
    if (useRemote) throw new Error('La importación solo está disponible en modo de prueba.');
    const existing = findImportedReview(sourceToken);
    if (existing) return existing;
    const now = Date.now();
    const accessToken = generateToken();
    tree.unshift({
      id: `preview_${generateToken()}`, name: `${snapshot.name} · PRUEBA`,
      previewSource: sourceToken, createdAt: now, updatedAt: now,
      versions: [{
        id: 'preview_v01', name: snapshot.versionName, videoUrl: snapshot.videoUrl,
        fps: snapshot.fps, status: snapshot.status,
        accessToken, accessStatus: 'active', comments: snapshot.comments,
        createdAt: now, updatedAt: now, approvedAt: null, approvedBy: null, activity: [],
      }],
    });
    persistLocal();
    notifyProjects();
    return accessToken;
  }

  /* ---------- boot ---------- */

  attach();

  return {
    isRemote: useRemote,
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
    closeReview,
    setEditorActive,
    getReviewVersions: () => reviewVersions,
    onReviewVersions: (fn) => { reviewSubs.add(fn); return () => reviewSubs.delete(fn); },
    findImportedReview,
    importReview,
    setAccessStatus,
    setReviewStatus,
    approveActive,
    syncAllTokens,
    onTokenSync: (fn) => { tokenSyncSubs.add(fn); return () => tokenSyncSubs.delete(fn); },
    onConnection,
    ensureSeed,
    addProject,
    addVersion,
    editProject,
    editVersion,
    deleteProject,

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
        const generation = reviewGeneration;
        await createComment(tok(), data);
        if (generation !== reviewGeneration) return;
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
        const generation = reviewGeneration;
        await updateComment(tok(), id, patch);
        if (generation !== reviewGeneration) return;
        optimisticPatch(id, patch);
      } else {
        localMutate((v) => { v.comments = v.comments.map((c) => (c.id === id ? { ...c, ...patch } : c)); });
        applyMirror(localComments());
      }
      logActivity(currentVersion(), status === 'resolved' ? 'comment_resolved' : 'comment_reopened', { commentId: id });
      persistLocal();
    },
    async edit(id, body) {
      const text = String(body || '').trim();
      if (!text || !mirror.some((c) => c.id === id)) throw new Error('COMMENT_NOT_FOUND_OR_EMPTY');
      const patch = { body: text, updatedAt: Date.now() };
      if (useRemote) {
        const generation = reviewGeneration;
        await updateComment(tok(), id, patch);
        if (generation !== reviewGeneration) return;
        optimisticPatch(id, patch);
      } else {
        localMutate((v) => { v.comments = v.comments.map((c) => c.id === id ? { ...c, ...patch } : c); });
        applyMirror(localComments());
      }
      logActivity(currentVersion(), 'comment_edited', { commentId: id });
      persistLocal();
    },
    async remove(id) {
      if (useRemote) {
        const generation = reviewGeneration;
        await deleteComment(tok(), id);
        if (generation !== reviewGeneration) return;
        optimisticRemove(id);
      } else {
        localMutate((v) => { v.comments = v.comments.filter((c) => c.id !== id); });
        applyMirror(localComments());
      }
    },
  };
}
