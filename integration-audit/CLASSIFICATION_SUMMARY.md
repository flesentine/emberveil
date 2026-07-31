# Integration classification summary

## Fully integrated and playable

Title screen, New Game, Continue, save slots, player movement, collision, combat, enemies, NPC dialogue, quests, inventory, shops, map transitions, interiors, caves, dungeons, puzzles, bosses, checkpoints, death/recovery, audio, settings, accessibility, keyboard controls, world-map progression, cutscenes, fast travel, and multiplayer isolation.

## Integrated but incomplete

- Equipment progression: all ten items are in the preview loadout; only a subset has campaign acquisition and bespoke production targets.
- Items/tools: Grappling Line and Gale Feather demonstrations are still primarily development-lab content.
- Controller, touch, and mobile: connected in runtime, but physical device/browser coverage remains incomplete.
- Production build: release infrastructure is present, but dependency-backed typecheck, lint, Vite build, and browser smoke did not pass in this isolated environment because dependencies could not be installed.

## Present only in a test scene

Interaction Yard, Combat Arena, Equipment Hall, Enemy Behavior Hall, Recovery Hall, Puzzle Laboratory, Pixel Lab, Audio Lab, control test/editor, direct boss start, two-player co-op room, and two laboratory-only cutscene sequences.

## Implemented but unused

None remain in the integrated `src/` tree after cleanup.

## Missing or broken

No remaining runtime-critical campaign system was identified. The unpassed dependency-backed production gates remain a release blocker rather than a proven gameplay defect.
