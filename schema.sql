create extension if not exists vector;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date timestamp with time zone,
  created_at timestamp with time zone default now(),
  owner_id uuid references auth.users(id) on delete cascade,
  access_code text unique,
  access_code_hash text
);

-- Keep existing projects aligned with the current backend contract.
alter table events add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table events add column if not exists access_code text;
alter table events add column if not exists access_code_hash text;
alter table events alter column date drop not null;
create unique index if not exists events_access_code_unique_idx on events(access_code) where access_code is not null;
create index if not exists events_owner_id_idx on events(owner_id);

-- Shared access is verified per request using the current page's in-memory
-- access code; it is deliberately not persisted as an ownership-like record.

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  storage_path text not null,
  image_url text,
  embedding vector(512),
  created_at timestamp with time zone default now()
);

create index if not exists photos_event_id_idx on photos(event_id);
alter table photos add column if not exists face_count integer not null default 0 check (face_count >= 0);
alter table photos add column if not exists perceptual_hash text;
alter table photos add column if not exists processing_status text not null default 'ready' check (processing_status in ('pending','processing','ready','failed'));
create table if not exists photo_faces (id uuid primary key default gen_random_uuid(), photo_id uuid not null references photos(id) on delete cascade, face_index integer not null check (face_index >= 0), embedding vector(512) not null, created_at timestamptz not null default now(), unique(photo_id, face_index));
create index if not exists photo_faces_photo_id_idx on photo_faces(photo_id);
create table if not exists event_activity (id uuid primary key default gen_random_uuid(), event_id uuid not null references events(id) on delete cascade, user_id uuid references auth.users(id) on delete set null, kind text not null check (kind in ('match_search','download')), created_at timestamptz not null default now());
create index if not exists event_activity_event_created_idx on event_activity(event_id, created_at desc);
create or replace function match_photo_faces(query_embedding vector(512), match_threshold float, match_count int, target_event_id uuid) returns table (id uuid, event_id uuid, storage_path text, image_url text, similarity float) language sql stable as $$ select p.id, p.event_id, p.storage_path, p.image_url, max(1 - (f.embedding <=> query_embedding))::float as similarity from photo_faces f join photos p on p.id=f.photo_id where p.event_id=target_event_id and 1-(f.embedding <=> query_embedding)>match_threshold group by p.id,p.event_id,p.storage_path,p.image_url order by similarity desc limit match_count; $$;

-- Individual love state is private to the signed-in user.  The production
-- migration is also kept in backend/migrations for existing deployments.
create table if not exists photo_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamp with time zone default now(),
  primary key (user_id, photo_id)
);

create index if not exists photo_favorites_user_id_idx on photo_favorites(user_id);

create table if not exists loved_collections (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80), created_at timestamptz not null default now()
);
create table if not exists loved_collection_photos (
  collection_id uuid not null references loved_collections(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (collection_id, photo_id)
);

create or replace function match_photos (
  query_embedding vector(512),
  match_threshold float,
  match_count int,
  target_event_id uuid
)
returns table (
  id uuid,
  event_id uuid,
  storage_path text,
  image_url text,
  similarity float
)
language sql stable
as $$
  select
    photos.id,
    photos.event_id,
    photos.storage_path,
    photos.image_url,
    1 - (photos.embedding <=> query_embedding) as similarity
  from photos
  where photos.event_id = target_event_id
    and photos.embedding is not null
    and 1 - (photos.embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
-- Secure, revocable read-only links for named loved collections.
create table if not exists loved_collection_shares (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references loved_collections(id) on delete cascade,
  share_token text not null unique,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists loved_collection_shares_active_idx on loved_collection_shares(collection_id) where revoked_at is null;
