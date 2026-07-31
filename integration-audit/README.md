# Emberveil integration-audit package

This directory accompanies `docs/INTEGRATION_AUDIT.md`.

## Included

- `INTEGRATION_FIXES.patch`: focused runtime corrections for the opening sequence, campaign/test-map separation, placeholder scene registration, shrine transition typing, and affected verifiers.
- `verify-integration-audit.mjs`: dependency-free graph and source-reachability verifier used against the complete integrated source.

## Files removed from the integrated source

The audit removed these unused or placeholder-only files:

- `src/components/MovementComponent.ts`
- `src/core/rendering/IntegerMotion.ts`
- `src/data/regions.ts`
- `src/entities/Enemy.ts`
- `src/network/NetworkClient.ts`
- `src/scenes/DungeonScene.ts`
- `src/scenes/InteriorScene.ts`
- `src/utils/math.ts`
- `src/world/MossvaleWorldBuilder.ts`
- `src/world/WorldRegistry.ts`
- `public/maps/mossvale-demo.json`

The full integrated source was audited outside the repository's existing review-pack layout. The report does not claim the dependency-backed production build passed: installed dependencies were unavailable and the npm registry timed out, so typecheck, lint, Vite build, and browser smoke remain release gates.
