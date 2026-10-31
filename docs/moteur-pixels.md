# Moteur de calques en pixels (type IbisPaint X) — conception

Statut : brouillon, étape 1 commencée (cœur de calcul pur, voir `services/rasterTiles.ts`).

## 1. Existant (analyse)

| Sujet | Aujourd'hui |
|---|---|
| Rendu | `react-native-svg` : `CanvasArt.tsx` reconstruit un `<Path>` quadratique par trait, à chaque rendu. `DrawingCanvas.tsx` gère gestes, zoom (shared values Reanimated), trait en cours. |
| Calques | `Layer` (`contexts/CanvasContext.tsx`) : `strokes`, `images`, `shapes`, `texts`, `opacity`, `visible`, `groupId`, et depuis #53 `kind?: 'raster' \| 'vector' \| 'photo'` — mais `raster` (« normal ») est encore vectoriel. |
| JSON de la toile | `CanvasData = { meta, layers }`, stocké en local (AsyncStorage / fichier) et dans `app_123creez.canvases.data` (jsonb), avec `updated_at` bigint ms. Les photos importées sont des dataURL dans le JSON. |
| Synchro | `supabaseService.ts` : toile entière, la plus récente (`updated_at`) gagne, pierres tombales pour les suppressions. Pas de fusion fine. |
| Mode pixellisé | `PixelatedView` : capture du Svg (`view-shot` / sérialisation SVG web) → image Skia agrandie en Nearest. C'est un rendu d'affichage, les données restent vectorielles. |
| Gomme | Traits `tool: 'eraser'` rendus en masque SVG par calque ; #52 limite chaque gomme aux traits antérieurs. |
| Undo/redo | Copie complète de `Layer[]` (copie peu profonde des traits) par action, limite `historyLimit` (250). |
| Export / miniatures | `thumbnailService.ts` re-peint les données vectorielles ; export via la même capture. |
| Skia | `@shopify/react-native-skia` 2.0.0-next.4 est **déjà** une dépendance (PixelatedView, `Surface.MakeOffscreen`). Pas de nouveau module natif à ajouter. |

Conséquence : un dessin pixel ne peut pas vivre dans `strokes` (rejouer des milliers de dabs à chaque rendu est trop lent, et la gomme pixel est destructive par nature). Il faut un vrai tampon de pixels par calque.

## 2. Choix du moteur

**Recommandé : Skia (`@shopify/react-native-skia`) pour le rendu et la composition, avec un cœur de calcul en TypeScript pur pour les tuiles.**

- Android/iOS : Skia natif (déjà embarqué), `Surface.MakeOffscreen` GPU, `Image.MakeImage` depuis des octets RGBA ; composition des calques dans un `<Canvas>` Skia.
- Web/Electron : CanvasKit (WASM) via `LoadSkiaWeb` — à valider (poids ~3 Mo) ; repli possible sur `OffscreenCanvas`/`<canvas>` 2D, même interface.
- Le cœur (`rasterTiles.ts`) calcule les pixels touchés (dabs, gomme, pipette, patches d'undo) sans dépendance : testable sous Node, identique partout. À l'étape 2, le tamponnage passera sur un `SkSurface` par tuile (dessin de cercles GPU) si le JS est trop lent sur mobile ; l'interface ne change pas.

Alternatives écartées : `expo-gl` brut (beaucoup de code shader, pas de web identique), `react-native-canvas` (WebView, lent), tout-SVG (impossible pour du pixel).

## 3. Stockage des pixels

Tuiles de **256 × 256 px**, RGBA 8 bits non prémultiplié, créées à la demande (zone vide = 0 octet).

| Option | Pour | Contre |
|---|---|---|
| Image entière par calque | simple | une retouche réécrit tout (2048² ≈ 16 Mo brut, 1–4 Mo PNG) ; synchro lourde |
| **Tuiles** (recommandé) | on ne réécrit/synchronise que les tuiles modifiées ; vide gratuit ; mémoire maîtrisée | plus de fichiers, gestion des clés |
| Pixels dans le JSON (base64) | aucune infra | jsonb de plusieurs Mo, chaque sauvegarde renvoie tout, lent à parser, limite de taille des requêtes |
| **Supabase Storage** (recommandé) | binaire, CDN, upload par tuile, pas de gonflement de la table | nécessite un bucket + policies (SQL préparé : `supabase/brouillons/moteur-pixels-storage.sql`) |

Format : **WebP sans perte** (repli PNG) encodé par Skia (`image.encodeToBase64(ImageFormat.WEBP, 100)`). Une tuile typique de dessin : 5–40 Ko.

Le JSON du calque garde seulement un manifeste :
```json
{ "kind": "raster", "raster": { "w": 2048, "h": 2048, "tile": 256,
  "tiles": { "0,0": "a1b2c3…", "3,1": "…" } } }
```
(la valeur = hash SHA-1 du contenu). Le nom d'objet Storage contient le hash → objets immuables, pas d'écrasement, dédoublonnage gratuit, et les anciennes versions restent récupérables (sécurité).

En local : un fichier par tuile (expo-file-system / IndexedDB sur web), même nommage.

Ordres de grandeur : toile 2048×2048 = 64 tuiles max par calque, 16 Mo RAM brute si pleine ; 10 calques pleins = 160 Mo → garde-fou : décharger les tuiles des calques masqués/inactifs (on garde l'image composée), limite de calques pixel affichée.

## 4. Synchro et conflits

- La règle actuelle reste : la toile la plus récente (`updated_at`) gagne, au niveau du manifeste.
- Ordre d'envoi : 1) upload des nouvelles tuiles (hash) ; 2) upsert de la ligne `canvases` avec le manifeste. Si l'étape 1 échoue, la ligne n'est pas envoyée → jamais de manifeste pointant vers une tuile absente.
- Réception : télécharger les tuiles dont le hash manque en local ; tant qu'elles manquent, afficher la vignette.
- Conflit (deux appareils modifient le même calque) : la plus récente gagne (cohérent avec l'existant). Amélioration possible plus tard : fusion par tuile (tuiles disjointes = fusion sans perte). Les tuiles perdantes restent dans Storage → récupérables.
- Ménage des tuiles orphelines : jamais automatique au début ; plus tard, uniquement avec accord (règle « pas de suppression cloud sans accord »).

## 5. Outils

- **Pinceau pixel** : dabs ronds espacés de 25 % du diamètre, dureté, opacité, mélange source-over (fait, étape 1). Ensuite : pression/vitesse, lissage (stabilisateur existant appliqué aux points avant tamponnage), opacité par trait (accumuler dans un calque temporaire puis fusionner, comme IbisPaint, pour éviter les sur-densités).
- **Crayon** : dab crénelé (`aliased`, fait).
- **Gomme** : destination-out sur les pixels (faite) — corrige naturellement le problème « je gomme puis je redessine ».
- **Pipette** : lecture du pixel du calque (faite) ou du composé (étape 2).
- **Seau** : remplissage par diffusion sur le composé/calque, tolérance (étape 4).
- Lasso / déplacer / transformer sur calque pixel : découpe de pixels + transformation Skia (étape 5).

## 6. Undo, zoom/rotation, mode pixellisé

- **Undo** : par calque pixel, on stocke uniquement les tuiles touchées *avant* le trait (`captureTiles` / `applyPatch`, fait). L'historique actuel (copie de `Layer[]`) garde une référence à l'entrée de patch. Budget mémoire (ex. 64 Mo) en plus de `historyLimit`.
- **Zoom/rotation** : coordonnées écran → toile via `services/canvasInput.ts` (inchangé) ; les calques pixel sont dessinés dans le même repère que le Svg, en Nearest au-delà de 100 % (pixels nets) et linéaire en dessous.
- **Mode pixellisé** : pour les calques pixel il devient « natif » (pas de capture) ; la capture actuelle reste pour les calques vectoriels.

## 7. Fusion normal + vectoriel, export

- Pile mixte : chaque calque est rendu par son moteur (Skia Image pour pixel, Svg/Skia Path pour vectoriel), dans l'ordre, avec opacité.
- **Fusionner vers le bas** : un calque vectoriel fusionné dans un pixel est *rastérisé* (rendu Skia offscreen à la taille de la toile puis découpé en tuiles). Pixel → vectoriel : interdit (ou on crée un calque pixel résultat).
- **Rastériser un calque** : action explicite, réversible par undo.
- Export PNG/JPG : composition Skia offscreen à la taille de la toile (unifie miniatures et export ; plus besoin de view-shot pour ça). Export PSD : hors périmètre.

## 8. Migration des toiles existantes

- Aucune donnée existante n'est convertie. `kind` absent ou `raster` sans champ `raster` = calque vectoriel historique, rendu comme avant.
- Seuls les **nouveaux** calques « normal » créés après la mise à jour reçoivent `raster`. Le champ est optionnel dans le JSON : aucune migration SQL de table.
- Anciennes versions de l'appli (v1.0.21) : elles ignorent `raster` et verraient un calque vide ; et si elles sauvegardent, elles peuvent supprimer le manifeste. → l'appli marque `meta.minVersion` et l'ancienne version… ne le connaît pas. Mesure : publier une version « lectrice » qui préserve les champs inconnus avant d'activer la création de calques pixel, et demander de mettre à jour tous les appareils.

## 9. Étapes livrables

1. **Cœur pixel local** (en cours) : tuiles, pinceau, crayon, gomme, pipette, undo par patch, tests Node. Puis rendu Skia d'un calque pixel *derrière le type « normal », derrière un réglage expérimental*, sauvegarde locale seulement. Testable : dessiner/gommer/undo sur un calque normal, sur téléphone et PC.
2. **Rendu et performance** : composition Skia mixte pixel + vectoriel, zoom/rotation, Nearest, mode pixellisé natif, tamponnage GPU si besoin, miniatures/export par composition.
3. **Stockage et synchro** : encodage WebP par tuile, fichiers locaux, bucket Storage (SQL prêt, à appliquer avec accord + sauvegarde), envoi/réception par hash.
4. **Outils** : pression, lissage, opacité par trait, seau, pipette sur composé, pinceaux supplémentaires.
5. **Édition** : lasso/déplacer/transformer sur pixels, fusionner vers le bas, rastériser, dupliquer.
6. **Finition** : garde-fous mémoire, version « lectrice » compatible, nettoyage, retrait du drapeau expérimental.

## 10. Risques

- Performance du tamponnage JS sur téléphones modestes → tuiles + GPU Skia à l'étape 2.
- Mémoire (16 Mo par calque plein en 2048²) → déchargement, limite de calques.
- Skia web (CanvasKit) dans Electron : poids et chargement à valider ; repli canvas 2D.
- Version de Skia « next » : API susceptible de bouger ; épingler.
- Compatibilité avec v1.0.21 qui écraserait les manifestes → version lectrice d'abord.
- Coût Storage Supabase (quota du plan) et tuiles orphelines.
- Synchro à mi-chemin (tuiles envoyées, manifeste non) → ordre d'envoi strict, objets immuables.
