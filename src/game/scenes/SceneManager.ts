import { Scene, ISceneManager } from './Scene';
import { SceneContext } from './SceneContext';

/**
 * Manages scene transitions and lifecycle
 */
export class SceneManager implements ISceneManager {
  private currentScene: Scene | null = null;
  private ctx: SceneContext;

  constructor(ctx: SceneContext) {
    this.ctx = ctx;
  }

  /**
   * Get the current scene context
   */
  getContext(): SceneContext {
    return this.ctx;
  }

  /**
   * Transition to a new scene
   */
  setScene(scene: Scene): void {
    // Exit current scene
    if (this.currentScene?.onExit) {
      this.currentScene.onExit();
    }

    this.currentScene = scene;

    // Enter new scene
    if (this.currentScene?.onEnter) {
      this.currentScene.onEnter();
    }
  }

  /**
   * Update the current scene
   */
  update(dt: number, time: number): void {
    // Update shared timing
    this.ctx.time = time;
    this.ctx.loadingAnimTime += dt;

    if (this.currentScene) {
      this.currentScene.update(dt, time);
    }
  }

  /**
   * Render the current scene
   */
  render(): void {
    if (this.currentScene) {
      this.currentScene.render();
    }
  }

  /**
   * Get the current scene (for debugging)
   */
  getCurrentScene(): Scene | null {
    return this.currentScene;
  }
}
