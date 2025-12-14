struct Uniforms {
  screenSize: vec2f,
  time: f32,
  zoom: f32,
  cameraPos: vec2f,
  pixelOffset: vec2f, // Sub-pixel offset for line thickening
  gridColor: vec3f,   // Base color (HDR)
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexInput {
  @location(0) position: vec2f,
  @location(1) restPosition: vec2f,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) displacement: f32,
  @location(1) screenUV: vec2f,
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;

  // Apply camera transform: translate then zoom
  let viewPos = (input.position - uniforms.cameraPos) * uniforms.zoom + uniforms.screenSize * 0.5;

  // Map to clip space (-1 to 1)
  let clip = (viewPos / uniforms.screenSize) * 2.0 - 1.0;

  // Apply sub-pixel offset for line thickening (convert pixels to clip space)
  let pixelToClip = 2.0 / uniforms.screenSize;
  let offset = uniforms.pixelOffset * pixelToClip;

  output.position = vec4f(clip.x + offset.x, -clip.y + offset.y, 0.0, 1.0);

  // Pass screen UV (0-1) for edge fade
  output.screenUV = viewPos / uniforms.screenSize;

  // Calculate displacement from rest position for coloring
  let dx = input.position.x - input.restPosition.x;
  let dy = input.position.y - input.restPosition.y;
  output.displacement = sqrt(dx * dx + dy * dy);

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  // Base color from uniform (HDR for bloom)
  let baseColor = uniforms.gridColor;

  // Displacement adds more brightness
  let dispNorm = min(input.displacement / 25.0, 1.0);
  let intensity = 1.0 + dispNorm * 2.0;

  // Fade out near screen edges to prevent edge bloom artifacts
  let edgeFade = 0.04; // Fade zone as fraction of screen
  let fadeL = smoothstep(0.0, edgeFade, input.screenUV.x);
  let fadeR = smoothstep(0.0, edgeFade, 1.0 - input.screenUV.x);
  let fadeT = smoothstep(0.0, edgeFade, input.screenUV.y);
  let fadeB = smoothstep(0.0, edgeFade, 1.0 - input.screenUV.y);
  let edgeAlpha = fadeL * fadeR * fadeT * fadeB;

  let finalColor = baseColor * intensity * edgeAlpha;

  return vec4f(finalColor, 1.0);
}
