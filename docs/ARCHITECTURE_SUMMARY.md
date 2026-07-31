# Architecture summary

## Client

Emberveil is a Phaser 3 + TypeScript + Vite browser game with a fixed 320×180 internal surface and integer pixel scaling. Scenes cover boot/preload, title, world/interiors/dungeons, UI, settings, saves, accounts, co-op lobby/test room, focus pause, and diagnostic laboratories hidden from public builds.

Core systems are data-driven:

- world maps, transitions, streamed entities, chunks, and traversal gates
- player movement, combat, equipment, health, statuses, inventory, loot, shops, quests, dialogue, puzzles, dungeons, bosses, and cutscenes
- four-bus audio mixer with crossfading, battle layers, ambience, positional processing, terrain footsteps, and pooled effects
- versioned four-slot local save service with checksums, backups, migrations, import/export, and idempotent transactions
- independent accessibility, input, audio, mobile, and performance profiles

## Release shell

The release layer supplies compatibility checks, a global friendly error screen, version/build metadata, online-service health reporting, release diagnostics, loading progress, and PWA update handling. The build finalizer creates compressed deploy output, version/integrity manifests, and a versioned service worker.

## Online services

The optional co-op server is a dedicated Node.js WebSocket room service. Important state is authoritative: movement bounds, attacks, damage, enemies, bosses, projectiles, pickups, currency, rewards, doors, switches, puzzles, cutscenes, revival, and reconnect state.

The optional account/cloud service is a separate Fastify service using Better Auth, HTTP-only sessions, email verification/reset, CSRF protections, rate limiting, validation, database migrations, optimistic cloud-save concurrency, backups, export, and deletion.

Guest single-player and local saves have no dependency on either server.

## Deployment boundary

The game client is static and can be served from a reputable HTTPS host/CDN. Co-op and account/cloud services deploy separately with persistent configuration, TLS termination, exact origin allowlists, and no client-side secrets.
