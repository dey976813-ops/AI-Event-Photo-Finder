create extension if not exists vector;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date timestamp with time zone not null,
  created_at timestamp with time zone default now()
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references events(id) on delete cascade not null,
  storage_path text not null,
  image_url text,
  embedding vector(512),
  created_at timestamp with time zone default now()
);

create index if not exists photos_event_id_idx on photos(event_id);

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