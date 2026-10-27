-- 123Créez : droits manquants sur le schéma app_123creez (NON APPLIQUÉE).
-- Constat (lecture seule, 26/10/2026) : le rôle `authenticated` n'a ni USAGE
-- sur le schéma ni droits sur canvases/folders → toute synchro échoue
-- (« permission denied ») ; les tables sont vides. Les policies RLS
-- « owner canvases / owner folders » existent déjà et restent le seul filtre.
grant usage on schema app_123creez to authenticated;
grant select, insert, update, delete on app_123creez.canvases to authenticated;
grant select, insert, update, delete on app_123creez.folders to authenticated;
-- Pas de droit pour `anon` : il faut être connecté.
-- À faire aussi dans le tableau de bord : Settings → Data API → Exposed schemas
-- doit contenir app_123creez (sinon PostgREST répond « Invalid schema »).
