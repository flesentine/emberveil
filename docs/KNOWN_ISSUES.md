# Emberveil Known Issues

## Open critical issues

None discovered by the automated QA pass.

## Open high-priority issues

None discovered after fixing QA-001 and QA-002.

## Medium-priority verification gaps

### QA-M01 — Real-device controller coverage is incomplete

Browser controller mappings vary by device, OS, Bluetooth mode, and browser. Automated input normalization passes, but Xbox, PlayStation, Switch-style, and generic Bluetooth controllers still require the manual matrix.

### QA-M02 — iOS Safari/PWA suspension requires hardware testing

The focus-pause, audio resume, Visual Viewport, and save recovery paths are implemented, but long background suspension and OS memory eviction cannot be reproduced reliably in this environment.

### QA-M03 — Co-op internet conditions need deployment testing

Protocol validation and deterministic room-server tests pass. Real reverse proxies, TLS termination, mobile carrier NAT, and geographic latency still need a deployed staging test.

### QA-M04 — Full semantic build is environment-dependent

The current execution environment cannot install `@eslint/js` from its internal package registry. Deterministic Node tests and TypeScript syntax transpilation can run here, but the final Vite build, semantic typecheck, ESLint, and formatting checks must run in GitHub Actions or a normal npm environment.

## Low-priority limitations

- The collision developer view uses a translucent collision layer plus interaction/hitbox outlines; it is intended for debugging rather than presentation.
- Game-speed changes are debug-only and can make audio pitch/cadence feel unnatural at extreme values.
- The developer console is intentionally disabled in normal production launches unless `?dev=1` is supplied.
- Manual checklist results are not claimed as complete until performed on the listed physical devices and browsers.
