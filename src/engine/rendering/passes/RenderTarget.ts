// Manages GPU textures for render passes

export interface RenderTargetConfig {
  width: number;
  height: number;
  format: GPUTextureFormat;
  label?: string;
}

export class RenderTarget {
  private device: GPUDevice;
  private texture: GPUTexture | null = null;
  private _view: GPUTextureView | null = null;
  private config: RenderTargetConfig;

  get view(): GPUTextureView {
    if (!this._view) throw new Error('RenderTarget not initialized');
    return this._view;
  }

  get width(): number { return this.config.width; }
  get height(): number { return this.config.height; }

  constructor(device: GPUDevice, config: RenderTargetConfig) {
    this.device = device;
    this.config = config;
    this.create();
  }

  private create(): void {
    this.texture = this.device.createTexture({
      size: { width: this.config.width, height: this.config.height },
      format: this.config.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      label: this.config.label,
    });
    this._view = this.texture.createView();
  }

  resize(width: number, height: number): void {
    if (this.config.width === width && this.config.height === height) return;

    this.config.width = Math.max(1, Math.floor(width));
    this.config.height = Math.max(1, Math.floor(height));

    this.destroy();
    this.create();
  }

  destroy(): void {
    this.texture?.destroy();
    this.texture = null;
    this._view = null;
  }
}

// Pool of render targets for ping-pong effects
export class RenderTargetPool {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private targets: Map<string, RenderTarget> = new Map();
  private width = 0;
  private height = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat = 'rgba16float') {
    this.device = device;
    this.format = format;
  }

  get(name: string): RenderTarget {
    let target = this.targets.get(name);
    if (!target) {
      target = new RenderTarget(this.device, {
        width: Math.max(1, this.width),
        height: Math.max(1, this.height),
        format: this.format,
        label: name,
      });
      this.targets.set(name, target);
    }
    return target;
  }

  resize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));

    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;

    for (const target of this.targets.values()) {
      target.resize(width, height);
    }
  }

  destroy(): void {
    for (const target of this.targets.values()) {
      target.destroy();
    }
    this.targets.clear();
  }
}
