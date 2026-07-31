# Installation

## Player installation

Emberveil runs in a current browser. Open the HTTPS deployment, allow the first load to finish, and optionally use the browser's **Install app** action. Landscape orientation is recommended.

Offline single-player becomes available only after the complete release loads successfully once and its service worker installs. Co-op, accounts, email verification, password reset, and cloud saving remain online-only.

## Source installation

Requirements:

- Node.js 22.13+
- npm 10+
- FFmpeg available on `PATH` for release-audio compression

```bash
npm install
npm run dev
```

For browser release testing:

```bash
npx playwright install chromium
npm run check:release
```

## Save-data warning

Local saves are browser-site data. Clearing storage, private-mode cleanup, uninstalling the PWA, or browser/device reset can delete them. Export important saves from the Save Files screen. Cloud saving is optional and conflict-aware; it never silently overwrites a newer copy.

## Browser baseline

Use a current stable version of Chrome, Edge, Firefox, or Safari with JavaScript, Canvas/WebGL, Web Audio, IndexedDB/local storage, and service workers enabled. WebGL is preferred; Phaser may fall back to Canvas with reduced effects or performance.
