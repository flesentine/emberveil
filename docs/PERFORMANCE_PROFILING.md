# Emberveil Performance Profiling and Optimization

Date: 2026-07-30  
Target: stable 60 FPS on normal desktop hardware and modern phones, with the existing safe 30 FPS fallback for constrained devices.

## Method

The optimization pass used two complementary measurement paths:

1. **Deterministic Node benchmarks** for CPU-heavy algorithms and allocation patterns that can be reproduced in CI without a browser.
2. **An optional in-engine F3 overlay** for real browser measurements, including frame time, update CPU time, GPU timer-query results when supported, JavaScript heap, display objects, estimated draw batches and texture switches, active physics bodies, entity sleep state, pathfinding frequency, particles, audio voices, map/save load time, network bytes, and suspected garbage-collection pauses.

Browsers do not expose a reliable cross-platform “GPU utilization percentage.” Emberveil therefore records GPU frame time with `EXT_disjoint_timer_query` when available and otherwise reports draw/texture proxies. The overlay labels estimated values with `~` instead of presenting them as exact driver counters.

Raw measurements:

- `docs/performance/baseline-2026-07-30.json`
- `docs/performance/after-2026-07-30.json`

## Measured baseline

The deterministic suite profiled 24 generated maps, 630 world objects, 3 runtime texture atlases, and 68 generated audio files.

| Workload | Before | After | Change |
|---|---:|---:|---:|
| 400 A* path requests | 54.432 ms | 13.385 ms | **75.4% faster** |
| 3,000 streamed entities over 900 frames | 6.196 ms | 1.728 ms | **72.1% faster** |
| 12,000 collision queries across 1,400 objects | 42.315 ms | 26.629 ms | **37.1% faster** |
| Co-op snapshot at 10 Hz | 11,830 B/s | 11,830 B/s | unchanged; already small |
| Runtime atlas count | 3 | 3 | unchanged; atlas strategy was already correct |
| Audio library | 68 files | 68 files | unchanged; audio was already pooled |

The synthetic process heap reading fell from roughly 10.3 MB to 9.4 MB during the optimized benchmark. This is indicative only; browser heap and garbage-collection behavior must be checked with the overlay because process heap measurements vary between runs.

## Findings and decisions

### Optimized because measurements justified it

- **A* open-list sorting:** the old implementation sorted the entire open list for every node expansion.
- **Full entity scan every frame:** all streamed records were distance-tested even when the player remained within the same small section of a map.
- **Collision candidate allocation:** hot collision queries constructed temporary arrays and scanned sleeping entities.
- **Per-entity colliders:** NPCs, enemies, and breakables created many separate collider relationships.
- **Short-lived visual objects:** combat dust, puzzle sparks, and tool projectiles repeatedly created and destroyed Phaser display objects.
- **Audio pool selection:** selecting a voice allocated and sorted a temporary copy when all voices were busy.

### Measured but intentionally left alone

- **Map JSON parsing:** Phaser loads and caches map JSON once. The real map-construction time is now measured, but no duplicate parser cache was added.
- **Save loading:** validation, checksums, migration, and backup recovery remain correctness-first. The real duration is now recorded rather than caching mutable save objects.
- **Network state size:** the two-player test snapshot is about 1.2 KB and roughly 11.8 KB/s at 10 Hz, so protocol compression or delta encoding would add complexity without a measured need.
- **Texture atlas count:** the game already uses compact shared atlases. The pass moved pooled combat sparks onto the existing effects atlas instead of creating another texture.

## Implemented optimizations

### Object pooling

- Added a bounded generic `ObjectPool`.
- Added `SceneEffectPool` for rectangles, circles, and atlas images.
- Combat dust, combat sparks, puzzle rings, puzzle sparks, and tool-projectile display objects now return to scene-owned pools.
- Pools kill active tweens before reuse and destroy retained objects on scene shutdown.

### Entity sleep and map chunks

- World stream records are indexed into 192-pixel spatial chunks.
- Only nearby chunks are considered during activation refreshes.
- Activation refresh is limited to every 120 ms; active entity AI still updates each game frame.
- Sleeping objects are invisible, inactive, and have disabled physics bodies.
- Moving NPCs and enemies are re-indexed when crossing chunk boundaries.
- The overlay shows active versus sleeping entity counts.

### Pathfinding

- Replaced repeated full-array sorting with a binary min-heap.
- Added a per-scene pathfinding budget of two path rebuilds per frame, or one in low-performance mode.
- Requests that exceed the budget are deferred by 50 ms instead of creating a frame spike.
- Initial path refresh times are staggered across enemies.
- Paths rebuild only when needed or when the target changes tile.
- Temporary movement vectors and collision rectangles are reused.
- Per-search tile blockage results are cached.

### Physics and collision

- NPCs, grounded enemies, and breakables use shared Arcade Physics groups.
- Player/object and enemy/world collision relationships use group colliders rather than one collider per entity.
- Solid queries avoid spread arrays and ignore sleeping stream records.
- Enemy lookup and stream-record lookup now use maps instead of repeated array scans.

### Particles and effects

- Added explicit particle quality: Auto, High, Medium, and Low.
- Puzzle bursts and combat dust respect the selected particle scale.
- Low-performance mode still automatically reduces effects when Particle Quality is Auto.

### Audio

- Existing per-effect voice pools remain the primary architecture.
- Busy-voice selection now uses one linear pass instead of allocating and sorting an array.
- The performance overlay reports active loop/effect instances and total pooled voices.

### Texture atlases

- The existing three-atlas runtime design was retained.
- Pooled hit sparks use `emberveil-effects-16.png`, reducing avoidable texture changes.
- The overlay estimates texture switches by render-list order for practical scene comparisons.

### Scene cleanup

- Performance listeners detach on scene shutdown.
- Scene effect pools destroy retained objects during shutdown.
- World entity groups, chunk indexes, cached lookup maps, and performance counters are cleared during map teardown.
- Tool projectiles return display objects to the scene pool instead of leaving destroyed-object churn.

## Performance overlay

Press **F3** in the main world or co-op test room. It can also be enabled persistently in Mobile settings or with `?perf=1`.

The overlay reports:

- FPS and rolling frame time
- Scene update CPU time
- GPU frame time when timer queries are supported
- JavaScript heap when `performance.memory` is available
- Visible display-object count
- Estimated draw calls and texture switches
- Active physics bodies
- Active and sleeping entities
- Path requests, deferrals, and pathfinding CPU time per second
- Active particle objects
- Active audio instances
- Suspected GC pauses based on frame gaps plus heap drops
- Map and save loading time
- Co-op inbound and outbound bytes per second

The overlay is disabled by default and has a 250 ms text refresh interval to avoid becoming its own performance problem.

## Correctness safeguards

- Entity activation still uses each object’s original activation radius.
- Active AI and movement continue to use elapsed milliseconds; the 30 FPS renderer fallback does not change game speed.
- Pathfinding still uses four-direction movement, collision checks, swimming restrictions, the existing 240-node search cap, and the existing 14-waypoint cap.
- Deferred paths continue steering toward the previous waypoint or direct target until a budget slot is available.
- Sleeping entities preserve position and persistent state.
- Pooled effects are presentation-only and never own damage, rewards, puzzle state, or authoritative network state.

## Browser validation procedure

For a release candidate, capture at least 60 seconds in each scenario with F3 enabled, then repeat with the overlay hidden:

1. Mossvale with maximum visible NPCs.
2. Woodland combat with six or more enemies.
3. Quarry room with pathfinding enemies, water, puzzles, and projectiles.
4. Gravemaw battle at the highest particle intensity.
5. Two-player co-op with artificial 150 ms latency.
6. A modern phone in landscape at 60 FPS mode.
7. The same phone in Auto mode to verify 30 FPS fallback and unchanged movement timing.

Acceptance target:

- Normal desktop and modern phones: 60 FPS median, frame time near or below 16.7 ms, no sustained update spikes above 8 ms.
- Constrained mode: stable 30 FPS with simulation speed unchanged.
- No increasing active-body, particle, audio-instance, or heap trend after repeated map transitions.
