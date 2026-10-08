# zadani-detsky-pokoj

Single-file brief for an interior designer (Czech), hosted on GitHub Pages.

`index.html` is the only published file: the full page with all photos inlined.

## Build

Sources (`src/`, `../build/img/`) are kept outside the repo.

```sh
node build.mjs                  # unencrypted (current)
PASSWORD='...' node build.mjs   # optional: wrap in a password prompt (AES-256-GCM, PBKDF2-SHA256)
```

The script inlines the photos, renders the floor plan SVG and writes `index.html`.
