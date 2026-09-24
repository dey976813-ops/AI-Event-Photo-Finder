-- Optional owner-defined event branding. A cover points to a photo already
-- stored for this event, so no separate media-storage path or bucket is needed.
alter table events add column if not exists description text;
alter table events add column if not exists cover_photo_id uuid references photos(id) on delete set null;
