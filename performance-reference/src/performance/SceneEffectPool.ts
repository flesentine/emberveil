import Phaser from 'phaser';
import { ObjectPool } from './ObjectPool';
import { PerformanceMonitor } from './PerformanceMonitor';

const pools = new WeakMap<Phaser.Scene, SceneEffectPool>();

export class SceneEffectPool {
  public static get(scene: Phaser.Scene): SceneEffectPool {
    let pool = pools.get(scene);
    if (!pool) {
      pool = new SceneEffectPool(scene);
      pools.set(scene, pool);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, pool.destroy, pool);
    }
    return pool;
  }

  private readonly rectangles: ObjectPool<Phaser.GameObjects.Rectangle>;
  private readonly circles: ObjectPool<Phaser.GameObjects.Arc>;
  private readonly images: ObjectPool<Phaser.GameObjects.Image>;

  private constructor(private readonly scene: Phaser.Scene) {
    this.rectangles = new ObjectPool({
      create: () => scene.add.rectangle(0, 0, 2, 2, 0xffffff, 1).setVisible(false).setActive(false),
      reset: (value) => value.setVisible(false).setActive(false).setAlpha(1).setScale(1).setRotation(0),
      dispose: (value) => value.destroy(),
      maxRetained: 48,
    });
    this.circles = new ObjectPool({
      create: () => scene.add.circle(0, 0, 4, 0xffffff, 0.15).setVisible(false).setActive(false),
      reset: (value) => value.setVisible(false).setActive(false).setAlpha(1).setScale(1).setRadius(4).setStrokeStyle(0, 0, 0),
      dispose: (value) => value.destroy(),
      maxRetained: 12,
    });
    this.images = new ObjectPool({
      create: () => scene.add.image(0, 0, '__DEFAULT').setVisible(false).setActive(false),
      reset: (value) => value.setVisible(false).setActive(false).clearTint().setAlpha(1).setScale(1).setRotation(0),
      dispose: (value) => value.destroy(),
      maxRetained: 20,
    });
  }

  public acquireRectangle(x: number, y: number, width: number, height: number, color: number, alpha = 1): Phaser.GameObjects.Rectangle {
    const value = this.rectangles.acquire();
    value.setPosition(Math.round(x), Math.round(y)).setSize(width, height).setDisplaySize(width, height).setFillStyle(color, alpha).setAlpha(alpha).setActive(true).setVisible(true);
    this.syncCount();
    return value;
  }

  public releaseRectangle(value: Phaser.GameObjects.Rectangle): void {
    this.scene.tweens.killTweensOf(value);
    this.rectangles.release(value);
    this.syncCount();
  }

  public acquireCircle(x: number, y: number, radius: number, color: number, alpha = 0.16): Phaser.GameObjects.Arc {
    const value = this.circles.acquire();
    value.setPosition(Math.round(x), Math.round(y)).setRadius(radius).setFillStyle(color, alpha).setAlpha(alpha).setActive(true).setVisible(true);
    this.syncCount();
    return value;
  }

  public releaseCircle(value: Phaser.GameObjects.Arc): void {
    this.scene.tweens.killTweensOf(value);
    this.circles.release(value);
    this.syncCount();
  }

  public acquireImage(texture: string, frame: string | number | undefined, x: number, y: number): Phaser.GameObjects.Image {
    const value = this.images.acquire();
    value.setTexture(texture, frame).setPosition(Math.round(x), Math.round(y)).setActive(true).setVisible(true);
    this.syncCount();
    return value;
  }

  public releaseImage(value: Phaser.GameObjects.Image): void {
    this.scene.tweens.killTweensOf(value);
    this.images.release(value);
    this.syncCount();
  }

  public destroy(): void {
    this.rectangles.destroy();
    this.circles.destroy();
    this.images.destroy();
    PerformanceMonitor.get(this.scene.game).setParticleCount(0);
    pools.delete(this.scene);
  }

  private syncCount(): void {
    PerformanceMonitor.get(this.scene.game).setParticleCount(
      this.rectangles.activeCount + this.circles.activeCount + this.images.activeCount,
    );
  }
}
