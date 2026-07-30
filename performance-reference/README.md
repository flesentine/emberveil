# Performance implementation reference

The complete integrated source is available in the companion build artifact. This branch keeps the measurement records, profiler core, overlay, pooling primitives, and correctness tests directly reviewable.

## Integrated files changed

- `package.json`
- `src/performance/ObjectPool.ts`
- `src/performance/SceneEffectPool.ts`
- `src/performance/PerformanceMonitor.ts`
- `src/performance/PerformanceOverlay.ts`
- `src/enemies/EnemyNavigation.ts`
- `src/world/maps/WorldEntityStreamer.ts`
- `src/world/maps/WorldMapRuntime.ts`
- `src/combat/CombatFeedback.ts`
- `src/puzzles/PuzzleFeedback.ts`
- `src/equipment/ToolProjectile.ts`
- `src/audio/AudioManager.ts`
- `src/network/CoopNetworkClient.ts`
- `src/platform/PerformanceProfile.ts`
- `src/platform/MobileSettingsService.ts`
- `src/scenes/WorldScene.ts`
- `src/scenes/CoopTestScene.ts`
- `src/scenes/CoopLobbyScene.ts`
- `src/scenes/ControlTestScene.ts`
- `tools/profile-performance.mjs`
- `tools/profile-performance-baseline.mjs`
- `tools/profile-performance-optimized.mjs`
- `tools/test-performance-optimizations.mjs`
- `tools/verify-performance.mjs`

## Source pack integrity

- Performance source pack SHA-256: `28db4fcd23970c3c46cdd4bb5acb75906b0bbdecebbd726408ad97007f4fb61d`
- Complete optimized project SHA-256: `f71d00a19e75f4fa91a2ee863bddc824c942171cf9100f2848768f54d303bd79`

## Correctness checks

The optimized binary-heap A* is tested against breadth-first search for shortest-path equivalence. Chunk activation is compared against a full-distance scan across 120 player positions. Existing save, networking, cloud-save, mobile-layout, accessibility, world, combat, puzzle, boss, cutscene, and audio verifiers remain green.
