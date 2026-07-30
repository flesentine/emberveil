import Phaser from 'phaser';
import { PerformanceMonitor } from './PerformanceMonitor';
import { MobileSettingsService } from '../platform/MobileSettingsService';

export class PerformanceOverlay {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;
  private visible = false;
  private nextRefreshAt = 0;

  public constructor(private readonly scene: Phaser.Scene) {
    this.visible = MobileSettingsService.get().performanceOverlay || new URLSearchParams(window.location.search).get('perf') === '1';
    this.panel = scene.add.graphics().setScrollFactor(0).setDepth(50_000).setVisible(this.visible);
    this.text = scene.add.text(4, 4, '', {
      fontFamily: 'monospace',
      fontSize: '6px',
      color: '#dff7ff',
      lineSpacing: 1,
    }).setScrollFactor(0).setDepth(50_001).setVisible(this.visible);
  }

  public toggle(): void {
    this.visible = !this.visible;
    this.panel.setVisible(this.visible);
    this.text.setVisible(this.visible);
    MobileSettingsService.update((settings) => { settings.performanceOverlay = this.visible; });
  }

  public update(time: number): void {
    if (!this.visible || time < this.nextRefreshAt) return;
    this.nextRefreshAt = time + 250;
    const s = PerformanceMonitor.get(this.scene.game).getSnapshot();
    const gpu = s.gpuTimingSupported ? (s.gpuMilliseconds === null ? 'pending' : `${s.gpuMilliseconds.toFixed(2)}ms`) : 'n/a';
    const heap = s.heapMegabytes === null ? 'n/a' : `${s.heapMegabytes.toFixed(1)}MB`;
    this.text.setText([
      `PERF ${s.fps.toFixed(0)} FPS  FRAME ${s.frameMilliseconds.toFixed(2)}ms`,
      `CPU ${s.updateMilliseconds.toFixed(2)}ms  GPU ${gpu}  HEAP ${heap}`,
      `DRAW~ ${s.estimatedDrawCalls}  TEX~ ${s.estimatedTextureSwitches}  OBJ ${s.displayObjects}`,
      `BODIES ${s.activePhysicsBodies}  ENTITY ${s.activeEntities}/${s.sleepingEntities} sleep`,
      `PATH ${s.pathRequestsPerSecond.toFixed(1)}/s ${s.pathMillisecondsPerSecond.toFixed(2)}ms  DEFER ${s.deferredPathRequestsPerSecond.toFixed(1)}`,
      `FX ${s.particles}  AUDIO ${s.audioInstances}  GC~ ${s.suspectedGcPauses}`,
      `NET ↓${Math.round(s.networkInboundBytesPerSecond)} ↑${Math.round(s.networkOutboundBytesPerSecond)} B/s`,
      `LOAD MAP ${s.mapLoadMilliseconds.toFixed(1)}ms  SAVE ${s.saveLoadMilliseconds.toFixed(1)}ms`,
      `F3 hide · ~ values are renderer-safe estimates`,
    ]);
    const bounds = this.text.getBounds();
    this.panel.clear().fillStyle(0x081014, 0.9).fillRoundedRect(2, 2, Math.ceil(bounds.width + 6), Math.ceil(bounds.height + 5), 2).lineStyle(1, 0x67bdd0, 0.9).strokeRoundedRect(2, 2, Math.ceil(bounds.width + 6), Math.ceil(bounds.height + 5), 2);
  }

  public destroy(): void {
    this.panel.destroy();
    this.text.destroy();
  }
}
