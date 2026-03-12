# db kind rewind

Save states for your local Postgres databases. A native macOS desktop widget built with Tauri v2, React, and Rust.

## Development

### Frontend

The frontend lives in `src/`. Styles use **CSS Modules** (`*.module.css`).

### Mock mode

```zsh
npm run dev
```

Open `http://localhost:1420` in a browser. Tauri runtime isn't present, so a mock layer handles all backend calls. Any connection string will "work" without touching a real database. Published builds always run in the webview. End users never receive mock mode, so, great for iterating on UI. 

### Tauri mode (real backend)

```zsh
npm run tauri dev
```

Runs inside Tauri's webview with the full Rust backend. `invoke()` calls hit real Postgres, so you'll need a running instance (e.g. via [Postgres.app](https://postgresapp.com)).

## Work

### To do

- Resize the listing VFD
- Review the error messages
- Replace logos
- Clean up unused assets
