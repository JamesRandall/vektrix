import type { SceneContext } from './SceneContext';

// Forward declaration to avoid circular dependency
export interface ISceneManager {
  setScene(scene: Scene): void;
  getContext(): SceneContext;
}

/**
 * Base interface for all game scenes
 */
export interface Scene {
  /** Update scene logic */
  update(dt: number, time: number): void;

  /** Render scene */
  render(): void;

  /** Called when scene becomes active */
  onEnter?(): void;

  /** Called when leaving scene */
  onExit?(): void;
}

/**
 * Base class providing common scene functionality
 */
export abstract class BaseScene implements Scene {
  protected ctx: SceneContext;
  protected sceneManager: ISceneManager;

  constructor(ctx: SceneContext, sceneManager: ISceneManager) {
    this.ctx = ctx;
    this.sceneManager = sceneManager;
  }

  abstract update(dt: number, time: number): void;
  abstract render(): void;

  onEnter?(): void;
  onExit?(): void;
}
