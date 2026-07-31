# Development

## Commands

```bash
npm install
npm run dev
npm run check
npm run build
npm run preview
```

Release-specific commands:

```bash
npm run refresh:release-audio
npm run verify:release
npm run build:test
npm run verify:dist
npm run test:release
npm run check:release
```

## Generated content

- `npm run generate:assets` creates original placeholder atlases.
- `npm run generate:audio:source` creates original WAV source audio.
- `npm run compress:audio` creates release MP3 audio.
- `npm run generate:maps` creates map JSON.
- `tools/finalize-release.mjs` removes development-only release files, writes version/integrity metadata, and generates the versioned service worker.

Do not hand-edit generated runtime files unless the generator is updated too.

## Modes

- Normal development: `npm run dev`
- Test build: `VITE_TEST_MODE=true`
- Explicit developer tools: `VITE_DEBUG_MODE=true` or `?dev=1`
- Performance overlay: F3 or `?perf=1`
- Developer console: F10 in a development-enabled build

Production builds must not expose debug laboratories or developer commands by default.

## Quality rules

Gameplay uses elapsed milliseconds and fixed-step physics; movement and AI must not depend on render FPS. Save writes must remain blocked during partial transitions. Network clients report intent only; authoritative damage, rewards, currency, and pickups stay server-side.
