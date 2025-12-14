// Black Hole Renderer - draws filled black circle with fizzing ring

const shaderSource = /* wgsl */ `
struct Uniforms {
  screenSize: vec2f,
  cameraPos: vec2f,
  zoom: f32,
  time: f32,
  ringColor: vec3f,
  _pad: f32,
}

struct BlackHole {
  worldPos: vec2f,
  radius: f32,
  _pad: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> blackHole: BlackHole;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Fullscreen quad vertices
  var positions = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0,  1.0),
  );

  let pos = positions[vertexIndex];

  // Transform black hole world position to screen
  let screenCenter = (blackHole.worldPos - uniforms.cameraPos) * uniforms.zoom + uniforms.screenSize * 0.5;
  let screenRadius = blackHole.radius * uniforms.zoom;

  // Scale and position the quad around the black hole (extra padding for ring)
  let quadSize = screenRadius + 30.0;
  let screenPos = screenCenter + pos * quadSize;

  var output: VertexOutput;
  output.position = vec4f(
    (screenPos.x / uniforms.screenSize.x) * 2.0 - 1.0,
    1.0 - (screenPos.y / uniforms.screenSize.y) * 2.0,
    0.0, 1.0
  );
  output.uv = pos;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let screenRadius = blackHole.radius * uniforms.zoom;
  let quadSize = screenRadius + 30.0;

  // Distance from center in screen pixels
  let dist = length(input.uv) * quadSize;

  // Normalized distance (0 at center, 1 at black hole edge)
  let normDist = dist / screenRadius;

  // Fizzing noise on the ring
  let angle = atan2(input.uv.y, input.uv.x);
  let noise = sin(uniforms.time * 10.0 + angle * 8.0) * 0.03 +
              sin(uniforms.time * 15.0 + angle * 12.0) * 0.02 +
              sin(uniforms.time * 23.0 + angle * 6.0) * 0.015;

  let ringCenter = 1.0 + noise;
  let ringWidth = 0.08;

  // Ring intensity (peaks at edge, falls off inside and outside)
  let ringDist = abs(normDist - ringCenter);
  let ringAlpha = 1.0 - smoothstep(0.0, ringWidth, ringDist);

  // Black fill (inside the ring)
  let fillEdge = 0.95;
  let fillAlpha = 1.0 - smoothstep(fillEdge - 0.05, fillEdge, normDist);

  // Combine: black fill + colored ring
  if (fillAlpha > 0.01) {
    return vec4f(0.0, 0.0, 0.0, fillAlpha);
  } else if (ringAlpha > 0.01) {
    return vec4f(uniforms.ringColor * ringAlpha * 2.0, ringAlpha);
  } else {
    discard;
  }

  return vec4f(0.0);
}
`;

export class BlackHoleRenderer {
  private device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private blackHoleBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;

  constructor(device: GPUDevice) {
    this.device = device;
    this.init();
  }

  private init(): void {
    const shaderModule = this.device.createShaderModule({
      code: shaderSource,
    });

    this.uniformBuffer = this.device.createBuffer({
      size: 48, // screenSize(8) + cameraPos(8) + zoom(4) + time(4) + ringColor(12) + pad(4) = 40, round to 48
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.blackHoleBuffer = this.device.createBuffer({
      size: 16, // worldPos(8) + radius(4) + pad(4) = 16
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.blackHoleBuffer } },
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
          // Opaque-ish blending - destination is replaced where alpha > 0
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'zero' },
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
    worldX: number,
    worldY: number,
    radius: number,
    time: number,
    ringColor: readonly number[]
  ): void {
    // Update uniforms
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([
        screenWidth, screenHeight,
        cameraX, cameraY,
        zoom, time,
        ringColor[0], ringColor[1], ringColor[2], 0
      ])
    );

    this.device.queue.writeBuffer(
      this.blackHoleBuffer,
      0,
      new Float32Array([worldX, worldY, radius, 0])
    );

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6); // Two triangles
    pass.end();
  }
}
