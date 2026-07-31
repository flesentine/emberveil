# Emberveil 0.27.0 public-release implementation

This branch contains the reviewable release-preparation records for the integrated Emberveil project.

## Implemented

- Production Vite configuration with ES2022 output, minification, Phaser chunk splitting, hashed JS/CSS names, and production source maps disabled.
- Original source WAV files converted to mono 44.1 kHz, 64 kbps MP3 release audio.
- Existing packed 16 px tile/effect and 32 px sprite atlases retained.
- Loading percentage, current-file status, and load-failure recovery screen.
- Friendly global error screen with reload, cache reset, and diagnostics.
- Version/build-channel display, credits, privacy, controls, gameplay guidance, browser notice, and first-run save warning.
- Landscape PWA manifest and versioned generated service worker.
- Offline single-player after the first successful complete load.
- Clear unavailable states for co-op, accounts, and cloud saves.
- Netlify static-host configuration, Render server blueprints, server Dockerfiles, environment documentation, HTTPS/WSS requirements, CSP, HSTS, and cache headers.
- Post-build release manifest with SHA-256 integrity entries and cache-busting.

## Verification decision

This is a **release candidate, not publish-ready**.

All dependency-free deterministic gameplay, save, networking, account/cloud, mobile, accessibility, performance, QA, and release-asset checks pass. The isolated preparation environment could not install Phaser, Vite, ESLint, Prettier, or the Playwright project dependency, so the final dependency-backed Vite build, semantic type check, lint/format gates, and Chromium smoke play-through remain mandatory.

Two preparation defects found by attempted final commands were fixed:

1. Added the missing `test:release` script alias.
2. Added `@types/node` for the Vite configuration and Node build scripts.

The full integrated release-candidate source package was delivered with this update. Do not deploy or tag it as a public release until the automated gates in `docs/RELEASE_CHECKLIST.md` pass against the exact deployment commit.
