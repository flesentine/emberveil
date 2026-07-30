# Emberveil Manual QA Checklist

Use a fresh profile and a migrated old-save profile. Record browser, OS, hardware, build commit, and result for every run.

Status values: **Pass / Fail / Blocked / Not tested**.

## Core input and display

| Test | Procedure | Expected result | Status |
|---|---|---|---|
| Keyboard | Move, attack, defend, interact, use item, open inventory/map, pause, remap one key | Every action fires once; held movement remains continuous; remap persists after refresh | Not tested |
| Controller | Connect before launch and during play; test sticks, D-pad, buttons, disconnect/reconnect | Input method changes cleanly; no stuck movement; prompts update | Not tested |
| Touch | Test joystick, action buttons, hold/toggle, custom drag layout, opacity and size | No missed primary actions; controls stay inside safe area and persist | Not tested |
| Window resizing | Resize repeatedly from wide to short landscape and back | Integer pixel scaling remains crisp; HUD and touch controls do not overlap | Not tested |
| Mobile orientation | Rotate landscape → portrait → landscape during gameplay and menus | Optional portrait warning appears; game resumes at correct scale without shifted controls | Not tested |
| Fullscreen changes | Enter/exit fullscreen during gameplay, dialogue, pause, and touch customization | Canvas recenters; safe areas and controls recalculate; no black input-blocking layer remains | Not tested |

## Browser lifecycle and persistence

| Test | Procedure | Expected result | Status |
|---|---|---|---|
| Browser refresh | Refresh while exploring, after checkpoint, during a safe cutscene step, and after a manual save | Latest committed safe state loads; no partially transitioned state is saved | Not tested |
| Tab switching | Switch away during movement, battle, dialogue, and pause | Focus pause engages; optional audio mute works; controls are not stuck on return | Not tested |
| Loading old saves | Import schema 1, schema 16, valid schema 17, corrupt primary with valid backup | Old saves migrate; backup recovery is visible; unrecoverable corruption is reported | Not tested |
| Saving near moving objects | Move/pull/lift an object, save while it is stable, reload | Object returns to its committed snapped position; no duplicate or invisible collider | Not tested |
| Death during transitions | Take lethal damage immediately before auto door/map trigger and during fade | Either death or transition completes atomically; no black screen, wrong map, or control lock | Not tested |

## World, doors, dialogue, and puzzles

| Test | Procedure | Expected result | Status |
|---|---|---|---|
| Entering doors repeatedly | Rapidly interact with the same door and walk through/back several times | One key is consumed at most once; no duplicate transition; door remains persistently open | Not tested |
| Dialogue interruption | Trigger dialogue, pause/focus-loss, refresh where recovery is supported, and attempt nearby interaction | Dialogue resumes or exits safely; NPC facing/control locks clean up | Not tested |
| Puzzle reset | Partially solve timed and movable-object puzzles, reset, leave/reenter, save/reload | Reset restores defined home state and increments reset count; solved flags remain cleared | Not tested |
| Boss defeat and reload | Defeat Gravemaw, collect reward, save, refresh, revisit arena | Boss stays defeated; doors/reward persist; reward cannot be collected twice | Not tested |

## Network and co-op

| Test | Procedure | Expected result | Status |
|---|---|---|---|
| Slow network | Add 150–250 ms latency, 30–60 ms jitter, and 1–3% packet loss | Local movement remains responsive; remote movement interpolates; authority remains server-side | Not tested |
| Disconnection | Disconnect guest during movement, battle, downed state, and cutscene; reconnect inside/outside grace | Reservation/reconnect works inside grace; room cleans up outside grace; no stuck shared state | Not tested |
| Simultaneous multiplayer pickups | Both players contact the same currency/item pickup on the same server tick | Server grants only permitted ownership; shared reward is issued once; inventories remain consistent | Not tested |
| Late join during shared state | Join after switch, door, boss damage, and cutscene progress | Snapshot reconstructs current shared state without replaying rewards | Not tested |

## Mobile performance smoke pass

| Test | Procedure | Expected result | Status |
|---|---|---|---|
| Modern phone 60 FPS | Play Mossvale, forest combat, quarry dungeon, boss, menus for 10 minutes | Stable target frame rate with no growing memory/audio/particle count | Not tested |
| 30 FPS fallback | Force low-performance mode and repeat combat/traversal | Gameplay speed and AI timing remain correct; only render cadence changes | Not tested |
| Browser bars | Scroll browser chrome in/out without scrolling the page | Canvas uses Visual Viewport correctly and stays centered | Not tested |
| Home-screen PWA | Install, launch offline after first cache, background/resume | Launches standalone; safe areas work; audio unlock and save state recover | Not tested |

## Developer-command verification

Open with **F10** or call `window.emberveilDev.execute()`.

- [ ] Teleport by map/spawn and by coordinates
- [ ] Give and remove stackable, unique, and equipment items
- [ ] Set each quest state and stage
- [ ] Set health from full to zero and back
- [ ] Toggle invincibility
- [ ] Spawn each enemy archetype
- [ ] Kill all enemies
- [ ] Unlock doors/passages
- [ ] Reveal overworld and dungeon map
- [ ] Start Gravemaw
- [ ] Change game speed from 0.25× to 4× and return to 1×
- [ ] Display and hide collision geometry
