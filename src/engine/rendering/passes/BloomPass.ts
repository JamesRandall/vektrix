// Bloom post-processing pass: threshold + gaussian blur

import bloomShaderSource from '../shaders/bloom.wgsl';

export interface BloomConfig {
  threshold?: number;
  spread?: number;
  iterations?: number;
}

export class BloomPass {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private thresholdPipeline: GPURenderPipeline;
  private blurHPipeline: GPURenderPipeline;
  private blurVPipeline: GPURenderPipeline;
  private thresholdUniformBuffer: GPUBuffer;
  private blurHUniformBuffer: GPUBuffer;
  private blurVUniformBuffer: GPUBuffer;

  private threshold: number;
  private spread: number;
  private iterations: number;

  constructor(device: GPUDevice, config: BloomConfig = {}) {
    this.device = device;
    this.threshold = config.threshold ?? 0.0;
    this.spread = config.spread ?? 8.0;
    this.iterations = config.iterations ?? 4;

    const shaderModule = device.createShaderModule({
      code: bloomShaderSource,
      label: 'Bloom Shader',
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    // Threshold uniform
    this.thresholdUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Bloom Threshold Uniform',
    });
    device.queue.writeBuffer(this.thresholdUniformBuffer, 0, new Float32Array([this.threshold, 0, 0, 0]));

    // Blur uniforms (direction + spread)
    this.blurHUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Bloom Blur H Uniform',
    });
    device.queue.writeBuffer(this.blurHUniformBuffer, 0, new Float32Array([1, 0, this.spread, 0]));

    this.blurVUniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Bloom Blur V Uniform',
    });
    device.queue.writeBuffer(this.blurVUniformBuffer, 0, new Float32Array([0, 1, this.spread, 0]));

    // Pipelines
    const thresholdBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.thresholdPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [thresholdBindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_threshold',
        targets: [{ format: 'rgba16float' }],
      },
      label: 'Bloom Threshold Pipeline',
    });

    const blurBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    this.blurHPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_blur',
        targets: [{ format: 'rgba16float' }],
      },
      label: 'Bloom Blur H Pipeline',
    });

    this.blurVPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blurBindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_blur',
        targets: [{ format: 'rgba16float' }],
      },
      label: 'Bloom Blur V Pipeline',
    });
  }

  setSpread(spread: number): void {
    this.spread = spread;
    this.device.queue.writeBuffer(this.blurHUniformBuffer, 0, new Float32Array([1, 0, spread, 0]));
    this.device.queue.writeBuffer(this.blurVUniformBuffer, 0, new Float32Array([0, 1, spread, 0]));
  }

  setThreshold(threshold: number): void {
    this.threshold = threshold;
    this.device.queue.writeBuffer(this.thresholdUniformBuffer, 0, new Float32Array([threshold, 0, 0, 0]));
  }

  setIterations(iterations: number): void {
    this.iterations = iterations;
  }

  /**
   * Apply bloom effect
   * @param encoder Command encoder
   * @param source Source texture view
   * @param pingPong Two texture views for ping-pong blurring [A, B]
   * @returns The texture view containing the final blurred result (always pingPong[0])
   */
  render(
    encoder: GPUCommandEncoder,
    source: GPUTextureView,
    pingPong: [GPUTextureView, GPUTextureView]
  ): GPUTextureView {
    const [targetA, targetB] = pingPong;

    // Threshold pass: source -> A
    const thresholdBindGroup = this.device.createBindGroup({
      layout: this.thresholdPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.thresholdUniformBuffer } },
      ],
    });

    const thresholdPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: targetA,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    thresholdPass.setPipeline(this.thresholdPipeline);
    thresholdPass.setBindGroup(0, thresholdBindGroup);
    thresholdPass.draw(3);
    thresholdPass.end();

    // Blur iterations
    for (let i = 0; i < this.iterations; i++) {
      // Horizontal blur: A -> B
      const blurHBindGroup = this.device.createBindGroup({
        layout: this.blurHPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: targetA },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: { buffer: this.thresholdUniformBuffer } },
          { binding: 3, resource: { buffer: this.blurHUniformBuffer } },
        ],
      });

      const blurHPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetB,
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      blurHPass.setPipeline(this.blurHPipeline);
      blurHPass.setBindGroup(0, blurHBindGroup);
      blurHPass.draw(3);
      blurHPass.end();

      // Vertical blur: B -> A
      const blurVBindGroup = this.device.createBindGroup({
        layout: this.blurVPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: targetB },
          { binding: 1, resource: this.sampler },
          { binding: 2, resource: { buffer: this.thresholdUniformBuffer } },
          { binding: 3, resource: { buffer: this.blurVUniformBuffer } },
        ],
      });

      const blurVPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: targetA,
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      blurVPass.setPipeline(this.blurVPipeline);
      blurVPass.setBindGroup(0, blurVBindGroup);
      blurVPass.draw(3);
      blurVPass.end();
    }

    return targetA;
  }
}
