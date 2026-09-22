-- Adds real AI/indexing metadata without changing existing embeddings or data.
alter table photos add column if not exists face_count integer not null default 0 check (face_count >= 0);
alter table photos add column if not exists perceptual_hash text;
alter table photos add column if not exists processing_status text not null default 'ready' check (processing_status in ('pending','processing','ready','failed'));
create index if not exists photos_event_processing_idx on photos(event_id, processing_status);
create index if not exists photos_event_perceptual_hash_idx on photos(event_id, perceptual_hash) where perceptual_hash is not null;

create table if not exists photo_faces (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references photos(id) on delete cascade,
  face_index integer not null check (face_index >= 0),
  embedding vector(512) not null,
  created_at timestamptz not null default now(),
  unique(photo_id, face_index)
);
create index if not exists photo_faces_photo_id_idx on photo_faces(photo_id);

create table if not exists event_activity (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('match_search','download')),
  created_at timestamptz not null default now()
);
create index if not exists event_activity_event_created_idx on event_activity(event_id, created_at desc);
