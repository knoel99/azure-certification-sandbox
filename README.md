# azure-certification-sandbox

Bac à sable pour la préparation des certifications Microsoft Azure.

**En ligne :** <https://knoel99.github.io/azure-certification-sandbox/>

L'accueil reprend la grille du poster Credentials (juillet 2026). Seul AZ-900 est jouable, en français et en anglais.

## Déploiement

Le site est publié automatiquement sur GitHub Pages à chaque push sur `master` (workflow `.github/workflows/deploy.yml`). Le dossier `web/` est servi tel quel : toutes les références sont relatives, aucun build n'est nécessaire. Les vérifications de données doivent passer avant la publication.

## Développement local

```bash
cd web
npm install
npm test          # vérifications des données et du catalogue
python3 -m http.server 8765
```

Ouvrez http://127.0.0.1:8765/

Les tests de bout en bout (Playwright, Chromium requis) : `npm run test:e2e`.
