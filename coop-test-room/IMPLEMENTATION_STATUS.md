# Two-player co-op test-room status

This standalone vertical slice intentionally leaves the existing Emberveil single-player campaign untouched.

Implemented and covered by automated tests:

- private invite-code room creation and joining without accounts
- two-player late joining, disconnect grace, and reconnect tokens
- authoritative movement bounds, shared switch and door state
- server-validated melee and projectile attacks
- server-owned enemy health, damage, projectiles, and defeat state
- independent normal-item and currency pickup state
- idempotent shared major reward and shared quest completion
- player downing and revival
- synchronized opening cutscene
- ping markers, emotes, and connection-quality measurements
- packet schemas, packet-size limits, malformed-packet strikes, and per-message rate limits

The architecture document on `main` defines the synchronization policy for expansion to campaign regions and eventual two-to-four-player rooms.
