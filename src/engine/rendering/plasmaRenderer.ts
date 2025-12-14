// Plasma Band Renderer - draws lethal plasma bands with jittering particles

import { PlasmaBand } from '../../game/plasmaBands';

const MAX_BANDS = 8; // Support death spiral scenarios

const shaderSource = /* wgsl */ `
struct Uniforms {
  screenSize: vec2f,
  cameraPos: vec2f,
  zoom: f32,
  time: f32,
  bandCount: f32,
  _pad: f32,
}

struct Band {
  position: f32,      // World position of the band
  isHorizontal: f32,  // 1.0 for horizontal (top/bottom), 0.0 for vertical
  alpha: f32,         // Overall alpha (for fading)
  intensity: f32,     // Visual intensity (0 during warning, 1 when lethal)
}

struct BandData {
  bands: array<Band, ${MAX_BANDS}>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> bandData: BandData;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) screenPos: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen quad
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
  );

  let pos = positions[vertexIndex];

  var output: VertexOutput;
  output.position = vec4f(pos.x, -pos.y, 0.0, 1.0);
  output.screenPos = (pos * 0.5 + 0.5) * uniforms.screenSize;
  return output;
}

// Hash function for noise
fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash11(p: f32) -> f32 {
  var p2 = fract(p * 0.1031);
  p2 *= p2 + 33.33;
  p2 *= p2 + p2;
  return fract(p2);
}

// Noise for particle jitter
fn noise(p: vec2f, t: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);

  let a = hash21(i + vec2f(0.0, 0.0) + t * 0.1);
  let b = hash21(i + vec2f(1.0, 0.0) + t * 0.1);
  let c = hash21(i + vec2f(0.0, 1.0) + t * 0.1);
  let d = hash21(i + vec2f(1.0, 1.0) + t * 0.1);

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let bandCount = i32(uniforms.bandCount);
  if (bandCount == 0) {
    discard;
  }

  // Convert screen position to world position
  let worldPos = (input.screenPos - uniforms.screenSize * 0.5) / uniforms.zoom + uniforms.cameraPos;

  var totalColor = vec3f(0.0);
  var totalAlpha = 0.0;

  let coreWidth = 0.5;                        // Thin white core
  let particleWidth = 1.0;                    // Yellow particle spread

  for (var i = 0; i < ${MAX_BANDS}; i++) {
    if (i >= bandCount) {
      break;
    }

    let band = bandData.bands[i];
    if (band.alpha <= 0.0) {
      continue;
    }

    // Calculate distance to band
    var dist: f32;
    var alongBand: f32;
    if (band.isHorizontal > 0.5) {
      dist = abs(worldPos.y - band.position);
      alongBand = worldPos.x;
    } else {
      dist = abs(worldPos.x - band.position);
      alongBand = worldPos.y;
    }

    // Scale distance to screen pixels for consistent visual
    let screenDist = dist * uniforms.zoom;

    // Core (white, very thin, always visible)
    let coreAlpha = 1.0 - smoothstep(0.0, coreWidth, screenDist);

    // Particle effect (yellow, jittery)
    // Multiple noise layers for fizzing effect
    let noiseScale = 0.15;
    let timeScale = uniforms.time * 12.0;

    let n1 = noise(vec2f(alongBand * noiseScale, uniforms.time * 8.0), timeScale);
    let n2 = noise(vec2f(alongBand * noiseScale * 2.3 + 100.0, uniforms.time * 12.0), timeScale * 1.3);
    let n3 = noise(vec2f(alongBand * noiseScale * 0.7 + 200.0, uniforms.time * 6.0), timeScale * 0.7);

    // Jitter the distance based on noise
    let jitter = (n1 - 0.5) * 2.0 + (n2 - 0.5) * 1.5 + (n3 - 0.5) * 1.0;
    let jitteredDist = screenDist + jitter * band.intensity;

    // Particle intensity based on jittered distance
    let particleBase = 1.0 - smoothstep(0.0, particleWidth, abs(jitteredDist));

    // Add sparkle/crackle effect
    let sparkle = hash21(vec2f(alongBand * 0.5, uniforms.time * 20.0));
    let sparkleIntensity = step(0.92, sparkle) * particleBase * 2.0;

    let particleAlpha = particleBase * 0.8 + sparkleIntensity;

    // Warning phase: dim, less particles
    let warningMult = mix(0.25, 1.0, band.intensity);

    // Fade phase: increase jitter, decrease alpha
    let fadeAlpha = band.alpha;

    // Combine core and particles
    // Core is white (less HDR to reduce bloom spread)
    let coreColor = vec3f(1.2, 1.2, 1.0) * coreAlpha * warningMult;

    // Particles are yellow/orange (reduced intensity to minimize bloom spread)
    let particleColor = vec3f(0.9, 0.7, 0.15) * particleAlpha * warningMult * band.intensity;

    let bandColor = coreColor + particleColor;
    let bandAlpha = max(coreAlpha, particleAlpha * band.intensity) * fadeAlpha * warningMult;

    // Additive blending for multiple bands
    totalColor += bandColor * fadeAlpha;
    totalAlpha = max(totalAlpha, bandAlpha);
  }

  if (totalAlpha < 0.01) {
    discard;
  }

  return vec4f(totalColor, totalAlpha);
}
`;

export class PlasmaRenderer {
  private device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private bandBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;

  constructor(device: GPUDevice) {
    this.device = device;
    this.init();
  }

  private init(): void {
    const shaderModule = this.device.createShaderModule({
      code: shaderSource,
    });

    // Uniforms: screenSize(8) + cameraPos(8) + zoom(4) + time(4) + bandCount(4) + pad(4) = 32
    this.uniformBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Band data: 8 bands * 4 floats * 4 bytes = 128 bytes
    this.bandBuffer = this.device.createBuffer({
      size: MAX_BANDS * 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.bandBuffer } },
      ],
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one' }, // Additive for glow
            alpha: { srcFactor: 'one', dstFactor: 'one' },
          },
        }],
      },
    });
  }

  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    screenWidth: number,
    screenHeight: number,
    cameraX: number,
    cameraY: number,
    zoom: number,
    time: number,
    bands: readonly PlasmaBand[]
  ): void {
    if (bands.length === 0) return;

    const bandCount = Math.min(bands.length, MAX_BANDS);

    // Update uniforms
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([
        screenWidth, screenHeight,
        cameraX, cameraY,
        zoom, time,
        bandCount, 0
      ])
    );

    // Update band data
    const bandData = new Float32Array(MAX_BANDS * 4);
    for (let i = 0; i < bandCount; i++) {
      const band = bands[i];
      const isHorizontal = band.edge === 'top' || band.edge === 'bottom';

      // Calculate alpha based on fade state
      let alpha = 1.0;
      if (band.isFading) {
        alpha = band.fadeTimer / 1.5; // FADE_TIME
      }

      // Calculate intensity (0 during warning, 1 when lethal)
      let intensity = band.isLethal ? 1.0 : 0.0;
      if (band.warningTimer > 0) {
        // Pulse during warning
        intensity = 0.3 + 0.2 * Math.sin(time * 10);
      }

      bandData[i * 4 + 0] = band.currentPosition;
      bandData[i * 4 + 1] = isHorizontal ? 1.0 : 0.0;
      bandData[i * 4 + 2] = alpha;
      bandData[i * 4 + 3] = intensity;
    }

    this.device.queue.writeBuffer(this.bandBuffer, 0, bandData);

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6);
    pass.end();
  }
}
