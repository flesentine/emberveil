# Emberveil public preview

Emberveil is an original browser-based 16-bit fantasy action-adventure built with Phaser 3, TypeScript, and Vite. The public-preview candidate includes offline single-player after the first successful load, durable local saves, optional verified accounts and conflict-safe cloud copies, and an optional dedicated two-player co-op test room.

All placeholder art, music, ambience, effects, characters, creatures, locations, dialogue, symbols, and UI are original Emberveil work.

## Release status

Version **0.27.0** is currently a **release candidate, not publish-ready**. The release implementation and deterministic suites are complete, but the dependency-backed Vite build, semantic typecheck, ESLint, Prettier, and Playwright route must pass in a clean connected Node environment before publication. See `docs/RELEASE_READINESS_REPORT.md`.

## Local development

Requirements:

- Node.js 22.13 or newer
- npm 10 or newer
- A current desktop or mobile browser

```bash
npm install
npm run dev
```

## Production validation

```bash
npm install
npx playwright install chromium
npm run check:release
```

Do not publish when any automated gate fails.

## Save warning

Local saves live in browser storage. Clearing site data, using private browsing, browser cleanup tools, or uninstalling the PWA can remove them. Use **Save Files → Export** for backups. Optional cloud saves never silently replace a newer local or cloud copy.

## Online services

Guest single-player never requires an account. Co-op and account/cloud services deploy separately and report when unavailable. Production pages and account APIs require HTTPS; co-op requires WSS.

## Documentation

- Installation: `docs/INSTALLATION.md`
- Development: `docs/DEVELOPMENT.md`
- Deployment: `docs/DEPLOYMENT.md`
- Architecture: `docs/ARCHITECTURE_SUMMARY.md`
- Controls: `docs/CONTROLS_REFERENCE.md`
- Known issues: `docs/KNOWN_ISSUES.md`
- Release checklist: `docs/RELEASE_CHECKLIST.md`
