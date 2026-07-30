import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const plan = read('docs/QA_TEST_PLAN.md');
const checklist = read('docs/MANUAL_QA_CHECKLIST.md');
const issues = read('docs/KNOWN_ISSUES.md');
const tests = read('qa-reference/tools/test-quality-assurance.mjs');
const consoleSource = read('qa-reference/src/qa/DeveloperConsole.ts');
const fixes = read('qa-reference/HIGH_PRIORITY_FIXES.patch');

for (const area of [
  'Save and load', 'Inventory', 'Quests', 'Damage', 'Status effects', 'Shops',
  'Item uniqueness', 'Doors', 'Puzzles', 'Map transitions', 'Input remapping',
  'Networking', 'Developer tools',
]) assert.ok(plan.includes(area), `Missing automated coverage: ${area}`);

for (const manual of [
  'Keyboard', 'Controller', 'Touch', 'Window resizing', 'Mobile orientation',
  'Browser refresh', 'Tab switching', 'Slow network', 'Disconnection',
  'Loading old saves', 'Entering doors repeatedly', 'Death during transitions',
  'Saving near moving objects', 'Boss defeat and reload',
  'Simultaneous multiplayer pickups', 'Dialogue interruption', 'Puzzle reset',
  'Fullscreen changes',
]) assert.ok(checklist.includes(manual), `Missing manual test: ${manual}`);

for (const command of [
  'teleport', 'give', 'remove', 'quest', 'health', 'invincible', 'spawn',
  'killall', 'unlockdoors', 'revealmap', 'boss', 'speed', 'collisions',
]) {
  assert.match(consoleSource, new RegExp(`case '${command}'`), `Missing command: ${command}`);
}

assert.ok(tests.includes('save and load preserves complete gameplay state'));
assert.ok(tests.includes('network message validation rejects malformed and forged packets'));
assert.ok(fixes.includes('UNIQUE_COLLECTION_CATEGORIES'));
assert.ok(fixes.includes('getOverworldNode(mapId)?.regionId'));
assert.ok(issues.includes('None discovered after fixing QA-001 and QA-002'));

console.log('QA reference verification passed: coverage, manual matrix, developer commands, fixes, and known issues are documented.');
