-- Run once in Supabase SQL editor.  Favorites are intentionally per-user,
-- never a global reaction on a photo.
create table if not exists photo_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_id uuid not null references photos(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, photo_id)
);

create index if not exists photo_favorites_user_id_idx on photo_favorites(user_id);
