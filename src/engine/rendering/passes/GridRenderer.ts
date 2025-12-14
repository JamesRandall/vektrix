// Grid line renderer with multi-pass thickness effect

import { GridState, GRID_COLS, GRID_ROWS, VERTEX_COUNT } from '../../grid/grid';
import gridShaderSource from '../shaders/grid.wgsl';

export interface GridRenderConfig {
  lineOffsets?: number[][];
}

const DEFAULT_LINE_OFFSETS = [
  [0, 0],
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export class GridRenderer {
  private device: GPUDevice;
  private pipeline!: GPURenderPipeline;
  private vertexBuffer!: GPUBuffer;
  private indexBuffer!: GPUBuffer;
  private uniformBuffers: GPUBuffer[] = [];
  private bindGroups: GPUBindGroup[] = [];
  private indexCount = 0;
  private lineOffsets: number[][];

  constructor(device: GPUDevice, config: GridRenderConfig = {}) {
    this.device = device;
    this.lineOffsets = config.lineOffsets ?? DEFAULT_LINE_OFFSETS;

    const shaderModule = device.createShaderModule({
      code: gridShaderSource,
      label: 'Grid Shader',
    });

    const vertexBufferLayout: GPUVertexBufferLayout = {
      arrayStride: 16,
      attributes: [
        { shaderLocation: 0, offset: 0, format: 'float32x2' },
        { shaderLocation: 1, offset: 8, format: 'float32x2' },
      ],
    };

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
      label: 'Grid Bind Group Layout',
    });

    // Create uniform buffers and bind groups for each line offset
    for (let i = 0; i < this.lineOffsets.length; i++) {
      const buffer = device.createBuffer({
        size: 48, // screenSize, time, zoom, cameraPos, pixelOffset, gridColor, pad
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: `Grid Uniform ${i}`,
      });
      this.uniformBuffers.push(buffer);

      const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{ binding: 0, resource: { buffer } }],
        label: `Grid Bind Group ${i}`,
      });
      this.bindGroups.push(bindGroup);
    }

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [vertexBufferLayout],
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
      primitive: { topology: 'line-list' },
      label: 'Grid Pipeline',
    });

    this.vertexBuffer = device.createBuffer({
      size: VERTEX_COUNT * 16,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'Grid Vertex Buffer',
    });

    this.createIndices();
  }

  private createIndices(): void {
    // Create indices sorted by diagonal for draw-in animation
    // Bottom-left to top-right: sort by (GRID_ROWS - 1 - row) + col
    type LineSegment = { i1: number; i2: number; diagonal: number };
    const segments: LineSegment[] = [];

    // Horizontal lines
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS - 1; col++) {
        const i = row * GRID_COLS + col;
        const diagonal = (GRID_ROWS - 1 - row) + col;
        segments.push({ i1: i, i2: i + 1, diagonal });
      }
    }

    // Vertical lines
    for (let col = 0; col < GRID_COLS; col++) {
      for (let row = 0; row < GRID_ROWS - 1; row++) {
        const i = row * GRID_COLS + col;
        const diagonal = (GRID_ROWS - 1 - row) + col;
        segments.push({ i1: i, i2: i + GRID_COLS, diagonal });
      }
    }

    // Sort by diagonal (bottom-left first)
    segments.sort((a, b) => a.diagonal - b.diagonal);

    // Flatten to index array
    const indices: number[] = [];
    for (const seg of segments) {
      indices.push(seg.i1, seg.i2);
    }

    this.indexCount = indices.length;

    this.indexBuffer = this.device.createBuffer({
      size: indices.length * 4,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
      label: 'Grid Index Buffer',
    });

    this.device.queue.writeBuffer(this.indexBuffer, 0, new Uint32Array(indices));
  }

  updateVertices(grid: GridState): void {
    const vertexData = new Float32Array(VERTEX_COUNT * 4);

    for (let i = 0; i < VERTEX_COUNT; i++) {
      const offset = i * 4;
      vertexData[offset] = grid.x[i];
      vertexData[offset + 1] = grid.y[i];
      vertexData[offset + 2] = grid.restX[i];
      vertexData[offset + 3] = grid.restY[i];
    }

    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertexData);
  }

  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    worldWidth: number,
    worldHeight: number,
    time: number,
    zoom: number,
    cameraX: number,
    cameraY: number,
    gridColor: [number, number, number] = [0.2, 0.45, 1.2],
    clearTarget: boolean = true,
    drawProgress: number = 1.0  // 0-1, for draw-in animation
  ): void {
    // Calculate how many indices to draw based on progress
    // Indices must be even (each line segment = 2 indices)
    const indicesToDraw = Math.floor((this.indexCount * drawProgress) / 2) * 2;

    // If nothing to draw, still clear if requested
    if (indicesToDraw <= 0) {
      if (clearTarget) {
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: target,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          }],
        });
        pass.end();
      }
      return;
    }

    // Update uniforms for each line offset
    for (let i = 0; i < this.lineOffsets.length; i++) {
      const offset = this.lineOffsets[i];
      this.device.queue.writeBuffer(
        this.uniformBuffers[i],
        0,
        new Float32Array([
          worldWidth, worldHeight, time, zoom,
          cameraX, cameraY,
          offset[0], offset[1],
          gridColor[0], gridColor[1], gridColor[2], 0 // color + pad
        ])
      );
    }

    // Render multiple passes for line thickness
    for (let i = 0; i < this.lineOffsets.length; i++) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: target,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: (clearTarget && i === 0) ? 'clear' : 'load',
          storeOp: 'store',
        }],
      });

      pass.setPipeline(this.pipeline);
      pass.setBindGroup(0, this.bindGroups[i]);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, 'uint32');
      pass.drawIndexed(indicesToDraw);
      pass.end();
    }
  }
}
