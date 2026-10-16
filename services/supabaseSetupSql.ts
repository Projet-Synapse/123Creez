// Powered by OnSpace.AI — SQL de mise en place Supabase pour le vault
// 123Créez (schéma dédié `app_123creez` du projet partagé « Projet Synapse »).
// Exposé ici pour le bouton « Copier le SQL » de Réglages → Synchronisation ;
// le même contenu vit dans `supabase-schema.sql` à la racine du repo.
// Idempotent : peut être réexécuté sans risque.
export const SUPABASE_SETUP_SQL = `-- 123Créez — vault synchronisé par compte Google (schéma app_123creez).
-- Projet partagé « Projet Synapse » : rien ne touche aux tables des autres apps.
-- RLS : chaque compte Google ne voit QUE ses propres lignes
-- (owner_id = auth.uid()), même convention que app_123ecriture.

create schema if not exists app_123creez;

create table if not exists app_123creez.canvases (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text not null,
  folder_id text,
  created_at bigint,
  updated_at bigint not null,
  width integer,
  height integer,
  thumbnail_color text,
  stroke_count integer,
  thumbnail text,
  thumb_at bigint,
  order_index integer,
  data jsonb,
  synced_at timestamptz not null default now()
);

create table if not exists app_123creez.folders (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  name text,
  parent_id text,
  created_at bigint,
  color text,
  order_index integer,
  preview_mode text,
  updated_at timestamptz not null default now()
);

-- Migration v1 -> v2 (colonnes owner_id absentes des toutes premières tables).
alter table app_123creez.canvases add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table app_123creez.folders add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Rattachement des lignes créées avant le compte Google (vault local existant).
update app_123creez.canvases
  set owner_id = (select id from auth.users where email ilike 'catelyn2332@gmail.com' limit 1)
  where owner_id is null;
update app_123creez.folders
  set owner_id = (select id from auth.users where email ilike 'catelyn2332@gmail.com' limit 1)
  where owner_id is null;

create index if not exists canvases_updated_at_idx on app_123creez.canvases (updated_at);
create index if not exists canvases_folder_id_idx on app_123creez.canvases (folder_id);
create index if not exists canvases_owner_id_idx on app_123creez.canvases (owner_id);
create index if not exists folders_owner_id_idx on app_123creez.folders (owner_id);

-- RLS : strictement le propriétaire (compte Google connecté).
alter table app_123creez.canvases enable row level security;
alter table app_123creez.folders enable row level security;

drop policy if exists "anon canvases" on app_123creez.canvases;
drop policy if exists "anon folders" on app_123creez.folders;

drop policy if exists "owner canvases" on app_123creez.canvases;
create policy "owner canvases" on app_123creez.canvases
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owner folders" on app_123creez.folders;
create policy "owner folders" on app_123creez.folders
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
`;
