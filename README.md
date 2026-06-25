# Aqua Launcher

Aqua Launcher is a lightweight Minecraft launcher built with Electron. It gives you a polished launcher interface for selecting modpacks, managing versions, and starting the game with the right loader configuration.

## What it includes

- Custom modpack support with per-pack asset folders
- Modrinth version resolution for compatible mod downloads
- Persistent RAM and settings handling
- Desktop-style window chrome and drag support
- Built-in launch status and notification toggles

## Project structure

- `main.js` - Electron main process, window setup, IPC handlers
- `renderer.js` - UI behavior and event handling
- `launcher.html` - Launcher layout and client-side template
- `preload.js` - Secure renderer API surface
- `services/` - Modpack, launcher and server list services
- `assets/` - Icons and background image assets
- `build.bat` - Windows packaging helper

## Setup

1. Install dependencies:
   ```bat
   npm install
   ```

2. Run the launcher:
   ```bat
   npm start
   ```

## Build

To package the app for Windows, use:

```bat
npm run build
```

Or run the helper directly:

```bat
build.bat
```

## Notes

- The app icon lives in `assets/icon.ico`.
- The launcher UI uses `assets/icon.svg` for the sidebar icon and `assets/photo.png` for the background.
- Installed modpacks are kept under `.minecraft/aqua-modpacks/`, and active mod packs are synced into the standard `.minecraft/mods/` folder.

## Troubleshooting

- If you change asset paths, confirm the `assets/` references in `launcher.html` and `main.js`.
- If packaging fails, ensure `electron-packager` is installed in `node_modules`.

## License

MIT
