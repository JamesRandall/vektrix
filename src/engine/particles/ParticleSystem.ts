import { MAX_PARTICLES, MAX_EMISSIONS_PER_FRAME, EmissionRequest } from './types';

import emitShaderSource from './shaders/particle_emit.wgsl';
import updateShaderSource from './shaders/particle_update.wgsl';
import renderShaderSource from './shaders/particle_render.wgsl';

interface ParticleBufferSet {
  positionLife: GPUBuffer;  // x, y, life, maxLife
  velocitySize: GPUBuffer;  // vx, vy, size, sizeDecay
  colorType: GPUBuffer;     // r, g, b, type
}

export class ParticleSystem {
  private device: GPUDevice;

  // Double-buffered particle state
  private buffersA: ParticleBufferSet;
  private buffersB: ParticleBufferSet;
  private currentReadBuffer = 0; // 0 = A is read, B is write; 1 = opposite

  // Atomic counters
  private counterBufferA: GPUBuffer; // Live count for buffer A
  private counterBufferB: GPUBuffer; // Live count for buffer B
  private counterResetBuffer: GPUBuffer; // Zero value for resetting

  // Indirect draw buffer
  private indirectDrawBuffer: GPUBuffer;

  // Emission
  private emissionBuffer: GPUBuffer;
  private emissionData: Float32Array;
  private emissionQueue: EmissionRequest[] = [];

  // Approximate particle count tracking
  private estimatedParticleCount = 0;
  private lastAvgLifetime = 1;

  // Uniform buffers
  private emitUniformBuffer: GPUBuffer;
  private updateUniformBuffer: GPUBuffer;
  private renderUniformBuffer: GPUBuffer;

  // Pipelines
  private emitPipeline: GPUComputePipeline;
  private updatePipeline: GPUComputePipeline;
  private renderPipeline: GPURenderPipeline;

  // Bind group layouts
  private emitBindGroupLayout: GPUBindGroupLayout;
  private updateBindGroupLayout: GPUBindGroupLayout;
  private renderBindGroupLayout: GPUBindGroupLayout;

  constructor(device: GPUDevice, targetFormat: GPUTextureFormat = 'rgba16float') {
    this.device = device;

    // Create particle buffers (double-buffered)
    this.buffersA = this.createParticleBuffers();
    this.buffersB = this.createParticleBuffers();

    // Create counter buffers
    const counterUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
    this.counterBufferA = device.createBuffer({ size: 4, usage: counterUsage });
    this.counterBufferB = device.createBuffer({ size: 4, usage: counterUsage });
    this.counterResetBuffer = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    new Uint32Array(this.counterResetBuffer.getMappedRange()).set([0]);
    this.counterResetBuffer.unmap();

    // Create indirect draw buffer: [vertexCount, instanceCount, firstVertex, firstInstance]
    this.indirectDrawBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.INDIRECT | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    // Initialize with 6 vertices per quad, 0 instances initially
    new Uint32Array(this.indirectDrawBuffer.getMappedRange()).set([6, 0, 0, 0]);
    this.indirectDrawBuffer.unmap();

    // Create emission buffer
    const emissionStride = 16 * 4; // 16 floats per emission
    this.emissionBuffer = device.createBuffer({
      size: MAX_EMISSIONS_PER_FRAME * emissionStride,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.emissionData = new Float32Array(MAX_EMISSIONS_PER_FRAME * 16);

    // Create uniform buffers
    this.emitUniformBuffer = device.createBuffer({
      size: 16, // 4 x u32/f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.updateUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.renderUniformBuffer = device.createBuffer({
      size: 32, // 8 x f32
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Create pipelines
    this.emitBindGroupLayout = this.createEmitBindGroupLayout();
    this.updateBindGroupLayout = this.createUpdateBindGroupLayout();
    this.renderBindGroupLayout = this.createRenderBindGroupLayout();

    this.emitPipeline = this.createEmitPipeline();
    this.updatePipeline = this.createUpdatePipeline();
    this.renderPipeline = this.createRenderPipeline(targetFormat);
  }

  private createParticleBuffers(): ParticleBufferSet {
    const size = MAX_PARTICLES * 16; // 4 floats * 4 bytes
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

    return {
      positionLife: this.device.createBuffer({ size, usage }),
      velocitySize: this.device.createBuffer({ size, usage }),
      colorType: this.device.createBuffer({ size, usage }),
    };
  }

  private createEmitBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
  }

  private createUpdateBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 8, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
  }

  private createRenderBindGroupLayout(): GPUBindGroupLayout {
    return this.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    });
  }

  private createEmitPipeline(): GPUComputePipeline {
    const module = this.device.createShaderModule({ code: emitShaderSource });
    return this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.emitBindGroupLayout],
      }),
      compute: { module, entryPoint: 'main' },
    });
  }

  private createUpdatePipeline(): GPUComputePipeline {
    const module = this.device.createShaderModule({ code: updateShaderSource });
    return this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.updateBindGroupLayout],
      }),
      compute: { module, entryPoint: 'main' },
    });
  }

  private createRenderPipeline(format: GPUTextureFormat): GPURenderPipeline {
    const module = this.device.createShaderModule({ code: renderShaderSource });
    return this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [this.renderBindGroupLayout],
      }),
      vertex: {
        module,
        entryPoint: 'vs_main',
      },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one', // Additive blending for glow
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one',
              operation: 'add',
            },
          },
        }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });
  }

  emit(request: EmissionRequest): void {
    if (this.emissionQueue.length < MAX_EMISSIONS_PER_FRAME) {
      this.emissionQueue.push(request);
    }
  }

  private uploadEmissions(): number {
    const count = this.emissionQueue.length;
    if (count === 0) return 0;

    // Pack emission data
    for (let i = 0; i < count; i++) {
      const e = this.emissionQueue[i];
      const offset = i * 16;
      this.emissionData[offset + 0] = e.x;
      this.emissionData[offset + 1] = e.y;
      this.emissionData[offset + 2] = e.count;
      this.emissionData[offset + 3] = e.type;
      this.emissionData[offset + 4] = e.color[0];
      this.emissionData[offset + 5] = e.color[1];
      this.emissionData[offset + 6] = e.color[2];
      this.emissionData[offset + 7] = e.speedMin;
      this.emissionData[offset + 8] = e.speedMax;
      this.emissionData[offset + 9] = e.sizeMin;
      this.emissionData[offset + 10] = e.sizeMax;
      this.emissionData[offset + 11] = e.lifetimeMin;
      this.emissionData[offset + 12] = e.lifetimeMax;
      this.emissionData[offset + 13] = e.spread;
      this.emissionData[offset + 14] = e.direction;
      this.emissionData[offset + 15] = 0; // padding
    }

    this.device.queue.writeBuffer(
      this.emissionBuffer,
      0,
      this.emissionData.buffer,
      0,
      count * 16 * 4
    );

    // Track estimated particle count
    let totalParticles = 0;
    let totalLifetime = 0;
    for (const e of this.emissionQueue) {
      totalParticles += e.count;
      totalLifetime += (e.lifetimeMin + e.lifetimeMax) / 2 * e.count;
    }
    const avgLifetime = totalParticles > 0 ? totalLifetime / totalParticles : 1;
    this.estimatedParticleCount += totalParticles;
    this.estimatedParticleCount = Math.min(this.estimatedParticleCount, MAX_PARTICLES);

    // Store avg lifetime for decay calculation
    this.lastAvgLifetime = avgLifetime;

    this.emissionQueue = [];
    return count;
  }

  update(encoder: GPUCommandEncoder, dt: number, time: number): void {
    // Decay particle estimate based on average lifetime
    const decayRate = 1 / Math.max(0.5, this.lastAvgLifetime);
    this.estimatedParticleCount = Math.max(0, this.estimatedParticleCount - this.estimatedParticleCount * decayRate * dt);

    const readBuffers = this.currentReadBuffer === 0 ? this.buffersA : this.buffersB;
    const writeBuffers = this.currentReadBuffer === 0 ? this.buffersB : this.buffersA;
    const readCounter = this.currentReadBuffer === 0 ? this.counterBufferA : this.counterBufferB;
    const writeCounter = this.currentReadBuffer === 0 ? this.counterBufferB : this.counterBufferA;

    // Reset write counter to 0
    encoder.copyBufferToBuffer(this.counterResetBuffer, 0, writeCounter, 0, 4);

    // Process emissions
    const emissionCount = this.uploadEmissions();
    if (emissionCount > 0) {
      // Update emit uniforms
      const emitUniforms = new Uint32Array([emissionCount, MAX_PARTICLES]);
      const emitUniformsFloat = new Float32Array(emitUniforms.buffer);
      emitUniformsFloat[2] = time; // seed
      this.device.queue.writeBuffer(this.emitUniformBuffer, 0, emitUniforms.buffer);

      // Create emit bind group (writes to READ buffers, they become write target)
      const emitBindGroup = this.device.createBindGroup({
        layout: this.emitBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.emitUniformBuffer } },
          { binding: 1, resource: { buffer: this.emissionBuffer } },
          { binding: 2, resource: { buffer: readBuffers.positionLife } },
          { binding: 3, resource: { buffer: readBuffers.velocitySize } },
          { binding: 4, resource: { buffer: readBuffers.colorType } },
          { binding: 5, resource: { buffer: readCounter } },
        ],
      });

      const emitPass = encoder.beginComputePass();
      emitPass.setPipeline(this.emitPipeline);
      emitPass.setBindGroup(0, emitBindGroup);
      // Dispatch enough workgroups: each emission can spawn up to 256 particles
      emitPass.dispatchWorkgroups(Math.ceil((emissionCount * 256) / 64));
      emitPass.end();
    }

    // Update uniforms
    const updateUniforms = new Float32Array([dt, time, 0, 0]);
    const updateUniformsU32 = new Uint32Array(updateUniforms.buffer);
    updateUniformsU32[2] = MAX_PARTICLES;
    this.device.queue.writeBuffer(this.updateUniformBuffer, 0, updateUniforms.buffer);

    // Create update bind group
    const updateBindGroup = this.device.createBindGroup({
      layout: this.updateBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.updateUniformBuffer } },
        { binding: 1, resource: { buffer: readBuffers.positionLife } },
        { binding: 2, resource: { buffer: readBuffers.velocitySize } },
        { binding: 3, resource: { buffer: readBuffers.colorType } },
        { binding: 4, resource: { buffer: writeBuffers.positionLife } },
        { binding: 5, resource: { buffer: writeBuffers.velocitySize } },
        { binding: 6, resource: { buffer: writeBuffers.colorType } },
        { binding: 7, resource: { buffer: writeCounter } },
        { binding: 8, resource: { buffer: readCounter } },
      ],
    });

    const updatePass = encoder.beginComputePass();
    updatePass.setPipeline(this.updatePipeline);
    updatePass.setBindGroup(0, updateBindGroup);
    updatePass.dispatchWorkgroups(Math.ceil(MAX_PARTICLES / 256));
    updatePass.end();

    // Copy particle count to indirect draw buffer (instanceCount is at offset 4)
    encoder.copyBufferToBuffer(writeCounter, 0, this.indirectDrawBuffer, 4, 4);

    // Swap buffers
    this.currentReadBuffer = 1 - this.currentReadBuffer;
  }

  render(
    encoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    screenWidth: number,
    screenHeight: number,
    cameraX: number,
    cameraY: number,
    zoom: number,
    time: number
  ): void {
    // After update, the "read" buffer is now the one we just wrote to
    const renderBuffers = this.currentReadBuffer === 0 ? this.buffersA : this.buffersB;

    // Update render uniforms
    const renderUniforms = new Float32Array([
      screenWidth, screenHeight,
      cameraX, cameraY,
      zoom, time,
      0, 0, // padding
    ]);
    this.device.queue.writeBuffer(this.renderUniformBuffer, 0, renderUniforms.buffer);

    // Create render bind group
    const renderBindGroup = this.device.createBindGroup({
      layout: this.renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.renderUniformBuffer } },
        { binding: 1, resource: { buffer: renderBuffers.positionLife } },
        { binding: 2, resource: { buffer: renderBuffers.velocitySize } },
        { binding: 3, resource: { buffer: renderBuffers.colorType } },
      ],
    });

    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetView,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, renderBindGroup);
    // Use indirect draw - GPU determines instance count from particle counter
    renderPass.drawIndirect(this.indirectDrawBuffer, 0);
    renderPass.end();
  }

  // Get approximate particle count (estimated, not exact)
  getApproximateParticleCount(): number {
    return Math.floor(this.estimatedParticleCount);
  }

  // Update particle estimate during emission
  updateParticleEstimate(dt: number, emittedCount: number, avgLifetime: number): void {
    // Add new particles
    this.estimatedParticleCount += emittedCount;

    // Decay based on average lifetime (rough approximation)
    const decayRate = 1 / Math.max(0.5, avgLifetime);
    this.estimatedParticleCount = Math.max(0, this.estimatedParticleCount - this.estimatedParticleCount * decayRate * dt);

    // Cap at max particles
    this.estimatedParticleCount = Math.min(this.estimatedParticleCount, MAX_PARTICLES);
  }

  destroy(): void {
    this.buffersA.positionLife.destroy();
    this.buffersA.velocitySize.destroy();
    this.buffersA.colorType.destroy();
    this.buffersB.positionLife.destroy();
    this.buffersB.velocitySize.destroy();
    this.buffersB.colorType.destroy();
    this.counterBufferA.destroy();
    this.counterBufferB.destroy();
    this.counterResetBuffer.destroy();
    this.indirectDrawBuffer.destroy();
    this.emissionBuffer.destroy();
    this.emitUniformBuffer.destroy();
    this.updateUniformBuffer.destroy();
    this.renderUniformBuffer.destroy();
  }
}
