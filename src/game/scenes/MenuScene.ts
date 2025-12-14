import { BaseScene, ISceneManager } from './Scene';
import { SceneContext } from './SceneContext';
import { updateInput, mouse, exitPointerLock } from '../../engine/core/input';
import { camera } from '../../engine/core/camera';
import { simulateGrid, applyGridImpulse } from '../../engine/grid/grid';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants';
import { MenuState } from '../gameMenu';
import { GameScene } from './GameScene';

interface MenuWaveState {
  active: boolean;
  timer: number;
  progress: number;
  direction: number;
  speed: number;
}

/**
 * Menu scene - main menu with animated grid background
 */
export class MenuScene extends BaseScene {
  private menuWave: MenuWaveState = {
    active: false,
    timer: 2.0,  // Start first wave after 2 seconds
    progress: 0,
    direction: 0,
    speed: 1.5,  // Wave crosses screen in ~0.67 seconds
  };

  constructor(ctx: SceneContext, sceneManager: ISceneManager) {
    super(ctx, sceneManager);
  }

  onEnter(): void {
    // Exit pointer lock so user can interact with menu
    exitPointerLock();
    // Reset menu wave animation
    this.menuWave = {
      active: false,
      timer: 2.0,
      progress: 0,
      direction: 0,
      speed: 1.5,
    };
  }

  update(dt: number, _time: number): void {
    const { canvas, gameMenu, grid } = this.ctx;

    const menuState = gameMenu.getState();

    // Check if game has started
    if (menuState === MenuState.PLAYING) {
      this.sceneManager.setScene(new GameScene(this.ctx, this.sceneManager));
      return;
    }

    // Update menu
    gameMenu.update(dt, canvas.width, canvas.height);

    // Update wave animation
    this.updateWaveAnimation(dt);

    // Mouse ripples on grid during menu
    this.updateMouseRipples();

    // Simulate grid physics
    simulateGrid(grid, dt);

    updateInput();
  }

  render(): void {
    const { canvas, grid, renderer, gameMenu } = this.ctx;
    const dt = 1 / 60;  // Approximate dt for render
    const time = this.ctx.time;

    // Render full grid + menu
    renderer.render(
      grid, dt, time,
      WORLD_WIDTH / 2, WORLD_HEIGHT / 2, camera.zoom,
      WORLD_WIDTH, WORLD_HEIGHT,
      undefined, // no sprites
      (enc, target) => {
        gameMenu.render(enc, target, canvas.width, canvas.height);
      },
      1.0,  // full grid
      true  // skipHUDBloom - use menu bloom instead
    );
  }

  private updateWaveAnimation(dt: number): void {
    const { grid } = this.ctx;

    if (!this.menuWave.active) {
      this.menuWave.timer -= dt;
      if (this.menuWave.timer <= 0) {
        // Start a new wave from random direction
        this.menuWave.active = true;
        this.menuWave.progress = 0;
        this.menuWave.direction = Math.floor(Math.random() * 8);
        this.menuWave.timer = 2.0 + Math.random() * 2.0; // Next wave in 2-4 seconds
      }
    } else {
      // Animate wave
      this.menuWave.progress += dt * this.menuWave.speed;

      // Apply impulses along the wave front
      const numPoints = 20;
      const waveForce = 400;
      const waveRadius = 80;

      for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1); // 0 to 1 along wave front
        let x = 0, y = 0;

        // Calculate position based on direction and progress
        const p = this.menuWave.progress;
        switch (this.menuWave.direction) {
          case 0: // Bottom-left to top-right
            x = p * WORLD_WIDTH;
            y = WORLD_HEIGHT - t * WORLD_HEIGHT;
            break;
          case 1: // Top-right to bottom-left
            x = WORLD_WIDTH - p * WORLD_WIDTH;
            y = t * WORLD_HEIGHT;
            break;
          case 2: // Top-left to bottom-right
            x = p * WORLD_WIDTH;
            y = t * WORLD_HEIGHT;
            break;
          case 3: // Bottom-right to top-left
            x = WORLD_WIDTH - p * WORLD_WIDTH;
            y = WORLD_HEIGHT - t * WORLD_HEIGHT;
            break;
          case 4: // Left to right
            x = p * WORLD_WIDTH;
            y = t * WORLD_HEIGHT;
            break;
          case 5: // Right to left
            x = WORLD_WIDTH - p * WORLD_WIDTH;
            y = t * WORLD_HEIGHT;
            break;
          case 6: // Top to bottom
            x = t * WORLD_WIDTH;
            y = p * WORLD_HEIGHT;
            break;
          case 7: // Bottom to top
            x = t * WORLD_WIDTH;
            y = WORLD_HEIGHT - p * WORLD_HEIGHT;
            break;
        }

        applyGridImpulse(grid, x, y, waveRadius, waveForce);
      }

      if (this.menuWave.progress >= 1.0) {
        this.menuWave.active = false;
      }
    }
  }

  private updateMouseRipples(): void {
    const { canvas, grid, gameMenu } = this.ctx;

    // Convert screen coords to world coords (accounting for canvas scaling)
    const canvasRect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    const canvasX = mouse.x * scaleX;
    const canvasY = mouse.y * scaleY;

    // Convert to world coordinates (camera centered, zoom 2)
    const worldX = WORLD_WIDTH / 2 + (canvasX - canvas.width / 2) / camera.zoom;
    const worldY = WORLD_HEIGHT / 2 + (canvasY - canvas.height / 2) / camera.zoom;

    if (mouse.x > 0 && mouse.y > 0 && gameMenu.isCursorVisible()) {
      // Intense ripple following mouse movement
      applyGridImpulse(grid, worldX, worldY, 100, 300);
    }
  }
}
