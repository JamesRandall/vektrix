// Final composite pass: HDR + bloom -> screen with CRT effect

import bloomShaderSource from '../shaders/bloom.wgsl';

export class CompositePass {
  private device: GPUDevice;
  private sampler: GPUSampler;
  private pipeline: GPURenderPipeline;
  private uniformBuffer: GPUBuffer;

  constructor(device: GPUDevice, outputFormat: GPUTextureFormat) {
    this.device = device;

    const shaderModule = device.createShaderModule({
      code: bloomShaderSource,
      label: 'Composite Shader',
    });

    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
    });

    this.uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Composite Uniform',
    });
    device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([0, 0, 0, 0]));

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_composite',
        targets: [{ format: outputFormat }],
      },
      label: 'Composite Pipeline',
    });
  }

  render(
    encoder: GPUCommandEncoder,
    hdr: GPUTextureView,
    bloom: GPUTextureView,
    target: GPUTextureView
  ): void {
    const bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: hdr },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
        { binding: 4, resource: bloom },
      ],
    });

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
  }
}
