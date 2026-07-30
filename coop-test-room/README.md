# Two-player co-op test room

Emberveil's first online milestone is an optional, isolated two-player room. The existing campaign remains fully playable offline and does not open a WebSocket or alter campaign saves unless the player chooses **Online Co-op** from the title screen.

The broader authority model and synchronization matrix are documented in [`../docs/NETWORKING_ARCHITECTURE.md`](../docs/NETWORKING_ARCHITECTURE.md).

## What this test includes

- Private room creation and six-character invite codes.
- Two players with no account requirement.
- Late joining and a 30-second reconnect reservation.
- Predicted and reconciled local movement.
- Buffered interpolation for the remote player, sentinel, and projectiles.
- A server-authoritative shared switch and door.
- Independent normal-item and currency pickups.
- A server-authoritative Veil Sentinel with phases, contact damage, and projectiles.
- Server-validated melee and bolt attacks.
- Downed players and hold-to-revive support.
- One idempotent shared Signal Shard reward.
- Shared opening-cutscene timing and a connected-player skip barrier.
- Ping markers, emotes, and a rolling connection-quality display.

This milestone deliberately does **not** network the campaign overworld or write online rewards into a campaign save. It proves the room protocol and authority boundary before those systems are expanded.

## Run locally

From this directory:

```bash
npm install
npm start
```

Open `http://localhost:8081` in two browser windows. Create a private room in one window, then join with the six-character invite code in the other. The same Node process serves the test client and WebSocket endpoint.

## Test-room controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move with local prediction and server reconciliation. |
| J | Request a server-validated melee attack. |
| K | Request a server-owned bolt projectile. |
| E | Interact with the nearest switch, pickup, or reward. |
| Hold R | Revive a nearby downed player. |
| P | Place a short-lived ping marker. |
| 1–4 | Send wave, cheer, help, or thanks emotes. |

The standalone browser client is intentionally small and uses Canvas directly. It demonstrates the networking model without coupling the first server milestone to campaign rendering or save code.

## Dedicated-server configuration

The server reads these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `COOP_PORT` | `8081` | HTTP/WebSocket port. |
| `COOP_HOST` | `0.0.0.0` | Bind address. |
| `COOP_ALLOWED_ORIGINS` | empty | Comma-separated browser origins. Empty permits all origins for local development. |
| `COOP_MAX_CONNECTIONS_PER_IP` | `8` | Coarse connection-abuse limit. |
| `COOP_TRUST_PROXY` | `false` | Trust `X-Forwarded-For` only behind a reverse proxy that overwrites it. |

Production should terminate TLS in front of the Node process and expose `wss://`. Restrict `COOP_ALLOWED_ORIGINS` to the deployed game origins. Do not set `COOP_TRUST_PROXY=true` when clients can reach the Node process directly.

## Protocol safety

- Client packets are limited to 8 KiB and JSON object envelopes.
- Every envelope and payload is allow-listed and range-checked.
- Unknown or extra gameplay fields are rejected.
- Message-specific rate limits prevent input or effect flooding.
- Repeated malformed packets close only the offending connection.
- The client independently validates all welcome, snapshot, event, ping, and error packets before applying them.
- Clients submit attack and interaction intent only. Damage, pickups, currency, enemy health, quest completion, and reward grants are calculated by the server.
- Attack IDs and reward transaction IDs prevent replayed packets from granting duplicate outcomes.

## State ownership

The dedicated server owns:

- player position baselines, health, downed state, and revival progress
- normal inventories and currency for each room player
- shared quest, switch, door, reward, and cutscene state
- enemy AI, boss health and phases
- projectile spawn, movement, collisions, damage, and removal

The client owns presentation-only effects such as slash arcs, hit tint, particles, ping visuals, emote labels, and optional screen shake. Accessibility settings still govern those cosmetics.

## Automated checks

```bash
npm test
```

The tests cover all client message schemas, malformed and oversized packets, room creation and capacity, authoritative movement, attacks, projectiles, pickups, currency, shared rewards, late joining, cutscene barriers, revival, rate limiting, reconnect, and reconnect expiry.

When dependencies are installed, the live WebSocket smoke test is available through:

```bash
node tests/websocket.test.mjs
```
