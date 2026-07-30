# Emberveil Test and Quality-Assurance Plan

## Purpose

This pass adds an executable regression suite, a device/browser manual matrix, an in-engine developer console, and explicit severity tracking. The goal is to protect single-player, co-op, saves, mobile controls, accessibility, and content persistence while the game continues to expand.

## Automated suite

Run:

```bash
npm run verify:qa
```

The executable QA runner transpiles the project's TypeScript modules into an isolated temporary CommonJS build and exercises the real domain classes. It does not replace the existing focused save, networking, accessibility, mobile, performance, and cloud-save suites.

### Coverage

| Area | Assertions |
|---|---|
| Save and load | Player state, currency, flags, map state, moving objects, puzzle state, save transactions |
| Inventory | Stack changes, partial removal, unique-item duplication, unique-item removal and reacquisition |
| Quests | Start, stage change, failure, recovery, completion, reward idempotency |
| Damage | Quarter-heart quantization, temporary armor, reduced-damage accessibility multiplier |
| Status effects | Duration extension, expiry, movement penalties, silence |
| Shops | Atomic purchase, sale, currency changes, unique purchase rejection |
| Item uniqueness | Unique catalog IDs and one-item stack limits |
| Doors | Small-key consumption and idempotent persistent open state |
| Puzzles | Persistent state, completion flag, reset behavior, reset count |
| Map transitions | Every target map and target spawn resolves; destination-region save metadata is verified |
| Input remapping | Keyboard persistence, dead-zone clamping, movement actions remain hold-based |
| Networking | Valid packet acceptance; malformed JSON, extra damage fields, oversized packets rejected |
| Developer tools | Every required command is wired into the console command table |

## Severity definitions

- **Critical:** data loss, remote authority bypass, account/security compromise, unrecoverable soft lock, or widespread crash.
- **High:** repeatable progression block, reward duplication/loss, corrupted persistent state, wrong-map recovery, or core input failure.
- **Medium:** significant visual/UX defect with a workaround, device-specific degradation, or noncritical state mismatch.
- **Low:** cosmetic defects, debug-only limitations, wording, or minor polish.

## Bugs found and fixed in this pass

### QA-001 — Unique items could not actually be removed

**Severity:** High  
**Cause:** `ItemInventory.remove()` reduced the stack but left the item's legacy `collectedItems` marker. `quantity()` therefore continued returning one. Equipment removals also reported success without removing ownership.  
**Fix:** Unique collection markers are now removed with the item. Removable equipment is removed from ownership/upgrades and safely unequipped. The base Warden Blade remains protected.  
**Regression:** Add a unique quest item, reject a duplicate, remove it, verify quantity zero, then add it again.

### QA-002 — Cross-region transition saves recorded the source region

**Severity:** High  
**Cause:** The transition save changed `player.mapId` to the destination but retained the current runtime's region ID. Save-slot summaries and interrupted transition recovery could temporarily describe the wrong region.  
**Fix:** Transition persistence now resolves the destination map through `getOverworldNode()` and records its region.  
**Regression:** Static/runtime transition validation checks the destination-region resolver and every transition target/spawn.

## Developer console

Enable developer tools in a development build, with `VITE_DEBUG_MODE=true`, or by adding `?dev=1` to the URL. Press **F10** to open the in-engine console.

The same command interface is exposed at:

```js
window.emberveilDev.execute('give mossvale-tonic 2')
```

Commands:

```text
teleport <map|x> [spawn|y]
give <item> [amount]
remove <item> [amount]
quest <id> <inactive|active|complete|failed> [stage]
health <amount>
invincible [on|off]
spawn <enemy-type> [x y]
killall
unlockdoors
revealmap
boss [id]
speed <0.1-4>
collisions [on|off]
```

## Exit criteria

A release candidate is acceptable when:

1. `npm run check` passes in a dependency-complete environment.
2. `npm run verify:qa` passes.
3. No open critical or high issue remains.
4. The manual checklist has been completed on at least one desktop keyboard setup, one controller, one current iPhone-class Safari device, and one current Android Chrome device.
5. Co-op has been tested with latency and disconnection simulation.
