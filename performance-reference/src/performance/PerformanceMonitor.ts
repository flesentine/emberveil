import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';

interface MemoryPerformance extends Performance {
  memory?: { readonly usedJSHeapSize: number; readonly jsHeapSizeLimit: number };
}

interface GpuTimerResult {
  readonly supported: boolean;
  readonly milliseconds: number | null;
}

interface MutableCounters {
  activeEntities: number;
  sleepingEntities: number;
  particles: number;
  pathRequests: number;
  pathDeferred: number;
  pathMilliseconds: number;
  networkInbound: number;
  networkOutbound: number;
  mapLoadMilliseconds: number;
  saveLoadMilliseconds: number;
}

export interface PerformanceRuntimeSnapshot {
  readonly fps: number;
  readonly frameMilliseconds: number;
  readonly updateMilliseconds: number;
  readonly gpuMilliseconds: number | null;
  readonly gpuTimingSupported: boolean;
  readonly heapMegabytes: number | null;
  readonly displayObjects: number;
  readonly estimatedDrawCalls: number;
  readonly estimatedTextureSwitches: number;
  readonly activePhysicsBodies: number;
  readonly activeEntities: number;
  readonly sleepingEntities: number;
  readonly particles: number;
  readonly audioInstances: number;
  readonly pathRequestsPerSecond: number;
  readonly deferredPathRequestsPerSecond: number;
  readonly pathMillisecondsPerSecond: number;
  readonly networkInboundBytesPerSecond: number;
  readonly networkOutboundBytesPerSecond: number;
  readonly mapLoadMilliseconds: number;
  readonly saveLoadMilliseconds: number;
  readonly suspectedGcPauses: number;
}

const instances = new WeakMap<Phaser.Game, PerformanceMonitor>();

class GpuFrameTimer {
  private readonly gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  private readonly extension: any;
  private pending: any = null;
  private active: any = null;
  private lastMilliseconds: number | null = null;

  public constructor(game: Phaser.Game) {
    const renderer = game.renderer as unknown as { gl?: WebGLRenderingContext | WebGL2RenderingContext };
    this.gl = renderer.gl ?? null;
    this.extension = this.gl?.getExtension('EXT_disjoint_timer_query_webgl2')
      ?? this.gl?.getExtension('EXT_disjoint_timer_query')
      ?? null;
  }

  public begin(): void {
    if (!this.gl || !this.extension || this.active || this.pending) return;
    try {
      if ('createQuery' in this.gl) {
        const gl2 = this.gl as WebGL2RenderingContext;
        this.active = gl2.createQuery();
        gl2.beginQuery(this.extension.TIME_ELAPSED_EXT, this.active);
      } else {
        this.active = this.extension.createQueryEXT();
        this.extension.beginQueryEXT(this.extension.TIME_ELAPSED_EXT, this.active);
      }
    } catch {
      this.active = null;
    }
  }

  public end(): void {
    if (!this.gl || !this.extension || !this.active) return;
    try {
      if ('endQuery' in this.gl) (this.gl as WebGL2RenderingContext).endQuery(this.extension.TIME_ELAPSED_EXT);
      else this.extension.endQueryEXT(this.extension.TIME_ELAPSED_EXT);
      this.pending = this.active;
      this.active = null;
    } catch {
      this.active = null;
    }
  }

  public poll(): GpuTimerResult {
    if (!this.gl || !this.extension) return { supported: false, milliseconds: null };
    if (!this.pending) return { supported: true, milliseconds: this.lastMilliseconds };
    try {
      const available = 'getQueryParameter' in this.gl
        ? (this.gl as WebGL2RenderingContext).getQueryParameter(this.pending, (this.gl as WebGL2RenderingContext).QUERY_RESULT_AVAILABLE)
        : this.extension.getQueryObjectEXT(this.pending, this.extension.QUERY_RESULT_AVAILABLE_EXT);
      const disjoint = this.gl.getParameter(this.extension.GPU_DISJOINT_EXT);
      if (available && !disjoint) {
        const nanoseconds = 'getQueryParameter' in this.gl
          ? (this.gl as WebGL2RenderingContext).getQueryParameter(this.pending, (this.gl as WebGL2RenderingContext).QUERY_RESULT)
          : this.extension.getQueryObjectEXT(this.pending, this.extension.QUERY_RESULT_EXT);
        this.lastMilliseconds = Number(nanoseconds) / 1_000_000;
        if ('deleteQuery' in this.gl) (this.gl as WebGL2RenderingContext).deleteQuery(this.pending);
        else this.extension.deleteQueryEXT(this.pending);
        this.pending = null;
      }
    } catch {
      this.pending = null;
    }
    return { supported: true, milliseconds: this.lastMilliseconds };
  }
}

export class PerformanceMonitor {
  public static get(game: Phaser.Game): PerformanceMonitor {
    let instance = instances.get(game);
    if (!instance) {
      instance = new PerformanceMonitor(game);
      instances.set(game, instance);
    }
    return instance;
  }

  private readonly gpuTimer: GpuFrameTimer;
  private readonly frameSamples = new Float32Array(120);
  private frameSampleIndex = 0;
  private frameSampleCount = 0;
  private updateStartedAt = 0;
  private updateMilliseconds = 0;
  private frameMilliseconds = 16.67;
  private fps = 60;
  private lastFrameAt = performance.now();
  private lastSecondAt = performance.now();
  private lastHeap: number | null = null;
  private suspectedGcPauses = 0;
  private displayObjects = 0;
  private estimatedDrawCalls = 0;
  private estimatedTextureSwitches = 0;
  private activePhysicsBodies = 0;
  private audioInstances = 0;
  private readonly counters: MutableCounters = {
    activeEntities: 0,
    sleepingEntities: 0,
    particles: 0,
    pathRequests: 0,
    pathDeferred: 0,
    pathMilliseconds: 0,
    networkInbound: 0,
    networkOutbound: 0,
    mapLoadMilliseconds: 0,
    saveLoadMilliseconds: 0,
  };
  private rates = { path: 0, deferred: 0, pathMs: 0, inbound: 0, outbound: 0 };
  private attachedScene: Phaser.Scene | null = null;

  private constructor(private readonly game: Phaser.Game) {
    this.gpuTimer = new GpuFrameTimer(game);
    game.events.on('prerender', this.gpuTimer.begin, this.gpuTimer);
    game.events.on('postrender', this.gpuTimer.end, this.gpuTimer);
    game.events.once('destroy', this.destroy, this);
  }

  public attachScene(scene: Phaser.Scene): void {
    if (this.attachedScene === scene) return;
    this.detachScene();
    this.attachedScene = scene;
    scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, this.beginUpdate, this);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.endUpdate, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.detachScene, this);
  }

  public sample(scene: Phaser.Scene, delta: number): void {
    const now = performance.now();
    const measuredFrame = Math.max(0.01, Math.min(250, delta || now - this.lastFrameAt));
    this.lastFrameAt = now;
    this.frameSamples[this.frameSampleIndex] = measuredFrame;
    this.frameSampleIndex = (this.frameSampleIndex + 1) % this.frameSamples.length;
    this.frameSampleCount = Math.min(this.frameSamples.length, this.frameSampleCount + 1);
    let total = 0;
    for (let index = 0; index < this.frameSampleCount; index += 1) total += this.frameSamples[index] ?? 0;
    this.frameMilliseconds = total / Math.max(1, this.frameSampleCount);
    this.fps = 1000 / Math.max(1, this.frameMilliseconds);

    const memory = (performance as MemoryPerformance).memory;
    if (memory) {
      const heap = memory.usedJSHeapSize;
      if (measuredFrame > 35 && this.lastHeap !== null && heap < this.lastHeap * 0.94) this.suspectedGcPauses += 1;
      this.lastHeap = heap;
    }

    if (now - this.lastSecondAt >= 1000) {
      const elapsed = Math.max(0.25, (now - this.lastSecondAt) / 1000);
      this.rates = {
        path: this.counters.pathRequests / elapsed,
        deferred: this.counters.pathDeferred / elapsed,
        pathMs: this.counters.pathMilliseconds / elapsed,
        inbound: this.counters.networkInbound / elapsed,
        outbound: this.counters.networkOutbound / elapsed,
      };
      this.counters.pathRequests = 0;
      this.counters.pathDeferred = 0;
      this.counters.pathMilliseconds = 0;
      this.counters.networkInbound = 0;
      this.counters.networkOutbound = 0;
      this.lastSecondAt = now;
      this.sampleSceneCounts(scene);
    }
  }

  public setEntityCounts(active: number, sleeping: number): void {
    this.counters.activeEntities = Math.max(0, active);
    this.counters.sleepingEntities = Math.max(0, sleeping);
  }

  public setParticleCount(count: number): void {
    this.counters.particles = Math.max(0, count);
  }

  public recordPathfinding(milliseconds: number, deferred = false): void {
    this.counters.pathRequests += deferred ? 0 : 1;
    this.counters.pathDeferred += deferred ? 1 : 0;
    this.counters.pathMilliseconds += deferred ? 0 : Math.max(0, milliseconds);
  }

  public recordNetwork(inboundBytes: number, outboundBytes: number): void {
    this.counters.networkInbound += Math.max(0, inboundBytes);
    this.counters.networkOutbound += Math.max(0, outboundBytes);
  }

  public recordMapLoad(milliseconds: number): void {
    this.counters.mapLoadMilliseconds = Math.max(0, milliseconds);
  }

  public recordSaveLoad(milliseconds: number): void {
    this.counters.saveLoadMilliseconds = Math.max(0, milliseconds);
  }

  public getSnapshot(): PerformanceRuntimeSnapshot {
    const gpu = this.gpuTimer.poll();
    const memory = (performance as MemoryPerformance).memory;
    return {
      fps: this.fps,
      frameMilliseconds: this.frameMilliseconds,
      updateMilliseconds: this.updateMilliseconds,
      gpuMilliseconds: gpu.milliseconds,
      gpuTimingSupported: gpu.supported,
      heapMegabytes: memory ? memory.usedJSHeapSize / (1024 * 1024) : null,
      displayObjects: this.displayObjects,
      estimatedDrawCalls: this.estimatedDrawCalls,
      estimatedTextureSwitches: this.estimatedTextureSwitches,
      activePhysicsBodies: this.activePhysicsBodies,
      activeEntities: this.counters.activeEntities,
      sleepingEntities: this.counters.sleepingEntities,
      particles: this.counters.particles,
      audioInstances: this.audioInstances,
      pathRequestsPerSecond: this.rates.path,
      deferredPathRequestsPerSecond: this.rates.deferred,
      pathMillisecondsPerSecond: this.rates.pathMs,
      networkInboundBytesPerSecond: this.rates.inbound,
      networkOutboundBytesPerSecond: this.rates.outbound,
      mapLoadMilliseconds: this.counters.mapLoadMilliseconds,
      saveLoadMilliseconds: this.counters.saveLoadMilliseconds,
      suspectedGcPauses: this.suspectedGcPauses,
    };
  }

  private beginUpdate(): void {
    this.updateStartedAt = performance.now();
  }

  private endUpdate(): void {
    if (this.updateStartedAt > 0) this.updateMilliseconds = performance.now() - this.updateStartedAt;
  }

  private sampleSceneCounts(scene: Phaser.Scene): void {
    const children = scene.children.list;
    this.displayObjects = children.filter((child) => {
      const display = child as Phaser.GameObjects.GameObject & { visible?: boolean };
      return display.active && display.visible !== false;
    }).length;
    let textureSwitches = 0;
    let drawCalls = 0;
    let previousTexture = '';
    for (const child of children) {
      const textured = child as Phaser.GameObjects.GameObject & { visible?: boolean; texture?: { key?: string }; type?: string };
      if (!textured.active || textured.visible === false) continue;
      const texture = textured.texture?.key ?? `__${textured.type ?? 'shape'}`;
      if (texture !== previousTexture) {
        textureSwitches += 1;
        drawCalls += 1;
        previousTexture = texture;
      }
    }
    this.estimatedTextureSwitches = textureSwitches;
    this.estimatedDrawCalls = drawCalls;
    const bodies = scene.physics.world.bodies.getArray();
    const staticBodies = scene.physics.world.staticBodies.getArray();
    this.activePhysicsBodies = [...bodies, ...staticBodies].filter((body) => body.enable).length;
    const audio = AudioManager.get(this.game).getDebugSnapshot();
    this.audioInstances = audio.activeInstances;
  }

  private detachScene(): void {
    if (!this.attachedScene) return;
    this.attachedScene.events.off(Phaser.Scenes.Events.PRE_UPDATE, this.beginUpdate, this);
    this.attachedScene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.endUpdate, this);
    this.attachedScene = null;
  }

  private destroy(): void {
    this.detachScene();
    this.game.events.off('prerender', this.gpuTimer.begin, this.gpuTimer);
    this.game.events.off('postrender', this.gpuTimer.end, this.gpuTimer);
    instances.delete(this.game);
  }
}
