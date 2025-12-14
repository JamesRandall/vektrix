# Vektrix Delivery Plan - Part 3

Continuation of the phased delivery plan covering scoring, difficulty progression, and GPU-accelerated particle effects.

---

## Phase 6: Scoring & Difficulty

**Goal:** Add game progression through scoring and escalating difficulty. Creates motivation to survive longer and rewards skillful play.

### 6.1 Score System

Track and display player score.

```typescript
// Game state
interface GameState {
  score: number;
  multiplier: number;
  multiplierTimer: number;
  highScore: number;
  waveNumber: number;
  enemiesKilledThisWave: number;
}

const gameState: GameState = {
  score: 0,
  multiplier: 1,
  multiplierTimer: 0,
  highScore: 0,
  waveNumber: 1,
  enemiesKilledThisWave: 0,
};

// Score values per enemy type
const SCORE_VALUES: Record<number, number> = {
  [ENEMY_TYPE.GRUNT]: 25,
  [ENEMY_TYPE.WANDERER]: 50,
  [ENEMY_TYPE.CHASER]: 100,
  [ENEMY_TYPE.WEAVER]: 150,
};

function addScore(enemyType: number): void {
  const baseScore = SCORE_VALUES[enemyType] ?? 50;
  const points = baseScore * gameState.multiplier;
  gameState.score += points;

  // Reset multiplier decay timer
  gameState.multiplierTimer = MULTIPLIER_DECAY_TIME;

  // Increment multiplier (cap at 10x)
  gameState.multiplier = Math.min(10, gameState.multiplier + 0.25);

  gameState.enemiesKilledThisWave++;
}
```

**Deliverable:** Score tracking with enemy-type values.

### 6.2 Score Multiplier

Reward aggressive play with combo multiplier.

```typescript
const MULTIPLIER_DECAY_TIME = 2.0; // seconds before multiplier starts decaying
const MULTIPLIER_DECAY_RATE = 0.5; // per second once decaying

function updateMultiplier(dt: number): void {
  if (gameState.multiplierTimer > 0) {
    gameState.multiplierTimer -= dt;
  } else {
    // Decay multiplier back to 1x
    gameState.multiplier = Math.max(1, gameState.multiplier - MULTIPLIER_DECAY_RATE * dt);
  }
}
```

**Deliverable:** Multiplier encourages continuous enemy destruction.

### 6.3 HUD Rendering

Display score and multiplier on screen.

```typescript
// Simple canvas 2D overlay for HUD
class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  render(state: GameState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Score (top left)
    ctx.font = 'bold 32px monospace';
    ctx.fillStyle = '#00ffff';
    ctx.textAlign = 'left';
    ctx.fillText(`${state.score.toLocaleString()}`, 20, 50);

    // Multiplier (below score, pulsing if active)
    if (state.multiplier > 1) {
      const pulse = state.multiplierTimer > 0 ? 1 : 0.5 + Math.sin(Date.now() / 100) * 0.3;
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#ffff00';
      ctx.fillText(`x${state.multiplier.toFixed(1)}`, 20, 90);
      ctx.globalAlpha = 1;
    }

    // Wave number (top right)
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`WAVE ${state.waveNumber}`, this.canvas.width - 20, 50);

    // High score (below wave)
    ctx.font = '18px monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText(`HI: ${state.highScore.toLocaleString()}`, this.canvas.width - 20, 80);
  }
}
```

**Deliverable:** On-screen HUD showing score, multiplier, wave.

### 6.4 Wave System

Structure gameplay into escalating waves.

```typescript
interface WaveConfig {
  duration: number;           // Wave duration in seconds
  spawnInterval: number;      // Time between spawns
  enemyBudget: number;        // Total enemies to spawn this wave
  typeWeights: Record<number, number>;  // Enemy type spawn weights
  formationChance: number;    // Probability of formation spawns (0-1)
}

const WAVE_CONFIGS: WaveConfig[] = [
  // Wave 1: Tutorial - just grunts
  { duration: 30, spawnInterval: 2.5, enemyBudget: 10,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 1 }, formationChance: 0.2 },

  // Wave 2: Introduce chasers
  { duration: 35, spawnInterval: 2.0, enemyBudget: 15,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 3, [ENEMY_TYPE.CHASER]: 1 }, formationChance: 0.3 },

  // Wave 3: Add wanderers
  { duration: 40, spawnInterval: 1.8, enemyBudget: 20,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 2, [ENEMY_TYPE.CHASER]: 2, [ENEMY_TYPE.WANDERER]: 1 },
    formationChance: 0.4 },

  // Wave 4: Introduce weavers
  { duration: 45, spawnInterval: 1.5, enemyBudget: 25,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 2, [ENEMY_TYPE.CHASER]: 2, [ENEMY_TYPE.WANDERER]: 1, [ENEMY_TYPE.WEAVER]: 1 },
    formationChance: 0.5 },

  // Wave 5+: Escalating difficulty (procedurally generated)
];

function generateWave(waveNumber: number): WaveConfig {
  if (waveNumber <= WAVE_CONFIGS.length) {
    return WAVE_CONFIGS[waveNumber - 1];
  }

  // Procedural waves after predefined ones
  const scale = 1 + (waveNumber - WAVE_CONFIGS.length) * 0.15;
  return {
    duration: 45 + waveNumber * 2,
    spawnInterval: Math.max(0.5, 2.0 - waveNumber * 0.1),
    enemyBudget: Math.floor(25 * scale),
    typeWeights: {
      [ENEMY_TYPE.GRUNT]: 2,
      [ENEMY_TYPE.CHASER]: 2 + Math.floor(waveNumber / 3),
      [ENEMY_TYPE.WANDERER]: 1 + Math.floor(waveNumber / 4),
      [ENEMY_TYPE.WEAVER]: 1 + Math.floor(waveNumber / 2),
    },
    formationChance: Math.min(0.8, 0.3 + waveNumber * 0.05),
  };
}
```

**Deliverable:** Structured waves with escalating difficulty.

### 6.5 Wave Manager

Control wave progression and inter-wave breaks.

```typescript
class WaveManager {
  private currentWave: WaveConfig | null = null;
  private waveTimer = 0;
  private spawnTimer = 0;
  private enemiesSpawned = 0;
  private intermissionTimer = 0;
  private isIntermission = false;

  update(dt: number, spawner: Spawner): void {
    if (this.isIntermission) {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    if (!this.currentWave) {
      this.startNextWave();
      return;
    }

    this.waveTimer -= dt;
    this.spawnTimer -= dt;

    // Spawn enemies
    if (this.spawnTimer <= 0 && this.enemiesSpawned < this.currentWave.enemyBudget) {
      this.spawnTimer = this.currentWave.spawnInterval;
      spawner.spawnWithWeights(this.currentWave.typeWeights, this.currentWave.formationChance);
      this.enemiesSpawned++;
    }

    // Check wave completion
    if (this.waveTimer <= 0 || this.enemiesSpawned >= this.currentWave.enemyBudget) {
      this.endWave();
    }
  }

  private startNextWave(): void {
    gameState.waveNumber++;
    this.currentWave = generateWave(gameState.waveNumber);
    this.waveTimer = this.currentWave.duration;
    this.spawnTimer = 0;
    this.enemiesSpawned = 0;
    this.isIntermission = false;
    gameState.enemiesKilledThisWave = 0;
  }

  private endWave(): void {
    this.isIntermission = true;
    this.intermissionTimer = 3.0; // 3 second break between waves
    this.currentWave = null;

    // Bonus points for completing wave
    const waveBonus = gameState.waveNumber * 500;
    gameState.score += waveBonus;
  }
}
```

**Deliverable:** Waves progress with intermission breaks.

### 6.6 Difficulty Scaling

Dynamic difficulty based on wave progression.

```typescript
interface DifficultySettings {
  enemySpeedMultiplier: number;
  enemyHealthMultiplier: number;
  spawnRateMultiplier: number;
  formationSizeMultiplier: number;
}

function getDifficultySettings(waveNumber: number): DifficultySettings {
  const scale = Math.pow(1.05, waveNumber - 1); // 5% increase per wave

  return {
    enemySpeedMultiplier: Math.min(1.5, 1 + (waveNumber - 1) * 0.03),
    enemyHealthMultiplier: 1, // Reserved for future enemy health system
    spawnRateMultiplier: Math.min(2.0, scale),
    formationSizeMultiplier: Math.min(1.5, 1 + (waveNumber - 1) * 0.05),
  };
}
```

**Deliverable:** Enemies get faster and more numerous over time.

### 6.7 Player Lives & Game Over

Add lives system and game over state.

```typescript
const INITIAL_LIVES = 3;
const RESPAWN_INVULNERABILITY = 2.0; // seconds

interface PlayerState {
  lives: number;
  isAlive: boolean;
  invulnerableTimer: number;
  respawnTimer: number;
}

const playerState: PlayerState = {
  lives: INITIAL_LIVES,
  isAlive: true,
  invulnerableTimer: 0,
  respawnTimer: 0,
};

function onPlayerHit(): void {
  if (playerState.invulnerableTimer > 0) return;

  playerState.lives--;

  // Trigger death explosion particles (Phase 7)
  emitPlayerDeathParticles(playerPos.x, playerPos.y);

  if (playerState.lives <= 0) {
    gameOver();
  } else {
    // Respawn after delay
    playerState.isAlive = false;
    playerState.respawnTimer = 1.5;
  }

  // Reset multiplier on death
  gameState.multiplier = 1;
}

function gameOver(): void {
  // Update high score
  if (gameState.score > gameState.highScore) {
    gameState.highScore = gameState.score;
    localStorage.setItem('vektrix_highscore', String(gameState.highScore));
  }

  // Show game over screen (implementation in HUD)
}
```

**Deliverable:** Lives system with game over handling.

### 6.8 Local Storage Persistence

Save high score and settings.

```typescript
function loadGameData(): void {
  const savedHighScore = localStorage.getItem('vektrix_highscore');
  if (savedHighScore) {
    gameState.highScore = parseInt(savedHighScore, 10);
  }
}

function saveGameData(): void {
  localStorage.setItem('vektrix_highscore', String(gameState.highScore));
}
```

**Deliverable:** High score persists across sessions.

### Phase 6 Exit Criteria

- [ ] Score tracking with enemy-type values
- [ ] Multiplier system (builds on kills, decays over time)
- [ ] HUD displays score, multiplier, wave number
- [ ] Wave system with escalating difficulty
- [ ] Inter-wave breaks
- [ ] Enemy speed/quantity increases per wave
- [ ] Player lives (3 default)
- [ ] Game over screen with restart
- [ ] High score persistence

---

## Phase 7: GPU Particle System

**Goal:** Massive particle counts (100k+) via GPU compute shaders. Explosions on enemy death, player death, and bullet impacts create spectacular visual feedback without CPU overhead.

### 7.1 Architecture Overview

Particles live entirely on the GPU. CPU only emits spawn requests; simulation runs in compute shaders.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Particle Pipeline                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CPU (per frame):                                               │
│    1. Queue emission requests (position, count, color, type)    │
│    2. Upload emission buffer                                    │
│    3. Dispatch compute shader                                   │
│    4. Render particles (instanced draw)                         │
│                                                                 │
│  GPU (compute shader):                                          │
│    1. Process emissions → spawn new particles                   │
│    2. Update all particles (physics, lifetime)                  │
│    3. Compact dead particles (atomic counter)                   │
│    4. Write draw indirect buffer                                │
│                                                                 │
│  GPU (render):                                                  │
│    1. Indirect instanced draw from particle buffer              │
│    2. Point sprites or quads with SDF shapes                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- **Double-buffered particle state**: Compute reads from buffer A, writes to buffer B, swap each frame
- **Atomic counter for live count**: No CPU readback needed
- **Indirect draw**: GPU writes instance count directly
- **Ring buffer emissions**: Fixed-size emission queue, overwrite oldest if full

### 7.2 Particle Data Layout

GPU buffer structure for cache-efficient access.

```typescript
// Particle struct (48 bytes, aligned to 16)
// Stored as Struct-of-Arrays for better GPU cache utilization
const MAX_PARTICLES = 131072; // 128k particles

interface ParticleBuffers {
  // Position & velocity (vec4 each for alignment)
  positionLife: GPUBuffer;    // x, y, life, maxLife (per particle)
  velocitySize: GPUBuffer;    // vx, vy, size, sizeDecay (per particle)
  colorType: GPUBuffer;       // r, g, b, type (per particle)
}

// Buffer sizes
const PARTICLE_BUFFER_SIZE = MAX_PARTICLES * 16; // 4 floats * 4 bytes

function createParticleBuffers(device: GPUDevice): ParticleBuffers {
  const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

  return {
    positionLife: device.createBuffer({ size: PARTICLE_BUFFER_SIZE, usage }),
    velocitySize: device.createBuffer({ size: PARTICLE_BUFFER_SIZE, usage }),
    colorType: device.createBuffer({ size: PARTICLE_BUFFER_SIZE, usage }),
  };
}
```

**Deliverable:** GPU buffer layout for 128k particles.

### 7.3 Emission System

CPU queues particle spawns, GPU processes them.

```typescript
// Emission request (queued on CPU)
interface EmissionRequest {
  x: number;
  y: number;
  count: number;
  type: ParticleType;
  color: [number, number, number];
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  lifetimeMin: number;
  lifetimeMax: number;
  spread: number;  // Angular spread in radians (2π = omnidirectional)
  direction: number; // Base direction in radians
}

const MAX_EMISSIONS_PER_FRAME = 64;
const EMISSION_STRIDE = 64; // bytes per emission (padded for GPU alignment)

class ParticleEmitter {
  private emissionQueue: EmissionRequest[] = [];
  private emissionBuffer: GPUBuffer;
  private emissionData: Float32Array;

  constructor(device: GPUDevice) {
    this.emissionBuffer = device.createBuffer({
      size: MAX_EMISSIONS_PER_FRAME * EMISSION_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.emissionData = new Float32Array(MAX_EMISSIONS_PER_FRAME * 16);
  }

  emit(request: EmissionRequest): void {
    if (this.emissionQueue.length < MAX_EMISSIONS_PER_FRAME) {
      this.emissionQueue.push(request);
    }
  }

  // Convenience methods for common effects
  emitExplosion(x: number, y: number, color: [number, number, number], intensity: number = 1): void {
    this.emit({
      x, y,
      count: Math.floor(50 * intensity),
      type: ParticleType.SPARK,
      color,
      speedMin: 100 * intensity,
      speedMax: 400 * intensity,
      sizeMin: 2,
      sizeMax: 6,
      lifetimeMin: 0.3,
      lifetimeMax: 0.8,
      spread: Math.PI * 2,
      direction: 0,
    });
  }

  uploadAndClear(device: GPUDevice): number {
    const count = this.emissionQueue.length;

    // Pack emission data
    for (let i = 0; i < count; i++) {
      const e = this.emissionQueue[i];
      const offset = i * 16;
      this.emissionData[offset + 0] = e.x;
      this.emissionData[offset + 1] = e.y;
      this.emissionData[offset + 2] = e.count;
      this.emissionData[offset + 3] = e.type;
      this.emissionData[offset + 4] = e.color[0];
      this.emissionData[offset + 5] = e.color[1];
      this.emissionData[offset + 6] = e.color[2];
      this.emissionData[offset + 7] = e.speedMin;
      this.emissionData[offset + 8] = e.speedMax;
      this.emissionData[offset + 9] = e.sizeMin;
      this.emissionData[offset + 10] = e.sizeMax;
      this.emissionData[offset + 11] = e.lifetimeMin;
      this.emissionData[offset + 12] = e.lifetimeMax;
      this.emissionData[offset + 13] = e.spread;
      this.emissionData[offset + 14] = e.direction;
      this.emissionData[offset + 15] = 0; // padding
    }

    device.queue.writeBuffer(this.emissionBuffer, 0, this.emissionData, 0, count * 16);
    this.emissionQueue = [];

    return count;
  }
}
```

**Deliverable:** CPU-side emission queue with GPU upload.

### 7.4 Particle Types

Different visual behaviours for varied effects.

```typescript
enum ParticleType {
  SPARK = 0,      // Fast-fading point
  EMBER = 1,      // Slow-fading, gravity-affected
  DEBRIS = 2,     // Larger, slower, tumbling
  TRAIL = 3,      // Elongated in velocity direction
  RING = 4,       // Expanding ring (single particle creates ring)
}

// Type-specific behaviour applied in compute shader
// - SPARK: High drag, fast fade, no gravity
// - EMBER: Low drag, slow fade, slight gravity
// - DEBRIS: Medium drag, tumble rotation, gravity
// - TRAIL: Stretched based on velocity, high drag
// - RING: Expands over lifetime, fades at edges
```

**Deliverable:** Multiple particle types with distinct behaviours.

### 7.5 Compute Shader - Particle Update

GPU-side particle simulation.

```wgsl
// particle_update.wgsl

struct Particle {
  x: f32,
  y: f32,
  life: f32,
  maxLife: f32,
}

struct ParticleVelocity {
  vx: f32,
  vy: f32,
  size: f32,
  sizeDecay: f32,
}

struct ParticleColor {
  r: f32,
  g: f32,
  b: f32,
  type_: f32,
}

struct Uniforms {
  dt: f32,
  time: f32,
  gravity: f32,
  drag: f32,
}

struct AtomicCounter {
  count: atomic<u32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particlesIn: array<Particle>;
@group(0) @binding(2) var<storage, read> velocitiesIn: array<ParticleVelocity>;
@group(0) @binding(3) var<storage, read> colorsIn: array<ParticleColor>;
@group(0) @binding(4) var<storage, read_write> particlesOut: array<Particle>;
@group(0) @binding(5) var<storage, read_write> velocitiesOut: array<ParticleVelocity>;
@group(0) @binding(6) var<storage, read_write> colorsOut: array<ParticleColor>;
@group(0) @binding(7) var<storage, read_write> liveCount: AtomicCounter;
@group(0) @binding(8) var<storage, read_write> drawIndirect: array<u32>;

const PARTICLE_TYPE_SPARK: f32 = 0.0;
const PARTICLE_TYPE_EMBER: f32 = 1.0;
const PARTICLE_TYPE_DEBRIS: f32 = 2.0;
const PARTICLE_TYPE_TRAIL: f32 = 3.0;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;
  let maxParticles = arrayLength(&particlesIn);

  if (index >= maxParticles) {
    return;
  }

  var p = particlesIn[index];

  // Skip dead particles
  if (p.life <= 0.0) {
    return;
  }

  var v = velocitiesIn[index];
  let c = colorsIn[index];
  let dt = uniforms.dt;

  // Update lifetime
  p.life -= dt;

  if (p.life <= 0.0) {
    // Particle died, don't write to output
    return;
  }

  // Type-specific physics
  var gravity = uniforms.gravity;
  var drag = uniforms.drag;

  if (c.type_ == PARTICLE_TYPE_SPARK) {
    drag = 5.0;  // High drag
    gravity = 0.0;
  } else if (c.type_ == PARTICLE_TYPE_EMBER) {
    drag = 1.0;
    gravity = 50.0;
  } else if (c.type_ == PARTICLE_TYPE_DEBRIS) {
    drag = 2.0;
    gravity = 200.0;
  } else if (c.type_ == PARTICLE_TYPE_TRAIL) {
    drag = 8.0;
    gravity = 0.0;
  }

  // Apply physics
  v.vy += gravity * dt;
  v.vx *= 1.0 - drag * dt;
  v.vy *= 1.0 - drag * dt;

  p.x += v.vx * dt;
  p.y += v.vy * dt;

  // Size decay
  v.size = max(0.0, v.size - v.sizeDecay * dt);

  // Atomically allocate output slot
  let outIndex = atomicAdd(&liveCount.count, 1u);

  // Write compacted output
  particlesOut[outIndex] = p;
  velocitiesOut[outIndex] = v;
  colorsOut[outIndex] = c;
}

// Second pass: write draw indirect buffer
@compute @workgroup_size(1)
fn writeDrawIndirect() {
  let count = atomicLoad(&liveCount.count);
  drawIndirect[0] = 6u;      // vertices per instance (quad)
  drawIndirect[1] = count;   // instance count
  drawIndirect[2] = 0u;      // first vertex
  drawIndirect[3] = 0u;      // first instance
}
```

**Deliverable:** GPU compute shader for particle physics with compaction.

### 7.6 Compute Shader - Particle Emission

Process emission requests and spawn particles.

```wgsl
// particle_emit.wgsl

struct EmissionRequest {
  x: f32,
  y: f32,
  count: f32,
  type_: f32,
  r: f32,
  g: f32,
  b: f32,
  speedMin: f32,
  speedMax: f32,
  sizeMin: f32,
  sizeMax: f32,
  lifetimeMin: f32,
  lifetimeMax: f32,
  spread: f32,
  direction: f32,
  _pad: f32,
}

struct EmissionUniforms {
  emissionCount: u32,
  seed: f32,
  _pad0: f32,
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> uniforms: EmissionUniforms;
@group(0) @binding(1) var<storage, read> emissions: array<EmissionRequest>;
@group(0) @binding(2) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> velocities: array<ParticleVelocity>;
@group(0) @binding(4) var<storage, read_write> colors: array<ParticleColor>;
@group(0) @binding(5) var<storage, read_write> liveCount: AtomicCounter;

// Simple hash for pseudo-random
fn hash(n: u32) -> f32 {
  var x = n;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = ((x >> 16u) ^ x) * 0x45d9f3bu;
  x = (x >> 16u) ^ x;
  return f32(x) / f32(0xffffffffu);
}

fn randomRange(seed: u32, min: f32, max: f32) -> f32 {
  return min + hash(seed) * (max - min);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let emissionIndex = id.x / 64u;  // Which emission request
  let particleOffset = id.x % 64u; // Which particle within emission

  if (emissionIndex >= uniforms.emissionCount) {
    return;
  }

  let e = emissions[emissionIndex];

  if (f32(particleOffset) >= e.count) {
    return;
  }

  // Generate unique seed for this particle
  let seed = u32(uniforms.seed * 1000000.0) + id.x * 1337u;

  // Random angle within spread
  let angle = e.direction + (hash(seed) - 0.5) * e.spread;
  let speed = randomRange(seed + 1u, e.speedMin, e.speedMax);

  // Allocate particle slot
  let slot = atomicAdd(&liveCount.count, 1u);
  let maxParticles = arrayLength(&particles);

  if (slot >= maxParticles) {
    // Buffer full, skip
    atomicSub(&liveCount.count, 1u);
    return;
  }

  // Initialize particle
  var p: Particle;
  p.x = e.x;
  p.y = e.y;
  p.life = randomRange(seed + 2u, e.lifetimeMin, e.lifetimeMax);
  p.maxLife = p.life;

  var v: ParticleVelocity;
  v.vx = cos(angle) * speed;
  v.vy = sin(angle) * speed;
  v.size = randomRange(seed + 3u, e.sizeMin, e.sizeMax);
  v.sizeDecay = v.size / p.life * 0.5; // Shrink to half over lifetime

  var c: ParticleColor;
  // Slight color variation
  let colorVar = 0.2;
  c.r = e.r * (1.0 - colorVar + hash(seed + 4u) * colorVar * 2.0);
  c.g = e.g * (1.0 - colorVar + hash(seed + 5u) * colorVar * 2.0);
  c.b = e.b * (1.0 - colorVar + hash(seed + 6u) * colorVar * 2.0);
  c.type_ = e.type_;

  particles[slot] = p;
  velocities[slot] = v;
  colors[slot] = c;
}
```

**Deliverable:** GPU emission shader spawns particles from CPU requests.

### 7.7 Particle Render Shader

Render particles as point sprites with SDF shapes.

```wgsl
// particle_render.wgsl

struct Uniforms {
  screenSize: vec2f,
  cameraPos: vec2f,
  zoom: f32,
  time: f32,
  _pad: vec2f,
}

struct Particle {
  x: f32,
  y: f32,
  life: f32,
  maxLife: f32,
}

struct ParticleVelocity {
  vx: f32,
  vy: f32,
  size: f32,
  sizeDecay: f32,
}

struct ParticleColor {
  r: f32,
  g: f32,
  b: f32,
  type_: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
@group(0) @binding(2) var<storage, read> velocities: array<ParticleVelocity>;
@group(0) @binding(3) var<storage, read> colors: array<ParticleColor>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
  @location(2) life: f32,
  @location(3) type_: f32,
}

// Quad vertices
const quadPositions = array<vec2f, 6>(
  vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
  vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
);

const quadUVs = array<vec2f, 6>(
  vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
);

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let p = particles[instanceIndex];
  let v = velocities[instanceIndex];
  let c = colors[instanceIndex];

  let localPos = quadPositions[vertexIndex];

  // Scale by particle size
  var size = v.size;

  // Trail particles stretch in velocity direction
  var stretch = vec2f(1.0, 1.0);
  if (c.type_ == 3.0) { // TRAIL
    let speed = sqrt(v.vx * v.vx + v.vy * v.vy);
    stretch = vec2f(1.0 + speed * 0.01, 1.0);
  }

  var pos = localPos * size * stretch;

  // Rotate trail particles to face velocity
  if (c.type_ == 3.0 && (v.vx != 0.0 || v.vy != 0.0)) {
    let angle = atan2(v.vy, v.vx);
    let cos_a = cos(angle);
    let sin_a = sin(angle);
    pos = vec2f(
      pos.x * cos_a - pos.y * sin_a,
      pos.x * sin_a + pos.y * cos_a
    );
  }

  // World position
  let worldPos = pos + vec2f(p.x, p.y);

  // Camera transform
  let viewPos = (worldPos - uniforms.cameraPos) * uniforms.zoom + uniforms.screenSize * 0.5;
  let clip = (viewPos / uniforms.screenSize) * 2.0 - 1.0;

  var output: VertexOutput;
  output.position = vec4f(clip.x, -clip.y, 0.0, 1.0);

  // Fade alpha based on lifetime
  let lifeRatio = p.life / p.maxLife;
  let alpha = lifeRatio * lifeRatio; // Quadratic fade

  output.color = vec4f(c.r, c.g, c.b, alpha);
  output.uv = quadUVs[vertexIndex];
  output.life = lifeRatio;
  output.type_ = c.type_;

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.uv - vec2f(0.5);
  let dist = length(uv);

  // Soft circle falloff
  let alpha = 1.0 - smoothstep(0.3, 0.5, dist);

  if (alpha < 0.01) {
    discard;
  }

  // HDR bloom-friendly output
  return vec4f(input.color.rgb * 2.0, input.color.a * alpha);
}
```

**Deliverable:** Particle render shader with instanced quads.

### 7.8 Particle System Class

Orchestrates compute and render passes.

```typescript
class ParticleSystem {
  private device: GPUDevice;

  // Double-buffered particle state
  private buffersA: ParticleBuffers;
  private buffersB: ParticleBuffers;
  private currentBuffer = 0;

  // Atomic counter and indirect draw
  private counterBuffer: GPUBuffer;
  private drawIndirectBuffer: GPUBuffer;

  // Pipelines
  private emitPipeline: GPUComputePipeline;
  private updatePipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;

  // Bind groups (recreated on buffer swap)
  private emitBindGroup: GPUBindGroup;
  private updateBindGroup: GPUBindGroup;
  private renderBindGroup: GPUBindGroup;

  // Emitter
  private emitter: ParticleEmitter;

  constructor(device: GPUDevice) {
    this.device = device;
    this.buffersA = createParticleBuffers(device);
    this.buffersB = createParticleBuffers(device);
    this.emitter = new ParticleEmitter(device);

    // Counter buffer (reset each frame)
    this.counterBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Indirect draw buffer
    this.drawIndirectBuffer = device.createBuffer({
      size: 16, // 4 x u32
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.INDIRECT,
    });

    // Create pipelines...
    this.createPipelines();
  }

  emit(request: EmissionRequest): void {
    this.emitter.emit(request);
  }

  emitExplosion(x: number, y: number, color: [number, number, number], intensity = 1): void {
    this.emitter.emitExplosion(x, y, color, intensity);
  }

  update(encoder: GPUCommandEncoder, dt: number, time: number): void {
    // Reset counter
    this.device.queue.writeBuffer(this.counterBuffer, 0, new Uint32Array([0]));

    // Upload emissions
    const emissionCount = this.emitter.uploadAndClear(this.device);

    // Emit pass (if any emissions)
    if (emissionCount > 0) {
      const emitPass = encoder.beginComputePass();
      emitPass.setPipeline(this.emitPipeline);
      emitPass.setBindGroup(0, this.emitBindGroup);
      emitPass.dispatchWorkgroups(Math.ceil(emissionCount * 64 / 64));
      emitPass.end();
    }

    // Update pass
    const updatePass = encoder.beginComputePass();
    updatePass.setPipeline(this.updatePipeline);
    updatePass.setBindGroup(0, this.updateBindGroup);
    updatePass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / 256));
    updatePass.end();

    // Swap buffers
    this.currentBuffer = 1 - this.currentBuffer;
    this.rebuildBindGroups();
  }

  render(encoder: GPUCommandEncoder, target: GPUTextureView): void {
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.renderPipeline);
    pass.setBindGroup(0, this.renderBindGroup);
    pass.drawIndirect(this.drawIndirectBuffer, 0);
    pass.end();
  }
}
```

**Deliverable:** Complete particle system with compute/render integration.

### 7.9 Effect Presets

Pre-configured explosion types for game events.

```typescript
const PARTICLE_EFFECTS = {
  // Enemy death - burst in enemy color
  enemyDeath: (x: number, y: number, color: [number, number, number]) => ({
    x, y,
    count: 40,
    type: ParticleType.SPARK,
    color,
    speedMin: 150,
    speedMax: 350,
    sizeMin: 3,
    sizeMax: 8,
    lifetimeMin: 0.2,
    lifetimeMax: 0.6,
    spread: Math.PI * 2,
    direction: 0,
  }),

  // Player death - massive explosion
  playerDeath: (x: number, y: number) => ({
    x, y,
    count: 150,
    type: ParticleType.SPARK,
    color: [0.4, 1.2, 1.5] as [number, number, number], // Cyan like player
    speedMin: 200,
    speedMax: 600,
    sizeMin: 4,
    sizeMax: 12,
    lifetimeMin: 0.4,
    lifetimeMax: 1.2,
    spread: Math.PI * 2,
    direction: 0,
  }),

  // Bullet impact - small directional burst
  bulletImpact: (x: number, y: number, angle: number) => ({
    x, y,
    count: 15,
    type: ParticleType.SPARK,
    color: [1.5, 1.5, 0.4] as [number, number, number], // Yellow like bullet
    speedMin: 100,
    speedMax: 250,
    sizeMin: 2,
    sizeMax: 5,
    lifetimeMin: 0.1,
    lifetimeMax: 0.3,
    spread: Math.PI * 0.5, // 90 degree cone
    direction: angle + Math.PI, // Opposite to bullet direction
  }),

  // Muzzle flash - brief forward burst
  muzzleFlash: (x: number, y: number, angle: number) => ({
    x, y,
    count: 8,
    type: ParticleType.SPARK,
    color: [1.5, 1.2, 0.3] as [number, number, number],
    speedMin: 200,
    speedMax: 400,
    sizeMin: 2,
    sizeMax: 4,
    lifetimeMin: 0.05,
    lifetimeMax: 0.15,
    spread: Math.PI * 0.3,
    direction: angle,
  }),

  // Engine trail - continuous emission
  engineTrail: (x: number, y: number, angle: number) => ({
    x, y,
    count: 3,
    type: ParticleType.TRAIL,
    color: [0.3, 0.8, 1.2] as [number, number, number],
    speedMin: 50,
    speedMax: 100,
    sizeMin: 2,
    sizeMax: 4,
    lifetimeMin: 0.1,
    lifetimeMax: 0.3,
    spread: Math.PI * 0.2,
    direction: angle + Math.PI, // Behind player
  }),
};
```

**Deliverable:** Pre-configured effects for game events.

### 7.10 Integration with Game Events

Wire particle effects into collision and combat systems.

```typescript
// In main.ts collision handling
for (const { a, b } of collisions) {
  // ... existing collision logic ...

  // Bullet hits enemy
  if ((aIsBullet && bIsEnemy) || (bIsBullet && aIsEnemy)) {
    const enemyIdx = aIsEnemy ? a : b;
    const bulletIdx = aIsBullet ? a : b;

    // Get enemy color for particles
    const enemyColor: [number, number, number] = [
      sprites.tintR[enemyIdx],
      sprites.tintG[enemyIdx],
      sprites.tintB[enemyIdx],
    ];

    // Emit explosion
    particleSystem.emit(PARTICLE_EFFECTS.enemyDeath(
      transforms.x[enemyIdx],
      transforms.y[enemyIdx],
      enemyColor
    ));

    // Bullet impact particles
    const bulletAngle = transforms.rotation[bulletIdx];
    particleSystem.emit(PARTICLE_EFFECTS.bulletImpact(
      transforms.x[enemyIdx],
      transforms.y[enemyIdx],
      bulletAngle
    ));

    // ... destroy enemy and bullet ...
  }

  // Player hits enemy (death)
  if ((aIsPlayer && bIsEnemy) || (bIsPlayer && aIsEnemy)) {
    particleSystem.emit(PARTICLE_EFFECTS.playerDeath(playerPos.x, playerPos.y));
    // ... handle player death ...
  }
}

// Muzzle flash on shooting
if (bulletFired) {
  particleSystem.emit(PARTICLE_EFFECTS.muzzleFlash(
    playerPos.x + Math.cos(aimAngle) * 25,
    playerPos.y + Math.sin(aimAngle) * 25,
    aimAngle
  ));
}
```

**Deliverable:** Particles emit on all combat events.

### 7.11 Performance Optimizations

Ensure system scales to 100k+ particles.

```typescript
// Shader optimization flags
const WORKGROUP_SIZE = 256;  // Optimal for most GPUs
const MAX_PARTICLES = 131072; // 128k, power of 2

// Buffer strategy:
// - Double buffer prevents read-after-write hazards
// - Compaction in update pass reduces overdraw
// - Indirect draw avoids CPU readback of particle count

// Dispatch optimization:
// - Only dispatch emission compute if emissions queued
// - Update pass always runs (handles lifetime decay)
// - Render pass uses indirect draw (GPU-driven instance count)

// Memory optimization:
// - 48 bytes per particle (position, velocity, color, life)
// - 128k particles = 6MB GPU memory
// - Struct-of-Arrays for coalesced memory access
```

**Deliverable:** System handles 100k+ particles at 60fps.

### Phase 7 Exit Criteria

- [ ] Particle data stored entirely in GPU buffers
- [ ] Compute shader for particle physics (gravity, drag, lifetime)
- [ ] Compute shader for emission processing
- [ ] Atomic counter for live particle count
- [ ] Indirect draw eliminates CPU readback
- [ ] Double-buffered state prevents hazards
- [ ] Enemy death emits explosion particles
- [ ] Player death emits large explosion
- [ ] Bullet impact emits directional sparks
- [ ] Muzzle flash on shooting
- [ ] Multiple particle types (spark, ember, trail)
- [ ] Particles interact with bloom pass
- [ ] 100k+ particles at 60fps target

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
| 6 | Scoring | Points, multiplier, waves, lives | Progression and stakes |
| 7 | Particles | GPU compute, explosions, effects | Spectacular visual feedback |

**After Phase 7**, the core game loop is complete with full visual polish. Remaining phases:

- **Phase 8:** Audio (Web Audio API, spatial positioning, procedural sounds)
- **Phase 9:** Performance (Worker threads for physics, SharedArrayBuffer)
- **Phase 10:** Polish (Screen shake, slow-mo, power-ups, leaderboards)
