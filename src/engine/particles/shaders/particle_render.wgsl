// Particle Render Shader
// Renders particles as instanced quads with soft circle falloff

struct RenderUniforms {
  screenSize: vec2f,
  cameraPos: vec2f,
  zoom: f32,
  time: f32,
  _pad: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: RenderUniforms;
@group(0) @binding(1) var<storage, read> positionLife: array<vec4f>;
@group(0) @binding(2) var<storage, read> velocitySize: array<vec4f>;
@group(0) @binding(3) var<storage, read> colorType: array<vec4f>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
  @location(2) life: f32,
  @location(3) particleType: f32,
}

// Quad vertices (two triangles)
const quadPositions = array<vec2f, 6>(
  vec2f(-0.5, -0.5), vec2f(0.5, -0.5), vec2f(0.5, 0.5),
  vec2f(-0.5, -0.5), vec2f(0.5, 0.5), vec2f(-0.5, 0.5)
);

const quadUVs = array<vec2f, 6>(
  vec2f(0.0, 1.0), vec2f(1.0, 1.0), vec2f(1.0, 0.0),
  vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(0.0, 0.0)
);

const TYPE_TRAIL: f32 = 3.0;

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let p = positionLife[instanceIndex];
  let v = velocitySize[instanceIndex];
  let c = colorType[instanceIndex];

  var output: VertexOutput;

  // Skip dead or invalid particles (move off-screen)
  if (p.z <= 0.0 || p.w <= 0.0) {
    output.position = vec4f(-10.0, -10.0, 0.0, 1.0);
    output.color = vec4f(0.0, 0.0, 0.0, 0.0);
    output.uv = vec2f(0.0, 0.0);
    output.life = 0.0;
    output.particleType = 0.0;
    return output;
  }

  let localPos = quadPositions[vertexIndex];

  // Scale by particle size
  var size = v.z;

  // Trail particles stretch in velocity direction
  var stretch = vec2f(1.0, 1.0);
  var rotation = 0.0;

  if (c.w == TYPE_TRAIL) {
    let speed = sqrt(v.x * v.x + v.y * v.y);
    if (speed > 1.0) {
      stretch = vec2f(1.0 + speed * 0.008, 0.6);
      rotation = atan2(v.y, v.x);
    }
  }

  var pos = localPos * size * stretch;

  // Apply rotation for trail particles
  if (rotation != 0.0) {
    let cos_r = cos(rotation);
    let sin_r = sin(rotation);
    pos = vec2f(
      pos.x * cos_r - pos.y * sin_r,
      pos.x * sin_r + pos.y * cos_r
    );
  }

  // World position
  let worldPos = pos + vec2f(p.x, p.y);

  // Camera transform
  let viewPos = (worldPos - uniforms.cameraPos) * uniforms.zoom + uniforms.screenSize * 0.5;
  let clip = (viewPos / uniforms.screenSize) * 2.0 - 1.0;

  output.position = vec4f(clip.x, -clip.y, 0.0, 1.0);

  // Calculate alpha based on lifetime (quadratic fade for softer end)
  let lifeRatio = p.z / p.w;
  let alpha = lifeRatio * lifeRatio;

  output.color = vec4f(c.r, c.g, c.b, alpha);
  output.uv = quadUVs[vertexIndex];
  output.life = lifeRatio;
  output.particleType = c.w;

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

  // HDR output for bloom
  return vec4f(input.color.rgb * 2.0, input.color.a * alpha);
}
