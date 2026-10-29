/** Metadatos públicos mínimos; nunca incluye comentarios ni el catálogo privado. */
export function isShared(version) {
  return version.accessStatus === 'active' && !!version.accessToken &&
    (['SENT_FOR_REVIEW', 'CHANGES_REQUESTED', 'APPROVED'].includes(version.status) ||
      (version.status === 'ARCHIVED' && !!version.sharedAt));
}

export function reviewTokenUpdates(projects) {
  const updates = {};
  for (const project of projects) {
    const versions = {};
    for (const version of project.versions || []) {
      if (isShared(version)) versions[version.accessToken] = {
        versionId: version.id, name: version.name || version.id,
        createdAt: version.createdAt || 0,
      };
    }
    for (const version of project.versions || []) {
      if (!version.accessToken) continue;
      const shared = isShared(version);
      updates[`cybrview/v1/tokens/${version.accessToken}`] = {
        projectId: project.id, versionId: version.id,
        status: shared ? 'active' : 'revoked',
        projectName: project.name, versionName: version.name || version.id,
        videoUrl: shared ? (version.videoUrl || '') : '', fps: version.fps || 25,
        reviewStatus: version.status || 'DRAFT',
        ...(shared ? { versions } : {}),
      };
    }
  }
  return updates;
}

export function sharedVersions(node, token) {
  // Los enlaces antiguos siguen funcionando mientras el editor sincroniza el índice.
  const entries = Object.entries(node.versions || {}).map(([accessToken, v]) => ({ ...v, accessToken }));
  if (!entries.some((v) => v.accessToken === token)) entries.push({
    accessToken: token, versionId: node.versionId, name: node.versionName, createdAt: 0,
  });
  return entries.sort((a, b) => a.createdAt - b.createdAt || String(a.name).localeCompare(String(b.name), undefined, { numeric: true }));
}
