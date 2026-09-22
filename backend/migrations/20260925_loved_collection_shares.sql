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