struct Uniforms {
  screenSize: vec2f,
  time: f32,
  zoom: f32,
  cameraPos: vec2f,
  fade: f32,
  _pad: f32,
}

struct SpriteInstance {
  posX: f32,
  posY: f32,
  rotation: f32,
  scaleX: f32,
  scaleY: f32,
  width: f32,
  height: f32,
  tintR: f32,
  tintG: f32,
  tintB: f32,
  tintA: f32,
  shape: f32, // 0=circle, 1=player ship
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> instances: array<SpriteInstance>;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec4f,
  @location(1) uv: vec2f,
  @location(2) shape: f32,
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

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32
) -> VertexOutput {
  let instance = instances[instanceIndex];
  let localPos = quadPositions[vertexIndex];

  // Scale by sprite size
  var pos = localPos * vec2f(instance.width * instance.scaleX, instance.height * instance.scaleY);

  // Rotate
  let cos_r = cos(instance.rotation);
  let sin_r = sin(instance.rotation);
  let rotated = vec2f(
    pos.x * cos_r - pos.y * sin_r,
    pos.x * sin_r + pos.y * cos_r
  );

  // Translate to world position
  let worldPos = rotated + vec2f(instance.posX, instance.posY);

  // Apply camera transform: translate then zoom
  let viewPos = (worldPos - uniforms.cameraPos) * uniforms.zoom + uniforms.screenSize * 0.5;

  // Convert to clip space
  let clip = (viewPos / uniforms.screenSize) * 2.0 - 1.0;

  var output: VertexOutput;
  output.position = vec4f(clip.x, -clip.y, 0.0, 1.0);
  output.color = vec4f(instance.tintR, instance.tintG, instance.tintB, instance.tintA);
  output.uv = quadUVs[vertexIndex];
  output.shape = instance.shape;

  return output;
}

// Signed distance to a line segment
fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

// Player ship shape - chevron pointing right
fn drawPlayerShip(uv: vec2f, strokeWidth: f32) -> f32 {
  // Center UV and flip X so ship points right (nose at +X)
  let p = uv - vec2f(0.5);

  // Ship vertices (pointing right)
  let nose = vec2f(0.45, 0.0);           // Front tip
  let backTop = vec2f(-0.35, 0.35);      // Back top
  let backBottom = vec2f(-0.35, -0.35);  // Back bottom
  let indent = vec2f(-0.15, 0.0);        // Back indent (creates the chevron)

  // Distance to each line segment
  let d1 = sdSegment(p, nose, backTop);      // Top edge
  let d2 = sdSegment(p, nose, backBottom);   // Bottom edge
  let d3 = sdSegment(p, backTop, indent);    // Top back
  let d4 = sdSegment(p, backBottom, indent); // Bottom back

  let dist = min(min(d1, d2), min(d3, d4));

  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Circle ring shape
fn drawCircle(uv: vec2f, strokeWidth: f32) -> f32 {
  let center = uv - vec2f(0.5);
  let dist = length(center);
  let ringRadius = 0.42;
  let ringDist = abs(dist - ringRadius);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, ringDist);
}

// Bullet shape - elongated diamond pointing right
fn drawBullet(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);

  // Elongated diamond pointing right
  let nose = vec2f(0.45, 0.0);
  let tail = vec2f(-0.45, 0.0);
  let top = vec2f(0.0, 0.15);
  let bottom = vec2f(0.0, -0.15);

  let d1 = sdSegment(p, nose, top);
  let d2 = sdSegment(p, nose, bottom);
  let d3 = sdSegment(p, tail, top);
  let d4 = sdSegment(p, tail, bottom);

  let dist = min(min(d1, d2), min(d3, d4));
  return 1.0 - smoothstep(strokeWidth * 0.3, strokeWidth * 0.8, dist);
}

// Diamond shape for Wanderer enemy
fn drawDiamond(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let d1 = sdSegment(p, vec2f(0.4, 0.0), vec2f(0.0, 0.3));
  let d2 = sdSegment(p, vec2f(0.0, 0.3), vec2f(-0.4, 0.0));
  let d3 = sdSegment(p, vec2f(-0.4, 0.0), vec2f(0.0, -0.3));
  let d4 = sdSegment(p, vec2f(0.0, -0.3), vec2f(0.4, 0.0));
  let dist = min(min(d1, d2), min(d3, d4));
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Arrow shape for Chaser enemy
fn drawArrow(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let nose = vec2f(0.45, 0.0);
  let backTop = vec2f(-0.3, 0.3);
  let backBottom = vec2f(-0.3, -0.3);
  let d1 = sdSegment(p, nose, backTop);
  let d2 = sdSegment(p, nose, backBottom);
  let d3 = sdSegment(p, backTop, backBottom);
  let dist = min(min(d1, d2), d3);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Wave/curved shape for Weaver enemy
fn drawWave(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  // Curved S-like shape
  let top = vec2f(0.35, 0.2);
  let mid = vec2f(0.0, 0.0);
  let bottom = vec2f(-0.35, -0.2);
  let d1 = sdSegment(p, top, mid);
  let d2 = sdSegment(p, mid, bottom);
  // Add side curves
  let topCurve = vec2f(0.15, 0.35);
  let bottomCurve = vec2f(-0.15, -0.35);
  let d3 = sdSegment(p, top, topCurve);
  let d4 = sdSegment(p, bottom, bottomCurve);
  let dist = min(min(d1, d2), min(d3, d4));
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Triangle shape for Grunt enemy
fn drawTriangle(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let nose = vec2f(0.4, 0.0);
  let backTop = vec2f(-0.3, 0.3);
  let backBottom = vec2f(-0.3, -0.3);
  let d1 = sdSegment(p, nose, backTop);
  let d2 = sdSegment(p, nose, backBottom);
  let d3 = sdSegment(p, backTop, backBottom);
  let dist = min(min(d1, d2), d3);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Eye shape for Shy enemy - almond/eye shape
fn drawShy(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  // Eye outline - two arcs meeting at points
  let leftPoint = vec2f(-0.4, 0.0);
  let rightPoint = vec2f(0.4, 0.0);
  let topMid = vec2f(0.0, 0.28);
  let bottomMid = vec2f(0.0, -0.28);
  // Upper arc segments
  let d1 = sdSegment(p, leftPoint, topMid);
  let d2 = sdSegment(p, topMid, rightPoint);
  // Lower arc segments
  let d3 = sdSegment(p, leftPoint, bottomMid);
  let d4 = sdSegment(p, bottomMid, rightPoint);
  // Pupil circle in center
  let pupilDist = length(p) - 0.12;
  let d5 = abs(pupilDist);
  let dist = min(min(min(d1, d2), min(d3, d4)), d5);
  return 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, dist);
}

// Spinner enemy - circle with offset dot to show rotation
fn drawSpinner(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  // Outer circle ring
  let ringRadius = 0.38;
  let ringDist = abs(length(p) - ringRadius);
  // Dot near circumference (at right side, rotation handled by transform)
  let dotPos = vec2f(0.28, 0.0);
  let dotDist = length(p - dotPos) - 0.08;
  // Combine ring and filled dot
  let ringAlpha = 1.0 - smoothstep(strokeWidth * 0.5, strokeWidth, ringDist);
  let dotAlpha = 1.0 - smoothstep(0.0, strokeWidth, dotDist);
  return max(ringAlpha, dotAlpha);
}

// Enemy bullet - small filled circle
fn drawEnemyBullet(uv: vec2f, strokeWidth: f32) -> f32 {
  let p = uv - vec2f(0.5);
  let dist = length(p) - 0.35;
  return 1.0 - smoothstep(0.0, strokeWidth, dist);
}

// Mine - solid yellow circle
fn drawMine(uv: vec2f) -> f32 {
  let p = uv - vec2f(0.5);
  let dist = length(p);
  return 1.0 - smoothstep(0.35, 0.4, dist);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let strokeWidth = 0.04;
  var alpha: f32;

  let shapeType = i32(input.shape + 0.5); // Round to nearest int

  if (shapeType == 1) {
    // Player ship
    alpha = drawPlayerShip(input.uv, strokeWidth);
  } else if (shapeType == 2) {
    // Bullet
    alpha = drawBullet(input.uv, strokeWidth);
  } else if (shapeType == 3) {
    // Wanderer - diamond
    alpha = drawDiamond(input.uv, strokeWidth);
  } else if (shapeType == 4) {
    // Chaser - arrow
    alpha = drawArrow(input.uv, strokeWidth);
  } else if (shapeType == 5) {
    // Weaver - wave
    alpha = drawWave(input.uv, strokeWidth);
  } else if (shapeType == 6) {
    // Grunt - triangle
    alpha = drawTriangle(input.uv, strokeWidth);
  } else if (shapeType == 7) {
    // Shy - eye shape
    alpha = drawShy(input.uv, strokeWidth);
  } else if (shapeType == 8) {
    // Spinner - circle with dot
    alpha = drawSpinner(input.uv, strokeWidth);
  } else if (shapeType == 9) {
    // Enemy bullet - filled circle
    alpha = drawEnemyBullet(input.uv, strokeWidth);
  } else if (shapeType == 10) {
    // Mine - solid filled circle
    alpha = drawMine(input.uv);
  } else {
    // Default: circle
    alpha = drawCircle(input.uv, strokeWidth);
  }

  if (alpha < 0.01) {
    discard;
  }

  // Apply scene fade
  return vec4f(input.color.rgb * 2.0 * uniforms.fade, input.color.a * alpha);
}
