# Vektrix Engine Architecture Specification

A data-oriented, async-first architecture for a browser-based 2D/2.5D game engine. Vektrix serves as both the proving ground and the showcase—if it runs well with thousands of entities, particles, and constant collision checks, the architecture is sound.

---

## Design Principles

**Data-oriented over object-oriented.** Game state lives in typed arrays backed by SharedArrayBuffer. Entity is just a `u32` index. The user-facing component API is a view layer over flat storage.

**Async by default.** GPU compute for collision, worker threads for physics and AI, main thread for rendering and user scripts. Latency is hidden through pipelining, not avoided.

**Prove it with stress.** Vektrix exercises mass entity churn, thousands of collision pairs per frame, heavy particle systems, and a deformable grid. Anything that survives this generalises well.

---

## Memory Layout

### Entity Storage

Entities are indices into parallel arrays. No heap allocations per entity, no pointer chasing.

```typescript
const MAX_ENTITIES = 65536;

// Entity lifecycle
const entities = {
  buffer: new SharedArrayBuffer(MAX_ENTITIES * 4),
  generation: new Uint16Array(...),  // incremented on reuse to invalidate stale handles
  flags: new Uint16Array(...),       // alive, active, etc.
};

// Freelist for recycling
const freeList: Uint32Array;  // stack of available indices
let freeCount: number;
```

Entity handles are `(index << 16) | generation` packed into a `u32`. Stale handle detection is a single comparison.

### Component Storage (Struct-of-Arrays)

Each component type owns contiguous typed arrays. Components are optional—presence tracked via bitflags per entity.

```typescript
// Transform component
const transforms = {
  buffer: new SharedArrayBuffer(MAX_ENTITIES * 24),
  x: new Float32Array(buffer, 0, MAX_ENTITIES),
  y: new Float32Array(buffer, MAX_ENTITIES * 4, MAX_ENTITIES),
  rotation: new Float32Array(buffer, MAX_ENTITIES * 8, MAX_ENTITIES),
  scaleX: new Float32Array(buffer, MAX_ENTITIES * 12, MAX_ENTITIES),
  scaleY: new Float32Array(buffer, MAX_ENTITIES * 16, MAX_ENTITIES),
  z: new Float32Array(buffer, MAX_ENTITIES * 20, MAX_ENTITIES),  // depth sorting
};

// Velocity component (physics-owned)
const velocities = {
  buffer: new SharedArrayBuffer(MAX_ENTITIES * 8),
  vx: new Float32Array(buffer, 0, MAX_ENTITIES),
  vy: new Float32Array(buffer, MAX_ENTITIES * 4, MAX_ENTITIES),
};

// Sprite component
const sprites = {
  buffer: new SharedArrayBuffer(MAX_ENTITIES * 16),
  textureId: new Uint16Array(...),
  frameIndex: new Uint16Array(...),
  width: new Uint16Array(...),
  height: new Uint16Array(...),
  flags: new Uint8Array(...),  // flipX, flipY, visible, emissive
  tint: new Uint32Array(...),  // packed RGBA
};

// Collision component
const colliders = {
  buffer: new SharedArrayBuffer(MAX_ENTITIES * 20),
  halfWidth: new Float32Array(...),
  halfHeight: new Float32Array(...),
  layer: new Uint8Array(...),      // collision layer bitmask
  mask: new Uint8Array(...),       // layers this collides with
  flags: new Uint8Array(...),      // enabled, trigger, static
};

// Component presence bitmask per entity
const componentMask: Uint32Array;  // bit 0 = transform, bit 1 = velocity, etc.
```

### Why Struct-of-Arrays

Cache efficiency when iterating systems. Physics reads all `x`, `y`, `vx`, `vy` in tight loops—contiguous memory, no interleaved garbage. GPU upload is a single `writeBuffer` call per component type.

---

## Worker Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                         Main Thread                              │
│  - Render loop (WebGPU command encoding)                        │
│  - User behaviour scripts                                        │
│  - Input handling                                                │
│  - Audio                                                         │
│  - Orchestration                                                 │
└──────────────────────────┬──────────────────────────────────────┘
                           │ SharedArrayBuffer
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Physics Worker │  │ Collision     │  │ Grid Worker   │
│                │  │ Worker        │  │               │
│ - Integration  │  │ - Broad phase │  │ - Mass-spring │
│ - Constraints  │  │ - Spatial hash│  │   simulation  │
│ - Grid deform  │  │ - Pair output │  │ - Vertex      │
│   forces       │  │               │  │   buffer gen  │
└───────────────┘  └───────────────┘  └───────────────┘
```

### Synchronisation

Frame-locked via Atomics. Workers read state, compute, write results, signal completion.

```typescript
// Shared sync state
const sync = {
  buffer: new SharedArrayBuffer(16),
  phase: new Int32Array(buffer, 0, 1),      // current frame phase
  frameId: new Uint32Array(buffer, 4, 1),   // monotonic frame counter
  workersDone: new Int32Array(buffer, 8, 1) // atomic countdown
};

const PHASE = {
  IDLE: 0,
  SIMULATE: 1,
  READY: 2
};

// Main thread kicks off simulation
function beginSimulation() {
  Atomics.store(sync.workersDone, 0, WORKER_COUNT);
  Atomics.store(sync.phase, 0, PHASE.SIMULATE);
  Atomics.notify(sync.phase, 0);
}

// Worker waits for work, processes, signals completion
function workerLoop() {
  while (true) {
    Atomics.wait(sync.phase, 0, PHASE.IDLE);
    
    // Do work...
    processPhysics();
    
    // Signal completion
    if (Atomics.sub(sync.workersDone, 0, 1) === 1) {
      Atomics.store(sync.phase, 0, PHASE.READY);
      Atomics.notify(sync.phase, 0);
    }
  }
}

// Main thread waits for all workers
async function awaitSimulation() {
  while (Atomics.load(sync.phase, 0) !== PHASE.READY) {
    await Atomics.waitAsync(sync.phase, 0, PHASE.SIMULATE).value;
  }
}
```

### Data Ownership and Parallel Safety

Workers don't all run simultaneously on the same data. Parallel execution is safe because of strict data ownership and phase ordering.

**Ownership breakdown:**

| Worker | Reads | Writes |
|--------|-------|--------|
| Collision (broad phase) | transforms, colliders | candidate pairs buffer |
| Physics | velocities, collision results | transforms, velocities |
| Grid | grid state, impulse snapshot | grid vertices |

The critical conflict is transforms—collision reads them, physics writes them. This is resolved through phased execution:

```
Frame N:
│
├─ Phase 1: Collision Broad Phase
│  ├─ Reads: transforms (safe - physics not writing yet)
│  ├─ Reads: colliders
│  └─ Writes: candidate pairs to separate buffer
│
├─ Phase 2: Physics + Grid (truly parallel)
│  ├─ Physics Worker:
│  │  ├─ Reads: velocities, collision results from previous frame
│  │  └─ Writes: transforms, velocities
│  │
│  └─ Grid Worker:
│     ├─ Reads: grid state, impulse snapshot (not transforms!)
│     └─ Writes: grid vertex positions
│
└─ Phase 3: Main Thread
   ├─ GPU pixel-perfect collision dispatch
   ├─ User behaviour scripts
   └─ Render
```

Physics and Grid run simultaneously because they write to completely separate memory regions. The grid needs entity positions for impulse sources (explosions, bullets), but accessing main transform arrays during physics would create a race condition.

### Impulse Snapshot

Before Phase 2, main thread snapshots impulse source positions into a small dedicated buffer. Grid worker reads this instead of the main transform arrays.

```typescript
// Impulse sources - explosions, bullet impacts, player bombs
const MAX_IMPULSE_SOURCES = 256;

const impulseSnapshot = {
  buffer: new SharedArrayBuffer(MAX_IMPULSE_SOURCES * 16),
  x: new Float32Array(buffer, 0, MAX_IMPULSE_SOURCES),
  y: new Float32Array(buffer, MAX_IMPULSE_SOURCES * 4, MAX_IMPULSE_SOURCES),
  radius: new Float32Array(buffer, MAX_IMPULSE_SOURCES * 8, MAX_IMPULSE_SOURCES),
  force: new Float32Array(buffer, MAX_IMPULSE_SOURCES * 12, MAX_IMPULSE_SOURCES),
};

let impulseCount = 0;

// Called on main thread before Phase 2
function snapshotImpulses() {
  impulseCount = 0;
  
  for (const entity of activeImpulseSources) {
    if (impulseCount >= MAX_IMPULSE_SOURCES) break;
    
    impulseSnapshot.x[impulseCount] = transforms.x[entity];
    impulseSnapshot.y[impulseCount] = transforms.y[entity];
    impulseSnapshot.radius[impulseCount] = impulses.radius[entity];
    impulseSnapshot.force[impulseCount] = impulses.force[entity];
    impulseCount++;
  }
  
  // Store count for grid worker to read
  Atomics.store(impulseSnapshot.count, 0, impulseCount);
}

// Grid worker uses snapshot, never touches transforms
function applySnapshotImpulses() {
  const count = Atomics.load(impulseSnapshot.count, 0);
  
  for (let i = 0; i < count; i++) {
    applyGridImpulse(
      impulseSnapshot.x[i],
      impulseSnapshot.y[i],
      impulseSnapshot.radius[i],
      impulseSnapshot.force[i]
    );
  }
}
```

This keeps physics and grid fully independent with no double-buffer latency. The snapshot is tiny (4KB for 256 sources) and written once per frame.

### Why Not Double-Buffer Transforms?

An alternative is maintaining two transform arrays—physics writes to `next`, everyone else reads `current`, swap at frame end. This works but adds one frame of latency to position updates (16ms at 60fps). For responsive gameplay, especially player movement, this can feel "floaty".

The phase-based approach with impulse snapshots achieves true parallelism without the latency cost.

### Why Not Atomics Everywhere?

You could use `Atomics.load` and `Atomics.store` for every transform access, guaranteeing no torn reads. Problems:

- Performance overhead on every access
- `Float32Array` doesn't support Atomics directly—you'd need `Uint32Array` views and bitcasting
- Overkill when phase ordering already prevents conflicts

Atomics are reserved for synchronisation primitives (phase flags, worker countdown), not bulk data access.

---

## Collision System

### Broad Phase: Spatial Hash Grid

Cell size tuned to average entity size (e.g., 64 pixels). Entities register in cells they overlap.

```typescript
const CELL_SIZE = 64;
const GRID_WIDTH = Math.ceil(WORLD_WIDTH / CELL_SIZE);

// Per-cell entity lists (fixed-size for predictability)
const MAX_PER_CELL = 32;
const cellEntities = new Uint32Array(GRID_WIDTH * GRID_HEIGHT * MAX_PER_CELL);
const cellCounts = new Uint16Array(GRID_WIDTH * GRID_HEIGHT);

function insertEntity(id: u32, x: f32, y: f32, hw: f32, hh: f32) {
  const minCellX = Math.floor((x - hw) / CELL_SIZE);
  const maxCellX = Math.floor((x + hw) / CELL_SIZE);
  const minCellY = Math.floor((y - hh) / CELL_SIZE);
  const maxCellY = Math.floor((y + hh) / CELL_SIZE);
  
  for (let cy = minCellY; cy <= maxCellY; cy++) {
    for (let cx = minCellX; cx <= maxCellX; cx++) {
      const cellIdx = cy * GRID_WIDTH + cx;
      const count = cellCounts[cellIdx];
      if (count < MAX_PER_CELL) {
        cellEntities[cellIdx * MAX_PER_CELL + count] = id;
        cellCounts[cellIdx]++;
      }
    }
  }
}
```

### Narrow Phase: AABB

After broad phase identifies candidate pairs, AABB test filters further:

```typescript
function aabbOverlap(
  ax: f32, ay: f32, ahw: f32, ahh: f32,
  bx: f32, by: f32, bhw: f32, bhh: f32
): boolean {
  return Math.abs(ax - bx) < (ahw + bhw) &&
         Math.abs(ay - by) < (ahh + bhh);
}
```

### Pixel-Perfect: GPU Compute

For pairs passing AABB, dispatch compute shader over the overlap region. Results written to a collision buffer, read back async.

```wgsl
struct CollisionQuery {
  entityA: u32,
  entityB: u32,
  overlapMinX: f32,
  overlapMinY: f32,
  overlapMaxX: f32,
  overlapMaxY: f32,
  // Transform data for both sprites
  transformA: mat3x3<f32>,
  transformB: mat3x3<f32>,
  texOffsetA: vec2u,  // atlas offset
  texOffsetB: vec2u,
}

@group(0) @binding(0) var<storage, read> queries: array<CollisionQuery>;
@group(0) @binding(1) var<storage, read_write> results: array<atomic<u32>>;
@group(0) @binding(2) var atlas: texture_2d<f32>;

@compute @workgroup_size(8, 8)
fn main(
  @builtin(workgroup_id) wgId: vec3u,
  @builtin(local_invocation_id) localId: vec3u
) {
  let query = queries[wgId.z];
  let worldPos = vec2f(
    query.overlapMinX + f32(wgId.x * 8u + localId.x),
    query.overlapMinY + f32(wgId.y * 8u + localId.y)
  );
  
  // Check bounds
  if (worldPos.x > query.overlapMaxX || worldPos.y > query.overlapMaxY) {
    return;
  }
  
  // Transform to texture space
  let uvA = (query.transformA * vec3f(worldPos, 1.0)).xy;
  let uvB = (query.transformB * vec3f(worldPos, 1.0)).xy;
  
  let texCoordA = vec2i(query.texOffsetA) + vec2i(uvA);
  let texCoordB = vec2i(query.texOffsetB) + vec2i(uvB);
  
  let alphaA = textureLoad(atlas, texCoordA, 0).a;
  let alphaB = textureLoad(atlas, texCoordB, 0).a;
  
  if (alphaA > 0.5 && alphaB > 0.5) {
    atomicStore(&results[wgId.z], 1u);
  }
}
```

### Handling Readback Latency

Collision dispatch happens early in frame. Results read after other work completes.

```typescript
async function frame(dt: number) {
  // 1. Kick off collision compute
  const collisionPairs = broadPhase();
  dispatchPixelPerfectCompute(collisionPairs);
  
  // 2. Do other work while GPU crunches
  beginSimulation();  // workers start physics
  updateAnimations();
  updateAudio();
  processInput();
  await awaitSimulation();  // workers done
  
  // 3. Now read collision results (GPU likely done by now)
  const collisions = await readCollisionResults();
  
  // 4. Respond to collisions
  for (const { entityA, entityB } of collisions) {
    emitCollisionEvent(entityA, entityB);
  }
  
  // 5. Run user scripts (may react to collision events)
  runBehaviours(dt);
  
  // 6. Render
  render();
}
```

---

## Rendering

### Batched Instanced Drawing

All sprites share a single quad. Per-instance data packed into a storage buffer.

```typescript
struct SpriteInstance {
  transform: mat3x3<f32>,  // 2D transform (position, rotation, scale)
  uvRect: vec4f,           // atlas region (x, y, w, h)
  tint: vec4f,
  flags: u32,              // emissive, additive blend, etc.
}
```

Instances sorted by texture atlas page (ideally one atlas), then by blend mode. Minimal state changes.

```typescript
function buildSpriteBatch() {
  let instanceCount = 0;
  
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (!(componentMask[i] & (COMP_TRANSFORM | COMP_SPRITE))) continue;
    if (!(sprites.flags[i] & FLAG_VISIBLE)) continue;
    
    // Write directly to mapped GPU buffer
    writeInstance(instanceBuffer, instanceCount++, i);
  }
  
  return instanceCount;
}
```

### Post-Processing Pipeline

Vektrix aesthetic requires:

1. **Render to HDR target** (RGBA16Float)
2. **Bloom pass** - threshold, blur, composite
3. **Grid overlay** - separate render pass
4. **Tonemap + colour grading**
5. **Present**

```typescript
const postPipeline = [
  { shader: bloomThreshold, input: 'hdr', output: 'bloomA' },
  { shader: gaussianBlurH, input: 'bloomA', output: 'bloomB' },
  { shader: gaussianBlurV, input: 'bloomB', output: 'bloomA' },
  // Multiple blur iterations for wider bloom
  { shader: gaussianBlurH, input: 'bloomA', output: 'bloomB' },
  { shader: gaussianBlurV, input: 'bloomB', output: 'bloom' },
  { shader: composite, inputs: ['hdr', 'bloom', 'grid'], output: 'final' },
];
```

---

## The Grid

Vektrix's deformable background is a mass-spring system. Each vertex is a point mass connected to neighbours.

### Data Layout

```typescript
const GRID_COLS = 64;
const GRID_ROWS = 36;
const VERTEX_COUNT = GRID_COLS * GRID_ROWS;

const grid = {
  buffer: new SharedArrayBuffer(VERTEX_COUNT * 24),
  x: new Float32Array(...),
  y: new Float32Array(...),
  vx: new Float32Array(...),
  vy: new Float32Array(...),
  restX: new Float32Array(...),  // rest position
  restY: new Float32Array(...),
};
```

### Simulation (Worker)

The grid uses [Hooke's Law](https://en.wikipedia.org/wiki/Hooke%27s_law) for spring forces: `F = -kx`, where force is proportional to displacement from rest position. Each vertex has:

- An anchor spring pulling it back to its rest position
- Structural springs connecting it to neighbours (up, down, left, right)
- Velocity damping to prevent endless oscillation

The stiffness constant `k` controls how "tight" the grid feels. Higher values = snappier response, lower values = more wobbly. Damping bleeds energy from the system so disturbances settle rather than ringing forever.

```typescript
function simulateGrid(dt: number) {
  const k = 400;      // spring stiffness (Hooke's Law constant)
  const damping = 5;  // velocity damping coefficient
  
  for (let i = 0; i < VERTEX_COUNT; i++) {
    let fx = 0, fy = 0;
    
    // Spring to rest position
    fx += (grid.restX[i] - grid.x[i]) * k;
    fy += (grid.restY[i] - grid.y[i]) * k;
    
    // Springs to neighbours (left, right, up, down)
    for (const n of getNeighbours(i)) {
      const dx = grid.x[n] - grid.x[i];
      const dy = grid.y[n] - grid.y[i];
      const restLen = distance(grid.restX[i], grid.restY[i], grid.restX[n], grid.restY[n]);
      const len = Math.sqrt(dx * dx + dy * dy);
      const stretch = len - restLen;
      
      fx += (dx / len) * stretch * k * 0.5;
      fy += (dy / len) * stretch * k * 0.5;
    }
    
    // Damping
    fx -= grid.vx[i] * damping;
    fy -= grid.vy[i] * damping;
    
    // Integrate
    grid.vx[i] += fx * dt;
    grid.vy[i] += fy * dt;
    grid.x[i] += grid.vx[i] * dt;
    grid.y[i] += grid.vy[i] * dt;
  }
}

// Apply impulse from explosions/bullets
function applyGridImpulse(worldX: number, worldY: number, radius: number, force: number) {
  for (let i = 0; i < VERTEX_COUNT; i++) {
    const dx = grid.x[i] - worldX;
    const dy = grid.y[i] - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < radius && dist > 0) {
      const falloff = 1 - (dist / radius);
      const impulse = force * falloff * falloff;
      grid.vx[i] += (dx / dist) * impulse;
      grid.vy[i] += (dy / dist) * impulse;
    }
  }
}
```

### Rendering

Grid rendered as line segments. Vertex buffer updated each frame from simulation output.

---

## User-Facing API

The flat data lives underneath. Users see a clean component/entity interface.

### Entity Handle

```typescript
class Entity {
  constructor(private _world: World, private _handle: u32) {}
  
  get id(): u32 { return this._handle & 0xFFFF; }
  get generation(): u16 { return this._handle >> 16; }
  
  get valid(): boolean {
    return this._world.entities.generation[this.id] === this.generation;
  }
  
  get transform(): Transform | null {
    if (!this.has(ComponentType.Transform)) return null;
    return new Transform(this._world.transforms, this.id);
  }
  
  has(type: ComponentType): boolean {
    return (this._world.componentMask[this.id] & type) !== 0;
  }
  
  add<T extends Component>(type: ComponentConstructor<T>): T {
    // Allocate component, set presence bit, return view
  }
  
  destroy() {
    // Clear presence bits, add to freelist, bump generation
  }
}
```

### Component View

```typescript
class Transform {
  constructor(private _storage: TransformStorage, private _id: u32) {}
  
  get x(): number { return this._storage.x[this._id]; }
  set x(v: number) { this._storage.x[this._id] = v; }
  
  get y(): number { return this._storage.y[this._id]; }
  set y(v: number) { this._storage.y[this._id] = v; }
  
  get rotation(): number { return this._storage.rotation[this._id]; }
  set rotation(v: number) { this._storage.rotation[this._id] = v; }
  
  setPosition(x: number, y: number) {
    this._storage.x[this._id] = x;
    this._storage.y[this._id] = y;
  }
}
```

### Behaviour System

User scripts attach to entities. Event decorators subscribe to typed events.

```typescript
class EnemyBehaviour extends Behaviour {
  constructor(
    private transform: Transform,
    private velocity: Velocity,
    private target: Entity
  ) {}
  
  @on('update')
  seek(dt: number) {
    const tx = this.target.transform!;
    const dx = tx.x - this.transform.x;
    const dy = tx.y - this.transform.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    
    this.velocity.vx = (dx / len) * ENEMY_SPEED;
    this.velocity.vy = (dy / len) * ENEMY_SPEED;
  }
  
  @on('collision:enter')
  die(other: Entity) {
    if (other.has(ComponentType.Bullet)) {
      spawnExplosion(this.transform.x, this.transform.y);
      this.entity.destroy();
    }
  }
}
```

---

## Frame Timeline

```
Time ────────────────────────────────────────────────────────────────────────────►

Phase 1 (Sequential):
Main:     [Input] [Collision Broad Phase] [Snapshot Impulses] [Flush Particle Emits]
                          |
                          v
                   candidate pairs

Phase 2 (Parallel):
Physics:                                  [Integration + Constraints]--------+
Grid:                                     [Mass-Spring + Impulses]-----------+
GPU:                                      [Pixel-Perfect Collision]          |
                                          [Particle Emit]                    |
                                          [Particle Update]------------------+
                                                                             |
Phase 3 (Sequential):                                                        |
Main:     <------------------------------------------------------------------+
          [Read Collision Results] [Behaviours] [Render Sprites]
          [Render Grid] [Render Particles] [Post-Process] [Present]
```

Phase 2 is where the parallelism pays off—physics and grid run on worker threads while GPU handles collision, particle emission, and particle update simultaneously.

---

## Vektrix-Specific Systems

### Spawning

Enemy spawner tracks patterns, wave timing, spawn points. Uses a seeded PRNG for determinism (replays, debugging).

```typescript
interface SpawnPattern {
  enemyType: EnemyType;
  count: number;
  formation: 'ring' | 'line' | 'random';
  delay: number;
}

class Spawner {
  private queue: SpawnPattern[] = [];
  private timer = 0;
  
  update(dt: number) {
    this.timer -= dt;
    if (this.timer <= 0 && this.queue.length > 0) {
      const pattern = this.queue.shift()!;
      this.execute(pattern);
      this.timer = pattern.delay;
    }
  }
}
```

### Particle System

High-throughput particles for explosions, trails, pickups. Entirely GPU-resident—data never leaves the GPU except for a small emission buffer each frame.

**Why GPU compute over CPU:**

- Scales to millions of particles without CPU bottleneck
- Zero per-frame CPU-GPU transfer (particle data stays on GPU)
- Update and render share the same buffers—no upload step

**Data layout:**

```wgsl
struct Particle {
  position: vec2f,
  velocity: vec2f,
  life: f32,
  maxLife: f32,
  colour: vec4f,
  size: f32,
  _pad: f32,  // 16-byte alignment
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> freeList: array<u32>;
@group(0) @binding(2) var<storage, read_write> freeCount: atomic<u32>;
@group(0) @binding(3) var<uniform> params: SimParams;

struct SimParams {
  dt: f32,
  gravity: f32,
  maxParticles: u32,
}
```

**Update shader:**

Iterates all particle slots. Live particles get physics and aging. Dead particles push their index to the free list for reuse.

```wgsl
@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.maxParticles) { return; }
  
  var p = particles[idx];
  
  // Skip already-dead particles (life < 0 means slot is free)
  if (p.life < 0.0) { return; }
  
  // Age
  p.life -= params.dt;
  
  if (p.life <= 0.0) {
    // Die - push to free list
    p.life = -1.0;  // mark as dead
    let slot = atomicAdd(&freeCount, 1u);
    freeList[slot] = idx;
  } else {
    // Physics
    p.velocity.y -= params.gravity * params.dt;
    p.position += p.velocity * params.dt;
    
    // Fade based on remaining life
    let t = p.life / p.maxLife;
    p.colour.a = t * t;  // quadratic falloff looks nicer
  }
  
  particles[idx] = p;
}
```

**Emission:**

CPU builds a small buffer of emission requests each frame (explosion positions, trail sources). A compute shader pops slots from the free list and initialises particles.

```wgsl
struct EmitRequest {
  position: vec2f,
  velocity: vec2f,
  velocityVariance: vec2f,  // randomisation range
  life: f32,
  lifeVariance: f32,
  colour: vec4f,
  size: f32,
  sizeVariance: f32,
}

@group(0) @binding(4) var<storage, read> emitRequests: array<EmitRequest>;
@group(0) @binding(5) var<uniform> emitCount: u32;

// Simple hash for randomisation
fn hash(seed: u32) -> f32 {
  var s = seed;
  s = s ^ (s >> 16u);
  s = s * 0x85ebca6bu;
  s = s ^ (s >> 13u);
  s = s * 0xc2b2ae35u;
  s = s ^ (s >> 16u);
  return f32(s) / f32(0xffffffffu);
}

@compute @workgroup_size(64)
fn emit(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= emitCount) { return; }
  
  // Pop from free list
  let freeSlot = atomicSub(&freeCount, 1u);
  if (freeSlot == 0u || freeSlot > params.maxParticles) { 
    // Underflow - no free slots, restore count
    atomicAdd(&freeCount, 1u);
    return; 
  }
  
  let idx = freeList[freeSlot - 1u];
  let req = emitRequests[gid.x];
  let seed = idx * 1000u + gid.x;
  
  // Apply variance for randomisation
  var p: Particle;
  p.position = req.position;
  p.velocity = req.velocity + req.velocityVariance * (vec2f(hash(seed), hash(seed + 1u)) * 2.0 - 1.0);
  p.life = req.life + req.lifeVariance * (hash(seed + 2u) * 2.0 - 1.0);
  p.maxLife = p.life;
  p.colour = req.colour;
  p.size = req.size + req.sizeVariance * (hash(seed + 3u) * 2.0 - 1.0);
  p._pad = 0.0;
  
  particles[idx] = p;
}
```

**CPU-side emission interface:**

```typescript
interface ParticleConfig {
  velocity: [number, number];
  velocityVariance: [number, number];
  life: number;
  lifeVariance: number;
  colour: [number, number, number, number];
  size: number;
  sizeVariance: number;
}

const MAX_EMITS_PER_FRAME = 4096;
const emitBuffer = new Float32Array(MAX_EMITS_PER_FRAME * 16);  // 16 floats per request
let emitCount = 0;

function emitParticles(x: number, y: number, count: number, config: ParticleConfig) {
  for (let i = 0; i < count && emitCount < MAX_EMITS_PER_FRAME; i++) {
    const offset = emitCount * 16;
    emitBuffer[offset + 0] = x;
    emitBuffer[offset + 1] = y;
    emitBuffer[offset + 2] = config.velocity[0];
    emitBuffer[offset + 3] = config.velocity[1];
    emitBuffer[offset + 4] = config.velocityVariance[0];
    emitBuffer[offset + 5] = config.velocityVariance[1];
    emitBuffer[offset + 6] = config.life;
    emitBuffer[offset + 7] = config.lifeVariance;
    emitBuffer[offset + 8] = config.colour[0];
    emitBuffer[offset + 9] = config.colour[1];
    emitBuffer[offset + 10] = config.colour[2];
    emitBuffer[offset + 11] = config.colour[3];
    emitBuffer[offset + 12] = config.size;
    emitBuffer[offset + 13] = config.sizeVariance;
    emitCount++;
  }
}

function flushParticleEmits(device: GPUDevice, emitRequestBuffer: GPUBuffer) {
  if (emitCount === 0) return;
  
  device.queue.writeBuffer(emitRequestBuffer, 0, emitBuffer, 0, emitCount * 16);
  // Dispatch emit shader with emitCount
  emitCount = 0;
}
```

**Rendering:**

Particles render as instanced quads. The vertex shader reads particle data directly from the storage buffer using `instance_index`—no separate vertex buffer needed.

```wgsl
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) colour: vec4f,
  @location(1) uv: vec2f,
}

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIdx: u32,
  @builtin(instance_index) instanceIdx: u32
) -> VertexOutput {
  let p = particles[instanceIdx];
  
  // Skip dead particles by collapsing to zero-size
  if (p.life < 0.0) {
    var out: VertexOutput;
    out.position = vec4f(0.0, 0.0, 0.0, 1.0);
    out.colour = vec4f(0.0);
    out.uv = vec2f(0.0);
    return out;
  }
  
  // Quad vertices (two triangles)
  let quadVerts = array<vec2f, 6>(
    vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
    vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
  );
  
  let localPos = quadVerts[vertexIdx] * p.size;
  let worldPos = p.position + localPos;
  
  var out: VertexOutput;
  out.position = viewProj * vec4f(worldPos, 0.0, 1.0);
  out.colour = p.colour;
  out.uv = quadVerts[vertexIdx] + 0.5;
  return out;
}
```

**Frame flow:**

```
1. Game logic calls emitParticles() - fills CPU-side emit buffer
2. flushParticleEmits() - uploads emit requests (small buffer, <64KB typically)
3. Dispatch emit shader - pops from free list, initialises new particles
4. Dispatch update shader - physics, aging, dead particles push to free list
5. Draw instanced quads - vertex shader reads particle storage buffer directly
```

**Initialisation:**

On startup, the free list is populated with all indices and freeCount set to MAX_PARTICLES:

```typescript
function initParticleSystem(device: GPUDevice) {
  const initialFreeList = new Uint32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) {
    initialFreeList[i] = i;
  }
  device.queue.writeBuffer(freeListBuffer, 0, initialFreeList);
  
  // Set initial free count
  const countData = new Uint32Array([MAX_PARTICLES]);
  device.queue.writeBuffer(freeCountBuffer, 0, countData);
  
  // Zero out particle buffer (all dead)
  const emptyParticles = new Float32Array(MAX_PARTICLES * 12);  // 12 floats per particle
  for (let i = 0; i < MAX_PARTICLES; i++) {
    emptyParticles[i * 12 + 4] = -1.0;  // life = -1 (dead)
  }
  device.queue.writeBuffer(particleBuffer, 0, emptyParticles);
}
```

---

## Distribution: Tauri

Vektrix ships as a native application via [Tauri](https://tauri.app/) rather than Electron. Smaller binaries (~10MB vs ~150MB), lower memory footprint, native OS webview.

### Why Tauri

- **Binary size**: Rust core + native webview vs bundling all of Chromium
- **Performance**: Native webview, no extra abstraction layer
- **Memory**: Shares system webview rather than running a separate browser process
- **Steam-friendly**: Ships as a standard executable, integrates with Steamworks normally

### Platform Webviews

| Platform | Webview | WebGPU Status |
|----------|---------|---------------|
| macOS | WebKit (WKWebView) | Supported ✓ |
| Windows | WebView2 (Chromium) | Supported ✓ |
| Linux | WebKitGTK | Check version - may need flags |

**Linux/Steam Deck note**: WebKitGTK's WebGPU support lags behind. Options:

1. Test first - recent versions may just work
2. Enable experimental flags if needed
3. Fall back to bundling Chromium for Linux via custom `wry` config
4. Target Steam Deck specifically with a Chromium-based build

### Project Structure

```
vektrix/
├── src-tauri/           # Rust backend
│   ├── Cargo.toml
│   ├── tauri.conf.json  # App config, window settings
│   └── src/
│       └── main.rs      # Minimal - just launches webview
├── src/                 # TypeScript engine + game
│   ├── engine/
│   ├── game/
│   └── index.html
├── package.json
└── vite.config.ts       # Or bundler of choice
```

### Tauri Config

```json
{
  "build": {
    "distDir": "../dist",
    "devPath": "http://localhost:5173"
  },
  "tauri": {
    "windows": [
      {
        "title": "Vektrix",
        "width": 1920,
        "height": 1080,
        "fullscreen": false,
        "resizable": true
      }
    ],
    "security": {
      "csp": null
    },
    "bundle": {
      "active": true,
      "targets": ["dmg", "msi", "deb", "appimage"],
      "identifier": "com.vektrix.game",
      "icon": ["icons/icon.png"]
    }
  }
}
```

### Rust Backend

For a pure WebGPU game, the Rust side is minimal - just window management:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

If needed later, Rust commands can expose native functionality:

```rust
#[tauri::command]
fn save_game(data: String) -> Result<(), String> {
    // Native file I/O, bypassing browser sandboxing
    std::fs::write("save.json", data).map_err(|e| e.to_string())
}
```

Called from TypeScript:

```typescript
import { invoke } from '@tauri-apps/api/tauri';

await invoke('save_game', { data: JSON.stringify(gameState) });
```

### Build Commands

```bash
# Development
npm run tauri dev

# Production builds
npm run tauri build              # Current platform
npm run tauri build --target universal-apple-darwin  # macOS universal
npm run tauri build --target x86_64-pc-windows-msvc  # Windows
npm run tauri build --target x86_64-unknown-linux-gnu # Linux
```

### Steam Integration

Tauri apps integrate with Steam like any native game:

1. Build platform-specific binaries via Tauri
2. Add to Steamworks as standard executable
3. Steam overlay works normally (it's a native window)
4. Achievements, cloud saves via Steamworks SDK - either:
   - JavaScript SDK if available
   - Rust bindings via `steamworks` crate, exposed as Tauri commands

### WebGPU Verification

On startup, verify WebGPU is available and fail gracefully:

```typescript
async function initWebGPU(): Promise<GPUDevice> {
  if (!navigator.gpu) {
    showError('WebGPU not supported in this browser/webview. Please update your system.');
    throw new Error('WebGPU not available');
  }
  
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    showError('No suitable GPU adapter found.');
    throw new Error('No GPU adapter');
  }
  
  return adapter.requestDevice();
}
```

For Linux builds where WebKitGTK might not support WebGPU, consider a build-time flag that bundles Chromium instead:

```bash
# Standard build (native webview)
npm run tauri build

# Chromium fallback for Linux
TAURI_LINUX_WEBVIEW=chromium npm run tauri build --target x86_64-unknown-linux-gnu
```

(Requires custom `wry` configuration - evaluate if actually needed after testing.)

---

## What This Proves

Once Vektrix runs smoothly at 4K with thousands of entities:

- **Data layout** handles high entity churn without fragmentation
- **Worker topology** scales physics/collision across cores
- **GPU compute** works for pixel-perfect collision and particle systems at scale
- **Async frame structure** hides latency effectively
- **Rendering pipeline** handles mass instancing and post-processing
- **User API** remains clean despite underlying complexity

The 2.5D generalisation (3D models, skeletal animation, level editor, orthographic camera modes) layers on top without redesigning fundamentals.

---

## Open Questions

1. **Entity limit**: 65536 is arbitrary. Profile to find actual ceiling before GPU/CPU becomes the bottleneck.

2. **Worker count**: Hardcoded or adaptive based on `navigator.hardwareConcurrency`?

3. **Collision layers**: 8-bit mask sufficient? Some games want more granularity.

4. **Audio worker**: Web Audio runs on its own thread, but spatial positioning data needs syncing. Worth a dedicated worker?

5. **Determinism**: For replays/netcode, need deterministic physics. Float precision across browsers/platforms is a minefield.

6. **Hot reload**: User scripts changing mid-game. Behaviour replacement without losing state?

7. **Steam Deck WebGPU**: Test WebKitGTK's WebGPU support on Steam Deck early. If broken, evaluate Chromium bundling cost vs native webview benefits.
