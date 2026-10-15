# Build Your Blend — Caffè Suiso

Quiz autonome (`index.html`, 4 langues) publié sur https://blend.caffesuiso.ch par GitHub Pages
(branche `main`, racine). **Tout ce qui arrive sur `main` est en ligne 1 à 2 minutes plus tard.**

## Travailler avec Clémence

- Clémence n'est pas développeuse : avant chaque action, l'expliquer en une phrase simple, en français.
- Demander son accord avant toute action irréversible ou publique, et avant chaque push sur `main`.
- Pour un changement de design : travailler sur une branche, lancer `node tests/screenshots.js --compare main`,
  lui montrer les captures avant/après (proposer 2–3 variantes si elle hésite), puis `node tests/quiz.test.js`.
  Publier sur `main` seulement après son accord et des tests au vert. Voir `tests/README.md`.

## Ce qu'il ne faut pas casser

- **Panier Shopify** : `orderBlend()` poste vers `https://www.caffesuiso.ch/cart/add` les champs `id`, `quantity`,
  `properties[Nome miscela]`, `properties[Composizione]`, `properties[Regalo]` (si cadeau), `return_to`.
  Les identifiants de variantes `VARIANTS` correspondent au produit « Miscela Personalizzata ».
- **Algorithme** : `calcBlend()` lit les valeurs `v` des options (`espresso`, `light`, `choc`…), pas les textes.
  On peut changer les textes et les icônes affichés, pas les `v`.
- **Registre Google Sheet** (`REGISTRY_URL`, envoi dans `logBlend()`) : un Apps Script, hors de ce dépôt,
  refuse tout envoi qui n'a pas exactement la forme actuelle (11 champs, poids 250g/500g/1kg, mouture
  grani/moka/filtro/espresso, référence de 4 caractères, nom ≤ 40 caractères, pourcentages entiers au total 100,
  composition au format de `compositionString()` avec les noms `ORIGIN_IT`). Si cette forme change,
  l'Apps Script doit être mis à jour en même temps : Clémence le colle dans Apps Script et redéploie
  le déploiement existant en « Nouvelle version » (jamais « Nouveau déploiement », qui change l'URL).
- **Aucune ressource externe** : polices dans `fonts/` (pas de Google Fonts), images dans le dépôt.
- **Aperçus de partage** : les balises Open Graph utilisent des URL absolues `https://blend.caffesuiso.ch/…`
  (`og-image.png`, 1200×630). Le fichier `CNAME` doit rester.
- Ne jamais mettre dans ce dépôt public : le code de l'Apps Script, des exports, des données clients.

## Autres dépôts

`ClemenceNP/caffe-suiso` : outils internes de Clémence ; son `blend/index.html` redirige les anciens liens
vers https://blend.caffesuiso.ch/. Le logo `CS_Logo.png` s'y trouve.
