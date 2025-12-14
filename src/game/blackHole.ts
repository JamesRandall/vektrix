// Black Hole - grows over time, collapses and spawns enemies

import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLORS } from './constants';
import { gameState } from './gameState';

// Size constants (in grid cells, ~50 world units per cell)
const GRID_CELL_SIZE = 50;
const MIN_SIZE = 0.5;          // Starting size
const MAX_SIZE = 5;            // Max size before collapse
const GROW_TIME = 6;           // Seconds to grow from min to max
const COLLAPSE_TIME = 0.6;     // Seconds to collapse from max to zero

// Movement
const TRACK_SPEED = 40;        // How fast it tracks player (pixels/sec)

// Grid warp
const WARP_STRENGTH = 12000;
const WARP_RADIUS = 500;

// Visual
const FIZZ_SPEED = 2.0;

interface BlackHoleState {
  active: boolean;
  x: number;
  y: number;
  size: number;              // Current size in grid cells
  growTimer: number;         // Time spent growing
  collapsing: boolean;       // True when collapsing after reaching max
  collapseTimer: number;     // Time spent collapsing
  collapseStartSize: number; // Size when collapse started
  timeSinceLastHit: number;  // Time since last bullet hit
  destroyedByPlayer: boolean; // True if player shot it to death
  previousColorIndex: number;
  fizzPhase: number;
}

const state: BlackHoleState = {
  active: false,
  x: 0,
  y: 0,
  size: MIN_SIZE,
  growTimer: 0,
  collapsing: false,
  collapseTimer: 0,
  collapseStartSize: MIN_SIZE,
  timeSinceLastHit: 0,
  destroyedByPlayer: false,
  previousColorIndex: 0,
  fizzPhase: 0,
};

// Get world radius from grid cell size
function getWorldRadius(): number {
  return (state.size * GRID_CELL_SIZE) / 2;
}

// Spawn a black hole at the given position
export function spawnBlackHole(x: number, y: number): boolean {
  if (state.active) return false; // Only one at a time

  // Calculate min distance from edges (need room to grow to max size)
  const maxRadius = (MAX_SIZE * GRID_CELL_SIZE) / 2;
  const margin = maxRadius + 50;

  // Clamp position to valid area
  const clampedX = Math.max(margin, Math.min(WORLD_WIDTH - margin, x));
  const clampedY = Math.max(margin, Math.min(WORLD_HEIGHT - margin, y));

  // Get previous wave color index
  const currentColorIndex = (gameState.waveNumber - 1) % GRID_COLORS.length;
  const prevColorIndex = (currentColorIndex - 1 + GRID_COLORS.length) % GRID_COLORS.length;

  state.active = true;
  state.x = clampedX;
  state.y = clampedY;
  state.size = MIN_SIZE;
  state.growTimer = 0;
  state.collapsing = false;
  state.collapseTimer = 0;
  state.timeSinceLastHit = 0;
  state.destroyedByPlayer = false;
  state.previousColorIndex = prevColorIndex;
  state.fizzPhase = 0;

  return true;
}

// Update black hole - grows, tracks player, collapses
// Returns: null if still active, or spawn info if collapsed
export function updateBlackHole(
  dt: number,
  playerX: number,
  playerY: number
): { shouldSpawn: boolean; x: number; y: number } | null {
  if (!state.active) return null;

  // Update fizz animation
  state.fizzPhase += dt * FIZZ_SPEED;

  // Slowly track player
  const dx = playerX - state.x;
  const dy = playerY - state.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > 10) {
    const nx = dx / dist;
    const ny = dy / dist;
    state.x += nx * TRACK_SPEED * dt;
    state.y += ny * TRACK_SPEED * dt;

    // Keep within bounds
    const maxRadius = (MAX_SIZE * GRID_CELL_SIZE) / 2;
    const margin = maxRadius + 50;
    state.x = Math.max(margin, Math.min(WORLD_WIDTH - margin, state.x));
    state.y = Math.max(margin, Math.min(WORLD_HEIGHT - margin, state.y));
  }

  if (state.collapsing) {
    // Collapsing phase - shrink from current size to zero
    state.collapseTimer += dt;
    const collapseProgress = state.collapseTimer / COLLAPSE_TIME;
    state.size = state.collapseStartSize * (1 - collapseProgress);

    if (state.collapseTimer >= COLLAPSE_TIME) {
      // Collapse complete
      state.active = false;
      const shouldSpawn = !state.destroyedByPlayer;
      return { shouldSpawn, x: state.x, y: state.y };
    }
  } else {
    // Growing phase - grow size directly each frame
    const growRate = (MAX_SIZE - MIN_SIZE) / GROW_TIME;

    // Only grow if not recently hit (1 second recovery)
    if (state.timeSinceLastHit > 0) {
      state.timeSinceLastHit += dt;
      if (state.timeSinceLastHit >= 1.0) {
        state.timeSinceLastHit = 0; // Can grow again
      }
    }

    // Grow if not in recovery period
    if (state.timeSinceLastHit === 0) {
      state.size += growRate * dt;
    }

    if (state.size >= MAX_SIZE) {
      // Start collapsing from max size
      state.size = MAX_SIZE;
      state.collapsing = true;
      state.collapseTimer = 0;
      state.collapseStartSize = state.size;
    }
  }

  return null;
}

// Called when hit by player bullet
export function hitByBullet(): boolean {
  if (!state.active || state.collapsing) return false;

  state.timeSinceLastHit = 0.001; // Start recovery timer (non-zero to pause growth)

  // Shrink with each hit - fixed amount per bullet
  const shrinkAmount = 0.25; // Shrink by 0.25 grid cells per hit
  state.size -= shrinkAmount;

  if (state.size <= MIN_SIZE) {
    // Player destroyed it - trigger collapse from current size, no spawn
    state.size = MIN_SIZE;
    state.destroyedByPlayer = true;
    state.collapsing = true;
    state.collapseTimer = 0;
    state.collapseStartSize = state.size;
    return true;
  }

  return false;
}

// Check if bullet hits the black hole
export function collidesWithBlackHole(x: number, y: number, entityRadius: number = 0): boolean {
  if (!state.active) return false;

  const dx = x - state.x;
  const dy = y - state.y;
  const distanceSquared = dx * dx + dy * dy;

  const bhRadius = getWorldRadius();
  const collisionDist = bhRadius * 0.95 + entityRadius;

  return distanceSquared < collisionDist * collisionDist;
}

// Get current state for rendering
export function getBlackHoleState(): {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  color: readonly number[];
  fizzPhase: number;
  collapsing: boolean;
  collapseProgress: number;
} {
  const color = GRID_COLORS[state.previousColorIndex];
  return {
    active: state.active,
    x: state.x,
    y: state.y,
    radius: getWorldRadius(),
    color,
    fizzPhase: state.fizzPhase,
    collapsing: state.collapsing,
    collapseProgress: state.collapsing ? state.collapseTimer / COLLAPSE_TIME : 0,
  };
}

// Get gravity parameters for grid warp
export function getBlackHoleWarp(): { x: number; y: number; radius: number; strength: number } | null {
  if (!state.active) return null;
  const sizeProgress = (state.size - MIN_SIZE) / (MAX_SIZE - MIN_SIZE);
  const sizeMultiplier = 1.0 + sizeProgress * 0.5;
  return {
    x: state.x,
    y: state.y,
    radius: WARP_RADIUS + getWorldRadius(),
    strength: WARP_STRENGTH * sizeMultiplier,
  };
}

// Check if black hole is active
export function isBlackHoleActive(): boolean {
  return state.active;
}

// Reset black hole state
export function resetBlackHole(): void {
  state.active = false;
  state.collapsing = false;
}

// Check if currently collapsing (for visual effects)
export function isCollapsing(): boolean {
  return state.collapsing;
}
