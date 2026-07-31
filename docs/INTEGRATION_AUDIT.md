# Emberveil Integration Audit

**Audit target:** Emberveil 0.27.0 public-release candidate  
**Audit date:** 2026-07-30  
**Scope:** Reachability and runtime integration only. No new gameplay features were added.

## Classification scale

1. **Fully integrated and playable**
2. **Integrated but incomplete**
3. **Present only in a test scene**
4. **Implemented but unused**
5. **Missing or broken**

## Executive result

The production campaign is a connected 16-map graph beginning in Mossvale Village. Every production map is reachable through a valid transition and every transition resolves to an existing destination spawn. Six laboratory maps remain intentionally development-only and are no longer exposed through Mossvale campaign portals.

The audit found two major accidental disconnects and one structural documentation/code problem:

- New Game wrote a valid save and entered the world, but the opening cutscene was guarded by a launch mode used only by direct debug starts.
- Mossvale exposed six development laboratories and a direct dungeon test route to ordinary campaign players.
- Placeholder `DungeonScene` and `InteriorScene` classes were registered even though real caves, interiors, and dungeons already run through `WorldScene` and `WorldMapRuntime`.

All three are corrected. Stale unused implementation files and the unregistered `mossvale-demo.json` map were removed. A new dependency-free integration verifier now checks campaign reachability, test-map isolation, title routes, system construction, transition targets, multiplayer isolation, release infrastructure, documentation claims, and unused TypeScript files.

## System classification

| System | Class | Runtime evidence and limits |
|---|---:|---|
| Title screen | 1 | Boots through Preload and exposes New Game, Continue, Save Files, Online Co-op, Account/Cloud, Settings, help, privacy, credits, and system notice. Development labs appear only under `DEBUG_MODE` or `?dev=1`. |
| New Game | 1 | Creates a manual save and autosave, selects the autosave, enters Mossvale, and now correctly launches the opening cutscene when its completion flag is absent. |
| Continue | 1 | Loads the newest valid primary or backup save and resumes the stored map/spawn. Invalid or corrupt slots are surfaced instead of silently ignored. |
| Save slots | 1 | Three manual slots and one autosave are reachable from title and pause flows, with backups, validation, import/export, conflict protections, and confirmations. |
| Player movement | 1 | `Player`, `PlayerStateMachine`, unified input, delta-based motion, fixed-step physics, traversal abilities, and collision are instantiated by `WorldScene`. |
| Collision | 1 | Tile collision, grouped Arcade Physics collision, interaction line-of-sight, hazards, movable objects, enemy bodies, and transition safety are used in campaign maps. |
| Combat | 1 | Campaign enemies, breakables, hazards, bosses, equipment attacks, damage/status logic, and feedback all route through `CombatSystem`. The Combat Lab is supplementary, not the sole integration point. |
| Enemies | 1 | Enemy archetypes are placed throughout production regions and streamed by `WorldEntityStreamer`; the Enemy Lab is development-only coverage. |
| NPC dialogue | 1 | Eight Mossvale NPCs use production dialogue trees, flags, quest signals, shops, choices, and persistence. |
| Quests | 1 | Five opening quests are started and advanced by production NPC dialogue, item collection, exploration, switches, enemies, and world flags. Rewards are transaction-protected. |
| Inventory | 1 | Accessible from gameplay and pause, displays items, equipment, quests, map, settings access, and persistent values. |
| Equipment | 2 | Weapon, defense, tool selection, ammunition, upgrades, HUD, combat use, and production equipment targets are connected. However, the preview grants all ten equipment items from the start, and only a subset has campaign acquisition or bespoke production targets. |
| Items and tools | 2 | Consumables, currency, loot, pickups, bow, bombs, lantern, tide, hammer, lens, shield, and blade have production uses. Grappling Line and Gale Feather item-specific target demonstrations remain development-lab focused; regional traversal uses separate persistent abilities. |
| Shops | 1 | Pella's Mossvale shop is reachable in normal play and uses atomic buy/sell logic, inventory limits, currency validation, and persistence. |
| Map transitions | 1 | Sixteen production maps form one reachable graph. All target maps and spawns validate. Development maps are isolated from campaign transitions. Shrine transitions are now represented by the typed transition model. |
| Interiors | 1 | Warden House and indoor maps run through the shared map runtime. The unused placeholder `InteriorScene` was removed. |
| Caves | 1 | Quarry Intake Cave and Ashwatch Cave are reachable production maps with terrain, transitions, enemies, and persistence. |
| Dungeons | 1 | Signal Vault and Sunken Quarry use `DungeonRuntime`, room cameras, doors, water, dungeon items, puzzles, reward flow, and return routes. The unused placeholder `DungeonScene` was removed. |
| Puzzles | 1 | Production puzzles use `PuzzleRuntime` with persistent state, resets, movable recovery, tool prerequisites, and feedback. Puzzle Lab is supplementary development coverage. |
| Bosses | 1 | Gravemaw is reached in the production Sunken Quarry, synchronizes doors/phases/projectiles/reward state, persists defeat, and supports reload recovery. |
| Checkpoints | 1 | Production save stones update checkpoint map/position and autosave only after safe state commits. |
| Death and recovery | 1 | Damage, death animation, Game Over, safe checkpoint recovery, currency-loss setting, drowning/falling recovery, and transition guards are connected. |
| Audio | 1 | Global mixer, map zones, footsteps, combat layers, pooled effects, positional processing, pause/focus behavior, settings, and compressed release files are connected. Audio Lab is only a debug browser. |
| Settings | 1 | Title, pause, and inventory routes open the same independently persisted settings profile with category resets. |
| Accessibility | 1 | Text, visual, assistance, navigation, controls, subtitles, reduced flashing, reduced motion, reduced shake, damage/healing assists, and indicators affect live gameplay code. |
| Keyboard controls | 1 | Unified actions, remapping, buffering, hold/toggle behavior, dialogue/menu navigation, and gameplay actions are connected. |
| Controller controls | 2 | Phaser gamepad input, remapping, prompts, menus, and gameplay actions are connected. The remaining gap is physical-device/browser matrix validation. |
| Touch controls | 2 | Joystick, large actions, custom layouts, opacity/size, safe areas, and touch input are connected. The remaining gap is physical-device validation across browsers. |
| Mobile layout | 2 | Integer scaling, safe areas, Visual Viewport, focus pause, orientation handling, performance fallback, and overlap tests are connected. iOS/Android hardware and PWA suspension tests remain outstanding. |
| World-map progression | 1 | Discovery is driven by visited map state, primary routes and optional mini-dungeons reveal progressively, and towers/shortcuts affect presentation. Interiors and hidden local spaces are intentionally omitted from the regional map. |
| Cutscenes | 1 | Opening, first tower failure, first dungeon reward, and Mossvale evacuation are triggered by production progression, recover after interruption, and clean up safely. Two extra sequences remain lab-only. |
| Fast travel | 1 | Seven production towers restore persistently, destinations use real map/spawn pairs, and travel is blocked during unsafe combat/script/transition states. |
| Multiplayer isolation from single-player | 1 | Campaign `WorldScene` does not import or instantiate co-op networking. Online Co-op starts a separate room/lobby flow and cannot write campaign progression. |
| Optional multiplayer gameplay | 3 | The implemented network gameplay remains a dedicated two-player test room, not the single-player campaign. Documentation now states this directly. |
| Production build | 2 | Production Vite, minification, cache busting, compressed audio, service worker, manifest, headers, and host configuration are present. Final dependency-backed typecheck, lint, build, and browser smoke status is recorded in the verification section below. |

## Corrections made during this audit

### INT-001 — Opening sequence disconnected from normal New Game

**Severity:** Major  
**Status:** Fixed

`SaveSlotScene` correctly starts a saved campaign using `mode: 'continue'`, but `WorldScene` required `mode === 'new'` before playing the opening. That launch mode is used by direct debug starts, not ordinary New Game. The mode guard was removed; the cutscene now depends on the actual conditions that matter: Mossvale start and an absent completion flag.

### INT-002 — Development laboratories exposed in Mossvale

**Severity:** Major  
**Status:** Fixed

Ordinary Mossvale contained portals to Interaction Yard, Combat Arena, Equipment Hall, Enemy Hall, Recovery Hall, Puzzle Lab, and a debug dungeon route. These transitions and their campaign-facing sign were removed. The labs remain available only from the development title menu and retain valid return spawns.

### INT-003 — Placeholder scenes registered as if they were gameplay

**Severity:** Minor/structural  
**Status:** Fixed

`DungeonScene` and `InteriorScene` displayed placeholder text and were never reached by game flow. Real interiors and dungeons use the shared map runtime. The placeholder files, scene keys, registrations, and false architecture claim were removed.

### INT-004 — Untyped shrine transition

**Severity:** Minor  
**Status:** Fixed

Rootbound Shrine used an existing `shrine` transition object that the parser accepted by cast but the `TransitionKind` type omitted. The existing transition kind is now explicitly typed and receives the correct interaction prompt.

### INT-005 — Legacy unused implementation files

**Severity:** Minor/maintenance  
**Status:** Fixed

Removed unused procedural-world, legacy enemy alias, null network, simple movement/math, region registry, and integer-motion prototypes. Static import reachability now reports no unused implementation files; ambient declaration files are excluded appropriately.

### INT-006 — False laboratory-route documentation

**Severity:** Minor/documentation  
**Status:** Fixed

Combat, equipment, enemies, health, puzzle, interaction, dungeon, and quarry documents no longer direct public players to removed Mossvale test portals. They identify direct laboratory launches as development-only.

## Critical blockers

The audit found no remaining runtime-critical campaign blocker after the corrections above.

**Release blocker:** the dependency-backed semantic typecheck, ESLint run, production Vite build, and browser smoke test could not complete in this isolated environment because project dependencies were unavailable and the npm registry could not be reached. The deterministic suite passed, but this exact source must not be called production-ready until those gates run successfully in a connected environment.

## Major problems still open

None affecting the existing single-player progression path.

The equipment progression model remains incomplete rather than broken: all ten equipment items are part of the preview starting loadout, while only a subset has production acquisition moments and unique campaign targets. Correcting that would require progression/content design and is outside this integration-only pass.

## Minor problems and verification gaps

- Controller behavior is automated and code-connected but not validated on the full Xbox/PlayStation/Switch/generic hardware matrix.
- Touch and mobile layouts pass deterministic resolution tests but still require physical iOS Safari, installed-PWA, Chrome Android, and tablet testing.
- The regional world map intentionally omits Warden House, Hidden Clearing, and Signal Vault as local/interior spaces. Their gameplay maps are reachable despite not receiving separate world-map nodes.
- The development laboratories are still included in source and debug builds. They are isolated from public campaign progression but increase repository/test asset volume.

## Unused systems

No unused TypeScript implementation file remains in `src/` after the cleanup. `src/vite-env.d.ts` is an ambient declaration and is intentionally not imported.

## Test-only systems and content

The following are deliberately classified as development/test surfaces rather than campaign features:

- Interaction Yard
- Combat Arena
- Equipment Hall
- Enemy Behavior Hall
- Recovery Hall
- Puzzle Laboratory
- Pixel Lab
- Audio Lab
- Control remapping test/editor scene
- Boss direct-start mode
- Two-player co-op room
- `interaction-memory` and `gate-warning` laboratory cutscene sequences

## Unreachable content

No production map is unreachable from Mossvale after following transition edges and excluding development maps. The stale unregistered `mossvale-demo.json` file was removed.

Development maps are intentionally unreachable from campaign maps and require a development-enabled title menu.

## Recommended first-playtest path

1. Start **New Game** in an empty manual slot and confirm the opening cutscene plays.
2. Speak with Mara, Oren, Nima, Jori, Tavi, and Pella; start quests and buy/sell one item.
3. Use the Mossvale save stone, return to title, and verify **Continue** restores the correct state.
4. Restore or inspect the first tower and confirm its first-failure cutscene does not restore it prematurely.
5. Travel east through Whispering Woodland, discover the hidden clearing and Rootbound Shrine, and retrieve the quarry route key through Quarry Intake Cave.
6. Reach Quarry Overlook. Enter Signal Vault and Sunken Quarry through their real routes rather than debug starts.
7. Solve room doors, water controls, movable puzzles, equipment targets, and defeat Gravemaw.
8. Confirm the Stone Seal reward cutscene, boss-defeat persistence, and reload behavior.
9. Return to Mossvale and complete the evacuation cutscene/battle sequence.
10. Continue through Moonwater Marsh, Emberpeak Highlands, Frostglass Ruins, and the Veiled Citadel outskirts, testing both permanent shortcuts.
11. Restore at least two signal towers and verify fast travel, its unsafe-state restrictions, and save persistence.
12. Repeat the path using keyboard, controller, and touch; include resize, orientation, focus loss, refresh, death during a transition, and offline reload after the first successful load.
13. Launch Online Co-op separately and confirm entering/leaving it does not change the campaign save.

## Verification

### Dependency-free and deterministic checks

The complete deterministic suite passes after the integration corrections, including:

- all production map/spawn transitions;
- gameplay systems, quests, combat, equipment, enemies, health, inventory, economy, dungeons, puzzles, bosses, cutscenes, audio, saves, mobile, accessibility, networking, accounts, performance, QA, and release assets;
- 16 reachable production maps and 6 isolated development maps;
- no unused TypeScript implementation files.

### Dependency-backed gates

The commands were run after the corrections with these results:

| Gate | Result | Evidence |
|---|---|---|
| Automated deterministic tests | Passed before the final typecheck step | All gameplay, save, network, account, mobile, accessibility, performance, QA, release, and integration verifiers completed successfully. |
| Semantic TypeScript check | Blocked | Exit 2. `phaser`, `better-auth/client`, `vite`, and Node type declarations were unavailable because dependencies were not installed. Cascading inherited-member errors followed from the missing Phaser types. |
| ESLint | Blocked | Exit 127. `eslint` executable was not installed. |
| Production build | Blocked after prebuild | Asset/audio/map generation and release-asset verification passed; build then stopped at the dependency-blocked TypeScript step before Vite ran. |
| Browser play-through | Not run | Requires the production bundle and Playwright dependency. |

The npm registry timed out from this environment, so installing the missing packages was not possible. These are unpassed release gates, not passing results. Run `npm install`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, `npm run verify:dist`, and `npm run test:playthrough` in a connected environment before publication.
