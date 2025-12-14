# Vektrix Phased Delivery Plan

Four phases to get from blank canvas to playable prototype. Each phase ends with something you can see and interact with.

---

## Phase 0: Project Setup

**Goal:** Vite + TypeScript project with dev server running, ready for WebGPU development.

### 0.1 Scaffold Project

```bash
npm create vite@latest vektrix -- --template vanilla-ts
cd vektrix
npm install
```

### 0.2 Project Structure

Organise for engine/game separation from the start.

```
vektrix/
├── src/
│   ├── engine/
│   │   ├── core/
│   │   │   ├── device.ts      # WebGPU initialisation
│   │   │   └── loop.ts        # Frame loop, delta time
│   │   ├── ecs/
│   │   │   ├── entity.ts      # Entity storage, handles
│   │   │   └── components.ts  # Component definitions
│   │   ├── rendering/
│   │   │   ├── renderer.ts    # Render orchestration
│   │   │   └── shaders/       # WGSL files
│   │   ├── grid/
│   │   │   └── grid.ts        # Mass-spring simulation
│   │   └── index.ts           # Engine exports
│   ├── game/
│   │   ├── player.ts
│   │   ├── enemies.ts
│   │   ├── spawner.ts
│   │   └── index.ts           # Game entry point
│   ├── main.ts                # Bootstrap
│   └── style.css
├── public/
│   └── assets/
│       └── sprites/           # Texture atlases
├── index.html
├── tsconfig.json
├── vite.config.ts
└── package.json
```

### 0.3 TypeScript Configuration

Strict mode, ES2022 target for SharedArrayBuffer support.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "types": ["@webgpu/types"]
  },
  "include": ["src"]
}
```

### 0.4 WebGPU Types

Install type definitions for WebGPU API.

```bash
npm install --save-dev @webgpu/types
```

### 0.5 Vite Configuration

Configure for WGSL imports and SharedArrayBuffer headers.

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      // Required for SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  assetsInclude: ['**/*.wgsl'],
});
```

### 0.6 WGSL Import Support

Add a declaration file for importing shaders as strings.

```typescript
// src/wgsl.d.ts
declare module '*.wgsl' {
  const shader: string;
  export default shader;
}
```

Update Vite config to handle WGSL as raw text:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  plugins: [
    {
      name: 'wgsl-loader',
      transform(code, id) {
        if (id.endsWith('.wgsl')) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
      },
    },
  ],
});
```

### 0.7 HTML Canvas Setup

Minimal HTML with fullscreen canvas.

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vektrix</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <canvas id="canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

```css
/* src/style.css */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

#canvas {
  width: 100%;
  height: 100%;
  display: block;
}
```

### 0.8 Entry Point Stub

Minimal main.ts that confirms everything works.

```typescript
// src/main.ts
async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  
  if (!navigator.gpu) {
    document.body.innerHTML = '<h1 style="color:white;padding:2rem;">WebGPU not supported</h1>';
    return;
  }
  
  console.log('Vektrix initialising...');
  console.log('Canvas:', canvas.width, 'x', canvas.height);
  console.log('WebGPU available:', !!navigator.gpu);
  console.log('SharedArrayBuffer available:', typeof SharedArrayBuffer !== 'undefined');
  
  // Phase 1 starts here
}

main().catch(console.error);
```

### 0.9 Verify Dev Server

```bash
npm run dev
```

Open browser, check console for initialisation messages. Verify:
- No TypeScript errors
- WebGPU detected
- SharedArrayBuffer available (COOP/COEP headers working)

### Phase 0 Exit Criteria

- [ ] `npm run dev` starts without errors
- [ ] TypeScript compiling with strict mode
- [ ] WebGPU types available (`navigator.gpu` has autocomplete)
- [ ] WGSL files importable as strings
- [ ] SharedArrayBuffer available (headers configured)
- [ ] Fullscreen black canvas rendering
- [ ] Project structure in place for engine/game separation

---

## Phase 1: The Grid

**Goal:** Deformable grid rendering with mouse-driven impulses. No entities, no ECS, just the grid proving out WebGPU and the mass-spring simulation.

### 1.1 WebGPU Bootstrap

Minimal setup to get pixels on screen.

- Canvas setup, device/adapter acquisition, swap chain configuration
- Basic render pipeline with hardcoded triangle (sanity check)
- Frame loop with `requestAnimationFrame` and delta time calculation
- Resize handling

**Deliverable:** Coloured triangle rendering at 60fps.

### 1.2 Grid Data Structures

CPU-side grid state. No workers yet - everything on main thread initially.

```typescript
// Start simple, on main thread
const GRID_COLS = 64;
const GRID_ROWS = 36;

interface GridVertex {
  x: number;
  y: number;
  vx: number;
  vy: number;
  restX: number;
  restY: number;
}

const vertices: GridVertex[] = [];
```

- Initialise vertex positions in a regular grid pattern
- Store rest positions (where vertices want to return to)
- Zero velocities

**Deliverable:** Grid data initialised, logged to console.

### 1.3 Grid Rendering

Line-based rendering of the grid mesh.

- Vertex buffer for grid positions (updated each frame)
- Index buffer for line segments (horizontal + vertical, static)
- Simple vertex/fragment shader pair - position passthrough, solid colour output
- Upload vertex positions each frame via `writeBuffer`

```wgsl
// vertex shader
@vertex
fn vs(@location(0) pos: vec2f) -> @builtin(position) vec4f {
  // Map world coords to clip space
  let clip = (pos / screenSize) * 2.0 - 1.0;
  return vec4f(clip.x, -clip.y, 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.2, 0.6, 1.0, 1.0); // Cyan grid lines
}
```

**Deliverable:** Static grid visible on screen.

### 1.4 Mass-Spring Simulation

Bring the grid to life.

- Implement Hooke's Law spring forces (vertex → rest position)
- Add neighbour springs (structural connections)
- Velocity damping
- Semi-implicit Euler integration

```typescript
function simulateGrid(dt: number) {
  const k = 400;
  const damping = 5;
  
  for (const v of vertices) {
    // Anchor spring
    let fx = (v.restX - v.x) * k;
    let fy = (v.restY - v.y) * k;
    
    // Neighbour springs (add separately)
    // ...
    
    // Damping
    fx -= v.vx * damping;
    fy -= v.vy * damping;
    
    // Integrate
    v.vx += fx * dt;
    v.vy += fy * dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
  }
}
```

**Deliverable:** Grid that wobbles when disturbed (hardcoded impulse on startup).

### 1.5 Mouse Impulses

Interactive grid deformation.

- Track mouse position in world coordinates
- On click/drag, apply radial impulse to nearby vertices
- Falloff based on distance from mouse

```typescript
function applyImpulse(worldX: number, worldY: number, radius: number, force: number) {
  for (const v of vertices) {
    const dx = v.x - worldX;
    const dy = v.y - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < radius && dist > 0) {
      const falloff = 1 - (dist / radius);
      const impulse = force * falloff * falloff;
      v.vx += (dx / dist) * impulse;
      v.vy += (dy / dist) * impulse;
    }
  }
}
```

**Deliverable:** Click and drag to push the grid around. Satisfying wobble feedback.

### 1.6 Grid Visual Polish

Make it look like Geometry Wars.

- Gradient colour based on displacement from rest (more displaced = brighter)
- Line thickness variation (or switch to instanced quads for thick lines)
- Basic bloom pass: threshold bright pixels, Gaussian blur, composite

**Deliverable:** Glowing neon grid that responds to interaction.

### Phase 1 Exit Criteria

- [ ] WebGPU initialised and rendering
- [ ] 64×36 grid visible with line rendering
- [ ] Mass-spring simulation running at 60fps
- [ ] Mouse impulses deform the grid
- [ ] Basic bloom post-processing
- [ ] Grid settles back to rest state smoothly

---

## Phase 2: Player Ship

**Goal:** Controllable player entity with the grid reacting to movement. First use of the ECS.

### 2.1 Entity Storage Foundation

Implement the core ECS data structures from your architecture.

- Entity storage with generation-based handles
- Freelist for entity recycling
- Component presence bitmask

```typescript
const MAX_ENTITIES = 65536;

const entities = {
  generation: new Uint16Array(MAX_ENTITIES),
  flags: new Uint16Array(MAX_ENTITIES),
};

const freeList = new Uint32Array(MAX_ENTITIES);
let freeCount = MAX_ENTITIES;

// Initialise freelist
for (let i = 0; i < MAX_ENTITIES; i++) {
  freeList[i] = i;
}
```

**Deliverable:** `createEntity()` and `destroyEntity()` working with generation checks.

### 2.2 Transform and Velocity Components

First two components, struct-of-arrays layout.

```typescript
const transforms = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
  rotation: new Float32Array(MAX_ENTITIES),
  scaleX: new Float32Array(MAX_ENTITIES),
  scaleY: new Float32Array(MAX_ENTITIES),
};

const velocities = {
  vx: new Float32Array(MAX_ENTITIES),
  vy: new Float32Array(MAX_ENTITIES),
};
```

- Component view classes (Transform, Velocity) wrapping raw storage
- Entity handle class with `.transform`, `.velocity` accessors

**Deliverable:** Can create entity, set position, read it back via view classes.

### 2.3 Sprite Component and Rendering

Get entities visible.

- Sprite component storage (textureId, frameIndex, dimensions, tint)
- Texture atlas loading (start with a single ship sprite)
- Instanced sprite rendering pipeline
- Per-instance data: transform matrix, UV rect, tint

```typescript
function buildSpriteBatch(): number {
  let count = 0;
  
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (!(componentMask[i] & (COMP_TRANSFORM | COMP_SPRITE))) continue;
    
    // Write instance to GPU buffer
    writeInstance(instanceBuffer, count++, i);
  }
  
  return count;
}
```

**Deliverable:** Ship sprite rendering at a position.

### 2.4 Input System

Keyboard input for ship control.

- Key state tracking (down/up/held)
- Gamepad support (optional, but trivial to add)
- Input polling in frame loop

```typescript
const keys = new Set<string>();

window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup', e => keys.delete(e.code));

function getMovementInput(): { x: number, y: number } {
  let x = 0, y = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  return { x, y };
}
```

**Deliverable:** Input state accessible each frame.

### 2.5 Player Behaviour

Ship movement and rotation.

- WASD/arrow keys for movement
- Mouse aim for rotation (or right stick)
- Velocity-based movement with acceleration/deceleration
- Screen boundary clamping

```typescript
function updatePlayer(dt: number) {
  const input = getMovementInput();
  const speed = 500;
  
  // Set velocity based on input
  velocities.vx[playerId] = input.x * speed;
  velocities.vy[playerId] = input.y * speed;
  
  // Integrate position
  transforms.x[playerId] += velocities.vx[playerId] * dt;
  transforms.y[playerId] += velocities.vy[playerId] * dt;
  
  // Face movement direction (or mouse)
  if (input.x !== 0 || input.y !== 0) {
    transforms.rotation[playerId] = Math.atan2(input.y, input.x);
  }
  
  // Clamp to bounds
  transforms.x[playerId] = clamp(transforms.x[playerId], margin, worldWidth - margin);
  transforms.y[playerId] = clamp(transforms.y[playerId], margin, worldHeight - margin);
}
```

**Deliverable:** Ship moves with WASD, rotates to face movement direction.

### 2.6 Grid Reacts to Player

Connect player movement to grid impulses.

- Player creates a subtle continuous impulse (wake effect)
- Larger impulse on direction change / rapid movement
- Impulse magnitude based on velocity

```typescript
function applyPlayerGridEffect() {
  const vx = velocities.vx[playerId];
  const vy = velocities.vy[playerId];
  const speed = Math.sqrt(vx * vx + vy * vy);
  
  if (speed > 50) {
    applyImpulse(
      transforms.x[playerId],
      transforms.y[playerId],
      100,           // radius
      speed * 0.01   // force scales with speed
    );
  }
}
```

**Deliverable:** Ship leaves a wake in the grid as it moves.

### Phase 2 Exit Criteria

- [ ] ECS foundation: entities, components, views
- [ ] Player entity created on startup
- [ ] Ship sprite rendering via instanced draw
- [ ] WASD movement with smooth acceleration
- [ ] Ship rotation follows movement/aim direction
- [ ] Grid responds to player movement
- [ ] Stays within world bounds

---

## Phase 3: Spawning Enemy

**Goal:** Single enemy type that spawns, seeks player, and can be destroyed. Proves spawning, AI, collision.

### 3.1 Collider Component

Add collision data to the ECS.

```typescript
const colliders = {
  halfWidth: new Float32Array(MAX_ENTITIES),
  halfHeight: new Float32Array(MAX_ENTITIES),
  layer: new Uint8Array(MAX_ENTITIES),
  mask: new Uint8Array(MAX_ENTITIES),
  flags: new Uint8Array(MAX_ENTITIES),
};

const LAYER = {
  PLAYER: 1,
  ENEMY: 2,
  BULLET: 4,
};
```

**Deliverable:** Entities can have collision bounds.

### 3.2 Collision Detection (Simple)

Start with brute-force AABB before optimising.

```typescript
function detectCollisions(): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  
  // Brute force for now - optimise later with spatial hash
  for (let a = 0; a < activeEntityCount; a++) {
    if (!(componentMask[a] & COMP_COLLIDER)) continue;
    
    for (let b = a + 1; b < activeEntityCount; b++) {
      if (!(componentMask[b] & COMP_COLLIDER)) continue;
      
      // Layer/mask check
      if (!(colliders.layer[a] & colliders.mask[b]) &&
          !(colliders.layer[b] & colliders.mask[a])) continue;
      
      if (aabbOverlap(a, b)) {
        pairs.push([a, b]);
      }
    }
  }
  
  return pairs;
}
```

**Deliverable:** Collision pairs detected each frame.

### 3.3 Enemy Entity and Sprite

Add a basic enemy type.

- Enemy sprite in atlas
- Spawn at random edge position
- Collider sized to sprite

```typescript
function createEnemy(x: number, y: number): number {
  const id = createEntity();
  
  addComponent(id, COMP_TRANSFORM);
  transforms.x[id] = x;
  transforms.y[id] = y;
  transforms.scaleX[id] = 1;
  transforms.scaleY[id] = 1;
  
  addComponent(id, COMP_VELOCITY);
  
  addComponent(id, COMP_SPRITE);
  sprites.textureId[id] = TEXTURE_ENEMY;
  sprites.tint[id] = 0xFF00FFFF; // Magenta
  
  addComponent(id, COMP_COLLIDER);
  colliders.halfWidth[id] = 16;
  colliders.halfHeight[id] = 16;
  colliders.layer[id] = LAYER.ENEMY;
  colliders.mask[id] = LAYER.PLAYER | LAYER.BULLET;
  
  return id;
}
```

**Deliverable:** Enemy entity spawns and renders.

### 3.4 Seek Behaviour

Enemy moves toward player.

```typescript
function updateEnemies(dt: number) {
  const playerX = transforms.x[playerId];
  const playerY = transforms.y[playerId];
  const enemySpeed = 150;
  
  for (const id of enemyEntities) {
    const dx = playerX - transforms.x[id];
    const dy = playerY - transforms.y[id];
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist > 0) {
      velocities.vx[id] = (dx / dist) * enemySpeed;
      velocities.vy[id] = (dy / dist) * enemySpeed;
      transforms.rotation[id] = Math.atan2(dy, dx);
    }
    
    // Integrate
    transforms.x[id] += velocities.vx[id] * dt;
    transforms.y[id] += velocities.vy[id] * dt;
  }
}
```

**Deliverable:** Enemy tracks toward player position.

### 3.5 Spawner System

Timed enemy spawning from edges.

```typescript
class Spawner {
  private timer = 0;
  private spawnInterval = 2; // seconds
  
  update(dt: number) {
    this.timer += dt;
    
    if (this.timer >= this.spawnInterval) {
      this.timer = 0;
      this.spawnFromEdge();
    }
  }
  
  private spawnFromEdge() {
    // Pick random edge
    const edge = Math.floor(Math.random() * 4);
    let x: number, y: number;
    
    switch (edge) {
      case 0: x = -50; y = Math.random() * worldHeight; break; // left
      case 1: x = worldWidth + 50; y = Math.random() * worldHeight; break; // right
      case 2: x = Math.random() * worldWidth; y = -50; break; // top
      case 3: x = Math.random() * worldWidth; y = worldHeight + 50; break; // bottom
    }
    
    createEnemy(x, y);
  }
}
```

**Deliverable:** Enemies spawn periodically from screen edges.

### 3.6 Collision Response

Handle player-enemy collision and enemy destruction.

```typescript
function processCollisions(pairs: Array<[number, number]>) {
  for (const [a, b] of pairs) {
    const aIsPlayer = a === playerId;
    const bIsPlayer = b === playerId;
    const aIsEnemy = enemyEntities.has(a);
    const bIsEnemy = enemyEntities.has(b);
    
    // Player hits enemy (or vice versa)
    if ((aIsPlayer && bIsEnemy) || (bIsPlayer && aIsEnemy)) {
      const enemyId = aIsEnemy ? a : b;
      
      // Explosion effect
      applyImpulse(transforms.x[enemyId], transforms.y[enemyId], 200, 500);
      
      // Destroy enemy
      destroyEntity(enemyId);
      enemyEntities.delete(enemyId);
      
      // For now, player takes no damage - add later
    }
  }
}
```

**Deliverable:** Colliding with enemy destroys it with grid explosion.

### 3.7 Enemy Death Visual

Particle burst on enemy death (stretch goal - can defer).

- If particle system not ready, just grid impulse is sufficient
- Otherwise, emit 20-50 particles at enemy position with random velocities

**Deliverable:** Satisfying visual feedback on enemy death.

### Phase 3 Exit Criteria

- [ ] Collider component in ECS
- [ ] AABB collision detection running
- [ ] Enemy entity type with seek behaviour
- [ ] Spawner creating enemies from edges on timer
- [ ] Player-enemy collision destroys enemy
- [ ] Grid explosion on enemy death
- [ ] Multiple enemies on screen simultaneously

---

## Phase Summary

| Phase | Focus | Key Systems | Visual Result |
|-------|-------|-------------|---------------|
| 0 | Setup | Vite, TypeScript, WebGPU types | Black canvas, dev server |
| 1 | Grid | WebGPU, mass-spring sim, bloom | Glowing deformable grid |
| 2 | Player | ECS, sprites, input, physics | Controllable ship with wake |
| 3 | Enemy | Collision, AI, spawning | Chasers to dodge/destroy |

**After Phase 3**, you'll have a playable core loop. Continued in [Part 2](./vektrix-delivery-plan-part2.md):

- **Phase 4:** Player shooting (bullets, collision with enemies)
- **Phase 5:** Multiple enemy types (behaviours, spawn patterns)
- **Phase 6:** Scoring, waves, difficulty ramping
- **Phase 7:** Particle system (GPU compute)
- **Phase 8:** Audio (Web Audio API, spatial positioning)
- **Phase 9:** Worker threads (move physics/grid off main thread)

The worker topology and GPU collision from your architecture doc can be deferred until the main-thread version hits performance limits. Get the gameplay feeling right first, then optimise.

---

## Technical Debt to Track

Things deliberately simplified in early phases:

1. **Collision is O(n²)** - Add spatial hash when enemy count > 50 causes frame drops
2. **Grid sim on main thread** - Move to worker when simulation budget exceeds 2ms
3. **No component pooling** - Add when entity churn causes GC hitches
4. **Single texture atlas** - Add atlas paging if sprite count grows
5. **No pixel-perfect collision** - AABB is fine for Geometry Wars shapes

Don't optimise until you measure. The architecture supports all of this, but ship gameplay first.
