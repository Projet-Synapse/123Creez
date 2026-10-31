-- BROUILLON — NE PAS APPLIQUER sans l'accord de Marianne (étape 3 du moteur
-- de pixels, docs/moteur-pixels.md). Sauvegarder la base avant.
-- Bucket privé pour les tuiles des calques pixel : <user_id>/<canvas_id>/<layer_id>/<tx>_<ty>_<hash>.webp
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creez-tiles', 'creez-tiles', false, 2097152, array['image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "creez_tiles_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'creez-tiles' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "creez_tiles_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'creez-tiles' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "creez_tiles_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'creez-tiles' and (storage.foldername(name))[1] = auth.uid()::text);
-- Pas de policy UPDATE : un objet n'est jamais réécrit (nom = hash du contenu).
