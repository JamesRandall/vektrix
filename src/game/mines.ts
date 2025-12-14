// Mine system - proximity triggered explosives

import { Entity, entities, destroyEntity } from '../engine/ecs/entity';
import { transforms, sprites, LAYER, SHAPE } from '../engine/ecs/components';

// Mine constants (tweakable)
export const MINE_SIZE = 16;                    // Visual size
export const MINE_ACTIVATION_TIME = 1.0;        // Seconds before mine is armed
export const MINE_TRIGGER_RADIUS = 24;          // ~0.5 grid squares
export const MINE_BLAST_RADIUS = 144;           // ~3 grid squares
export const MAX_PLAYER_MINES = 5;              // Total mines player can carry

// Mine state tracking
interface MineState {
  activationTimer: number;  // Time until armed (0 = armed)
  isArmed: boolean;
}

const activeMines = new Map<number, MineState>();
let playerMineCount = MAX_PLAYER_MINES;

export function createMine(x: number, y: number): Entity | null {
  if (playerMineCount <= 0) return null;

  const mine = Entity.create();

  mine.transform.setPosition(x, y);
  mine.transform.rotation = 0;
  mine.transform.setScale(1);

  mine.sprite.setSize(MINE_SIZE, MINE_SIZE);
  mine.sprite.setTint(1.5, 1.5, 0.2); // Bright yellow (HDR)
  mine.sprite.shape = SHAPE.MINE;

  // Mine collider - uses trigger radius for detection
  // Note: actual collision detection is done manually in checkMineProximity
  mine.collider.setSize(MINE_TRIGGER_RADIUS);
  mine.collider.setLayerMask(LAYER.MINE, 0); // No auto-collision, we check manually

  activeMines.set(mine.index, {
    activationTimer: MINE_ACTIVATION_TIME,
    isArmed: false,
  });

  playerMineCount--;

  return mine;
}

export function destroyMine(index: number): void {
  activeMines.delete(index);
  const handle = (entities.generation[index] << 16) | index;
  destroyEntity(handle);
}

export function getActiveMineIndices(): Map<number, MineState> {
  return activeMines;
}

export function getMineCount(): number {
  return activeMines.size;
}

export function getPlayerMineCount(): number {
  return playerMineCount;
}

export function resetPlayerMines(): void {
  playerMineCount = MAX_PLAYER_MINES;
}

export function updateMines(dt: number): void {
  for (const [index, state] of activeMines) {
    // Update activation timer
    if (!state.isArmed) {
      state.activationTimer -= dt;
      if (state.activationTimer <= 0) {
        state.isArmed = true;
        // Visual feedback: brighten when armed
        sprites.tintR[index] = 2.0;
        sprites.tintG[index] = 2.0;
        sprites.tintB[index] = 0.3;
      } else {
        // Pulsing while activating
        const pulse = 0.5 + Math.sin(state.activationTimer * 10) * 0.3;
        sprites.tintA[index] = pulse;
      }
    } else {
      // Armed - full brightness with subtle pulse
      const pulse = 0.9 + Math.sin(Date.now() * 0.01) * 0.1;
      sprites.tintA[index] = pulse;
    }
  }
}

/**
 * Check if any entity is within trigger radius of armed mines
 * Returns array of { mineIndex, triggeredBy } for mines that should explode
 */
export function checkMineProximity(
  entityIndices: Set<number> | number[],
  _playerIndex: number,
  playerX: number,
  playerY: number
): Array<{ mineIndex: number; x: number; y: number }> {
  const triggered: Array<{ mineIndex: number; x: number; y: number }> = [];

  for (const [mineIndex, state] of activeMines) {
    if (!state.isArmed) continue;

    const mineX = transforms.x[mineIndex];
    const mineY = transforms.y[mineIndex];

    // Check player proximity
    const pdx = playerX - mineX;
    const pdy = playerY - mineY;
    const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
    if (playerDist < MINE_TRIGGER_RADIUS) {
      triggered.push({ mineIndex, x: mineX, y: mineY });
      continue;
    }

    // Check enemy proximity
    for (const entityIndex of entityIndices) {
      const ex = transforms.x[entityIndex];
      const ey = transforms.y[entityIndex];
      const dx = ex - mineX;
      const dy = ey - mineY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < MINE_TRIGGER_RADIUS) {
        triggered.push({ mineIndex, x: mineX, y: mineY });
        break; // One trigger per mine
      }
    }
  }

  return triggered;
}

/**
 * Get all entities within blast radius of a position
 */
export function getEntitiesInBlastRadius(
  x: number,
  y: number,
  entityIndices: Set<number> | number[],
  _playerIndex: number,
  playerX: number,
  playerY: number
): { enemies: number[]; playerHit: boolean } {
  const enemies: number[] = [];
  let playerHit = false;

  // Check player
  const pdx = playerX - x;
  const pdy = playerY - y;
  const playerDist = Math.sqrt(pdx * pdx + pdy * pdy);
  if (playerDist < MINE_BLAST_RADIUS) {
    playerHit = true;
  }

  // Check enemies
  for (const entityIndex of entityIndices) {
    const ex = transforms.x[entityIndex];
    const ey = transforms.y[entityIndex];
    const dx = ex - x;
    const dy = ey - y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < MINE_BLAST_RADIUS) {
      enemies.push(entityIndex);
    }
  }

  return { enemies, playerHit };
}

/**
 * Clear all mines (used on game restart)
 */
export function clearAllMines(): void {
  for (const index of activeMines.keys()) {
    destroyMine(index);
  }
  activeMines.clear();
}
