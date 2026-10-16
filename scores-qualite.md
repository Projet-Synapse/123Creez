# Scores de qualité — 123Créez

| Dimension | Score |
|---|---|
| ♻ Ergonomie | 7/10 |
| 👍 Stabilité | 6/10 |
| 🔰 Sécurité | 6/10 |
| 🗂 Organisation | 6/10 |
| 🚀 Performance | 6/10 |

## Tâches

### 👍 Stabilité
- [ ] Ajouter des tests unitaires sur le découpage du lasso (`selectionService`) (+1)
- [ ] Corriger les erreurs de typing baseline (Href expo-router dans index.tsx) (+1)
- [ ] Gérer les collisions de données lors d'une future sync distante (+1)

### ♻ Ergonomie
- [ ] Indicateur visuel du calque actif dans la barre du haut de l'éditeur (+1)
- [ ] Message d'état quand un outil n'a pas d'effet (ex. lasso sur calque vide) (+1)

### 🔰 Sécurité
- [x] Documenter et sécuriser le stockage des clés Supabase côté client (+1) — clé publishable par design (doc 123Ecriture), URL/clé préconfigurées et surchargeables
- [x] Définir la politique RLS des tables Supabase (owner_id = auth.uid(), policies authenticated) (+1)
- [ ] Migrer la table folders vers un versioning updatedAt (LWW complet sur les dossiers) (+1)

### 🗂 Organisation
- [ ] Purger les dépendances non utilisées du package.json (maps, webrtc, stripe…) (+1)
- [ ] Extraire les styles dupliqués entre LayerPanel et RightPanel (+1)

### 🚀 Performance
- [ ] Limité les re-renders du vault pendant un drag de cartes (+1)
- [ ] Débounce la génération des vignettes lors d'un import en masse (+1)

## Historique
- 2026-10-05 : création, premier bilan (tâche 🟠 — 4 fonctionnalités majeures).
- 2026-10-14 : sync par compte Google (RLS owner + policies authenticated) — sécurité 4→6.
