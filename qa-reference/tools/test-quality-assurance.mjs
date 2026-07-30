import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../integrated-project');
const buildRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'emberveil-qa-'));

async function loadTypeScript() {
  try {
    return await import('typescript');
  } catch {
    return import('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js');
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

class MemoryStorage {
  #values = new Map();
  get length() { return this.#values.size; }
  clear() { this.#values.clear(); }
  getItem(key) { return this.#values.get(key) ?? null; }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  removeItem(key) { this.#values.delete(key); }
  setItem(key, value) { this.#values.set(key, String(value)); }
}

function properties(object) {
  return Object.fromEntries((object.properties ?? []).map((property) => [property.name, property.value]));
}

const results = [];
async function test(name, run) {
  try {
    await run();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, error });
    console.error(`FAIL ${name}: ${error instanceof Error ? error.stack : String(error)}`);
  }
}

try {
  if (!fs.existsSync(path.join(root, 'src'))) {
    console.log('QA reference runner: copy the complete Emberveil project to qa-reference/integrated-project before running this executable suite.');
    process.exit(0);
  }

  const tsModule = await loadTypeScript();
  const ts = tsModule.default ?? tsModule;
  for (const sourcePath of walk(path.join(root, 'src')).filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))) {
    const relative = path.relative(root, sourcePath).replace(/\.ts$/, '.js');
    const outputPath = path.join(buildRoot, relative);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
      fileName: sourcePath,
      reportDiagnostics: true,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    assert.equal((compiled.diagnostics ?? []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error).length, 0, `Syntax errors in ${relative}`);
    fs.writeFileSync(outputPath, compiled.outputText);
  }
  fs.writeFileSync(path.join(buildRoot, 'package.json'), '{"type":"commonjs"}\n');
  const require = createRequire(path.join(buildRoot, 'entry.cjs'));
  const moduleAt = (relative) => require(path.join(buildRoot, relative));

  const { SaveService, SaveTransactionService } = moduleAt('src/save/SaveService.js');
  const { ItemInventory } = moduleAt('src/items/ItemInventory.js');
  const { ShopService } = moduleAt('src/items/ShopService.js');
  const { QuestService } = moduleAt('src/quests/QuestService.js');
  const { QUEST_IDS } = moduleAt('src/data/quests/QuestDefinitions.js');
  const { HealthComponent } = moduleAt('src/components/HealthComponent.js');
  const { StatusController } = moduleAt('src/combat/StatusController.js');
  const { PlayerVitalsController } = moduleAt('src/health/PlayerVitalsController.js');
  const { DEFAULT_HEALTH_RECOVERY_SETTINGS } = moduleAt('src/health/HealthSettings.js');
  const { DungeonStateStore } = moduleAt('src/dungeons/DungeonStateStore.js');
  const { PuzzleStateStore } = moduleAt('src/puzzles/PuzzleStateStore.js');

  await test('save and load preserves complete gameplay state', () => {
    const storage = new MemoryStorage();
    SaveService.setStorageForTests(storage);
    const save = SaveService.createNew(1);
    save.player.mapId = 'moonwater-marsh';
    save.player.regionId = 'moonwater-marsh';
    save.player.x = 321;
    save.player.y = 207;
    save.player.health = 4.75;
    save.player.magic = 19;
    save.inventory.economy.glints = 88;
    save.worldFlags['shortcut.reedway-restored'] = true;
    save.maps['moonwater-marsh'] = {
      openedChests: ['qa-chest'], defeatedEnemies: ['qa-enemy'], activatedSwitches: ['qa-switch'],
      movedBlocks: { 'qa-block': { x: 40, y: 48 } }, collectedItems: ['qa-item'],
      unlockedPassages: ['qa-door'], discoveredSecrets: ['qa-secret'], completedInteractions: ['qa-talk'],
      puzzleStates: { 'qa-puzzle': { active: true, solved: true, value: 1, orientation: 2, sequenceIndex: 3, x: 16, y: 32, timerRemainingMs: 0, phase: 'solved', resetCount: 0 } },
    };
    assert.equal(SaveService.saveManual(save, 1, { reason: 'manual' }), true);
    const loaded = SaveService.loadSlot('manual-1');
    assert.ok(loaded);
    assert.equal(loaded.player.mapId, 'moonwater-marsh');
    assert.equal(loaded.player.health, 4.75);
    assert.equal(loaded.inventory.economy.glints, 88);
    assert.deepEqual(loaded.maps['moonwater-marsh'].movedBlocks['qa-block'], { x: 40, y: 48 });
    assert.equal(loaded.maps['moonwater-marsh'].puzzleStates['qa-puzzle'].solved, true);
    assert.equal(SaveTransactionService.claim(loaded, 'qa:reward'), true);
    assert.equal(SaveTransactionService.claim(loaded, 'qa:reward'), false);
  });

  await test('inventory changes, stack limits, and unique removal are correct', () => {
    const save = SaveService.createNew(1);
    const inventory = new ItemInventory(save);
    const starting = inventory.quantity('mossvale-tonic');
    assert.equal(inventory.add('mossvale-tonic', 2).added, 2);
    assert.equal(inventory.quantity('mossvale-tonic'), starting + 2);
    assert.equal(inventory.remove('mossvale-tonic', 1).removed, 1);
    assert.equal(inventory.quantity('mossvale-tonic'), starting + 1);
    assert.equal(inventory.add('jori-fishing-net', 1).added, 1);
    assert.equal(inventory.add('jori-fishing-net', 1).failure, 'duplicate-unique');
    assert.equal(inventory.remove('jori-fishing-net', 1).removed, 1);
    assert.equal(inventory.quantity('jori-fishing-net'), 0);
    assert.equal(inventory.add('jori-fishing-net', 1).added, 1);
  });

  await test('quest transitions and rewards are idempotent', () => {
    const save = SaveService.createNew(1);
    const initialGlints = save.inventory.economy.glints;
    assert.equal(QuestService.start(save, QUEST_IDS.SilentBeacon), true);
    assert.equal(QuestService.setStage(save, QUEST_IDS.SilentBeacon, 3), true);
    assert.equal(QuestService.fail(save, QUEST_IDS.SilentBeacon, 'qa interruption'), true);
    assert.equal(QuestService.recover(save, QUEST_IDS.SilentBeacon), true);
    assert.equal(QuestService.complete(save, QUEST_IDS.SilentBeacon), true);
    const rewardedGlints = save.inventory.economy.glints;
    assert.equal(rewardedGlints, initialGlints + 24);
    assert.equal(QuestService.complete(save, QUEST_IDS.SilentBeacon), false);
    QuestService.claimRewards(save, QUEST_IDS.SilentBeacon);
    assert.equal(save.inventory.economy.glints, rewardedGlints);
  });

  await test('damage calculations quantize, absorb armor, and respect accessibility', () => {
    const health = new HealthComponent(6, 6);
    assert.equal(health.damage(1.13), 4.75);
    assert.equal(health.heal(0.63), 5.5);
    const statuses = new StatusController();
    const standard = new PlayerVitalsController(health, statuses, DEFAULT_HEALTH_RECOVERY_SETTINGS);
    standard.grantTemporaryArmor(1, 1000, 0);
    assert.deepEqual(standard.resolveIncomingDamage(2, 100), { healthDamage: 1, armorAbsorbed: 1 });
    standard.setSettings({ ...DEFAULT_HEALTH_RECOVERY_SETTINGS, reducedEnemyDamage: true });
    assert.equal(standard.resolveIncomingDamage(2, 2000).healthDamage, 1.25);
  });

  await test('status effects extend, expire, and affect vitals', () => {
    const statuses = new StatusController();
    statuses.addStatus('poison', 1000, 100);
    statuses.addStatus('poison', 200, 200);
    statuses.update(900);
    assert.equal(statuses.hasStatus('poison'), true);
    statuses.update(1100);
    assert.equal(statuses.hasStatus('poison'), false);
    statuses.addStatus('slow', 1000, 1200);
    statuses.addStatus('silence', 1000, 1200);
    const vitals = new PlayerVitalsController(new HealthComponent(6), statuses, DEFAULT_HEALTH_RECOVERY_SETTINGS);
    assert.equal(vitals.movementMultiplier(), 0.62);
    assert.equal(vitals.canUseMagic(), false);
  });

  await test('shop transactions are atomic and unique stock cannot duplicate', () => {
    const save = SaveService.createNew(1);
    save.inventory.economy.glints = 200;
    const shop = new ShopService(save, 'yard-shop');
    const before = save.inventory.economy.glints;
    assert.equal(shop.buy('mossvale-tonic').success, true);
    assert.ok(save.inventory.economy.glints < before);
    assert.equal(shop.sell('mossvale-tonic').success, true);
    assert.equal(shop.buy('training-charm').success, true);
    assert.equal(shop.buy('training-charm').success, false);
  });

  await test('item catalog uniqueness IDs are not duplicated', () => {
    const { ITEM_DEFINITIONS } = moduleAt('src/items/ItemDefinitions.js');
    const ids = ITEM_DEFINITIONS.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);
    for (const item of ITEM_DEFINITIONS.filter((entry) => entry.unique)) assert.equal(item.maxStack, 1);
  });

  await test('door state and consumable keys remain idempotent', () => {
    const save = SaveService.createNew(1);
    const dungeon = new DungeonStateStore(save, 'qa-dungeon');
    assert.equal(dungeon.spendSmallKey(), false);
    dungeon.addSmallKey(1);
    assert.equal(dungeon.spendSmallKey(), true);
    assert.equal(dungeon.spendSmallKey(), false);
    dungeon.openDoor('room-a', 'door-a');
    dungeon.openDoor('room-a', 'door-a');
    assert.deepEqual(dungeon.room('room-a').openedDoors, ['door-a']);
  });

  await test('puzzle state persists and reset clears completion flags', () => {
    const flags = {};
    const mapState = { puzzleStates: {} };
    const fakeWorld = { map: () => mapState, setFlag: (id, value) => { flags[id] = value; } };
    const store = new PuzzleStateStore(fakeWorld, 'qa-map');
    const definition = { id: 'qa-puzzle', initialOrientation: 1, homeX: 32, homeY: 48, completionFlag: 'puzzle.qa', groupId: 'g', resetGroupId: 'g' };
    store.patch(definition, { solved: true, active: true, orientation: 3 });
    assert.equal(store.read(definition).orientation, 3);
    assert.equal(flags['puzzle.qa'], true);
    const reset = store.reset(definition);
    assert.equal(reset.solved, false);
    assert.equal(reset.orientation, 1);
    assert.equal(reset.resetCount, 1);
    assert.equal(flags['puzzle.qa'], false);
  });

  await test('every map transition resolves to an existing map and spawn', () => {
    const mapDirectory = path.join(root, 'public/maps');
    const maps = new Map();
    for (const file of fs.readdirSync(mapDirectory).filter((name) => name.endsWith('.json') && name !== 'emberveil-placeholder-tileset.json')) {
      const document = JSON.parse(fs.readFileSync(path.join(mapDirectory, file), 'utf8'));
      const mapId = path.basename(file, '.json');
      const objects = document.layers.filter((layer) => layer.type === 'objectgroup').flatMap((layer) => layer.objects ?? []);
      maps.set(mapId, { objects, spawns: new Set(objects.filter((object) => object.type === 'spawn').map((object) => object.name)) });
    }
    let transitionCount = 0;
    for (const [mapId, map] of maps) {
      for (const object of map.objects) {
        const props = properties(object);
        if (!props.targetMapId) continue;
        transitionCount += 1;
        assert.ok(maps.has(props.targetMapId), `${mapId}:${object.name} targets missing map ${props.targetMapId}`);
        if (props.targetSpawnId) assert.ok(maps.get(props.targetMapId).spawns.has(props.targetSpawnId));
      }
    }
    assert.ok(transitionCount >= 20);
    assert.match(fs.readFileSync(path.join(root, 'src/scenes/WorldScene.ts'), 'utf8'), /getOverworldNode\(mapId\)\?\.regionId/);
  });

  await test('input remapping persists, clamps, and preserves movement hold behavior', () => {
    const storage = new MemoryStorage();
    globalThis.window = { localStorage: storage };
    const { InputSettingsService } = moduleAt('src/systems/input/InputSettingsService.js');
    const { InputActions } = moduleAt('src/systems/input/InputAction.js');
    InputSettingsService.reset();
    assert.deepEqual(InputSettingsService.setKeyboardBinding(InputActions.Attack, 'KeyQ').keyboard[InputActions.Attack], ['KeyQ']);
    assert.equal(InputSettingsService.setDeadZone(5).deadZones.move, 0.8);
    assert.equal(InputSettingsService.setBehavior(InputActions.MoveUp, 'toggle').behavior[InputActions.MoveUp], 'hold');
  });

  await test('network message validation rejects malformed and forged packets', async () => {
    const protocol = await import(pathToFileURL(path.join(root, 'server/protocol.mjs')).href);
    assert.equal(protocol.parseClientPacket(JSON.stringify({ v: 1, type: 'hello', payload: { operation: 'create', displayName: 'Rowan', clientVersion: 'qa' } })).ok, true);
    assert.equal(protocol.parseClientPacket('{bad').code, 'malformed-json');
    assert.equal(protocol.parseClientPacket(JSON.stringify({ v: 1, type: 'attack', payload: { clientAttackId: 'x', kind: 'melee', aimX: 0, aimY: 0, damage: 9999 } })).ok, false);
    assert.equal(protocol.parseClientPacket('x'.repeat(9000)).code, 'packet-too-large');
  });

  await test('developer command surface contains every required command', () => {
    const source = fs.readFileSync(path.join(root, 'src/qa/DeveloperConsole.ts'), 'utf8');
    for (const command of ['teleport', 'give', 'remove', 'quest', 'health', 'invincible', 'spawn', 'killall', 'unlockdoors', 'revealmap', 'boss', 'speed', 'collisions']) assert.match(source, new RegExp(`case '${command}'`));
  });

  const failures = results.filter((result) => !result.passed);
  if (failures.length > 0) throw new Error(`${failures.length} QA tests failed.`);
  console.log(`Quality-assurance tests passed: ${results.length} suites.`);
} finally {
  fs.rmSync(buildRoot, { recursive: true, force: true });
}
