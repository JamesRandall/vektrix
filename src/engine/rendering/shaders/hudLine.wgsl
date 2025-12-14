// Line rendering shader for HUD with soft edges
// Each line is a quad (2 triangles) with position, color, edge distance

struct Uniforms {
  screenSize: vec2f,
  _pad: vec2f,
}

struct LineVertex {
  @location(0) position: vec2f,
  @location(1) color: vec3f,
  @location(2) edge: f32,  // 0 at edges, 1 at center
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) edge: f32,
}

@vertex
fn vs_main(input: LineVertex) -> VertexOutput {
  var output: VertexOutput;

  // Convert screen coords (pixels) to clip space
  let clip = (input.position / uniforms.screenSize) * 2.0 - 1.0;
  output.position = vec4f(clip.x, -clip.y, 0.0, 1.0);
  output.color = input.color;
  output.edge = input.edge;

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  // edge goes 0->1 across the line width
  // Convert to distance from center: 0 at center, 1 at edges
  let distFromCenter = abs(input.edge - 0.5) * 2.0;
  // Soft falloff at edges
  let alpha = 1.0 - smoothstep(0.5, 1.0, distFromCenter);
  return vec4f(input.color * alpha, alpha);
}
