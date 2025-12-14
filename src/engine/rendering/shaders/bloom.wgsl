// Bloom threshold shader - extracts bright pixels
struct ThresholdUniforms {
  threshold: f32,
  _pad1: f32,
  _pad2: f32,
  _pad3: f32,
}

struct BlurUniforms {
  direction: vec2f,
  spread: f32,
  _pad: f32,
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var inputSampler: sampler;
@group(0) @binding(2) var<uniform> thresholdUniforms: ThresholdUniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

// Fullscreen triangle
@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;

  // Generate fullscreen triangle
  let x = f32((vertexIndex & 1u) << 2u) - 1.0;
  let y = f32((vertexIndex & 2u) << 1u) - 1.0;

  output.position = vec4f(x, y, 0.0, 1.0);
  output.uv = vec2f((x + 1.0) * 0.5, (1.0 - y) * 0.5);

  return output;
}

@fragment
fn fs_threshold(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(inputTexture, inputSampler, input.uv);
  let brightness = dot(color.rgb, vec3f(0.2126, 0.7152, 0.0722));

  if (brightness > thresholdUniforms.threshold) {
    return vec4f(color.rgb * (brightness - thresholdUniforms.threshold), 1.0);
  }
  return vec4f(0.0, 0.0, 0.0, 1.0);
}

// Gaussian blur
@group(0) @binding(3) var<uniform> blurUniforms: BlurUniforms;

@fragment
fn fs_blur(input: VertexOutput) -> @location(0) vec4f {
  let texelSize = 1.0 / vec2f(textureDimensions(inputTexture));

  // 9-tap Gaussian blur with wide spread for glow effect
  let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

  var result = textureSample(inputTexture, inputSampler, input.uv).rgb * weights[0];

  for (var i = 1; i < 5; i++) {
    let offset = blurUniforms.direction * texelSize * f32(i) * blurUniforms.spread;
    result += textureSample(inputTexture, inputSampler, input.uv + offset).rgb * weights[i];
    result += textureSample(inputTexture, inputSampler, input.uv - offset).rgb * weights[i];
  }

  return vec4f(result, 1.0);
}

// Composite shader - combines original with bloom + CRT effect
@group(0) @binding(4) var bloomTexture: texture_2d<f32>;

// CRT barrel distortion
fn crtDistort(uv: vec2f, strength: f32) -> vec2f {
  let centered = uv - 0.5;
  let dist = dot(centered, centered);
  let distorted = centered * (1.0 + dist * strength);
  return distorted + 0.5;
}

@fragment
fn fs_composite(input: VertexOutput) -> @location(0) vec4f {
  // Apply CRT barrel distortion
  let crtStrength = 0.15; // Subtle curve
  let distortedUV = crtDistort(input.uv, crtStrength);

  // Clamp UV to valid range (avoids conditional before textureSample)
  let clampedUV = clamp(distortedUV, vec2f(0.0), vec2f(1.0));

  let original = textureSample(inputTexture, inputSampler, clampedUV).rgb;
  let bloom = textureSample(bloomTexture, inputSampler, clampedUV).rgb;

  // Black out pixels outside valid UV range
  let outOfBounds = step(1.0, max(
    max(step(distortedUV.x, -0.001), step(1.001, distortedUV.x)),
    max(step(distortedUV.y, -0.001), step(1.001, distortedUV.y))
  ));

  // Tonemap ONLY the original to make lines dark
  let exposure = 0.3;
  let darkened = (original * exposure) / (original * exposure + vec3f(1.0));

  // Add bloom AFTER tonemapping (bloom stays bright)
  var result = darkened + bloom * 2.5;

  // Subtle vignette (darker corners)
  let centered = input.uv - 0.5;
  let vignette = 1.0 - dot(centered, centered) * 0.5;
  result *= vignette;

  // Very subtle scanlines (low frequency to avoid moire)
  let screenY = input.uv.y * 400.0;
  let scanline = 0.97 + 0.03 * sin(screenY * 3.14159);
  result *= scanline;

  // Apply out-of-bounds mask
  result *= (1.0 - outOfBounds);

  return vec4f(result, 1.0);
}
