// Trail/ghost effect shader
// Fades previous frame's sprites and composites with current

struct TrailUniforms {
  fadeAmount: f32,    // 0.0 = no fade (full persistence), 1.0 = instant fade (no trail)
  bloomIntensity: f32, // Multiplier for entity bloom (0.0-1.0)
  cameraDelta: vec2f, // Camera movement this frame (in UV space) - used to offset trail
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var prevTrail: texture_2d<f32>;
@group(0) @binding(1) var trailSampler: sampler;
@group(0) @binding(2) var<uniform> uniforms: TrailUniforms;

// Fullscreen triangle vertex shader (oversized to cover entire viewport)
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Generate oversized fullscreen triangle: (-1,-1), (3,-1), (-1,3)
  let x = f32((vertexIndex & 1u) << 2u) - 1.0;
  let y = f32((vertexIndex & 2u) << 1u) - 1.0;

  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);

  return output;
}

// Fade pass - reads previous trail, outputs faded version
// Offsets sample by camera delta so trails appear behind moving objects
@fragment
fn fs_fade(input: VertexOutput) -> @location(0) vec4f {
  // Offset UV by camera movement - this shifts the previous frame's ghosts
  // in the opposite direction of camera movement, creating the trail effect
  let offsetUV = input.uv + uniforms.cameraDelta;

  // Sample with clamping to avoid edge artifacts
  let clampedUV = clamp(offsetUV, vec2f(0.0), vec2f(1.0));
  let prev = textureSample(prevTrail, trailSampler, clampedUV);

  // Fade out pixels that would sample outside the texture
  let outOfBounds = step(1.0, max(
    max(-offsetUV.x, offsetUV.x - 1.0),
    max(-offsetUV.y, offsetUV.y - 1.0)
  ) * 1000.0);

  // Fade RGB and alpha
  // fadeAmount of 0.08 means we keep 92% each frame
  let fadeMultiplier = (1.0 - uniforms.fadeAmount) * (1.0 - outOfBounds);
  let faded = vec4f(prev.rgb * fadeMultiplier, prev.a * fadeMultiplier);

  return faded;
}

// Composite trail onto scene (additive blend)
@fragment
fn fs_composite(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(prevTrail, trailSampler, input.uv);
}

// Composite bloom with intensity control (for entity bloom)
@fragment
fn fs_bloom_composite(input: VertexOutput) -> @location(0) vec4f {
  let bloom = textureSample(prevTrail, trailSampler, input.uv);
  return vec4f(bloom.rgb * uniforms.bloomIntensity, bloom.a * uniforms.bloomIntensity);
}
