# Emberveil Online Co-op Networking Architecture

Status: design approved for a **small two-player test room**. The protocol and room model are intentionally capable of growing to four players, but the first implementation caps rooms at two.

## 1. Goals and non-goals

### Goals

- Preserve the existing single-player game path and saves without requiring a network connection.
- Offer private, invite-only rooms without accounts.
- Use a dedicated Node.js room server rather than peer hosting or host migration.
- Make the server authoritative for gameplay state that can grant progress, deal damage, or change the shared world.
- Support late joining, short disconnects, and reconnecting to the same player identity.
- Keep moment-to-moment movement responsive through local prediction and server reconciliation.
- Interpolate remote players and server-owned entities, never the local player.
- Validate every message, cap packet size, and enforce per-message rate limits.

### First implementation boundary

The first playable slice is a separate `Co-op Test Room` scene. It contains:

- Two players in one compact arena.
- One shared switch and one server-owned door.
- One server-owned sentinel enemy/boss.
- Server-owned melee attacks and one projectile attack.
- Independent normal-item pickups and currency balances.
- One shared major reward guarded by an idempotent reward transaction.
- Downed/revival flow.
- Pings and emotes.
- A synchronized opening cutscene.
- Invite-code creation, joining, late joining, disconnect grace, and reconnect.

The existing campaign maps, inventories, quests, saves, combat, and cutscenes remain single-player in this milestone. The architecture below defines how those systems are synchronized when co-op expands beyond the test room.

## 2. Deployment model

```text
Browser client A ─┐
                  ├── WSS ── Dedicated Node.js room server
Browser client B ─┘             ├── room registry
                                ├── fixed-step simulation
                                ├── validation/rate limiting
                                └── authoritative snapshots
```

- The browser never becomes the authority or room host.
- Room survival does not depend on one player's browser.
- No host migration is required.
- Production uses TLS termination and `wss://`.
- Private rooms use short invite codes plus an unguessable reconnect token per player.
- No account, email address, or platform identity is required.

## 3. Trust boundary

The client may report only **intent**:

- movement direction and input sequence
- attack button / aim direction
- interact / revive intent
- ping location
- emote selection
- cutscene ready/acknowledgement

The client may not report:

- damage dealt
- enemy death
- item acquisition
- currency totals or deltas
- reward completion
- boss health
- door or switch state
- projectile hits
- quest completion

The server calculates or validates all of those outcomes.

## 4. Server simulation

- Fixed simulation tick: 20 Hz for the test room.
- Snapshot broadcast: 10 Hz, with immediate reliable event messages for important state changes.
- Movement input accepted at up to 30 messages/second per player.
- The server clamps direction magnitude, movement speed, acceleration, world bounds, and collision.
- Attacks use server timestamps, cooldowns, hit volumes, range checks, and line-of-sight checks.
- Projectiles are spawned, advanced, collided, and removed by the server.
- Rewards use unique transaction IDs stored in the room ledger.
- Shared state changes increment a monotonically increasing room revision.

## 5. Client movement model

### Local player

1. Sample local input.
2. Assign a monotonically increasing input sequence.
3. Apply the same deterministic movement approximation immediately for prediction.
4. Send compact input intent to the server.
5. On snapshot, set the authoritative baseline and replay unacknowledged inputs.
6. Correct small errors smoothly; snap only when the error is unsafe or very large.

The local player is **not interpolated** between server snapshots.

### Remote players and server entities

- Keep a short snapshot buffer, initially 100 ms.
- Render between two confirmed server states.
- Extrapolate only for a brief bounded period when a snapshot is late.
- Snap when an entity teleports, changes rooms, revives, or exceeds the interpolation error threshold.

## 6. Room lifecycle

1. Client requests `create-room` or `join-room`.
2. Server validates protocol version and display name.
3. Server returns room code, player ID, reconnect token, authoritative state, and server time.
4. Room starts immediately; late joiners receive a full snapshot and active cutscene state.
5. A disconnected player remains reserved for 30 seconds.
6. Reconnect requires the room code, player ID, and reconnect token.
7. If grace expires, the player entity is removed and the room continues.
8. Empty rooms are destroyed after a short idle timeout.

## 7. Protocol envelope

Every client packet uses this envelope:

```json
{
  "v": 1,
  "type": "input",
  "id": "optional-client-message-id",
  "payload": {}
}
```

Validation rules:

- Maximum packet size: 8 KiB.
- JSON objects only; arrays or primitives at the root are rejected.
- Exact protocol version required.
- Message type must be allow-listed.
- Payload keys, types, lengths, ranges, and enum values are validated.
- Unknown fields are ignored only where explicitly documented; otherwise the packet is rejected.
- Malformed-packet strikes close the connection after a small threshold.
- Rate-limit violations are dropped and can also accumulate strikes.

## 8. Message classes and rate limits

| Client message | Maximum | Server behavior |
|---|---:|---|
| `hello` | 2/10 s | Establish protocol and requested operation. |
| `input` | 30/s | Store latest movement input and sequence. |
| `attack` | 8/s | Validate cooldown, aim, state, and resources. |
| `interact` | 10/s | Validate range and current interactable state. |
| `revive` | 15/s | Validate distance, downed target, and hold state. |
| `ping` | 2/s | Validate world bounds and broadcast marker. |
| `emote` | 3/5 s | Validate emote allow-list and broadcast. |
| `cutscene-ready` | 4/10 s | Record readiness/acknowledgement. |
| `pong` | 2/s | Update round-trip and clock-offset estimate. |

## 9. Synchronization matrix

Legend:

- **A**: authoritative server state
- **P**: client-predicted, reconciled to server
- **I**: remote interpolation
- **E**: reliable event plus snapshot confirmation
- **C**: cosmetic client-side only

| System/state | Authority | Transport/update | Join/reconnect behavior | Validation / anti-duplication |
|---|---|---|---|---|
| Local movement | Server, client predicted | `input` + snapshot ack (**P**) | Full player state + last ack | Clamp vector, speed, bounds, collision, sequence monotonicity |
| Remote movement | Server | Snapshot buffer (**I**) | Included in full snapshot | No client position packets |
| Facing/animation intent | Server-derived from input | Snapshot (**I**) | Included | Enum/range checked |
| Health/downed state | Server (**A**) | Snapshot + damage/downed events | Included | Clients never report damage |
| Revival | Server (**A**) | Hold intent + progress snapshot | Active progress included | Distance, line of sight, target state, uninterrupted hold |
| Normal inventory | Server per-player (**A**) | Pickup/reward events + snapshot | Included only for owning player | Pickup existence, range, capacity, transaction ID |
| Equipment/loadout | Server per-player for gameplay; client cosmetics | Reliable change request/event | Included | Ownership and equip-slot rules |
| Currency | Server per-player (**A**) | Reliable delta event + snapshot | Included only for owner | Server-generated deltas, transaction ledger |
| Major quest progress | Server room state (**A**) | Reliable event + room revision | Included | Idempotent objective/reward IDs |
| Dungeon switches | Server room state (**A**) | Reliable event + snapshot | Included | Range, prerequisites, one-way/state machine checks |
| Doors/shortcuts | Server room state (**A**) | Reliable event + snapshot | Included | Derived from shared switch/quest state |
| Puzzles | Server room state (**A**) | Input intent + reliable component event | Included | Component-specific legal-transition validation |
| Moved permanent objects | Server room state (**A**) | Snapshot + settle event | Included | Collision, speed, authority ownership, valid destination |
| Enemies | Server (**A**) | Snapshots (**I**) + reliable spawn/defeat | Included | Server AI and health only |
| Bosses | Server (**A**) | Snapshot + phase/defeat events | Included, including current phase | Server phase machine, attacks, health, reward ledger |
| Player melee attacks | Server (**A**) | Attack intent; hit event | No historical replay; current cooldown included | Cooldown, range, facing, stamina, hit-once set |
| Projectiles | Server (**A**) | Spawn/remove events + snapshots (**I**) | Active projectiles included | Server spawn, velocity, collision, lifetime, ownership |
| Pickups | Server (**A**) | Spawn/collect events + snapshot | Remaining pickups included | Existence, range, eligibility, once-only transaction |
| Shared rewards | Server (**A**) | Reliable reward event | Ledger and completion state included | Unique reward transaction ID; atomic room update |
| Chests | Server shared or per-player by definition | Open event + snapshot | Included | Range, key/condition, chest policy, transaction ID |
| Cutscenes | Server timeline authority | Start/step/finish events + server timestamp | Active sequence and step included | Sequence allow-list, barrier policy, no client flag grants |
| Dialogue flags | Server room or per-player by definition | Reliable choice/result event | Included | Dialogue graph and prerequisite validation |
| Map/region changes | Server room coordinator | Transition event + ready barrier | Current region/spawn included | Destination allow-list and shared-region rule |
| Pings | Server relay | Expiring event | Not persisted | Rate, map bounds, player alive/connected |
| Emotes | Server relay | Expiring event | Not persisted | Allow-list and rate limit |
| Screen shake, particles, hit sparks | Client (**C**) | Derived from authoritative events | Not persisted | No gameplay effect |
| Connection quality | Each client from server ping | Ping/pong rolling statistics | Reinitialized | Server controls ping cadence |
| Co-op room persistence | Server memory for test room | Room snapshots | Reconnect grace only | Room revision and reconnect token |
| Campaign save data | Existing single-player client save | Not used by test room | Unchanged | Online mode cannot write campaign progression |

## 10. Cutscene synchronization policy

Cutscenes are classified:

- `blocking-shared`: all active players are locked; server advances on timeline or required acknowledgements.
- `nonblocking-shared`: server announces the event; players retain control.
- `personal`: local presentation only, with no shared state mutation.

Late joiners receive the active sequence ID, server start time, current step, and skip policy. Shared flags and rewards are applied by the server, never by a client skipping a presentation.

## 11. Security and abuse resistance

- Dedicated server owns simulation and progression state.
- No eval, dynamic imports from packets, or client-provided object paths.
- Packet length checked before JSON parsing.
- Schema validation for every message.
- Per-IP connection throttling and per-socket token buckets.
- Invite codes use cryptographically secure random bytes and exclude ambiguous characters.
- Reconnect tokens are high-entropy and are never used as room codes.
- Display names are normalized, length-limited, and stripped of control characters.
- Server logs avoid reconnect tokens and full packet bodies.
- Invalid numeric values, including `NaN`, infinities, and extreme coordinates, are rejected.

## 12. Failure handling

- Network loss never corrupts or overwrites single-player saves.
- Client enters a reconnect overlay while retaining its last rendered room state.
- After grace expiration, the player returns to the co-op lobby with a clear reason.
- Server errors are mapped to safe public codes; stack traces stay server-side.
- Unknown snapshots or room revisions trigger a full-state resync request.
- A room can continue with one connected player during the test, but the room remains capped at two.

## 13. Test-room acceptance criteria

- Create and join by private invite code with no account.
- Two browser clients share one room and see each other.
- Local movement is responsive and reconciled; remote movement is interpolated.
- Switch and door state synchronize.
- Sentinel enemy and projectile state synchronize.
- Damage, pickups, currency, and major reward are granted only by the server.
- The major reward cannot be duplicated by repeated packets or reconnecting.
- One player can be downed and revived by the other.
- Pings, emotes, opening cutscene, late join, reconnect, and quality indicator work.
- Malformed and excessive packets are rejected without crashing the room.
- Single-player title options and save files continue to work without starting the server.
