import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/constants';

export type DeveloperQuestState = 'inactive' | 'active' | 'complete' | 'failed';

export interface DeveloperCommandHost {
  teleport(target: string, secondary?: string): string;
  giveItem(itemId: string, amount: number): string;
  removeItem(itemId: string, amount: number): string;
  setQuestState(questId: string, state: DeveloperQuestState, stage?: number): string;
  setHealth(amount: number): string;
  toggleInvincibility(force?: boolean): string;
  spawnEnemy(enemyType: string, x?: number, y?: number): string;
  killAllEnemies(): string;
  unlockDoors(): string;
  revealMap(): string;
  startBoss(bossId?: string): string;
  setGameSpeed(multiplier: number): string;
  displayCollisions(force?: boolean): string;
}

const HELP_LINES = [
  'teleport <map|x> [spawn|y]',
  'give <item> [amount] · remove <item> [amount]',
  'quest <id> <inactive|active|complete|failed> [stage]',
  'health <amount> · invincible [on|off]',
  'spawn <enemy-type> [x y] · killall',
  'unlockdoors · revealmap · boss [id]',
  'speed <0.1-4> · collisions [on|off]',
] as const;

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === 'on' || value === 'true' || value === '1') return true;
  if (value === 'off' || value === 'false' || value === '0') return false;
  return undefined;
}

function amount(value: string | undefined, fallback = 1): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

export class DeveloperConsole {
  public active = false;

  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly output: Phaser.GameObjects.Text;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly keyHandler: (event: KeyboardEvent) => void;
  private readonly history: string[] = [];
  private historyIndex = 0;
  private line = '';
  private messages: string[] = ['EMBERveil developer console · type help'];
  private destroyed = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly host: DeveloperCommandHost,
  ) {
    this.panel = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH - 12, 116, 0x080b10, 0.96)
      .setStrokeStyle(1, 0xa488d6, 1)
      .setScrollFactor(0)
      .setDepth(49_998)
      .setVisible(false);
    this.output = scene.add
      .text(10, 37, '', {
        fontFamily: 'monospace',
        fontSize: '6px',
        color: '#d9e2d0',
        wordWrap: { width: GAME_WIDTH - 20 },
        lineSpacing: 1,
      })
      .setScrollFactor(0)
      .setDepth(49_999)
      .setVisible(false);
    this.inputText = scene.add
      .text(10, 137, '> ', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#fff1c1',
        backgroundColor: '#17131cee',
        padding: { x: 3, y: 2 },
      })
      .setScrollFactor(0)
      .setDepth(50_000)
      .setVisible(false);

    this.keyHandler = (event) => this.handleKey(event);
    scene.input.keyboard?.on('keydown', this.keyHandler);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);

    const exposed = {
      execute: (command: string) => this.execute(command),
      help: () => [...HELP_LINES],
      open: () => this.setActive(true),
      close: () => this.setActive(false),
    };
    (window as Window & { emberveilDev?: typeof exposed }).emberveilDev = exposed;
  }

  public setActive(active: boolean): void {
    this.active = active;
    this.panel.setVisible(active);
    this.output.setVisible(active);
    this.inputText.setVisible(active);
    this.refresh();
  }

  public execute(commandLine: string): string {
    const trimmed = commandLine.trim();
    if (!trimmed) return '';
    this.history.push(trimmed);
    if (this.history.length > 40) this.history.shift();
    this.historyIndex = this.history.length;
    const [rawCommand, ...args] = trimmed.split(/\s+/);
    const command = rawCommand?.toLowerCase() ?? '';
    let result = '';
    try {
      switch (command) {
        case 'help':
          result = HELP_LINES.join('\n');
          break;
        case 'teleport':
        case 'tp':
          result = args[0] ? this.host.teleport(args[0], args[1]) : 'Usage: teleport <map|x> [spawn|y]';
          break;
        case 'give':
          result = args[0] ? this.host.giveItem(args[0], amount(args[1])) : 'Usage: give <item> [amount]';
          break;
        case 'remove':
          result = args[0] ? this.host.removeItem(args[0], amount(args[1])) : 'Usage: remove <item> [amount]';
          break;
        case 'quest': {
          const state = args[1] as DeveloperQuestState | undefined;
          const valid = state === 'inactive' || state === 'active' || state === 'complete' || state === 'failed';
          result = args[0] && valid
            ? this.host.setQuestState(args[0], state, args[2] === undefined ? undefined : Number(args[2]))
            : 'Usage: quest <id> <inactive|active|complete|failed> [stage]';
          break;
        }
        case 'health':
          result = Number.isFinite(Number(args[0])) ? this.host.setHealth(Number(args[0])) : 'Usage: health <amount>';
          break;
        case 'invincible':
        case 'god':
          result = this.host.toggleInvincibility(parseBoolean(args[0]));
          break;
        case 'spawn':
          result = args[0]
            ? this.host.spawnEnemy(args[0], args[1] === undefined ? undefined : Number(args[1]), args[2] === undefined ? undefined : Number(args[2]))
            : 'Usage: spawn <enemy-type> [x y]';
          break;
        case 'killall':
          result = this.host.killAllEnemies();
          break;
        case 'unlockdoors':
          result = this.host.unlockDoors();
          break;
        case 'revealmap':
          result = this.host.revealMap();
          break;
        case 'boss':
          result = this.host.startBoss(args[0]);
          break;
        case 'speed':
          result = Number.isFinite(Number(args[0])) ? this.host.setGameSpeed(Number(args[0])) : 'Usage: speed <0.1-4>';
          break;
        case 'collisions':
          result = this.host.displayCollisions(parseBoolean(args[0]));
          break;
        case 'clear':
          this.messages = [];
          result = '';
          break;
        default:
          result = `Unknown command '${command}'. Type help.`;
      }
    } catch (error) {
      result = `Command failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    this.messages.push(`> ${trimmed}`);
    if (result) this.messages.push(...result.split('\n'));
    this.messages = this.messages.slice(-12);
    this.line = '';
    this.refresh();
    return result;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scene.input.keyboard?.off('keydown', this.keyHandler);
    const target = window as Window & { emberveilDev?: unknown };
    delete target.emberveilDev;
    this.panel.destroy();
    this.output.destroy();
    this.inputText.destroy();
  }

  private handleKey(event: KeyboardEvent): void {
    if (event.code === 'F10') {
      event.preventDefault();
      event.stopPropagation();
      this.setActive(!this.active);
      return;
    }
    if (!this.active) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      this.setActive(false);
      return;
    }
    if (event.key === 'Enter') {
      this.execute(this.line);
      return;
    }
    if (event.key === 'Backspace') {
      this.line = this.line.slice(0, -1);
      this.refresh();
      return;
    }
    if (event.key === 'ArrowUp') {
      this.historyIndex = Math.max(0, this.historyIndex - 1);
      this.line = this.history[this.historyIndex] ?? '';
      this.refresh();
      return;
    }
    if (event.key === 'ArrowDown') {
      this.historyIndex = Math.min(this.history.length, this.historyIndex + 1);
      this.line = this.history[this.historyIndex] ?? '';
      this.refresh();
      return;
    }
    if (event.key.length === 1 && this.line.length < 96) {
      this.line += event.key;
      this.refresh();
    }
  }

  private refresh(): void {
    this.output.setText(this.messages.join('\n'));
    this.inputText.setText(`> ${this.line}${this.active ? '█' : ''}`);
  }
}
