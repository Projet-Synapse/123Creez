# Proposition (NON appliquée) : photos de calque dans Supabase Storage

État actuel (cette PR) : la photo importée est un dataURL dans `layers[].images[].src`,
donc dans la colonne JSON `data` de `canvases`. Aucune migration nécessaire, synchro identique aux toiles.

Alternative pour plus tard si les toiles deviennent trop lourdes :
- bucket privé `layer-photos`, chemin `<owner_id>/<canvas_id>/<image_id>.png` ;
- `LayerImage.src` = `storage://layer-photos/...` + cache local ;
- policies RLS storage : `owner_id = auth.uid()` en lecture/écriture.

Brouillon SQL (à relire, NE PAS exécuter en prod sans accord) :

```sql
insert into storage.buckets (id, name, public) values ('layer-photos', 'layer-photos', false)
on conflict do nothing;
create policy "layer_photos_owner_rw" on storage.objects for all to authenticated
  using (bucket_id = 'layer-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'layer-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

Pour : lignes `canvases` légères, synchro plus rapide, photos partagées entre copies.
Contre : migration + policies, gestion hors ligne / cache, nettoyage des orphelins,
résolution de conflit à deux sources (JSON + fichier), plus de code.
