// Trail/ghost effect pass: fading persistence with camera compensation

import trailShaderSource from '../shaders/trail.wgsl';

export interface TrailConfig {
  fadeAmount?: number;
  bloomIntensity?: number;
}

export class TrailPass {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private fadePipeline: GPURenderPipeline;
  private compositePipeline: GPURenderPipeline;
  private bloomCompositePipeline: GPURenderPipeline;
  private fadeUniformBuffer: GPUBuffer;
  private bloomUniformBuffer: GPUBuffer;

  private currentIndex = 0;
  private prevCameraX = 0;
  private prevCameraY = 0;
  private fadeAmount: number;

  constructor(device: GPUDevice, config: TrailConfig = {}) {
    this.fadeAmount = config.fadeAmount ?? 0.08;
    this.device = device;

    const shaderModule = device.createShaderModule({
      code: trailShaderSource,
      label: 'Trail Shader',
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Fade uniform (fadeAmount, bloomIntensity, cameraDeltaX, cameraDeltaY)
    this.fadeUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Trail Fade Uniform',
    });
    device.queue.writeBuffer(this.fadeUniformBuffer, 0, new Float32Array([
      config.fadeAmount ?? 0.08, 0, 0, 0
    ]));

    // Bloom composite uniform
    this.bloomUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Trail Bloom Uniform',
    });
    device.queue.writeBuffer(this.bloomUniformBuffer, 0, new Float32Array([
      0, config.bloomIntensity ?? 2.0, 0, 0
    ]));

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

    // Fade pipeline
    this.fadePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_fade',
        targets: [{ format: 'rgba16float' }],
      },
      label: 'Trail Fade Pipeline',
    });

    // Composite pipeline (additive)
    this.compositePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_composite',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one' },
            alpha: { srcFactor: 'one', dstFactor: 'one' },
          },
        }],
      },
      label: 'Trail Composite Pipeline',
    });

    // Bloom composite pipeline (additive with intensity)
    this.bloomCompositePipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_bloom_composite',
        targets: [{
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one' },
            alpha: { srcFactor: 'one', dstFactor: 'one' },
          },
        }],
      },
      label: 'Trail Bloom Composite Pipeline',
    });
  }

  setFadeAmount(amount: number): void {
    this.fadeAmount = amount;
    this.device.queue.writeBuffer(this.fadeUniformBuffer, 0, new Float32Array([amount, 0, 0, 0]));
  }

  setBloomIntensity(intensity: number): void {
    this.device.queue.writeBuffer(this.bloomUniformBuffer, 0, new Float32Array([0, intensity, 0, 0]));
  }

  /**
   * Get current trail buffer index (for ping-pong)
   */
  get currentBufferIndex(): number {
    return this.currentIndex;
  }

  /**
   * Get the current trail target for sprite rendering
   */
  getCurrentTarget(pingPong: [GPUTextureView, GPUTextureView]): GPUTextureView {
    return pingPong[this.currentIndex];
  }

  /**
   * Reset ping-pong state (call when textures are recreated)
   */
  reset(): void {
    this.currentIndex = 0;
    this.prevCameraX = 0;
    this.prevCameraY = 0;
  }

  /**
   * Fade previous trail buffer
   * @returns The current trail target (for sprite rendering)
   */
  fade(
    encoder: GPUCommandEncoder,
    pingPong: [GPUTextureView, GPUTextureView],
    cameraX: number,
    cameraY: number,
    zoom: number,
    worldWidth: number,
    worldHeight: number
  ): GPUTextureView {
    const prevView = pingPong[1 - this.currentIndex];
    const currView = pingPong[this.currentIndex];

    // Calculate camera delta
    const cameraDeltaX = (cameraX - this.prevCameraX) * zoom / worldWidth;
    const cameraDeltaY = (cameraY - this.prevCameraY) * zoom / worldHeight;

    // Update uniforms
    this.device.queue.writeBuffer(
      this.fadeUniformBuffer,
      0,
      new Float32Array([this.fadeAmount, 0, cameraDeltaX, cameraDeltaY])
    );

    this.prevCameraX = cameraX;
    this.prevCameraY = cameraY;

    // Fade pass
    const fadeBindGroup = this.device.createBindGroup({
      layout: this.fadePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: prevView },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.fadeUniformBuffer } },
      ],
    });

    const fadePass = encoder.beginRenderPass({
      colorAttachments: [{
        view: currView,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    fadePass.setPipeline(this.fadePipeline);
    fadePass.setBindGroup(0, fadeBindGroup);
    fadePass.draw(3);
    fadePass.end();

    return currView;
  }

  /**
   * Composite trail onto target (additive)
   */
  composite(
    encoder: GPUCommandEncoder,
    source: GPUTextureView,
    target: GPUTextureView
  ): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.compositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.fadeUniformBuffer } },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.compositePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  /**
   * Composite bloom with intensity control
   */
  compositeBloom(
    encoder: GPUCommandEncoder,
    bloom: GPUTextureView,
    target: GPUTextureView
  ): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.bloomCompositePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: bloom },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.bloomUniformBuffer } },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.bloomCompositePipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }

  /**
   * Swap ping-pong buffers (call after rendering sprites to trail)
   */
  swapBuffers(): void {
    this.currentIndex = 1 - this.currentIndex;
  }
}
