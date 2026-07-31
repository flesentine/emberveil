# Public release checklist

Release target: **Emberveil 0.27.0 public preview**

## Required automated gates

- [ ] Clean dependency installation succeeds
- [ ] TypeScript semantic type check passes
- [ ] ESLint passes with zero warnings
- [ ] Prettier formatting check passes
- [x] All deterministic subsystem tests pass
- [x] Save migration and corruption-recovery tests pass
- [x] Network validation and server-authority tests pass
- [x] Release-asset verifier passes
- [ ] Production Vite build succeeds
- [ ] Output contains minified hashed JS/CSS bundles
- [ ] Output contains compressed MP3 audio and no source WAV files
- [ ] Service worker and release integrity manifest are generated from the production output
- [ ] Playwright title/world/movement/pause/offline smoke test passes
- [ ] Playwright friendly-error recovery test passes

## Automated Chromium route

- [ ] Title scene reaches a stable ready state
- [ ] Displayed release version matches package version
- [ ] A world map loads without uncaught errors
- [ ] Rowan moves with keyboard input
- [ ] Pause opens and closes
- [ ] Online co-op clearly reports unavailable while offline
- [ ] Browser refresh returns to a valid game state
- [ ] Service worker controls the page after installation
- [ ] Offline reload reaches the title scene
- [ ] Friendly error screen offers reload, cache clear, and diagnostics

## Manual desktop

- [ ] Chrome keyboard play-through — **Not tested**
- [ ] Firefox keyboard play-through — **Not tested**
- [ ] Edge keyboard play-through — **Not tested**
- [ ] Safari keyboard play-through — **Not tested**
- [ ] Xbox-style controller — **Not tested**
- [ ] PlayStation-style controller — **Not tested**
- [ ] Window resizing and fullscreen changes — **Not tested**
- [ ] Tab switching and audio resume — **Not tested**

## Manual mobile/tablet

- [ ] iPhone landscape touch controls — **Not tested**
- [ ] Android phone landscape touch controls — **Not tested**
- [ ] iPad landscape and PWA install — **Not tested**
- [ ] Android tablet and PWA install — **Not tested**
- [ ] Portrait warning and orientation change — **Not tested**
- [ ] Browser bars and safe areas — **Not tested**
- [ ] 30 FPS fallback on a slower device — **Not tested**

## Manual persistence and gameplay

- [ ] New game, manual save, reload, and Continue
- [ ] Export and import a save
- [ ] Load an older schema save
- [ ] Boss defeat, autosave, reload
- [ ] Door entry repeated rapidly
- [ ] Death during a transition
- [ ] Save near a permanent moving object
- [ ] Dialogue interruption and recovery
- [ ] Puzzle reset and reload

## Deployed online staging

- [ ] HTTPS static site and security headers verified
- [ ] WSS co-op create/join/reconnect under latency
- [ ] Simultaneous multiplayer pickup remains unique
- [ ] Server disconnect reports clearly and recovers gracefully
- [ ] Account registration and email verification
- [ ] Password reset
- [ ] Cloud conflict choice on two browser profiles
- [ ] Personal-data export and account deletion

## Publication

- [x] Version and build-channel framework added
- [x] Credits, privacy, controls, gameplay, and known-issues documentation prepared
- [ ] Confirm production debug/test flags are disabled in the built output
- [ ] Confirm production service URLs use HTTPS/WSS
- [ ] Confirm no secrets appear in client bundles or repository files
- [ ] Download and inspect the deployment artifact
- [ ] Tag the exact tested commit
- [ ] Publish release notes with known limitations

A build is a **release candidate** until every automated gate passes. It should only be described as device-certified after the relevant manual rows are completed on real hardware.
