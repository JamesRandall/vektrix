// Plasma Bands Anti-Camping Mechanic
// Spawns lethal bands from screen edges when player stays stationary

import { camera } from '../engine/core/camera';
import { getGameSpeed, gameState } from './gameState';

// Tuning parameters
const VELOCITY_THRESHOLD = 5;      // Near-zero movement detection
const STATIONARY_TIME = 0.5;       // Time before warning starts
const WARNING_TIME = 0.5;          // Dim appearance before lethal
const GRACE_TIME = 3.0;            // Immunity at start/wave/respawn
const BASE_CLOSE_SPEED = 200;      // Units/sec (scales with game speed)
const FADE_TIME = 1.5;             // Persistence after player moves
const BAND_THICKNESS = 4;          // Collision thickness
const PLAYER_RADIUS = 20;          // Player collision radius

export type BandEdge = 'top' | 'bottom' | 'left' | 'right';

export interface PlasmaBand {
  edge: BandEdge;
  currentPosition: number;   // Current world position of the band
  targetPosition: number;    // Player position on this axis
  spawnPosition: number;     // Original spawn position (screen edge)
  isClosing: boolean;
  isFading: boolean;
  fadeTimer: number;
  warningTimer: number;      // 0.5s dim warning before full intensity
  isLethal: boolean;         // False during warning phase
}

interface PlasmaState {
  stationaryTimer: number;
  graceTimer: number;
  activeBands: PlasmaBand[];
  isWarningPhase: boolean;
  warningTimer: number;
}

const plasmaState: PlasmaState = {
  stationaryTimer: 0,
  graceTimer: GRACE_TIME,
  activeBands: [],
  isWarningPhase: false,
  warningTimer: 0,
};

function getScreenBounds(): { left: number; right: number; top: number; bottom: number } {
  const visible = camera.getVisibleSize();
  return {
    left: camera.x - visible.width / 2,
    right: camera.x + visible.width / 2,
    top: camera.y - visible.height / 2,
    bottom: camera.y + visible.height / 2,
  };
}

function spawnBands(playerX: number, playerY: number): void {
  const bounds = getScreenBounds();

  // Determine closest edges
  const distToLeft = playerX - bounds.left;
  const distToRight = bounds.right - playerX;
  const distToTop = playerY - bounds.top;
  const distToBottom = bounds.bottom - playerY;

  // Choose horizontal edge (top or bottom) - closest to player
  const hEdge: BandEdge = distToTop < distToBottom ? 'top' : 'bottom';
  const hPosition = hEdge === 'top' ? bounds.top : bounds.bottom;

  // Choose vertical edge (left or right) - closest to player
  const vEdge: BandEdge = distToLeft < distToRight ? 'left' : 'right';
  const vPosition = vEdge === 'left' ? bounds.left : bounds.right;

  // Create horizontal band
  plasmaState.activeBands.push({
    edge: hEdge,
    currentPosition: hPosition,
    targetPosition: playerY,
    spawnPosition: hPosition,
    isClosing: false,
    isFading: false,
    fadeTimer: 0,
    warningTimer: WARNING_TIME,
    isLethal: false,
  });

  // Create vertical band
  plasmaState.activeBands.push({
    edge: vEdge,
    currentPosition: vPosition,
    targetPosition: playerX,
    spawnPosition: vPosition,
    isClosing: false,
    isFading: false,
    fadeTimer: 0,
    warningTimer: WARNING_TIME,
    isLethal: false,
  });
}

export function updatePlasmaBands(
  dt: number,
  playerSpeed: number,
  playerX: number,
  playerY: number
): void {
  // Pause handling - don't update if game is paused
  if (gameState.isPaused) return;

  // Grace period countdown
  if (plasmaState.graceTimer > 0) {
    plasmaState.graceTimer -= dt;
    return;
  }

  const isMoving = playerSpeed > VELOCITY_THRESHOLD;
  const closeSpeed = BASE_CLOSE_SPEED * getGameSpeed();

  // Update stationary detection
  if (isMoving) {
    plasmaState.stationaryTimer = 0;
    plasmaState.isWarningPhase = false;
    plasmaState.warningTimer = 0;
  } else {
    plasmaState.stationaryTimer += dt;
  }

  // Handle warning phase and band spawning
  if (!isMoving && plasmaState.stationaryTimer >= STATIONARY_TIME) {
    if (!plasmaState.isWarningPhase && plasmaState.activeBands.length === 0) {
      // Start warning phase
      plasmaState.isWarningPhase = true;
      plasmaState.warningTimer = WARNING_TIME;
      spawnBands(playerX, playerY);
    } else if (plasmaState.isWarningPhase) {
      plasmaState.warningTimer -= dt;
      if (plasmaState.warningTimer <= 0) {
        // Warning complete - bands become lethal and start closing
        plasmaState.isWarningPhase = false;
        for (const band of plasmaState.activeBands) {
          if (band.warningTimer > 0) {
            band.warningTimer = 0;
            band.isLethal = true;
            band.isClosing = true;
          }
        }
      }
    }
  }

  // Update active bands
  const bandsToRemove: number[] = [];

  for (let i = 0; i < plasmaState.activeBands.length; i++) {
    const band = plasmaState.activeBands[i];

    // Warning phase countdown
    if (band.warningTimer > 0) {
      band.warningTimer -= dt;
      if (band.warningTimer <= 0 && !isMoving) {
        band.isLethal = true;
        band.isClosing = true;
      }
      continue;
    }

    // Handle closing/fading states
    if (isMoving && band.isClosing && !band.isFading) {
      // Player started moving - stop closing, start fading
      band.isClosing = false;
      band.isFading = true;
      band.fadeTimer = FADE_TIME;
    }

    if (band.isFading) {
      band.fadeTimer -= dt;
      if (band.fadeTimer <= 0) {
        bandsToRemove.push(i);
      }
      continue;
    }

    if (band.isClosing) {
      // Move band toward player
      const isHorizontal = band.edge === 'top' || band.edge === 'bottom';
      const target = isHorizontal ? playerY : playerX;
      band.targetPosition = target;

      const direction = band.edge === 'top' || band.edge === 'left' ? 1 : -1;
      band.currentPosition += direction * closeSpeed * dt;

      // Check if band has passed player position
      if (band.edge === 'top' && band.currentPosition >= target) {
        band.currentPosition = target;
      } else if (band.edge === 'bottom' && band.currentPosition <= target) {
        band.currentPosition = target;
      } else if (band.edge === 'left' && band.currentPosition >= target) {
        band.currentPosition = target;
      } else if (band.edge === 'right' && band.currentPosition <= target) {
        band.currentPosition = target;
      }
    }
  }

  // Remove expired bands
  for (let i = bandsToRemove.length - 1; i >= 0; i--) {
    plasmaState.activeBands.splice(bandsToRemove[i], 1);
  }
}

export function checkPlasmaCollision(playerX: number, playerY: number): boolean {
  for (const band of plasmaState.activeBands) {
    if (!band.isLethal) continue;

    const isHorizontal = band.edge === 'top' || band.edge === 'bottom';
    const dist = isHorizontal
      ? Math.abs(playerY - band.currentPosition)
      : Math.abs(playerX - band.currentPosition);

    if (dist < PLAYER_RADIUS + BAND_THICKNESS / 2) {
      return true;
    }
  }
  return false;
}

export function resetPlasmaGraceTimer(): void {
  plasmaState.graceTimer = GRACE_TIME;
}

export function clearPlasmaBands(): void {
  plasmaState.activeBands = [];
  plasmaState.stationaryTimer = 0;
  plasmaState.isWarningPhase = false;
  plasmaState.warningTimer = 0;
  plasmaState.graceTimer = GRACE_TIME;
}

export function getActiveBands(): readonly PlasmaBand[] {
  return plasmaState.activeBands;
}

export function getClosestBandDistance(playerX: number, playerY: number): number {
  let minDist = Infinity;

  for (const band of plasmaState.activeBands) {
    const isHorizontal = band.edge === 'top' || band.edge === 'bottom';
    const dist = isHorizontal
      ? Math.abs(playerY - band.currentPosition)
      : Math.abs(playerX - band.currentPosition);

    minDist = Math.min(minDist, dist);
  }

  return minDist;
}

export function hasActiveBands(): boolean {
  return plasmaState.activeBands.length > 0;
}
