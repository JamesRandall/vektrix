import { MAX_ENTITIES, componentMask, COMP_TRANSFORM, COMP_SPRITE } from '../ecs/entity';
import { transforms, sprites } from '../ecs/components';
import spriteShaderSource from './shaders/sprite.wgsl';

// Instance data layout: 12 floats per sprite (48 bytes, padded to 48)
const FLOATS_PER_INSTANCE = 12;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;
const MAX_SPRITES = 4096;

export class SpriteRenderer {
  private device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private uniformBuffer!: GPUBuffer;
  private instanceBuffer!: GPUBuffer;
  private bindGroup!: GPUBindGroup;
  private instanceData: Float32Array;

  constructor(device: GPUDevice) {
    this.device = device;
    this.instanceData = new Float32Array(MAX_SPRITES * FLOATS_PER_INSTANCE);
    this.init();
  }

  private init(): void {
    const shaderModule = this.device.createShaderModule({
      code: spriteShaderSource,
    });

    // Uniform buffer
    this.uniformBuffer = this.device.createBuffer({
      size: 32, // vec2 screenSize + time + zoom + vec2 cameraPos + vec2 padding
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Instance storage buffer
    this.instanceBuffer = this.device.createBuffer({
      size: MAX_SPRITES * BYTES_PER_INSTANCE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });

    this.bindGroup = this.device.createBindGroup({
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.instanceBuffer } },
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
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
    });
  }

  buildSpriteBatch(): number {
    let count = 0;

    for (let i = 0; i < MAX_ENTITIES && count < MAX_SPRITES; i++) {
      // Check if entity has both transform and sprite
      if ((componentMask[i] & (COMP_TRANSFORM | COMP_SPRITE)) !== (COMP_TRANSFORM | COMP_SPRITE)) {
        continue;
      }

      const offset = count * FLOATS_PER_INSTANCE;

      this.instanceData[offset + 0] = transforms.x[i];
      this.instanceData[offset + 1] = transforms.y[i];
      this.instanceData[offset + 2] = transforms.rotation[i];
      this.instanceData[offset + 3] = transforms.scaleX[i];
      this.instanceData[offset + 4] = transforms.scaleY[i];
      this.instanceData[offset + 5] = sprites.width[i];
      this.instanceData[offset + 6] = sprites.height[i];
      this.instanceData[offset + 7] = sprites.tintR[i];
      this.instanceData[offset + 8] = sprites.tintG[i];
      this.instanceData[offset + 9] = sprites.tintB[i];
      this.instanceData[offset + 10] = sprites.tintA[i];
      this.instanceData[offset + 11] = sprites.shape[i];

      count++;
    }

    if (count > 0) {
      this.device.queue.writeBuffer(this.instanceBuffer, 0, this.instanceData, 0, count * FLOATS_PER_INSTANCE);
    }

    return count;
  }

  render(
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    screenWidth: number,
    screenHeight: number,
    time: number,
    cameraX: number,
    cameraY: number,
    zoom: number,
    fade: number = 1.0,
    clearTarget: boolean = false
  ): void {
    // Update uniforms with camera data
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([screenWidth, screenHeight, time, zoom, cameraX, cameraY, fade, 0])
    );

    // Build instance batch
    const instanceCount = this.buildSpriteBatch();

    if (instanceCount === 0) {
      return;
    }

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: clearTarget ? 'clear' : 'load',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.draw(6, instanceCount); // 6 vertices per quad, instanced

    pass.end();
  }
}
