# Release readiness report

Release candidate: **Emberveil 0.27.0**  
Prepared: **2026-07-30**

## Current decision

**Not yet approved for public publication.** The release implementation is complete, and all dependency-free deterministic suites pass, but the final dependency-backed build/tooling gates could not run in the isolated preparation environment. The project must not be described as ready until those gates pass.

## Implemented release features

- Production Vite configuration with ES2022 output, minification, split Phaser chunk, hashed JS/CSS filenames, and disabled production source maps.
- Original WAV source audio converted to mono 44.1 kHz 64 kbps MP3 release files.
- Packed tile, effect, and sprite atlases.
- Loading percentage, current-file display, and load-failure recovery UI.
- Friendly global error screen with reload, cache reset, and diagnostic-copy controls.
- Version and build-channel display.
- In-game credits, privacy summary, controls, gameplay guidance, compatibility notice, and first-run save warning.
- Landscape PWA manifest and generated versioned service worker.
- Offline single-player after one complete successful load.
- Explicit offline/unavailable states for co-op, accounts, and cloud saves.
- Static and server deployment configurations, environment documentation, HTTPS/WSS rules, CSP, HSTS, and cache headers.
- Release manifest and per-file SHA-256 inventory generated after build.

## Passing gates

- Release architecture and asset verifier.
- Thirteen-suite QA regression pack.
- Durable-save migrations, backup recovery, corruption handling, and anti-duplication tests.
- Network protocol validation and authoritative-room tests.
- Map, combat, inventory, quest, dungeon, puzzle, boss, cutscene, audio, mobile, accessibility, account/cloud, and performance deterministic verifiers.
- Release audio check: 14,571,414 source WAV bytes reduced to 2,682,002 MP3 bytes.

## Attempted gates that remain incomplete

| Gate | Result here | Required action |
|---|---|---|
| `npm run build` | Blocked at semantic typecheck because Phaser, Vite, and Node type packages are not installed | Run after a clean dependency installation |
| `npm run typecheck` | Same missing-package blocker; Phaser member errors cascade from the unresolved base module | Re-run with installed dependencies |
| `npm run lint` | ESLint executable unavailable | Install dependencies and require zero warnings |
| `npm run format:check` | Prettier executable unavailable | Install dependencies and run |
| Playwright smoke route | Project Playwright package and compiled Vite output unavailable | Build, install Chromium, and run `npm run test:release` |

The missing `test:release` alias discovered during this pass was fixed. `@types/node` was also added so the Vite configuration receives proper Node globals in a clean install.

## Publication rule

Publish only after every automated gate in `docs/RELEASE_CHECKLIST.md` passes against the exact commit being deployed. Physical-device rows must remain marked **Not tested** until actually exercised.
