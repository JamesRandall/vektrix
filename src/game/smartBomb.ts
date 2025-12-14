// Smart bomb - expanding circle that destroys all enemies it touches

import { WORLD_HEIGHT } from './constants';

// Smart bomb constants
const EXPANSION_SPEED = 1800;  // Units per second
const MAX_RADIUS = WORLD_HEIGHT / 2;  // Half the viewable play area
const EDGE_TOLERANCE = 40;  // Enemies within this distance ahead of edge get hit

// Bomb state
interface SmartBombState {
  active: boolean;
  centerX: number;
  centerY: number;
  currentRadius: number;
  hitEnemies: Set<number>;  // Track enemies already destroyed by this bomb
}

const bombState: SmartBombState = {
  active: false,
  centerX: 0,
  centerY: 0,
  currentRadius: 0,
  hitEnemies: new Set(),
};

/**
 * Trigger a smart bomb at the given position
 */
export function triggerSmartBomb(x: number, y: number): boolean {
  if (bombState.active) return false;  // Can't trigger while one is active

  bombState.active = true;
  bombState.centerX = x;
  bombState.centerY = y;
  bombState.currentRadius = 0;
  bombState.hitEnemies.clear();

  return true;
}

/**
 * Update the smart bomb expansion
 * Returns list of enemy indices that were just hit this frame
 */
export function updateSmartBomb(
  dt: number,
  enemyIndices: Set<number>,
  getEnemyPosition: (idx: number) => { x: number; y: number }
): number[] {
  if (!bombState.active) return [];

  const previousRadius = bombState.currentRadius;
  bombState.currentRadius += EXPANSION_SPEED * dt;

  // Check if bomb has finished expanding
  if (bombState.currentRadius >= MAX_RADIUS) {
    bombState.active = false;
    bombState.currentRadius = MAX_RADIUS;
  }

  // Find enemies that just entered the blast radius
  const newlyHitEnemies: number[] = [];

  for (const idx of enemyIndices) {
    // Skip if already hit
    if (bombState.hitEnemies.has(idx)) continue;

    const pos = getEnemyPosition(idx);
    const dx = pos.x - bombState.centerX;
    const dy = pos.y - bombState.centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Check if enemy is at the edge of the expanding circle
    // Hit if: inside current radius AND (was outside previous radius OR very close to current edge)
    const atEdge = distance <= bombState.currentRadius &&
                   distance >= bombState.currentRadius - EDGE_TOLERANCE;
    const justEntered = distance <= bombState.currentRadius && distance > previousRadius;

    if (atEdge || justEntered) {
      bombState.hitEnemies.add(idx);
      newlyHitEnemies.push(idx);
    }
  }

  return newlyHitEnemies;
}

/**
 * Get current bomb state for rendering
 */
export function getSmartBombState(): {
  active: boolean;
  centerX: number;
  centerY: number;
  radius: number;
  maxRadius: number;
} {
  return {
    active: bombState.active,
    centerX: bombState.centerX,
    centerY: bombState.centerY,
    radius: bombState.currentRadius,
    maxRadius: MAX_RADIUS,
  };
}

/**
 * Check if a smart bomb is currently active
 */
export function isSmartBombActive(): boolean {
  return bombState.active;
}

/**
 * Reset smart bomb state (for game restart)
 */
export function resetSmartBomb(): void {
  bombState.active = false;
  bombState.currentRadius = 0;
  bombState.hitEnemies.clear();
}
