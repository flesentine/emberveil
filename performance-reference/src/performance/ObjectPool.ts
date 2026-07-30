export interface ObjectPoolOptions<T> {
  readonly create: () => T;
  readonly reset?: (value: T) => void;
  readonly dispose?: (value: T) => void;
  readonly maxRetained?: number;
}

/** Small bounded pool for objects that are created frequently during gameplay. */
export class ObjectPool<T> {
  private readonly available: T[] = [];
  private readonly leased = new Set<T>();
  private readonly maxRetained: number;

  public constructor(private readonly options: ObjectPoolOptions<T>) {
    this.maxRetained = Math.max(0, Math.floor(options.maxRetained ?? 64));
  }

  public acquire(): T {
    const value = this.available.pop() ?? this.options.create();
    this.leased.add(value);
    return value;
  }

  public release(value: T): void {
    if (!this.leased.delete(value)) return;
    this.options.reset?.(value);
    if (this.available.length < this.maxRetained) this.available.push(value);
    else this.options.dispose?.(value);
  }

  public releaseAll(): void {
    for (const value of [...this.leased]) this.release(value);
  }

  public destroy(): void {
    for (const value of this.leased) this.options.dispose?.(value);
    for (const value of this.available) this.options.dispose?.(value);
    this.leased.clear();
    this.available.length = 0;
  }

  public get activeCount(): number {
    return this.leased.size;
  }

  public get retainedCount(): number {
    return this.available.length;
  }
}
