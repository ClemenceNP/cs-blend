# Tests du quiz

Tests automatiques à relancer après chaque modification de `index.html`, avant de publier.
Ils tournent dans un navigateur headless (Playwright + Chromium) et **n'envoient rien** :
aucune commande Shopify, aucune ligne dans le Google Sheet.

## `node tests/quiz.test.js` — le quiz fonctionne toujours

| Partie | Ce qui est vérifié |
|---|---|
| A | Les 2 592 combinaisons de réponses, dans les 4 langues, donnent un blend qui totalise 100 % |
| B | 72 parcours au clic jusqu'au panier : le formulaire envoyé à `/cart/add` contient `id`, `quantity`, `properties[Nome miscela]`, `properties[Composizione]`, et `properties[Regalo]` seulement si l'option cadeau est cochée |
| C | Chaque envoi au registre (Google Sheet) a exactement la forme acceptée par l'Apps Script |
| D | La page ne contacte aucun site externe (polices, statistiques…) |

Si C échoue, l'Apps Script refuserait les nouveaux blends : il faut le mettre à jour en même temps
(il n'est pas dans ce dépôt, Clémence le colle dans Google Apps Script).

## `node tests/screenshots.js --compare main` — avant / après

Fait des captures des 4 écrans (accueil, question, nom, résultat) dans les 4 langues, format téléphone :

- `tests/screenshots/avant/` : la version publiée (branche `main`)
- `tests/screenshots/apres/` : les fichiers modifiés

et indique, écran par écran, la part de pixels qui a changé. Sans `--compare`, seules les captures
« après » sont faites. Les captures ne sont pas enregistrées dans le dépôt.
