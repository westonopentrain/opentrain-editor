create table if not exists docs (
  id text primary key,
  title text,
  job_id text,
  folder_id text,
  position integer,
  tiptap_json jsonb,
  html_snapshot text,
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_docs_jobid on docs(job_id);
create index if not exists idx_docs_folderid on docs(folder_id);
