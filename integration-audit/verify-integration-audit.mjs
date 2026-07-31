import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(root, relative));
const errors = [];
const requireText = (source, token, message) => {
  if (!source.includes(token)) errors.push(message);
};

const devMaps = new Set([
  'interaction-yard',
  'combat-arena',
  'equipment-lab',
  'enemy-lab',
  'health-lab',
  'puzzle-lab',
]);
const campaignStart = 'mossvale-village';

const title = read('src/scenes/TitleScene.ts');
for (const token of [
  "label: 'NEW GAME'",
  "label: 'CONTINUE'",
  "label: 'SAVE FILES'",
  "label: 'ONLINE CO-OP'",
  "label: 'ACCOUNT / CLOUD'",
  "label: 'SETTINGS'",
  'SaveService.hasSave()',
  'this.startNewGame()',
  'this.continueGame()',
]) requireText(title, token, `Title screen route missing ${token}`);
requireText(title, "get('dev') === '1'", 'Development labs are not gated behind developer mode');

const slots = read('src/scenes/SaveSlotScene.ts');
for (const token of [
  'SaveService.createNew(slot)',
  'SaveService.saveManual',
  'SaveService.saveAutosave',
  "SaveService.selectSlot('autosave')",
  'this.scene.start(SceneKeys.World',
]) requireText(slots, token, `New Game path missing ${token}`);
const world = read('src/scenes/WorldScene.ts');
requireText(world, "this.runtime.mapId === 'mossvale-village'", 'Opening scene lacks Mossvale start condition');
requireText(world, "this.playCutscene('opening')", 'Opening cutscene is not launched by WorldScene');
const openingBlock = world.slice(world.indexOf('private startPendingCutscene'), world.indexOf('private playCutscene'));
if (openingBlock.includes("this.mode === 'new'")) errors.push('Opening cutscene is still incorrectly tied to debug/new launch mode');

const config = read('src/core/gameConfig.ts');
const keys = read('src/core/SceneKeys.ts');
for (const name of ['DungeonScene', 'InteriorScene']) {
  if (config.includes(name) || keys.includes(name) || exists(`src/scenes/${name}.ts`)) errors.push(`${name} placeholder is still registered or present`);
}

const mapFiles = fs.readdirSync(path.join(root, 'public/maps')).filter((file) => file.endsWith('.json') && file !== 'emberveil-placeholder-tileset.json');
const maps = new Map();
for (const file of mapFiles) {
  const document = JSON.parse(read(`public/maps/${file}`));
  const properties = Object.fromEntries((document.properties ?? []).map((property) => [property.name, property.value]));
  const id = properties.mapId ?? file.replace(/\.json$/u, '');
  const layers = document.layers ?? [];
  const objects = layers.filter((layer) => layer.type === 'objectgroup').flatMap((layer) => layer.objects ?? []);
  const spawns = new Set(objects.filter((object) => object.type === 'spawn').map((object) => object.name));
  const transitions = (layers.find((layer) => layer.name === 'Transitions')?.objects ?? []).map((object) => {
    const props = Object.fromEntries((object.properties ?? []).map((property) => [property.name, property.value]));
    return { id: object.name, targetMapId: props.targetMapId, targetSpawnId: props.targetSpawnId };
  });
  maps.set(id, { spawns, transitions });
}
if (!maps.has(campaignStart)) errors.push('Mossvale campaign start map is missing');
for (const [mapId, map] of maps) {
  for (const transition of map.transitions) {
    const target = maps.get(transition.targetMapId);
    if (!target) {
      errors.push(`${mapId}:${transition.id} targets missing map ${transition.targetMapId}`);
      continue;
    }
    if (!target.spawns.has(transition.targetSpawnId)) errors.push(`${mapId}:${transition.id} targets missing spawn ${transition.targetMapId}:${transition.targetSpawnId}`);
    if (!devMaps.has(mapId) && devMaps.has(transition.targetMapId)) errors.push(`Campaign map ${mapId} exposes development map ${transition.targetMapId}`);
  }
}
const reachable = new Set([campaignStart]);
const queue = [campaignStart];
while (queue.length) {
  const id = queue.shift();
  for (const transition of maps.get(id)?.transitions ?? []) {
    if (devMaps.has(transition.targetMapId) || reachable.has(transition.targetMapId)) continue;
    reachable.add(transition.targetMapId);
    queue.push(transition.targetMapId);
  }
}
for (const mapId of maps.keys()) {
  if (!devMaps.has(mapId) && !reachable.has(mapId)) errors.push(`Production map is unreachable from Mossvale: ${mapId}`);
}
if (exists('public/maps/mossvale-demo.json')) errors.push('Stale unregistered mossvale-demo map is still shipped');

const runtime = read('src/world/maps/WorldMapRuntime.ts');
for (const [label, token, source] of [
  ['player', 'new Player(', world],
  ['map runtime', 'new WorldMapRuntime', world],
  ['combat', 'new CombatSystem', runtime],
  ['enemy streaming', 'new WorldEntityStreamer', runtime],
  ['puzzles', 'new PuzzleRuntime', runtime],
  ['dungeons', 'new DungeonRuntime', runtime],
  ['equipment', 'new EquipmentSystem', world],
  ['inventory', 'SceneKeys.Inventory', world],
  ['dialogue', 'new DialogueOverlay', world],
  ['shops', 'new ShopOverlay', world],
  ['cutscenes', 'new CutsceneDirector', world],
  ['audio zones', 'new WorldZoneAudio', world],
  ['fast travel', 'SceneKeys.FastTravel', world],
  ['checkpoints', 'activateCheckpoint', world],
  ['death/recovery', 'deathAnimationComplete', world],
]) requireText(source, token, `${label} is not instantiated by playable world code`);

const ui = read('src/scenes/GameUIScene.ts');
const settings = read('src/scenes/SettingsScene.ts');
for (const token of ['new InputManager', 'InputSettingsService']) requireText(world + ui + settings, token, `Input integration missing ${token}`);
requireText(config, 'gamepad: true', 'Controller input is not enabled in Phaser config');
requireText(config, 'touch: true', 'Touch input is not enabled in Phaser config');
requireText(ui, 'TouchControls', 'Touch controls are not launched by GameUIScene');
requireText(settings, 'GameSettingsService', 'Accessibility settings are not connected to SettingsScene');
requireText(read('src/core/createGame.ts'), 'MobilePlatformManager.install(game)', 'Mobile platform manager is not installed');

const inventory = read('src/scenes/InventoryScene.ts');
const travel = read('src/scenes/FastTravelScene.ts');
for (const token of ['OVERWORLD_NODES', 'this.saveData.maps']) requireText(inventory, token, `World map integration missing ${token}`);
for (const token of ['restoredSignalTowers', 'this.towers']) requireText(travel, token, `Fast travel integration missing ${token}`);

if (world.includes("from '../network/") || world.includes('CoopNetworkClient')) errors.push('Single-player WorldScene imports multiplayer networking');
requireText(title, 'SceneKeys.CoopLobby', 'Co-op lobby is not exposed as a separate title route');
requireText(read('src/scenes/CoopTestScene.ts'), 'CoopNetworkClient', 'Co-op test room does not use its network client');

const packageJson = JSON.parse(read('package.json'));
for (const script of ['typecheck', 'lint', 'format:check', 'build', 'check', 'check:release', 'test:e2e']) {
  if (!packageJson.scripts?.[script]) errors.push(`Production script missing: ${script}`);
}
for (const file of ['vite.config.ts', 'public/manifest.webmanifest', 'tools/finalize-release.mjs', 'netlify.toml']) {
  if (!exists(file)) errors.push(`Release infrastructure missing ${file}`);
}

for (const file of fs.readdirSync(path.join(root, 'docs')).filter((name) => name.endsWith('.md'))) {
  const source = read(`docs/${file}`);
  for (const phrase of [
    'use the training portal in Mossvale',
    'Mossvale laboratory portal',
    'enemy-study portal at the south edge of Mossvale',
    'recovery portal in southern Mossvale',
    'purple training portal in Mossvale Village',
    'quarry portal in Mossvale Village',
    'Signal Vault portal in Mossvale',
  ]) if (source.includes(phrase)) errors.push(`docs/${file} contains removed route claim: ${phrase}`);
}

const sourceFiles = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) sourceFiles.push(full);
  }
};
walk(path.join(root, 'src'));
const normalized = new Map(sourceFiles.map((file) => [path.resolve(file), file]));
const dependencies = new Map(sourceFiles.map((file) => [path.resolve(file), []]));
const importPattern = /(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]|import\(['"]([^'"]+)['"]\)/gu;
for (const file of sourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2];
    if (!specifier?.startsWith('.')) continue;
    const base = path.resolve(path.dirname(file), specifier);
    const target = [`${base}.ts`, path.join(base, 'index.ts')].find((candidate) => normalized.has(path.resolve(candidate)));
    if (target) dependencies.get(path.resolve(file)).push(path.resolve(target));
  }
}
const imported = new Set();
const stack = [path.resolve(root, 'src/main.ts')];
while (stack.length) {
  const current = stack.pop();
  if (imported.has(current)) continue;
  imported.add(current);
  stack.push(...(dependencies.get(current) ?? []));
}
for (const file of sourceFiles) {
  if (!imported.has(path.resolve(file)) && !file.endsWith('.d.ts')) errors.push(`Unused TypeScript implementation file: ${path.relative(root, file)}`);
}

if (errors.length) {
  console.error('Integration audit verification failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Integration audit verification passed: ${maps.size - devMaps.size} campaign maps are reachable, ${devMaps.size} development maps are isolated, and no unused implementation files remain.`);
