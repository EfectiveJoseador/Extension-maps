# Map Collaborator - Chrome Extension

Extension to collaborate on Google Maps points of interest.

## Installation

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked**.
4. Select the `Extension-maps` directory (`c:/Users/igorc/Extension-maps`).
5. Open [Google Maps](https://www.google.com/maps).

## Features

- **Pick on Map**: Click "📌 Pick on Map" and then click anywhere to save that precise spot.
- **Visual Markers**: Saved locations appear as red pins directly on the map surface that sync with your movement.
- **Save/Load**: Points are saved automatically to your browser storage.
- **Export/Import**: Use the Export/Import buttons to share `.json` files.
- **Navigation**: Click the "➜" arrow on a saved point to take you there.

## Sync (Optional)

If you want to sync over a local network:
1. Install Node.js.
2. Open a terminal in `Extension-maps/server`.
3. Run `node server.js`.
4. Click "Sync with Local Server" in the extension.

## Limitations

- Markers rely on the URL for positioning. If you drag the map very quickly, markers may lag slightly until movement stops. This is expected due to the "No API" approach.
