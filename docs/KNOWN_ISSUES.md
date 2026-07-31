# Emberveil Known Issues

## Open critical and high-priority gameplay issues

None remain open after fixing QA-001 and QA-002 in the automated QA pass.

## Release-blocking verification gap

### REL-B01 — Dependency-backed release gates are incomplete

The isolated preparation environment could not install the project dependency tree. The deterministic Node-based gameplay, save, networking, account/cloud, accessibility, mobile, performance, QA, and release-asset suites pass, but the following release gates still require a clean connected Node environment:

- Vite production build
- Phaser-aware semantic TypeScript check
- ESLint with zero warnings
- Prettier formatting check
- Playwright Chromium smoke and offline route

The project must remain labeled **release candidate — not publish-ready** until these pass against the exact deployment commit.

## Medium-priority verification gaps

### QA-M01 — Real-device controller coverage is incomplete

Browser controller mappings vary by device, OS, Bluetooth mode, and browser. Automated input normalization passes, but Xbox, PlayStation, Switch-style, and generic Bluetooth controllers still require the manual matrix.

### QA-M02 — iOS Safari/PWA suspension requires hardware testing

Focus pausing, audio resume, Visual Viewport handling, safe-area support, and save recovery are implemented. Long background suspension, OS memory eviction, and device-specific browser-bar behavior still require testing on physical iPhones and iPads.

### QA-M03 — Co-op internet conditions need deployment testing

Protocol validation and deterministic room-server tests pass. Reverse proxies, TLS termination, mobile carrier NAT, and geographic latency still require a deployed staging test.

## Public-preview limitations

- Co-op is a small two-player test room rather than a full cooperative campaign.
- Online accounts, email, cloud saving, and co-op require separately deployed HTTPS/WSS services.
- Offline single-player works only after one complete successful online load and service-worker installation.
- Clearing browser storage, private browsing cleanup, or uninstalling the PWA can remove local saves; exported files or optional cloud copies are the durable backup paths.
- Manual browser and physical-device checklist results are not claimed complete until actually performed.
