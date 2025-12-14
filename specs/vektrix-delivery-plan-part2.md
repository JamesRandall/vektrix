# Vektrix Delivery Plan - Part 2

Continuation of the phased delivery plan covering combat and enemy variety.

---

## Phase 4: Player Shooting

**Goal:** Player can fire bullets that destroy enemies. Proves bullet spawning, projectile physics, and bullet-enemy collision.

### 4.1 Bullet Component

Add bullet-specific data to the ECS.

```typescript
// Bullet component storage
export const bullets = {
  lifetime: new Float32Array(MAX_ENTITIES),    // Remaining lifetime in seconds
  maxLifetime: new Float32Array(MAX_ENTITIES), // For visual fade calculation
  damage: new Float32Array(MAX_ENTITIES),
};

// Component bit
export const COMP_BULLET = 1 << 4;
```

**Deliverable:** Bullet component storage and view class.

### 4.2 Bullet Entity Factory

Create bullets with consistent properties.

```typescript
const BULLET_SPEED = 1200;
const BULLET_SIZE = 8;
const BULLET_LIFETIME = 1.5; // seconds

function createBullet(x: number, y: number, angle: number): Entity {
  const bullet = Entity.create();

  bullet.transform.setPosition(x, y);
  bullet.transform.rotation = angle;

  // Velocity in direction of angle
  const vx = Math.cos(angle) * BULLET_SPEED;
  const vy = Math.sin(angle) * BULLET_SPEED;
  bullet.velocity.set(vx, vy);

  bullet.sprite.setSize(BULLET_SIZE, BULLET_SIZE * 2); // Elongated
  bullet.sprite.setTint(1.5, 1.5, 0.5); // Bright yellow (HDR)
  bullet.sprite.shape = SHAPE.BULLET;

  bullet.collider.setSize(BULLET_SIZE / 2);
  bullet.collider.setLayerMask(LAYER.BULLET, LAYER.ENEMY);

  bullet.bullet.lifetime = BULLET_LIFETIME;
  bullet.bullet.maxLifetime = BULLET_LIFETIME;
  bullet.bullet.damage = 1;

  return bullet;
}
```

**Deliverable:** `createBullet()` function spawns bullets.

### 4.3 Bullet Shape

Add a bullet/projectile shape to the sprite shader.

```wgsl
// Bullet shape - elongated diamond/line
fn drawBullet(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);

  // Elongated diamond pointing right
  let nose = vec2f(0.45, 0.0);
  let tail = vec2f(-0.45, 0.0);
  let top = vec2f(0.0, 0.12);
  let bottom = vec2f(0.0, -0.12);

  let d1 = sdSegment(p, nose, top);
  let d2 = sdSegment(p, nose, bottom);
  let d3 = sdSegment(p, tail, top);
  let d4 = sdSegment(p, tail, bottom);

  let dist = min(min(d1, d2), min(d3, d4));
  return 1.0 - smoothstep(strokeWidth * 0.3, strokeWidth * 0.8, dist);
}
```

**Deliverable:** Bullets render as elongated shapes aligned with travel direction.

### 4.4 Shooting Input

Handle shooting input from mouse and gamepad.

```typescript
// In input.ts
let shootPressed = false;
let shootJustPressed = false;

// Mouse: left button
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) { // Left mouse button
    shootJustPressed = !shootPressed;
    shootPressed = true;
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    shootPressed = false;
  }
});

// Gamepad: right shoulder (R1/RB)
function pollGamepadShooting(): void {
  const gamepad = navigator.getGamepads()[0];
  if (!gamepad) return;

  const wasPressed = shootPressed;
  shootPressed = gamepad.buttons[5].pressed; // R1/RB
  shootJustPressed = shootPressed && !wasPressed;
}

export function isShooting(): boolean {
  return shootPressed;
}

export function justStartedShooting(): boolean {
  return shootJustPressed;
}
```

**Deliverable:** `isShooting()` returns true while fire button held.

### 4.5 Fire Rate Control

Limit bullet spawn rate.

```typescript
class ShootingSystem {
  private fireTimer = 0;
  private fireRate = 0.08; // seconds between shots (12.5 shots/sec)

  update(dt: number, playerX: number, playerY: number, aimAngle: number): void {
    this.fireTimer -= dt;

    if (isShooting() && this.fireTimer <= 0) {
      this.fireTimer = this.fireRate;

      // Spawn bullet slightly ahead of player
      const spawnOffset = 25;
      const spawnX = playerX + Math.cos(aimAngle) * spawnOffset;
      const spawnY = playerY + Math.sin(aimAngle) * spawnOffset;

      createBullet(spawnX, spawnY, aimAngle);
    }
  }
}
```

**Deliverable:** Holding fire spawns bullets at controlled rate.

### 4.6 Bullet Update System

Move bullets and handle lifetime.

```typescript
function updateBullets(dt: number, grid: GridState): void {
  const toDestroy: number[] = [];

  for (const index of activeBullets) {
    // Update lifetime
    bullets.lifetime[index] -= dt;

    if (bullets.lifetime[index] <= 0) {
      toDestroy.push(index);
      continue;
    }

    // Move bullet
    transforms.x[index] += velocities.vx[index] * dt;
    transforms.y[index] += velocities.vy[index] * dt;

    // Small grid wake effect
    applyGridImpulse(grid, transforms.x[index], transforms.y[index], 30, 50);
  }

  // Destroy expired bullets
  for (const index of toDestroy) {
    destroyBullet(index);
  }
}
```

**Deliverable:** Bullets travel and expire after lifetime.

### 4.7 Bullet-Enemy Collision

Extend collision response to handle bullets hitting enemies.

```typescript
function processCollisions(pairs: CollisionPair[], grid: GridState): void {
  for (const { a, b } of pairs) {
    const aIsBullet = activeBullets.has(a);
    const bIsBullet = activeBullets.has(b);
    const aIsEnemy = activeEnemies.has(a);
    const bIsEnemy = activeEnemies.has(b);

    // Bullet hits enemy
    if ((aIsBullet && bIsEnemy) || (bIsBullet && aIsEnemy)) {
      const bulletIdx = aIsBullet ? a : b;
      const enemyIdx = aIsEnemy ? a : b;

      // Grid explosion at impact point
      applyGridImpulse(
        grid,
        transforms.x[enemyIdx],
        transforms.y[enemyIdx],
        150,
        400
      );

      // Destroy both
      destroyBullet(bulletIdx);
      destroyEnemy(enemyIdx);
    }

    // Player-enemy collision (existing logic)
    // ...
  }
}
```

**Deliverable:** Bullets destroy enemies on contact.

### 4.8 Visual Feedback

Enhance shooting feel.

- Muzzle flash: brief bright sprite at spawn point
- Bullet trail: bullets leave faint trail in phosphor buffer
- Impact flash: brief pulse when bullet hits enemy
- Grid recoil: small impulse behind player when firing

```typescript
// Firing feedback
function onBulletFired(x: number, y: number, angle: number): void {
  // Grid recoil (push grid behind player)
  const recoilX = x - Math.cos(angle) * 20;
  const recoilY = y - Math.sin(angle) * 20;
  applyGridImpulse(grid, recoilX, recoilY, 40, 100);
}
```

**Deliverable:** Shooting feels punchy with visual feedback.

### Phase 4 Exit Criteria

- [ ] Bullet component in ECS
- [ ] Left mouse button fires (keyboard/mouse)
- [ ] Right shoulder button fires (gamepad)
- [ ] Fire rate limiting (no bullet spam)
- [ ] Bullets travel in aim direction
- [ ] Bullets expire after lifetime
- [ ] Bullet-enemy collision destroys both
- [ ] Grid reacts to bullets and impacts
- [ ] Multiple bullets on screen simultaneously

---

## Phase 5: Multiple Enemy Types

**Goal:** Diverse enemy behaviours create varied gameplay. Different enemies require different strategies.

### 5.1 Enemy Type System

Add enemy type identifier and type-specific data.

```typescript
// Enemy types
export const ENEMY_TYPE = {
  WANDERER: 0,   // Original seeker, but slower and drifts
  CHASER: 1,     // Direct pursuit (current behaviour)
  WEAVER: 2,     // Sine-wave movement toward player
  SNIPER: 3,     // Keeps distance, fires at player
  GRUNT: 4,      // Spawns in groups, simple behaviour
} as const;

// Enemy component storage
export const enemies = {
  type: new Uint8Array(MAX_ENTITIES),
  health: new Float32Array(MAX_ENTITIES),
  stateTimer: new Float32Array(MAX_ENTITIES),  // For behaviour state machines
  statePhase: new Float32Array(MAX_ENTITIES),  // Behaviour phase/state
};

export const COMP_ENEMY = 1 << 5;
```

**Deliverable:** Enemy type system with per-type data.

### 5.2 Enemy Shapes

Distinct visual identity for each enemy type.

```typescript
export const SHAPE = {
  CIRCLE: 0,
  PLAYER_SHIP: 1,
  BULLET: 2,
  ENEMY_DIAMOND: 3,   // Wanderer - diamond/rhombus
  ENEMY_ARROW: 4,     // Chaser - aggressive arrow
  ENEMY_WAVE: 5,      // Weaver - curved shape
  ENEMY_SQUARE: 6,    // Sniper - angular square
  ENEMY_TRIANGLE: 7,  // Grunt - simple triangle
} as const;
```

```wgsl
// Diamond shape for Wanderer
fn drawDiamond(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let d1 = sdSegment(p, vec2f(0.4, 0.0), vec2f(0.0, 0.3));
  let d2 = sdSegment(p, vec2f(0.0, 0.3), vec2f(-0.4, 0.0));
  let d3 = sdSegment(p, vec2f(-0.4, 0.0), vec2f(0.0, -0.3));
  let d4 = sdSegment(p, vec2f(0.0, -0.3), vec2f(0.4, 0.0));
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, min(min(d1, d2), min(d3, d4)));
}

// Aggressive arrow for Chaser
fn drawArrow(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let nose = vec2f(0.45, 0.0);
  let backTop = vec2f(-0.3, 0.3);
  let backBottom = vec2f(-0.3, -0.3);
  let d1 = sdSegment(p, nose, backTop);
  let d2 = sdSegment(p, nose, backBottom);
  let d3 = sdSegment(p, backTop, backBottom);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, min(min(d1, d2), d3));
}

// Simple triangle for Grunt
fn drawTriangle(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let nose = vec2f(0.4, 0.0);
  let backTop = vec2f(-0.3, 0.3);
  let backBottom = vec2f(-0.3, -0.3);
  let d1 = sdSegment(p, nose, backTop);
  let d2 = sdSegment(p, nose, backBottom);
  let d3 = sdSegment(p, backTop, backBottom);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, min(min(d1, d2), d3));
}
```

**Deliverable:** Each enemy type has distinct silhouette.

### 5.3 Enemy Colours

Colour-coded threat identification.

```typescript
const ENEMY_COLOURS: Record<number, [number, number, number]> = {
  [ENEMY_TYPE.WANDERER]: [0.3, 1.2, 0.3],   // Green - passive
  [ENEMY_TYPE.CHASER]: [1.5, 0.2, 1.2],     // Magenta - aggressive
  [ENEMY_TYPE.WEAVER]: [1.2, 0.8, 0.2],     // Orange - erratic
  [ENEMY_TYPE.SNIPER]: [1.5, 0.2, 0.2],     // Red - dangerous
  [ENEMY_TYPE.GRUNT]: [0.8, 0.8, 1.2],      // Light blue - fodder
};
```

**Deliverable:** Enemies colour-coded by threat level.

### 5.4 Wanderer Behaviour

Passive enemy that drifts around, occasionally moving toward player.

```typescript
function updateWanderer(index: number, dt: number, playerX: number, playerY: number): void {
  const DRIFT_SPEED = 80;
  const WANDER_INTERVAL = 2.0;

  enemies.stateTimer[index] -= dt;

  if (enemies.stateTimer[index] <= 0) {
    // Pick new random direction, slightly biased toward player
    const toPlayerX = playerX - transforms.x[index];
    const toPlayerY = playerY - transforms.y[index];
    const toPlayerAngle = Math.atan2(toPlayerY, toPlayerX);

    // Random angle with slight player bias
    const randomAngle = Math.random() * Math.PI * 2;
    const finalAngle = lerpAngle(randomAngle, toPlayerAngle, 0.3);

    velocities.vx[index] = Math.cos(finalAngle) * DRIFT_SPEED;
    velocities.vy[index] = Math.sin(finalAngle) * DRIFT_SPEED;

    enemies.stateTimer[index] = WANDER_INTERVAL + Math.random();
  }

  // Integrate position
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face movement direction
  transforms.rotation[index] = Math.atan2(velocities.vy[index], velocities.vx[index]);
}
```

**Deliverable:** Wanderers drift unpredictably, low threat.

### 5.5 Chaser Behaviour

Aggressive direct pursuit (existing behaviour, refined).

```typescript
function updateChaser(index: number, dt: number, playerX: number, playerY: number): void {
  const CHASE_SPEED = 180;
  const ACCELERATION = 400;

  // Direct pursuit with acceleration
  const dx = playerX - transforms.x[index];
  const dy = playerY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    const targetVx = (dx / dist) * CHASE_SPEED;
    const targetVy = (dy / dist) * CHASE_SPEED;

    // Smooth acceleration toward target velocity
    velocities.vx[index] += (targetVx - velocities.vx[index]) * ACCELERATION * dt / CHASE_SPEED;
    velocities.vy[index] += (targetVy - velocities.vy[index]) * ACCELERATION * dt / CHASE_SPEED;
  }

  // Integrate
  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;

  // Face player
  transforms.rotation[index] = Math.atan2(dy, dx);
}
```

**Deliverable:** Chasers aggressively pursue player.

### 5.6 Weaver Behaviour

Sine-wave movement creates unpredictable dodging pattern.

```typescript
function updateWeaver(index: number, dt: number, playerX: number, playerY: number): void {
  const WEAVE_SPEED = 140;
  const WEAVE_AMPLITUDE = 200;
  const WEAVE_FREQUENCY = 3.0;

  // Update phase
  enemies.statePhase[index] += dt * WEAVE_FREQUENCY;

  // Direction to player
  const dx = playerX - transforms.x[index];
  const dy = playerY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    // Base velocity toward player
    const baseVx = (dx / dist) * WEAVE_SPEED;
    const baseVy = (dy / dist) * WEAVE_SPEED;

    // Perpendicular weave
    const perpX = -dy / dist;
    const perpY = dx / dist;
    const weaveOffset = Math.sin(enemies.statePhase[index]) * WEAVE_AMPLITUDE;

    velocities.vx[index] = baseVx + perpX * weaveOffset * dt * WEAVE_FREQUENCY;
    velocities.vy[index] = baseVy + perpY * weaveOffset * dt * WEAVE_FREQUENCY;
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
```

**Deliverable:** Weavers serpentine toward player, hard to hit.

### 5.7 Grunt Behaviour

Simple, slow enemies that spawn in groups.

```typescript
function updateGrunt(index: number, dt: number, playerX: number, playerY: number): void {
  const GRUNT_SPEED = 100;

  // Simple direct movement, no acceleration
  const dx = playerX - transforms.x[index];
  const dy = playerY - transforms.y[index];
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    velocities.vx[index] = (dx / dist) * GRUNT_SPEED;
    velocities.vy[index] = (dy / dist) * GRUNT_SPEED;
  }

  transforms.x[index] += velocities.vx[index] * dt;
  transforms.y[index] += velocities.vy[index] * dt;
  transforms.rotation[index] = Math.atan2(dy, dx);
}
```

**Deliverable:** Grunts are slow but spawn in numbers.

### 5.8 Enemy Update Dispatcher

Route updates to appropriate behaviour.

```typescript
function updateEnemies(dt: number, playerX: number, playerY: number, grid: GridState): void {
  for (const index of activeEnemies) {
    const type = enemies.type[index];

    switch (type) {
      case ENEMY_TYPE.WANDERER:
        updateWanderer(index, dt, playerX, playerY);
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
    }

    // Grid wake (all enemies)
    const speed = Math.sqrt(velocities.vx[index] ** 2 + velocities.vy[index] ** 2);
    if (speed > 30) {
      applyGridImpulse(grid, transforms.x[index], transforms.y[index], 60, speed * 0.2);
    }
  }
}
```

**Deliverable:** Unified enemy update handles all types.

### 5.9 Spawn Patterns

Different enemy types spawn in different patterns.

```typescript
interface SpawnPattern {
  type: number;
  count: number;
  formation: 'single' | 'line' | 'ring' | 'random';
  spacing: number;
}

class Spawner {
  private patterns: SpawnPattern[] = [
    { type: ENEMY_TYPE.GRUNT, count: 5, formation: 'line', spacing: 40 },
    { type: ENEMY_TYPE.CHASER, count: 1, formation: 'single', spacing: 0 },
    { type: ENEMY_TYPE.WANDERER, count: 3, formation: 'random', spacing: 100 },
    { type: ENEMY_TYPE.WEAVER, count: 2, formation: 'line', spacing: 60 },
  ];

  private spawnFormation(pattern: SpawnPattern, baseX: number, baseY: number, angle: number): void {
    switch (pattern.formation) {
      case 'single':
        createEnemy(baseX, baseY, pattern.type);
        break;

      case 'line':
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);
        const startOffset = -((pattern.count - 1) * pattern.spacing) / 2;

        for (let i = 0; i < pattern.count; i++) {
          const offset = startOffset + i * pattern.spacing;
          createEnemy(baseX + perpX * offset, baseY + perpY * offset, pattern.type);
        }
        break;

      case 'ring':
        for (let i = 0; i < pattern.count; i++) {
          const ringAngle = (i / pattern.count) * Math.PI * 2;
          createEnemy(
            baseX + Math.cos(ringAngle) * pattern.spacing,
            baseY + Math.sin(ringAngle) * pattern.spacing,
            pattern.type
          );
        }
        break;

      case 'random':
        for (let i = 0; i < pattern.count; i++) {
          const randAngle = Math.random() * Math.PI * 2;
          const randDist = Math.random() * pattern.spacing;
          createEnemy(
            baseX + Math.cos(randAngle) * randDist,
            baseY + Math.sin(randAngle) * randDist,
            pattern.type
          );
        }
        break;
    }
  }
}
```

**Deliverable:** Enemies spawn in varied formations.

### 5.10 Spawn Scheduling

Control spawn timing and mix.

```typescript
class Spawner {
  private spawnQueue: SpawnPattern[] = [];
  private timer = 0;
  private baseInterval = 2.0;

  update(dt: number): void {
    this.timer += dt;

    if (this.timer >= this.baseInterval) {
      this.timer = 0;

      // Pick random pattern, weighted by game time
      const pattern = this.selectPattern();
      const { x, y, angle } = this.getEdgeSpawnPoint();
      this.spawnFormation(pattern, x, y, angle);
    }
  }

  private selectPattern(): SpawnPattern {
    // Early game: mostly grunts and wanderers
    // Mid game: add chasers
    // Late game: weavers and mixed formations
    const weights = this.calculateWeights();
    return weightedRandom(this.patterns, weights);
  }

  private getEdgeSpawnPoint(): { x: number; y: number; angle: number } {
    const edge = Math.floor(Math.random() * 4);
    const offset = 60;

    switch (edge) {
      case 0: return { x: -offset, y: Math.random() * this.worldHeight, angle: 0 };
      case 1: return { x: this.worldWidth + offset, y: Math.random() * this.worldHeight, angle: Math.PI };
      case 2: return { x: Math.random() * this.worldWidth, y: -offset, angle: Math.PI / 2 };
      default: return { x: Math.random() * this.worldWidth, y: this.worldHeight + offset, angle: -Math.PI / 2 };
    }
  }
}
```

**Deliverable:** Spawn system creates varied enemy mix over time.

### Phase 5 Exit Criteria

- [ ] Enemy type system with type-specific storage
- [ ] 4+ distinct enemy types implemented
- [ ] Each type has unique shape and colour
- [ ] Wanderer: drifting, passive behaviour
- [ ] Chaser: direct aggressive pursuit
- [ ] Weaver: sine-wave evasive movement
- [ ] Grunt: slow, spawns in groups
- [ ] Spawn patterns: single, line, ring, random
- [ ] Spawn scheduling varies enemy mix
- [ ] All enemy types interact with grid

---

## Updated Phase Summary

| Phase | Focus | Key Systems | Visual Result |
|-------|-------|-------------|---------------|
| 0 | Setup | Vite, TypeScript, WebGPU types | Black canvas, dev server |
| 1 | Grid | WebGPU, mass-spring sim, bloom | Glowing deformable grid |
| 2 | Player | ECS, sprites, input, physics | Controllable ship with wake |
| 3 | Enemy | Collision, AI, spawning | Chasers to dodge/destroy |
| 4 | Shooting | Bullets, fire rate, collision | Player fights back |
| 5 | Enemy Types | Behaviours, formations, variety | Diverse tactical gameplay |

**After Phase 5**, you'll have a full combat loop with strategic depth. From there:

- **Phase 6:** Scoring, waves, difficulty ramping
- **Phase 7:** Particle system (GPU compute)
- **Phase 8:** Audio (Web Audio API, spatial positioning)
- **Phase 9:** Worker threads (move physics/grid off main thread)
