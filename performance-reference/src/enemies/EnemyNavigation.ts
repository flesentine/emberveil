import Phaser from 'phaser';
import { PerformanceMonitor } from '../performance/PerformanceMonitor';
import { PerformanceProfile } from '../platform/PerformanceProfile';
import type { EnemyMovementDefinition } from './EnemyTypes';

export interface EnemyNavigationEnvironment {
  readonly isBlocked: (bounds: Phaser.Geom.Rectangle) => boolean;
  readonly isWaterAt: (x: number, y: number) => boolean;
}

interface PathNode {
  readonly x: number;
  readonly y: number;
  readonly g: number;
  readonly f: number;
  readonly parent: PathNode | null;
}

interface ScenePathBudget {
  frame: number;
  used: number;
}

const pathBudgets = new WeakMap<Phaser.Scene, ScenePathBudget>();
const NEIGHBORS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function nodeKey(x: number, y: number): number {
  return ((y & 0xffff) << 16) | (x & 0xffff);
}

function claimPathBudget(scene: Phaser.Scene): boolean {
  const frame = scene.game.loop.frame;
  let budget = pathBudgets.get(scene);
  if (!budget) {
    budget = { frame, used: 0 };
    pathBudgets.set(scene, budget);
  }
  if (budget.frame !== frame) {
    budget.frame = frame;
    budget.used = 0;
  }
  const limit = PerformanceProfile.get(scene.game).isLowPerformance ? 1 : 2;
  if (budget.used >= limit) return false;
  budget.used += 1;
  return true;
}

class PathNodeHeap {
  private readonly values: PathNode[] = [];

  public get length(): number {
    return this.values.length;
  }

  public push(value: PathNode): void {
    const values = this.values;
    values.push(value);
    let index = values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      const parentValue = values[parent];
      if (!parentValue || parentValue.f <= value.f) break;
      values[index] = parentValue;
      index = parent;
    }
    values[index] = value;
  }

  public pop(): PathNode | null {
    const values = this.values;
    const root = values[0] ?? null;
    const tail = values.pop();
    if (!root || !tail || values.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= values.length) break;
      let smallest = left;
      if (right < values.length && (values[right]?.f ?? Infinity) < (values[left]?.f ?? Infinity)) smallest = right;
      const child = values[smallest];
      if (!child || child.f >= tail.f) break;
      values[index] = child;
      index = smallest;
    }
    values[index] = tail;
    return root;
  }
}

/** Integer movement, local wall sliding, and budgeted compact 16 px A* pathfinding. */
export class EnemyNavigation {
  private readonly path: Phaser.Math.Vector2[] = [];
  private readonly desired = new Phaser.Math.Vector2();
  private readonly perpendicular = new Phaser.Math.Vector2();
  private readonly desiredBounds = new Phaser.Geom.Rectangle();
  private readonly xBounds = new Phaser.Geom.Rectangle();
  private readonly yBounds = new Phaser.Geom.Rectangle();
  private pathIndex = 0;
  private nextPathAt = 0;
  private lastGoalX = Number.NaN;
  private lastGoalY = Number.NaN;

  public constructor(
    private readonly sprite: Phaser.Physics.Arcade.Sprite,
    private readonly movement: EnemyMovementDefinition,
    private readonly environment: EnemyNavigationEnvironment,
  ) {
    this.nextPathAt = (Math.abs(Math.round(sprite.x * 13 + sprite.y * 7)) % Math.max(80, movement.pathRefreshMs));
  }

  public get currentPath(): readonly Phaser.Math.Vector2[] {
    return this.path;
  }

  public stop(): void {
    this.sprite.setVelocity(0, 0);
  }

  public moveToward(target: Phaser.Math.Vector2, speed: number, time: number, delta: number): void {
    if (this.movement.mode === 'stationary') {
      this.stop();
      return;
    }
    if (this.movement.mode === 'pathfinding') {
      const goalX = Math.floor(target.x / 16);
      const goalY = Math.floor(target.y / 16);
      const goalChanged = goalX !== this.lastGoalX || goalY !== this.lastGoalY;
      const needsPath = this.path.length === 0 || this.pathIndex >= this.path.length;
      if ((needsPath || (goalChanged && time >= this.nextPathAt)) && time >= this.nextPathAt) {
        if (claimPathBudget(this.sprite.scene)) {
          const started = performance.now();
          this.rebuildPath(target, goalX, goalY);
          PerformanceMonitor.get(this.sprite.scene.game).recordPathfinding(performance.now() - started);
          this.lastGoalX = goalX;
          this.lastGoalY = goalY;
          this.nextPathAt = time + this.movement.pathRefreshMs;
        } else {
          this.nextPathAt = time + 50;
          PerformanceMonitor.get(this.sprite.scene.game).recordPathfinding(0, true);
        }
      }
      const waypoint = this.path[this.pathIndex] ?? target;
      const dx = this.sprite.x - waypoint.x;
      const dy = this.sprite.y - waypoint.y;
      if (dx * dx + dy * dy <= 64) this.pathIndex = Math.min(this.pathIndex + 1, this.path.length);
      this.applyDesiredVelocity(this.path[this.pathIndex] ?? target, speed, delta);
      return;
    }
    if (this.path.length > 0) {
      this.path.length = 0;
      this.pathIndex = 0;
    }
    this.applyDesiredVelocity(target, speed, delta);
  }

  public moveAwayFrom(target: Phaser.Math.Vector2, speed: number, delta: number): void {
    this.desired.set(this.sprite.x - target.x, this.sprite.y - target.y);
    if (this.desired.lengthSq() <= 0.001) this.desired.set(0, 1);
    this.desired.normalize().scale(48).add(new Phaser.Math.Vector2(this.sprite.x, this.sprite.y));
    this.applyDesiredVelocity(this.desired, speed, delta);
  }

  public jumpToward(target: Phaser.Math.Vector2, distance: number, durationMs: number): Phaser.Tweens.Tween {
    this.stop();
    this.desired.set(target.x - this.sprite.x, target.y - this.sprite.y);
    if (this.desired.lengthSq() <= 0.001) this.desired.set(0, 1);
    this.desired.normalize().scale(distance);
    const destination = this.findClearDestination(this.sprite.x + this.desired.x, this.sprite.y + this.desired.y);
    return this.sprite.scene.tweens.add({
      targets: this.sprite,
      x: Math.round(destination.x),
      y: Math.round(destination.y),
      scaleX: 1.08,
      scaleY: 0.92,
      duration: durationMs,
      ease: 'Quad.Out',
      onUpdate: () => this.sprite.setPosition(Math.round(this.sprite.x), Math.round(this.sprite.y)),
      onComplete: () => this.sprite.setScale(1),
    });
  }

  private applyDesiredVelocity(target: Phaser.Math.Vector2, speed: number, delta: number): void {
    const desired = this.desired.set(target.x - this.sprite.x, target.y - this.sprite.y);
    if (desired.lengthSq() <= 1) {
      this.stop();
      return;
    }
    desired.normalize().scale(speed);
    const movementScale = delta / 1000;
    const bodyWidth = Math.max(8, this.sprite.body.width);
    const bodyHeight = Math.max(8, this.sprite.body.height);
    this.desiredBounds.setTo(this.sprite.x + desired.x * movementScale - bodyWidth / 2, this.sprite.y + desired.y * movementScale - bodyHeight / 2, bodyWidth, bodyHeight);

    const ignoresWalls = this.movement.mode === 'flying' || this.movement.mode === 'burrowing';
    const waterAllowed = this.movement.mode !== 'swimming' || this.environment.isWaterAt(this.desiredBounds.centerX, this.desiredBounds.centerY);
    if (ignoresWalls || (!this.environment.isBlocked(this.desiredBounds) && waterAllowed)) {
      this.approachVelocity(desired.x, desired.y, delta);
      return;
    }

    this.xBounds.setTo(this.desiredBounds.x, this.sprite.y - bodyHeight / 2, bodyWidth, bodyHeight);
    this.yBounds.setTo(this.sprite.x - bodyWidth / 2, this.desiredBounds.y, bodyWidth, bodyHeight);
    const canX = !this.environment.isBlocked(this.xBounds) && (this.movement.mode !== 'swimming' || this.environment.isWaterAt(this.xBounds.centerX, this.xBounds.centerY));
    const canY = !this.environment.isBlocked(this.yBounds) && (this.movement.mode !== 'swimming' || this.environment.isWaterAt(this.yBounds.centerX, this.yBounds.centerY));
    if (canX) this.approachVelocity(desired.x, 0, delta);
    else if (canY) this.approachVelocity(0, desired.y, delta);
    else {
      const perpendicular = this.perpendicular.set(-desired.y, desired.x).normalize().scale(speed);
      this.desiredBounds.setTo(this.sprite.x + perpendicular.x * movementScale - bodyWidth / 2, this.sprite.y + perpendicular.y * movementScale - bodyHeight / 2, bodyWidth, bodyHeight);
      if (!this.environment.isBlocked(this.desiredBounds)) this.approachVelocity(perpendicular.x, perpendicular.y, delta);
      else this.approachVelocity(-perpendicular.x, -perpendicular.y, delta);
    }
  }

  private approachVelocity(targetX: number, targetY: number, delta: number): void {
    const maxDelta = (this.movement.acceleration * delta) / 1000;
    const approach = (current: number, target: number): number => {
      if (current < target) return Math.min(target, current + maxDelta);
      if (current > target) return Math.max(target, current - maxDelta);
      return target;
    };
    this.sprite.setVelocity(
      Math.round(approach(this.sprite.body.velocity.x, targetX)),
      Math.round(approach(this.sprite.body.velocity.y, targetY)),
    );
  }

  private findClearDestination(x: number, y: number): Phaser.Math.Vector2 {
    this.desiredBounds.setTo(x - this.sprite.body.width / 2, y - this.sprite.body.height / 2, this.sprite.body.width, this.sprite.body.height);
    if (!this.environment.isBlocked(this.desiredBounds)) return new Phaser.Math.Vector2(x, y);
    return new Phaser.Math.Vector2(this.sprite.x, this.sprite.y);
  }

  private rebuildPath(target: Phaser.Math.Vector2, goalX: number, goalY: number): void {
    const tileSize = 16;
    const startX = Math.floor(this.sprite.x / tileSize);
    const startY = Math.floor(this.sprite.y / tileSize);
    const open = new PathNodeHeap();
    open.push({ x: startX, y: startY, g: 0, f: 0, parent: null });
    const best = new Map<number, number>([[nodeKey(startX, startY), 0]]);
    const blocked = new Map<number, boolean>();
    const bounds = new Phaser.Geom.Rectangle(0, 0, 12, 12);
    let found: PathNode | null = null;
    let iterations = 0;
    while (open.length > 0 && iterations < 240) {
      iterations += 1;
      const current = open.pop();
      if (!current) break;
      if (current.x === goalX && current.y === goalY) {
        found = current;
        break;
      }
      for (const [dx, dy] of NEIGHBORS) {
        const x = current.x + dx;
        const y = current.y + dy;
        const key = nodeKey(x, y);
        const centerX = x * tileSize + tileSize / 2;
        const centerY = y * tileSize + tileSize / 2;
        let tileBlocked = blocked.get(key);
        if (tileBlocked === undefined) {
          bounds.setTo(centerX - 6, centerY - 6, 12, 12);
          tileBlocked = this.environment.isBlocked(bounds)
            || (this.movement.mode === 'swimming' && !this.environment.isWaterAt(centerX, centerY));
          blocked.set(key, tileBlocked);
        }
        if (tileBlocked) continue;
        const g = current.g + 1;
        if ((best.get(key) ?? Number.POSITIVE_INFINITY) <= g) continue;
        best.set(key, g);
        const h = Math.abs(goalX - x) + Math.abs(goalY - y);
        open.push({ x, y, g, f: g + h, parent: current });
      }
    }
    this.path.length = 0;
    this.pathIndex = 0;
    let node = found;
    while (node?.parent) {
      this.path.unshift(new Phaser.Math.Vector2(node.x * tileSize + tileSize / 2, node.y * tileSize + tileSize / 2));
      node = node.parent;
    }
    if (this.path.length > 14) this.path.length = 14;
  }
}
