# azure-certification-sandbox

Bac à sable pour la préparation des certifications Microsoft Azure.

**En ligne :** <https://knoel99.github.io/azure-certification-sandbox/>

L'accueil reprend la grille du poster Credentials (juillet 2026). Seul AZ-900 est jouable, en français et en anglais.

## Déploiement

Le site est publié automatiquement sur GitHub Pages à chaque push sur `master` (workflow `.github/workflows/deploy.yml`). Le dossier `web/` est servi tel quel : toutes les références sont relatives, aucun build n'est nécessaire. Les vérifications de données doivent passer avant la publication.

## Concurrence

Le site est entièrement statique et sans état serveur : chaque visiteur ne consomme que des fichiers servis par le CDN GitHub Pages. Tout l'état est côté client :

- une tentative d'examen vit dans le `sessionStorage` de son onglet — deux onglets, même sur un ordinateur partagé, mènent deux examens indépendants ;
- la langue et le thème sont des préférences du profil de navigateur (`localStorage`), sans lien avec une tentative.

Des visiteurs simultanés — sur le même examen ou sur des examens différents — ne partagent donc rien et ne peuvent pas se gêner. Seule limite connue : deux personnes qui partagent le même profil de navigateur voient la même préférence de langue/thème. Les garanties d'isolement sont verrouillées par `e2e/concurrency.spec.js` (deux onglets d'un même navigateur, deux visiteurs distincts en français et en anglais).

## Développement local

```bash
cd web
npm install
npm test          # vérifications des données et du catalogue
python3 -m http.server 8765
```

Ouvrez http://127.0.0.1:8765/

Les tests de bout en bout (Playwright, Chromium requis) : `npm run test:e2e`.
