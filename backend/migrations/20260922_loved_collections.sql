-- Run this migration in Supabase SQL Editor before testing named Loved Memories.
create table if not exists loved_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists loved_collections_user_id_idx on loved_collections(user_id);

create table if not exists loved_collection_photos (
  collection_id uuid not null references loved_collections(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (collection_id, photo_id)
);
create index if not exists loved_collection_photos_photo_id_idx on loved_collection_photos(photo_id);
