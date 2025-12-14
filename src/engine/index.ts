// Core
export { initWebGPU, resizeCanvas } from './core/device';
export type { GPUContext } from './core/device';
export { GameLoop } from './core/loop';
export type { FrameCallback } from './core/loop';
export { initInput, pollInput, updateInput, isKeyDown, isKeyPressed, isButtonDown, isButtonPressed, getMovementInput, getAimInput, isShooting, mouse, gamepad, GAMEPAD_BUTTONS } from './core/input';
export { Camera, camera } from './core/camera';

// ECS
export {
  MAX_ENTITIES,
  createEntity,
  destroyEntity,
  isEntityValid,
  getEntityIndex,
  addComponent,
  removeComponent,
  hasComponent,
  componentMask,
  COMP_TRANSFORM,
  COMP_VELOCITY,
  COMP_SPRITE,
  COMP_COLLIDER,
  Entity,
} from './ecs/entity';
export { transforms, velocities, sprites, Transform, Velocity, Sprite } from './ecs/components';

// Grid
export { createGrid, simulateGrid, applyGridImpulse, applyGridLineForce, GRID_COLS, GRID_ROWS, VERTEX_COUNT } from './grid/grid';
export type { GridState } from './grid/grid';

// Rendering
export { Renderer } from './rendering/renderer';
export { SpriteRenderer } from './rendering/spriteRenderer';
