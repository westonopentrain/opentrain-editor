// Simple in-memory store; replace with Postgres/S3 adapter later.
const docs = new Map(); // key: id, value: JobDoc

export function getDoc(id) {
  return docs.get(id) || null;
}

export function upsertDoc(id, payload) {
  const now = new Date().toISOString();
  const prev = docs.get(id) || { id, version: 0, createdAt: now };
  const next = {
    ...prev,
    ...payload,
    id,
    version: (prev.version || 0) + 1,
    updatedAt: now,
  };
  docs.set(id, next);
  return next;
}

export function listDocsByJob(jobId) {
  return Array.from(docs.values()).filter((doc) => doc.jobId === jobId);
}
