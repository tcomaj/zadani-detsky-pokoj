# zadani-detsky-pokoj

Password-protected, single-file brief for an interior designer (Czech), hosted on GitHub Pages.

`index.html` is the only published file. It contains a password prompt and an AES-256-GCM
encrypted payload (PBKDF2-SHA256, 600k iterations) holding the full page with all photos inlined.
Nothing readable is stored in this repository.

## Build

Sources (`src/`, `../build/img/`) are kept outside the repo on purpose.

```sh
PASSWORD='...' node build.mjs
```

The script inlines the photos, renders the floor plan SVG, encrypts the page, verifies a
decrypt round-trip and writes `index.html`.
