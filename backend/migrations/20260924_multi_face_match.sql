create or replace function match_photo_faces(query_embedding vector(512), match_threshold float, match_count int, target_event_id uuid)
returns table (id uuid, event_id uuid, storage_path text, image_url text, similarity float)
language sql stable as $$
  select p.id, p.event_id, p.storage_path, p.image_url, max(1 - (f.embedding <=> query_embedding))::float as similarity
  from photo_faces f join photos p on p.id = f.photo_id
  where p.event_id = target_event_id and 1 - (f.embedding <=> query_embedding) > match_threshold
  group by p.id, p.event_id, p.storage_path, p.image_url
  order by similarity desc limit match_count;
$$;
