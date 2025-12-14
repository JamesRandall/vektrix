import { BaseScene, ISceneManager } from './Scene';
import { SceneContext } from './SceneContext';
import { updateInput } from '../../engine/core/input';
import { camera } from '../../engine/core/camera';
import { updateCameraShake, getShakeOffset } from '../../engine/core/cameraShake';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants';
import { MenuScene } from './MenuScene';

const GRID_DRAW_DURATION = 1.5;  // seconds to draw grid

/**
 * Grid draw-in animation scene - animates the grid appearing
 */
export class GridDrawScene extends BaseScene {
  private gridDrawProgress = 0;

  constructor(ctx: SceneContext, sceneManager: ISceneManager) {
    super(ctx, sceneManager);
  }

  onEnter(): void {
    this.gridDrawProgress = 0;
  }

  update(dt: number, _time: number): void {
    this.gridDrawProgress += dt / GRID_DRAW_DURATION;

    if (this.gridDrawProgress >= 1) {
      this.gridDrawProgress = 1;
      // Transition to menu scene
      this.sceneManager.setScene(new MenuScene(this.ctx, this.sceneManager));
      return;
    }

    updateInput();
  }

  render(): void {
    const { grid, renderer, particleSystem } = this.ctx;
    const dt = 1 / 60;  // Approximate dt for render
    const time = this.ctx.time;

    // Update camera shake
    updateCameraShake(dt);
    const shakeOffset = getShakeOffset();
    const drawInCamX = WORLD_WIDTH / 2 + shakeOffset.x;
    const drawInCamY = WORLD_HEIGHT / 2 + shakeOffset.y;

    // Render grid drawing in with particles
    renderer.render(
      grid, dt, time,
      drawInCamX, drawInCamY, camera.zoom,
      WORLD_WIDTH, WORLD_HEIGHT,
      // Sprite callback - render particles here (HDR target)
      (encoder, hdrTarget) => {
        particleSystem.update(encoder, dt, time);
        particleSystem.render(encoder, hdrTarget, WORLD_WIDTH, WORLD_HEIGHT, drawInCamX, drawInCamY, camera.zoom, time);
      },
      undefined,  // no HUD
      this.gridDrawProgress,
      true,  // skipHUDBloom
      undefined   // no renderOnGrid
    );
  }
}
