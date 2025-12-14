import { Entity } from '../engine/ecs/entity';
import { transforms, velocities, enemies, LAYER, SHAPE, ENEMY_TYPE } from '../engine/ecs/components';
import { applyGridImpulse, GridState } from '../engine/grid/grid';
import { createEnemyBullet } from './bullets';
import { getGameSpeed } from './gameState';

// ===== SPINNER CONSTANTS (tweakable) =====
export const SPINNER_INITIAL_SPIN_SPEED = 1.5;      // Initial rotation speed (radians/sec)
export const SPINNER_SPIN_ACCELERATION = 0.15;     // How much spin speed increases per second
export const SPINNER_MAX_SPIN_SPEED = 12.0;         // Maximum rotation speed (radians/sec)
export const SPINNER_INITIAL_FIRE_INTERVAL = 1.2;  // Initial time between shots (seconds)
export const SPINNER_MIN_FIRE_INTERVAL = 0.15;     // Minimum time between shots at max spin
export const SPINNER_DRIFT_SPEED = 25;             // Slow drift toward player

// Enemy colours by type (HDR values for bloom)
const ENEMY_COLOURS: Record<number, [number, number, number]> = {
  [ENEMY_TYPE.WANDERER]: [0.3, 1.2, 0.3],   // Green - passive
  [ENEMY_TYPE.CHASER]: [1.5, 0.2, 1.2],     // Magenta - aggressive
  [ENEMY_TYPE.WEAVER]: [1.2, 0.8, 0.2],     // Orange - erratic
  [ENEMY_TYPE.GRUNT]: [0.8, 0.8, 1.2],      // Light blue - fodder
  [ENEMY_TYPE.SHY]: [1.4, 0.3, 0.3],        // Red - shy/scared
  [ENEMY_TYPE.SPINNER]: [1.0, 0.2, 1.5],    // Purple - dangerous
};

// Enemy shapes by type
const ENEMY_SHAPES: Record<number, number> = {
  [ENEMY_TYPE.WANDERER]: SHAPE.ENEMY_DIAMOND,
  [ENEMY_TYPE.CHASER]: SHAPE.ENEMY_ARROW,
  [ENEMY_TYPE.WEAVER]: SHAPE.ENEMY_WAVE,
  [ENEMY_TYPE.GRUNT]: SHAPE.ENEMY_TRIANGLE,
  [ENEMY_TYPE.SHY]: SHAPE.ENEMY_SHY,
  [ENEMY_TYPE.SPINNER]: SHAPE.ENEMY_SPINNER,
};

// Enemy sizes by type
const ENEMY_SIZES: Record<number, number> = {
  [ENEMY_TYPE.WANDERER]: 36,
  [ENEMY_TYPE.CHASER]: 32,
  [ENEMY_TYPE.WEAVER]: 30,
  [ENEMY_TYPE.GRUNT]: 28,
  [ENEMY_TYPE.SHY]: 34,
  [ENEMY_TYPE.SPINNER]: 42,
};

// Track active enemy entities by their index
const activeEnemies = new Set<number>();

// Track spinner movement modes (true = homing, false = wander)
const spinnerHomingMode = new Set<number>();

// Track spinner wander state (direction change timer and current direction)
const spinnerWanderState = new Map<number, { timer: number; dirX: number; dirY: number }>();
const SPINNER_WANDER_INTERVAL = 2.0; // How often wander spinners change direction

// Formation tracking - members follow lead enemy and maintain relative positions
interface FormationMember {
  leadIndex: number;    // Index of the formation's lead enemy
  offsetX: number;      // X offset from lead position
  offsetY: number;      // Y offset from lead position
}
const formationMembers = new Map<number, FormationMember>();
const formationLeads = new Set<number>(); // Track which enemies are formation leads

export function createEnemy(x: number, y: number, type: number = ENEMY_TYPE.CHASER): Entity {
  const enemy = Entity.create();

  const size = ENEMY_SIZES[type] ?? 32;
  const colour = ENEMY_COLOURS[type] ?? [1.5, 0.2, 1.2];
  const shape = ENEMY_SHAPES[type] ?? SHAPE.CIRCLE;

  enemy.transform.setPosition(x, y);
  enemy.transform.rotation = 0;
  enemy.transform.setScale(1);

  enemy.velocity.set(0, 0);

  enemy.sprite.setSize(size);
  enemy.sprite.setTint(colour[0], colour[1], colour[2]);
  enemy.sprite.shape = shape;

  enemy.collider.setSize(size / 2);
  enemy.collider.setLayerMask(LAYER.ENEMY, LAYER.PLAYER | LAYER.BULLET);

  // Set enemy type data
  enemies.type[enemy.index] = type;
  enemies.stateTimer[enemy.index] = Math.random() * 2; // Random initial timer
  enemies.statePhase[enemy.index] = Math.random() * Math.PI * 2; // Random initial phase

  // Assign spinner movement mode (50-50 homing vs wander)
  if (type === ENEMY_TYPE.SPINNER) {
    if (Math.random() < 0.5) {
      spinnerHomingMode.add(enemy.index);
    }
  }

  activeEnemies.add(enemy.index);

  return enemy;
}

export function destroyEnemy(index: number): void {
  activeEnemies.delete(index);
  spinnerHomingMode.delete(index); // Clean up spinner mode tracking
  spinnerWanderState.delete(index);

  // Clean up formation tracking
  formationMembers.delete(index);
  if (formationLeads.has(index)) {
    formationLeads.delete(index);
    // Promote first remaining member to lead, or dissolve formation
    for (const [memberIdx, member] of formationMembers) {
      if (member.leadIndex === index) {
        // This member's lead was destroyed - make them independent (no longer in formation)
        formationMembers.delete(memberIdx);
      }
    }
  }
}

export function getActiveEnemyIndices(): Set<number> {
  return activeEnemies;
}

export function getActiveSpinnerCount(): number {
  let count = 0;
  for (const index of activeEnemies) {
    if (enemies.type[index] === ENEMY_TYPE.SPINNER) {
      count++;
    }
  }
  return count;
}

// Set up a formation where enemies maintain relative positions to a lead
// leadIndex: the enemy that does the actual homing
// memberIndices: array of other enemies that follow the lead
// Offsets are calculated from current positions relative to lead
export function setupFormation(leadIndex: number, memberIndices: number[]): void {
  formationLeads.add(leadIndex);

  const leadX = transforms.x[leadIndex];
  const leadY = transforms.y[leadIndex];

  for (const memberIndex of memberIndices) {
    if (memberIndex !== leadIndex) {
      formationMembers.set(memberIndex, {
        leadIndex,
        offsetX: transforms.x[memberIndex] - leadX,
        offsetY: transforms.y[memberIndex] - leadY,
      });
    }
  }
}

// Check if an enemy is a formation member (not the lead)
export function isFormationMember(index: number): boolean {
  return formationMembers.has(index);
}

// Get the target position for a formation member (lead position + offset)
export function getFormationTargetPosition(index: number): { x: number; y: number } | null {
  const member = formationMembers.get(index);
  if (!member) return null;

  // Check if lead still exists
  if (!activeEnemies.has(member.leadIndex)) {
    formationMembers.delete(index);
    return null;
  }

  return {
    x: transforms.x[member.leadIndex] + member.offsetX,
    y: transforms.y[member.leadIndex] + member.offsetY,
  };
}

export function getEnemyCount(): number {
  return activeEnemies.size;
}

// Wanderer behaviour - drifts randomly with slight player bias
function updateWanderer(index: number, dt: number, playerX: number, playerY: number, worldWidth: number, worldHeight: number): void {
  const DRIFT_SPEED = 80 * getGameSpeed();
  const WANDER_INTERVAL = 2.0;
  const GRID_PADDING = 40;
  const INNER_MARGIN = 100; // Start steering inward before hitting edge

  const x = transforms.x[index];
  const y = transforms.y[index];

  // Check if outside play area or near edge
  const isOutside = x < GRID_PADDING || x > worldWidth - GRID_PADDING ||
                    y < GRID_PADDING || y > worldHeight - GRID_PADDING;
  const isNearEdge = x < GRID_PADDING + INNER_MARGIN || x > worldWidth - GRID_PADDING - INNER_MARGIN ||
                     y < GRID_PADDING + INNER_MARGIN || y > worldHeight - GRID_PADDING - INNER_MARGIN;

  enemies.stateTimer[index] -= dt;

  // Force direction change when outside or near edge
  if (enemies.stateTimer[index] <= 0 || isOutside) {
    let finalAngle: number;

    if (isOutside) {
      // Outside: point directly toward center with small random offset
      const centerX = worldWidth / 2;
      const centerY = worldHeight / 2;
      const toCenterAngle = Math.atan2(centerY - y, centerX - x);
      finalAngle = toCenterAngle + (Math.random() - 0.5) * 0.5; // ±15 degrees
      enemies.stateTimer[index] = 0.3;
    } else if (isNearEdge) {
      // Near edge: bias strongly toward player
      const toPlayerAngle = Math.atan2(playerY - y, playerX - x);
      finalAngle = toPlayerAngle + (Math.random() - 0.5) * 1.0; // ±30 degrees
      enemies.stateTimer[index] = 0.5 + Math.random() * 0.5;
    } else {
      // Inside: random direction with 30% player bias
      const toPlayerAngle = Math.atan2(playerY - y, playerX - x);
      const randomAngle = Math.random() * Math.PI * 2;
      // Use random, but 30% chance to use player direction instead
      finalAngle = Math.random() < 0.3 ? toPlayerAngle + (Math.random() - 0.5) * 1.5 : randomAngle;
      enemies.stateTimer[index] = WANDER_INTERVAL + Math.random();
    }

    velocities.vx[index] = Math.cos(finalAngle) * DRIFT_SPEED;
    velocities.vy[index] = Math.sin(finalAngle) * DRIFT_SPEED;
  }

  // Integrate position
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face movement direction
  const vx = velocities.vx[index];
  const vy = velocities.vy[index];
  if (vx !== 0 || vy !== 0) {
    transforms.rotation[index] = Math.atan2(vy, vx);
  }
}

// Chaser behaviour - direct aggressive pursuit with acceleration
function updateChaser(index: number, dt: number, playerX: number, playerY: number): void {
  const CHASE_SPEED = 180 * getGameSpeed();
  const ACCELERATION = 400;

  // Formation members follow their formation position instead of player
  let targetX = playerX;
  let targetY = playerY;
  const formationTarget = getFormationTargetPosition(index);
  if (formationTarget) {
    targetX = formationTarget.x;
    targetY = formationTarget.y;
  }

  const dx = targetX - transforms.x[index];
  const dy = targetY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    const targetVx = (dx / dist) * CHASE_SPEED;
    const targetVy = (dy / dist) * CHASE_SPEED;

    // Smooth acceleration toward target velocity
    const accelFactor = (ACCELERATION * dt) / CHASE_SPEED;
    velocities.vx[index] += (targetVx - velocities.vx[index]) * accelFactor;
    velocities.vy[index] += (targetVy - velocities.vy[index]) * accelFactor;
  }

  // Integrate
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face direction of movement (or player if formation member)
  const faceDx = playerX - transforms.x[index];
  const faceDy = playerY - transforms.y[index];
  transforms.rotation[index] = Math.atan2(faceDy, faceDx);
}

// Weaver behaviour - sine-wave movement toward player
function updateWeaver(index: number, dt: number, playerX: number, playerY: number): void {
  const WEAVE_SPEED = 120 * getGameSpeed();
  const WEAVE_AMPLITUDE = 200; // Perpendicular velocity amplitude
  const WEAVE_FREQUENCY = 3.0;

  // Update phase
  enemies.statePhase[index] += dt * WEAVE_FREQUENCY;

  // Formation members follow their formation position instead of player
  let targetX = playerX;
  let targetY = playerY;
  const formationTarget = getFormationTargetPosition(index);
  if (formationTarget) {
    targetX = formationTarget.x;
    targetY = formationTarget.y;
  }

  const dx = targetX - transforms.x[index];
  const dy = targetY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    // Base velocity toward target
    const baseVx = (dx / dist) * WEAVE_SPEED;
    const baseVy = (dy / dist) * WEAVE_SPEED;

    // Perpendicular weave velocity (not offset!)
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const weaveVelocity = Math.sin(enemies.statePhase[index]) * WEAVE_AMPLITUDE;

    velocities.vx[index] = baseVx + perpX * weaveVelocity;
    velocities.vy[index] = baseVy + perpY * weaveVelocity;
  }

  // Integrate
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face movement direction
  const vLen = Math.sqrt(velocities.vx[index] ** 2 + velocities.vy[index] ** 2);
  if (vLen > 0) {
    transforms.rotation[index] = Math.atan2(velocities.vy[index], velocities.vx[index]);
  }
}

// Grunt behaviour - slow, simple direct movement
function updateGrunt(index: number, dt: number, playerX: number, playerY: number): void {
  const GRUNT_SPEED = 100 * getGameSpeed();

  // Formation members follow their formation position instead of player
  let targetX = playerX;
  let targetY = playerY;
  const formationTarget = getFormationTargetPosition(index);
  if (formationTarget) {
    targetX = formationTarget.x;
    targetY = formationTarget.y;
  }

  const dx = targetX - transforms.x[index];
  const dy = targetY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    velocities.vx[index] = (dx / dist) * GRUNT_SPEED;
    velocities.vy[index] = (dy / dist) * GRUNT_SPEED;
  }

  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face player (not target) for visual consistency
  const faceDx = playerX - transforms.x[index];
  const faceDy = playerY - transforms.y[index];
  transforms.rotation[index] = Math.atan2(faceDy, faceDx);
}

// Shy behaviour - approaches player, but flees when player looks at it
function updateShy(index: number, dt: number, playerX: number, playerY: number, playerAimAngle: number): void {
  const speed = getGameSpeed();
  const APPROACH_SPEED = 120 * speed;
  const FLEE_SPEED = 240 * speed; // 2x approach speed

  const dx = playerX - transforms.x[index];
  const dy = playerY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return;

  // Angle from player to this enemy
  const angleToEnemy = Math.atan2(-dy, -dx); // Negative because we want player->enemy direction

  // Normalize angle difference to -PI to PI
  let angleDiff = angleToEnemy - playerAimAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  // Check if within 90 degree cone (45 degrees each side)
  const isBeingLookedAt = Math.abs(angleDiff) < Math.PI / 4;

  if (isBeingLookedAt) {
    // Flee away from player at 2x speed
    velocities.vx[index] = (-dx / dist) * FLEE_SPEED;
    velocities.vy[index] = (-dy / dist) * FLEE_SPEED;
  } else {
    // Approach player
    velocities.vx[index] = (dx / dist) * APPROACH_SPEED;
    velocities.vy[index] = (dy / dist) * APPROACH_SPEED;
  }

  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face movement direction
  transforms.rotation[index] = Math.atan2(velocities.vy[index], velocities.vx[index]);
}

// Spinner behaviour - spins and shoots bullets
// Movement: 50% homing (drifts toward player), 50% wander (random directions)
// stateTimer: time until next shot
// statePhase: current spin speed (increases over time)
function updateSpinner(index: number, dt: number, playerX: number, playerY: number): void {
  // Initialize spin speed on first update (statePhase stores spin speed)
  if (enemies.statePhase[index] === 0 || enemies.statePhase[index] > SPINNER_MAX_SPIN_SPEED) {
    enemies.statePhase[index] = SPINNER_INITIAL_SPIN_SPEED;
    enemies.stateTimer[index] = SPINNER_INITIAL_FIRE_INTERVAL;
  }

  // Increase spin speed over time
  enemies.statePhase[index] = Math.min(
    enemies.statePhase[index] + SPINNER_SPIN_ACCELERATION * dt,
    SPINNER_MAX_SPIN_SPEED
  );

  const spinSpeed = enemies.statePhase[index];

  // Rotate the spinner
  transforms.rotation[index] += spinSpeed * dt;

  // Calculate fire interval based on spin speed (faster spin = faster shooting)
  // Linear interpolation from initial to min interval based on spin speed
  const spinRatio = (spinSpeed - SPINNER_INITIAL_SPIN_SPEED) / (SPINNER_MAX_SPIN_SPEED - SPINNER_INITIAL_SPIN_SPEED);
  const fireInterval = SPINNER_INITIAL_FIRE_INTERVAL - spinRatio * (SPINNER_INITIAL_FIRE_INTERVAL - SPINNER_MIN_FIRE_INTERVAL);

  // Update fire timer
  enemies.stateTimer[index] -= dt;
  if (enemies.stateTimer[index] <= 0) {
    enemies.stateTimer[index] = fireInterval;

    // Fire bullet in direction spinner is facing
    const x = transforms.x[index];
    const y = transforms.y[index];
    const angle = transforms.rotation[index];

    // Spawn bullet at edge of spinner (offset by size)
    const spawnOffset = 25;
    const bulletX = x + Math.cos(angle) * spawnOffset;
    const bulletY = y + Math.sin(angle) * spawnOffset;

    createEnemyBullet(bulletX, bulletY, angle);
  }

  // Movement based on mode
  const isHoming = spinnerHomingMode.has(index);

  if (isHoming) {
    // Homing mode: drift toward player
    const dx = playerX - transforms.x[index];
    const dy = playerY - transforms.y[index];
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      const driftSpeed = SPINNER_DRIFT_SPEED * getGameSpeed();
      velocities.vx[index] = (dx / dist) * driftSpeed;
      velocities.vy[index] = (dy / dist) * driftSpeed;
    }
  } else {
    // Wander mode: random directions like wanderer
    let wander = spinnerWanderState.get(index);
    if (!wander) {
      // Initialize with random direction
      const angle = Math.random() * Math.PI * 2;
      wander = {
        timer: SPINNER_WANDER_INTERVAL,
        dirX: Math.cos(angle),
        dirY: Math.sin(angle),
      };
      spinnerWanderState.set(index, wander);
    }

    // Update wander timer
    wander.timer -= dt;
    if (wander.timer <= 0) {
      wander.timer = SPINNER_WANDER_INTERVAL;
      // Pick new random direction with slight bias toward player (30%)
      if (Math.random() < 0.3) {
        const dx = playerX - transforms.x[index];
        const dy = playerY - transforms.y[index];
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          wander.dirX = dx / dist;
          wander.dirY = dy / dist;
        }
      } else {
        const angle = Math.random() * Math.PI * 2;
        wander.dirX = Math.cos(angle);
        wander.dirY = Math.sin(angle);
      }
    }

    const wanderSpeed = SPINNER_DRIFT_SPEED * getGameSpeed();
    velocities.vx[index] = wander.dirX * wanderSpeed;
    velocities.vy[index] = wander.dirY * wanderSpeed;
  }

  // Apply movement
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;
}

export function updateEnemies(
  dt: number,
  playerX: number,
  playerY: number,
  playerAimAngle: number,
  grid: GridState,
  worldWidth: number,
  worldHeight: number,
  isGameOver: boolean = false
): void {
  const margin = 20; // Allow enemies to be slightly off-screen before clamping

  for (const index of activeEnemies) {
    const type = enemies.type[index];

    // On game over, all enemies wander freely (formations break - job done!)
    if (isGameOver) {
      updateWanderer(index, dt, playerX, playerY, worldWidth, worldHeight);
      continue;
    }

    // Dispatch to appropriate behaviour
    switch (type) {
      case ENEMY_TYPE.WANDERER:
        updateWanderer(index, dt, playerX, playerY, worldWidth, worldHeight);
        break;
      case ENEMY_TYPE.CHASER:
        updateChaser(index, dt, playerX, playerY);
        break;
      case ENEMY_TYPE.WEAVER:
        updateWeaver(index, dt, playerX, playerY);
        break;
      case ENEMY_TYPE.GRUNT:
        updateGrunt(index, dt, playerX, playerY);
        break;
      case ENEMY_TYPE.SHY:
        updateShy(index, dt, playerX, playerY, playerAimAngle);
        break;
      case ENEMY_TYPE.SPINNER:
        updateSpinner(index, dt, playerX, playerY);
        break;
      default:
        // Fallback to chaser behaviour
        updateChaser(index, dt, playerX, playerY);
    }

    // Clamp to world bounds (with small margin)
    transforms.x[index] = Math.max(-margin, Math.min(worldWidth + margin, transforms.x[index]));
    transforms.y[index] = Math.max(-margin, Math.min(worldHeight + margin, transforms.y[index]));

    // Grid wake effect (all enemies)
    const vx = velocities.vx[index];
    const vy = velocities.vy[index];
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed > 30) {
      applyGridImpulse(grid, transforms.x[index], transforms.y[index], 60, speed * 0.3);
    }
  }
}

// Re-export ENEMY_TYPE for use in spawner
export { ENEMY_TYPE };
