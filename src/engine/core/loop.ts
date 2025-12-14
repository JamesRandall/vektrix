export type FrameCallback = (dt: number) => void;

export class GameLoop {
  private lastTime = 0;
  private running = false;
  private frameId = 0;
  private callback: FrameCallback;

  constructor(callback: FrameCallback) {
    this.callback = callback;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.frameId) {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap at 100ms to avoid spiral of death
    this.lastTime = now;

    this.callback(dt);

    this.frameId = requestAnimationFrame(this.tick);
  };
}
