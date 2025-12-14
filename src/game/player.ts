import { Entity } from '../engine/ecs/entity';
import { getMovementInput, getAimInput, mouse, gamepad, reticleOffset, pointerLock } from '../engine/core/input';
import { camera } from '../engine/core/camera';
import { applyGridImpulse, GridState } from '../engine/grid/grid';
import { LAYER, SHAPE, sprites } from '../engine/ecs/components';
import { isPlayerAlive, isPlayerInvulnerable } from './gameState';

const PLAYER_SPEED = 600;
const PLAYER_SIZE = 40;

let player: Entity | null = null;
let spawnX = 0;
let spawnY = 0;

export function createPlayer(x: number, y: number): Entity {
  spawnX = x;
  spawnY = y;

  player = Entity.create();

  player.transform.setPosition(x, y);
  player.transform.rotation = 0;
  player.transform.setScale(1);

  player.velocity.set(0, 0);

  player.sprite.setSize(PLAYER_SIZE);
  player.sprite.setTint(0.4, 1.2, 1.5); // Bright cyan (HDR)
  player.sprite.shape = SHAPE.PLAYER_SHIP;

  player.collider.setSize(PLAYER_SIZE / 2);
  player.collider.setLayerMask(LAYER.PLAYER, LAYER.ENEMY);

  return player;
}

export function respawnPlayer(): void {
  if (!player) return;

  player.transform.setPosition(spawnX, spawnY);
  player.velocity.set(0, 0);
}

export function updatePlayer(dt: number, worldWidth: number, worldHeight: number, grid: GridState, time: number): void {
  if (!player) return;

  // Handle visibility when dead or invulnerable
  if (!isPlayerAlive()) {
    // Hide player when dead
    sprites.tintA[player.index] = 0;
    return;
  }

  // Flicker when invulnerable
  if (isPlayerInvulnerable()) {
    const flicker = Math.sin(time * 20) > 0 ? 1 : 0.3;
    sprites.tintA[player.index] = flicker;
  } else {
    sprites.tintA[player.index] = 1;
  }

  const t = player.transform;
  const v = player.velocity;

  const input = getMovementInput();

  // Set velocity based on input
  const targetVx = input.x * PLAYER_SPEED;
  const targetVy = input.y * PLAYER_SPEED;

  // Smooth acceleration (lower = more mass/inertia)
  const accel = 8;
  v.vx += (targetVx - v.vx) * accel * dt;
  v.vy += (targetVy - v.vy) * accel * dt;

  // Integrate position
  t.x += v.vx * dt;
  t.y += v.vy * dt;

  // Face aim direction (right stick or mouse)
  const aimInput = getAimInput();
  if (aimInput) {
    // Gamepad right stick active - aim in that direction
    t.rotation = Math.atan2(aimInput.y, aimInput.x);
  } else if (!gamepad.connected) {
    if (pointerLock.active) {
      // Pointer locked - use reticle offset (already relative to player)
      if (reticleOffset.x !== 0 || reticleOffset.y !== 0) {
        t.rotation = Math.atan2(reticleOffset.y, reticleOffset.x);
      }
    } else {
      // Normal mode - use absolute mouse position
      const worldMouse = camera.screenToWorld(mouse.worldX, mouse.worldY);
      const dx = worldMouse.x - t.x;
      const dy = worldMouse.y - t.y;
      if (dx !== 0 || dy !== 0) {
        t.rotation = Math.atan2(dy, dx);
      }
    }
  }
  // If gamepad connected but stick released, keep current rotation

  // Clamp to world bounds
  const margin = PLAYER_SIZE / 2 + 50;
  t.x = Math.max(margin, Math.min(worldWidth - margin, t.x));
  t.y = Math.max(margin, Math.min(worldHeight - margin, t.y));

  // Apply wake effect to grid based on movement speed
  const speed = v.speed;
  if (speed > 50) {
    applyGridImpulse(grid, t.x, t.y, 80, speed * 0.375);
  }
}

export function getPlayerPosition(): { x: number; y: number } {
  if (!player) return { x: 0, y: 0 };
  return { x: player.transform.x, y: player.transform.y };
}

export function getPlayer(): Entity | null {
  return player;
}

export function getPlayerIndex(): number {
  return player ? player.index : -1;
}

export function getPlayerAimAngle(): number {
  return player ? player.transform.rotation : 0;
}
