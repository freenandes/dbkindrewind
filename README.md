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

- Review the error messages
- Replace logos
- Clean up unused assets






| **Displayed text** | **Internal** `AppStatus` | **When it appears**                                                                                                                 |
| ------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **STANDBY**        | `STANDBY`                | Initial state on app load (line 32), and after pressing EJECT / disconnect (line 175)                                               |
| **CONNECTING**     | `CONNECTING`             | While the connect button handler is running, before the Tauri `connect_db` call resolves (line 51)                                  |
| **CONNECTED**      | `CONNECTED`              | After a successful connection (lines 57, 89), after a successful snapshot creation (line 126), after a successful rewind (line 146) |
| **RECORDING...**   | `INDEXING`               | While creating a snapshot, before the Tauri `create_snapshot` call resolves (line 99)                                               |
| **REWINDING...**   | `REWINDING`              | While restoring a snapshot, before the Tauri `zero_return` call resolves (line 136)                                                 |
| **ERROR**          | `ERROR`                  | On any failure: connection error (line 93), snapshot creation error (line 130), rewind error (line 149), or delete error (line 166) |


