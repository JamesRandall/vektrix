import { GridState } from '../../engine/grid/grid';
import { Renderer } from '../../engine/rendering/renderer';
import { SpriteRenderer } from '../../engine/rendering/spriteRenderer';
import { BlackHoleRenderer } from '../../engine/rendering/blackHoleRenderer';
import { ParticleSystem } from '../../engine/particles';
import { VectorHUD } from '../vectorHud';
import { HUD } from '../hud';
import { GameMenu } from '../gameMenu';
import { WaveManager } from '../waveManager';
import { ShootingSystem } from '../bullets';
import { MusicPlayer, ProceduralSounds } from '../../engine/audio';

/**
 * GPU context from WebGPU initialization
 */
export interface GPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
}

/**
 * Shared context passed to all scenes
 */
export interface SceneContext {
  // GPU & Rendering
  gpuContext: GPUContext;
  renderer: Renderer;
  spriteRenderer: SpriteRenderer;
  blackHoleRenderer: BlackHoleRenderer;
  particleSystem: ParticleSystem;
  vectorHud: VectorHUD;
  hud: HUD;

  // Game Systems
  grid: GridState;
  gameMenu: GameMenu;
  waveManager: WaveManager;
  shootingSystem: ShootingSystem;

  // Audio
  musicPlayer: MusicPlayer | null;
  proceduralSounds: ProceduralSounds | null;

  // Canvas
  canvas: HTMLCanvasElement;

  // Timing (shared across scenes for continuity)
  time: number;
  loadingAnimTime: number;
}

/**
 * Create a scene context from initialized resources
 */
export function createSceneContext(
  gpuContext: GPUContext,
  renderer: Renderer,
  spriteRenderer: SpriteRenderer,
  blackHoleRenderer: BlackHoleRenderer,
  particleSystem: ParticleSystem,
  vectorHud: VectorHUD,
  hud: HUD,
  grid: GridState,
  gameMenu: GameMenu,
  waveManager: WaveManager,
  shootingSystem: ShootingSystem,
  canvas: HTMLCanvasElement
): SceneContext {
  return {
    gpuContext,
    renderer,
    spriteRenderer,
    blackHoleRenderer,
    particleSystem,
    vectorHud,
    hud,
    grid,
    gameMenu,
    waveManager,
    shootingSystem,
    musicPlayer: null,
    proceduralSounds: null,
    canvas,
    time: 0,
    loadingAnimTime: 0,
  };
}
