// Particle Emission Compute Shader
// Processes emission requests from CPU and spawns new particles

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
  maxParticles: u32,
  seed: f32,
  _pad: f32,
}

struct AtomicCounter {
  count: atomic<u32>,
}

// Particle data (Structure of Arrays layout)
// positionLife: x, y, life, maxLife
// velocitySize: vx, vy, size, sizeDecay
// colorType: r, g, b, type

@group(0) @binding(0) var<uniform> uniforms: EmissionUniforms;
@group(0) @binding(1) var<storage, read> emissions: array<EmissionRequest>;
@group(0) @binding(2) var<storage, read_write> positionLife: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> velocitySize: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> colorType: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> counter: AtomicCounter;

// PCG hash for pseudo-random numbers
fn pcg(n: u32) -> u32 {
  var h = n * 747796405u + 2891336453u;
  h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
  return (h >> 22u) ^ h;
}

fn randomFloat(seed: u32) -> f32 {
  return f32(pcg(seed)) / f32(0xffffffffu);
}

fn randomRange(seed: u32, min: f32, max: f32) -> f32 {
  return min + randomFloat(seed) * (max - min);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3u) {
  // Each thread handles one potential particle spawn
  // id.x encodes both emission index and particle-within-emission
  let emissionIndex = id.x / 256u;
  let particleOffset = id.x % 256u;

  if (emissionIndex >= uniforms.emissionCount) {
    return;
  }

  let e = emissions[emissionIndex];

  // Check if this thread should spawn a particle
  if (f32(particleOffset) >= e.count) {
    return;
  }

  // Generate unique seed for this particle
  let baseSeed = u32(uniforms.seed * 1000000.0);
  let seed = baseSeed + id.x * 1337u + emissionIndex * 7919u;

  // Atomically allocate a particle slot
  let slot = atomicAdd(&counter.count, 1u);

  if (slot >= uniforms.maxParticles) {
    // Buffer full, revert counter and skip
    atomicSub(&counter.count, 1u);
    return;
  }

  // Random angle within spread
  let angleOffset = (randomFloat(seed) - 0.5) * e.spread;
  let angle = e.direction + angleOffset;
  let speed = randomRange(seed + 1u, e.speedMin, e.speedMax);

  // Initialize particle
  let lifetime = randomRange(seed + 2u, e.lifetimeMin, e.lifetimeMax);
  let size = randomRange(seed + 3u, e.sizeMin, e.sizeMax);

  // Position and life
  positionLife[slot] = vec4f(e.x, e.y, lifetime, lifetime);

  // Velocity and size (sizeDecay = shrink to ~30% over lifetime)
  let vx = cos(angle) * speed;
  let vy = sin(angle) * speed;
  let sizeDecay = size * 0.7 / lifetime;
  velocitySize[slot] = vec4f(vx, vy, size, sizeDecay);

  // Color with slight variation
  let colorVar = 0.15;
  let r = e.r * (1.0 - colorVar + randomFloat(seed + 4u) * colorVar * 2.0);
  let g = e.g * (1.0 - colorVar + randomFloat(seed + 5u) * colorVar * 2.0);
  let b = e.b * (1.0 - colorVar + randomFloat(seed + 6u) * colorVar * 2.0);
  colorType[slot] = vec4f(r, g, b, e.type_);
}
