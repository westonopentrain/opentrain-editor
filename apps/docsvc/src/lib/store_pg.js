import { query } from './db.js';

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title ?? null,
    jobId: row.job_id ?? null,
    folderId: row.folder_id ?? null,
    position: row.position ?? null,
    tiptapJson: row.tiptap_json ?? null,
    htmlSnapshot: row.html_snapshot ?? null,
    version: Number(row.version ?? 0),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function getDoc(id) {
  const { rows } = await query('select * from docs where id = $1', [id]);
  return mapRow(rows[0]);
}

export async function upsertDoc(id, payload) {
  const fields = ['title', 'jobId', 'folderId', 'position', 'tiptapJson', 'htmlSnapshot'];

  const values = fields.map((key) => (Object.prototype.hasOwnProperty.call(payload, key) ? payload[key] : null));
  const flags = fields.map((key) => Object.prototype.hasOwnProperty.call(payload, key));

  const params = [id, ...values, ...flags];

  const { rows } = await query(
    `insert into docs (id, title, job_id, folder_id, position, tiptap_json, html_snapshot, version, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, 1, now(), now())
     on conflict (id) do update set
       title = case when $8 then excluded.title else docs.title end,
       job_id = case when $9 then excluded.job_id else docs.job_id end,
       folder_id = case when $10 then excluded.folder_id else docs.folder_id end,
       position = case when $11 then excluded.position else docs.position end,
       tiptap_json = case when $12 then excluded.tiptap_json else docs.tiptap_json end,
       html_snapshot = case when $13 then excluded.html_snapshot else docs.html_snapshot end,
       version = docs.version + 1,
       updated_at = now()
     returning *`,
    params
  );
  return mapRow(rows[0]);
}

export async function listDocsByJob(jobId) {
  const { rows } = await query(
    `select * from docs
     where job_id = $1
     order by position asc nulls last, created_at asc`,
    [jobId]
  );
  return rows.map(mapRow);
}

export async function deleteDocCascade(id) {
  const childResult = await query('delete from docs where folder_id = $1 returning id', [id]);
  const childIds = childResult.rows?.map((row) => row.id) ?? [];
  const mainResult = await query('delete from docs where id = $1 returning id', [id]);
  const mainIds = mainResult.rows?.map((row) => row.id) ?? [];
  const ordered = [...mainIds, ...childIds];
  const deletedIds = Array.from(new Set(ordered));
  return { deletedIds };
}
