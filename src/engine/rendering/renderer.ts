// Main renderer - orchestrates render passes

import { GPUContext } from '../core/device';
import { GridState } from '../grid/grid';
import {
  RenderTargetPool,
  GridRenderer,
  BloomPass,
  TrailPass,
  CompositePass,
} from './passes';

export class Renderer {
  private device: GPUDevice;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;

  // Render passes
  private gridRenderer: GridRenderer;
  private gridBloom: BloomPass;
  private entityBloom: BloomPass;
  private hudBloom: BloomPass;
  private menuBloom: BloomPass;  // Higher threshold bloom for menu
  private trailPass: TrailPass;
  private compositePass: CompositePass;

  // Render targets
  private targets: RenderTargetPool;

  // State
  private width = 0;
  private height = 0;

  // Grid color animation
  private gridColorCurrent: [number, number, number] = [0.2, 0.45, 1.2];
  private gridColorTarget: [number, number, number] = [0.2, 0.45, 1.2];
  private readonly GRID_COLOR_LERP_SPEED = 2.0; // transitions per second

  // Scene fade (for game over)
  private sceneFadeCurrent = 1.0;
  private sceneFadeTarget = 1.0;
  private readonly SCENE_FADE_SPEED = 1.5; // fade transitions per second

  // Expose for sprite rendering
  get sceneTarget(): GPUTextureView { return this.targets.get('scene').view; }
  get trailTarget(): GPUTextureView {
    return this.trailPass.getCurrentTarget([
      this.targets.get('trailA').view,
      this.targets.get('trailB').view,
    ]);
  }
  get gpuDevice(): GPUDevice { return this.device; }
  get screenWidth(): number { return this.width; }
  get screenHeight(): number { return this.height; }

  setGridColor(color: [number, number, number]): void {
    this.gridColorTarget = color;
  }

  setSceneFade(fade: number): void {
    this.sceneFadeTarget = Math.max(0, Math.min(1, fade));
  }

  private updateGridColor(dt: number): void {
    const t = Math.min(1, dt * this.GRID_COLOR_LERP_SPEED);
    this.gridColorCurrent[0] += (this.gridColorTarget[0] - this.gridColorCurrent[0]) * t;
    this.gridColorCurrent[1] += (this.gridColorTarget[1] - this.gridColorCurrent[1]) * t;
    this.gridColorCurrent[2] += (this.gridColorTarget[2] - this.gridColorCurrent[2]) * t;

    // Update scene fade
    const fadeT = Math.min(1, dt * this.SCENE_FADE_SPEED);
    this.sceneFadeCurrent += (this.sceneFadeTarget - this.sceneFadeCurrent) * fadeT;
  }

  getSceneFade(): number {
    return this.sceneFadeCurrent;
  }

  constructor(gpuContext: GPUContext) {
    this.device = gpuContext.device;
    this.context = gpuContext.context;
    this.format = gpuContext.format;

    // Initialize render targets
    this.targets = new RenderTargetPool(this.device, 'rgba16float');

    // Initialize render passes
    this.gridRenderer = new GridRenderer(this.device);

    this.gridBloom = new BloomPass(this.device, {
      threshold: 0.0,
      spread: 8.0,
      iterations: 4,
    });

    this.entityBloom = new BloomPass(this.device, {
      threshold: 0.0,
      spread: 4.0,
      iterations: 3,
    });

    this.hudBloom = new BloomPass(this.device, {
      threshold: 0.0,
      spread: 6.0,
      iterations: 3,
    });

    // Menu bloom - higher threshold so only bright parts bloom
    this.menuBloom = new BloomPass(this.device, {
      threshold: 0.5,  // Only bloom colors > 0.5 brightness
      spread: 8.0,
      iterations: 4,
    });

    this.trailPass = new TrailPass(this.device, {
      fadeAmount: 0.15,
      bloomIntensity: 1.5,
    });

    this.compositePass = new CompositePass(this.device, this.format);
  }

  private ensureTextureSize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));

    if (this.width === width && this.height === height) return;

    this.width = width;
    this.height = height;

    this.targets.resize(width, height);
    this.trailPass.reset();
  }

  updateGridVertices(grid: GridState): void {
    this.gridRenderer.updateVertices(grid);
  }

  render(
    grid: GridState,
    dt: number,
    time: number,
    cameraX: number,
    cameraY: number,
    zoom: number,
    worldWidth: number,
    worldHeight: number,
    renderSprites?: (encoder: GPUCommandEncoder, target: GPUTextureView) => void,
    renderHUD?: (encoder: GPUCommandEncoder, target: GPUTextureView) => void,
    gridDrawProgress: number = 1.0,  // For grid draw-in animation
    skipHUDBloom: boolean = false,   // Skip bloom for menu rendering
    renderOnGrid?: (encoder: GPUCommandEncoder, target: GPUTextureView) => void  // Render directly on scene after grid
  ): void {
    const canvas = this.context.canvas as HTMLCanvasElement;
    this.ensureTextureSize(canvas.width, canvas.height);

    // Update grid color interpolation
    this.updateGridColor(dt);

    // Update grid vertices
    this.gridRenderer.updateVertices(grid);

    const encoder = this.device.createCommandEncoder();

    // Get render targets
    const scene = this.targets.get('scene').view;
    const bloomA = this.targets.get('bloomA').view;
    const bloomB = this.targets.get('bloomB').view;
    const bloomC = this.targets.get('bloomC').view;
    const trailA = this.targets.get('trailA').view;
    const trailB = this.targets.get('trailB').view;
    const hud = this.targets.get('hud').view;

    // ============================================
    // 1. GRID: Render grid to scene
    // ============================================
    // Apply scene fade to grid color
    const fadedGridColor: [number, number, number] = [
      this.gridColorCurrent[0] * this.sceneFadeCurrent,
      this.gridColorCurrent[1] * this.sceneFadeCurrent,
      this.gridColorCurrent[2] * this.sceneFadeCurrent,
    ];
    this.gridRenderer.render(
      encoder, scene,
      worldWidth, worldHeight,
      time, zoom, cameraX, cameraY,
      fadedGridColor,
      true, // clear target
      gridDrawProgress
    );

    // ============================================
    // 1b. RENDER ON GRID: Opaque elements that sit on top of grid
    // ============================================
    if (renderOnGrid) {
      renderOnGrid(encoder, scene);
    }

    // ============================================
    // MENU MODE: Use higher-threshold bloom when skipHUDBloom is true
    // ============================================
    if (skipHUDBloom) {
      // Render menu directly to scene
      if (renderSprites) {
        renderSprites(encoder, scene);
      }
      if (renderHUD) {
        renderHUD(encoder, scene);
      }

      // Apply menu bloom (higher threshold - only blooms bright parts)
      const menuBloomResult = this.menuBloom.render(encoder, scene, [bloomA, bloomB]);

      // Final composite with menu bloom
      this.compositePass.render(
        encoder,
        scene,
        menuBloomResult,
        this.context.getCurrentTexture().createView()
      );

      this.device.queue.submit([encoder.finish()]);
      return;
    }

    // ============================================
    // 2. GRID BLOOM: Apply bloom to grid only
    // ============================================
    const gridBloomResult = this.gridBloom.render(encoder, scene, [bloomA, bloomB]);

    // ============================================
    // 3. ENTITY TRAIL + BLOOM
    // ============================================
    if (renderSprites) {
      // Fade previous trail
      const currentTrail = this.trailPass.fade(
        encoder,
        [trailA, trailB],
        cameraX, cameraY,
        zoom, worldWidth, worldHeight
      );

      // Render sprites to trail
      renderSprites(encoder, currentTrail);

      // Apply entity bloom (use bloomB/C since bloomA has grid bloom)
      const entityBloomResult = this.entityBloom.render(encoder, currentTrail, [bloomB, bloomC]);

      // Composite trail onto scene
      this.trailPass.composite(encoder, currentTrail, scene);

      // Composite entity bloom onto scene
      this.trailPass.compositeBloom(encoder, entityBloomResult, scene);

      // Swap trail buffers
      this.trailPass.swapBuffers();
    }

    // ============================================
    // 4. HUD: Render to own target + bloom, then composite
    // ============================================
    if (renderHUD) {
      // Render HUD to dedicated target
      renderHUD(encoder, hud);

      // Composite HUD onto scene
      this.trailPass.composite(encoder, hud, scene);

      // Apply bloom to HUD
      const hudBloomResult = this.hudBloom.render(encoder, hud, [bloomB, bloomC]);
      // Composite HUD bloom onto scene
      this.trailPass.compositeBloom(encoder, hudBloomResult, scene);
    }

    // ============================================
    // 5. FINAL COMPOSITE: scene + grid bloom -> screen (with CRT)
    // ============================================
    this.compositePass.render(
      encoder,
      scene,
      gridBloomResult,
      this.context.getCurrentTexture().createView()
    );

    this.device.queue.submit([encoder.finish()]);
  }
}
