// Particle Update Compute Shader
// Updates particle physics, handles lifetime, compacts dead particles

struct UpdateUniforms {
  dt: f32,
  time: f32,
  maxParticles: u32,
  _pad: u32,
}

struct AtomicCounter {
  count: atomic<u32>,
}

// Particle types
const TYPE_SPARK: f32 = 0.0;
const TYPE_EMBER: f32 = 1.0;
const TYPE_DEBRIS: f32 = 2.0;
const TYPE_TRAIL: f32 = 3.0;

@group(0) @binding(0) var<uniform> uniforms: UpdateUniforms;
@group(0) @binding(1) var<storage, read> positionLifeIn: array<vec4f>;
@group(0) @binding(2) var<storage, read> velocitySizeIn: array<vec4f>;
@group(0) @binding(3) var<storage, read> colorTypeIn: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> positionLifeOut: array<vec4f>;
@group(0) @binding(5) var<storage, read_write> velocitySizeOut: array<vec4f>;
@group(0) @binding(6) var<storage, read_write> colorTypeOut: array<vec4f>;
@group(0) @binding(7) var<storage, read_write> liveCounter: AtomicCounter;
@group(0) @binding(8) var<storage, read_write> inputCount: AtomicCounter;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let index = id.x;

  // Only process particles that exist
  let particleCount = atomicLoad(&inputCount.count);
  if (index >= particleCount) {
    return;
  }

  // Read particle data
  var p = positionLifeIn[index];
  var v = velocitySizeIn[index];
  let c = colorTypeIn[index];

  let dt = uniforms.dt;
  let particleType = c.w;

  // Skip dead particles
  if (p.z <= 0.0) {
    return;
  }

  // Update lifetime
  p.z -= dt;

  if (p.z <= 0.0) {
    // Particle died, don't write to output
    return;
  }

  // Type-specific physics parameters
  var gravity: f32 = 0.0;
  var drag: f32 = 2.0;

  if (particleType == TYPE_SPARK) {
    drag = 1.5;  // Low drag for long travel
    gravity = 0.0;
  } else if (particleType == TYPE_EMBER) {
    drag = 1.0;
    gravity = 60.0;
  } else if (particleType == TYPE_DEBRIS) {
    drag = 1.5;
    gravity = 200.0;
  } else if (particleType == TYPE_TRAIL) {
    drag = 4.0;
    gravity = 0.0;
  }

  // Apply physics
  v.y += gravity * dt;

  // Apply drag (exponential decay)
  let dragFactor = exp(-drag * dt);
  v.x *= dragFactor;
  v.y *= dragFactor;

  // Integrate position
  p.x += v.x * dt;
  p.y += v.y * dt;

  // Size decay
  v.z = max(0.1, v.z - v.w * dt);

  // Atomically allocate output slot (compaction)
  let outIndex = atomicAdd(&liveCounter.count, 1u);

  // Write compacted output
  positionLifeOut[outIndex] = p;
  velocitySizeOut[outIndex] = v;
  colorTypeOut[outIndex] = c;
}
