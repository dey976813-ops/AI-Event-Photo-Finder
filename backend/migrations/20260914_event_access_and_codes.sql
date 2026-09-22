-- Run in the Supabase SQL editor before deploying the owner/access-code flow.
alter table events add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table events add column if not exists access_code text;
alter table events add column if not exists access_code_hash text;
alter table events alter column date drop not null;
create unique index if not exists events_access_code_unique_idx on events(access_code) where access_code is not null;
create index if not exists events_owner_id_idx on events(owner_id);

-- Access-code grants are intentionally browser-session-only and therefore do
-- not need a database access table.
