// Vector HUD - self-contained renderer for crisp text above CRT effect
// Does NOT use the entity system - manages its own vertex buffer

import { getCharDef, COLORS } from './vectorFont';
import { GameState } from './gameState';
import hudLineShader from '../engine/rendering/shaders/hudLine.wgsl';

// Layout constants
const LINE_THICKNESS = 4.0;
const CHAR_WIDTH = 28;
const CHAR_HEIGHT = 42;
const CHAR_SPACING = 4;
const LINE_HEIGHT = 44;

// Max vertices (each line segment = 2 triangles = 6 vertices)
const MAX_VERTICES = 8192;
const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, edge

export class VectorHUD {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private swapChainPipeline: GPURenderPipeline; // For direct-to-screen rendering
  private vertexBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexData: Float32Array;
  private vertexCount = 0;

  constructor(device: GPUDevice) {
    this.device = device;
    this.vertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);

    const shaderModule = device.createShaderModule({
      code: hudLineShader,
      label: 'HUD Line Shader',
    });

    this.uniformBuffer = device.createBuffer({
      size: 16, // vec2 screenSize + vec2 pad
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'HUD Uniforms',
    });

    this.vertexBuffer = device.createBuffer({
      size: MAX_VERTICES * FLOATS_PER_VERTEX * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'HUD Vertex Buffer',
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
      label: 'HUD Bind Group Layout',
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      label: 'HUD Bind Group',
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: FLOATS_PER_VERTEX * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
            { shaderLocation: 1, offset: 8, format: 'float32x3' },  // color
            { shaderLocation: 2, offset: 20, format: 'float32' },   // edge
          ],
        }],
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
      primitive: { topology: 'triangle-list' },
      label: 'HUD Pipeline',
    });

    // Second pipeline for rendering directly to swap chain (bgra8unorm)
    this.swapChainPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [{
          arrayStride: FLOATS_PER_VERTEX * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x2' },
            { shaderLocation: 1, offset: 8, format: 'float32x3' },
            { shaderLocation: 2, offset: 20, format: 'float32' },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: navigator.gpu.getPreferredCanvasFormat(),
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
      label: 'HUD SwapChain Pipeline',
    });
  }

  addLineSegment(
    x1: number, y1: number,
    x2: number, y2: number,
    color: readonly number[],
    thickness: number = LINE_THICKNESS
  ): void {
    if (this.vertexCount + 6 > MAX_VERTICES) return;

    // Calculate perpendicular for line thickness
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;

    const nx = (-dy / len) * thickness * 0.5;
    const ny = (dx / len) * thickness * 0.5;

    const [r, g, b] = color;
    let i = this.vertexCount * FLOATS_PER_VERTEX;

    // Triangle 1: (x1-n, edge=0), (x1+n, edge=1), (x2+n, edge=1)
    this.vertexData[i++] = x1 - nx;
    this.vertexData[i++] = y1 - ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 0; // edge

    this.vertexData[i++] = x1 + nx;
    this.vertexData[i++] = y1 + ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 1; // edge

    this.vertexData[i++] = x2 + nx;
    this.vertexData[i++] = y2 + ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 1; // edge

    // Triangle 2: (x1-n, edge=0), (x2+n, edge=1), (x2-n, edge=0)
    this.vertexData[i++] = x1 - nx;
    this.vertexData[i++] = y1 - ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 0; // edge

    this.vertexData[i++] = x2 + nx;
    this.vertexData[i++] = y2 + ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 1; // edge

    this.vertexData[i++] = x2 - nx;
    this.vertexData[i++] = y2 - ny;
    this.vertexData[i++] = r;
    this.vertexData[i++] = g;
    this.vertexData[i++] = b;
    this.vertexData[i++] = 0; // edge

    this.vertexCount += 6;
  }

  drawReticle(
    screenX: number,
    screenY: number,
    size: number = 32,
    color: readonly number[] = [2.0, 2.0, 2.0]
  ): void {
    const halfSize = size / 2;
    const gap = 6;
    const thickness = 3;

    // Four lines forming crosshair with gap in center
    // Top
    this.addLineSegment(screenX, screenY - halfSize, screenX, screenY - gap, color, thickness);
    // Bottom
    this.addLineSegment(screenX, screenY + gap, screenX, screenY + halfSize, color, thickness);
    // Left
    this.addLineSegment(screenX - halfSize, screenY, screenX - gap, screenY, color, thickness);
    // Right
    this.addLineSegment(screenX + gap, screenY, screenX + halfSize, screenY, color, thickness);
  }

  private drawChar(
    char: string,
    x: number,
    y: number,
    color: readonly number[],
    scale: number = 1
  ): number {
    const segments = getCharDef(char);
    const w = CHAR_WIDTH * scale;
    const h = CHAR_HEIGHT * scale;

    for (const [x1, y1, x2, y2] of segments) {
      this.addLineSegment(
        x + x1 * w,
        y + y1 * h,
        x + x2 * w,
        y + y2 * h,
        color,
        LINE_THICKNESS * scale
      );
    }

    return w + CHAR_SPACING * scale;
  }

  drawText(
    text: string,
    x: number,
    y: number,
    color: readonly number[],
    scale: number = 1,
    align: 'left' | 'center' | 'right' = 'left'
  ): void {
    const charW = CHAR_WIDTH * scale + CHAR_SPACING * scale;
    const totalWidth = text.length * charW - CHAR_SPACING * scale;

    let startX = x;
    if (align === 'center') startX = x - totalWidth / 2;
    else if (align === 'right') startX = x - totalWidth;

    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i], startX + i * charW, y, color, scale);
    }
  }

  beginFrame(): void {
    this.vertexCount = 0;
  }

  update(state: GameState, screenWidth: number, screenHeight: number, _time: number): void {
    this.vertexCount = 0;

    if (state.isGameOver) {
      this.renderGameOver(state, screenWidth, screenHeight);
      return;
    }

    const margin = 24;

    // Score (top left)
    this.drawText(
      state.score.toLocaleString(),
      margin,
      margin,
      COLORS.CYAN,
      1.2
    );

    // Multiplier (below score)
    if (state.multiplier > 1) {
      this.drawText(
        `x${state.multiplier.toFixed(1)}`,
        margin,
        margin + LINE_HEIGHT * 1.2,
        COLORS.YELLOW,
        0.8
      );
    }

    // Wave number (top right)
    if (state.waveNumber > 0) {
      this.drawText(
        `WAVE ${state.waveNumber}`,
        screenWidth - margin,
        margin,
        COLORS.WHITE,
        0.9,
        'right'
      );
    }

    // Lives (bottom left) - diamonds (50% larger)
    for (let i = 0; i < state.lives; i++) {
      const lx = margin + i * 42;
      const ly = screenHeight - margin - 25;
      // Diamond shape
      this.addLineSegment(lx, ly - 15, lx + 15, ly, COLORS.CYAN);
      this.addLineSegment(lx + 15, ly, lx, ly + 15, COLORS.CYAN);
      this.addLineSegment(lx, ly + 15, lx - 15, ly, COLORS.CYAN);
      this.addLineSegment(lx - 15, ly, lx, ly - 15, COLORS.CYAN);
    }

    // Bombs (above lives) - starburst shape (50% larger)
    const BOMB_COLOR: readonly number[] = [2.5, 0.5, 0.3]; // Red/orange
    for (let i = 0; i < 5; i++) {
      const bx = margin + i * 33;
      const by = screenHeight - margin - 70;
      const color = i < state.bombs ? BOMB_COLOR : COLORS.GRAY;
      const outerR = 14;
      const innerR = 6;
      // 8-pointed starburst
      for (let j = 0; j < 8; j++) {
        const a1 = (j / 8) * Math.PI * 2;
        const a2 = ((j + 0.5) / 8) * Math.PI * 2;
        const a3 = ((j + 1) / 8) * Math.PI * 2;
        // Outer point to inner
        this.addLineSegment(
          bx + Math.cos(a1) * outerR,
          by + Math.sin(a1) * outerR,
          bx + Math.cos(a2) * innerR,
          by + Math.sin(a2) * innerR,
          color
        );
        // Inner to next outer point
        this.addLineSegment(
          bx + Math.cos(a2) * innerR,
          by + Math.sin(a2) * innerR,
          bx + Math.cos(a3) * outerR,
          by + Math.sin(a3) * outerR,
          color
        );
      }
    }

    // Respawn message
    if (!state.isAlive && !state.isGameOver) {
      this.drawText(
        'RESPAWNING...',
        screenWidth / 2,
        screenHeight / 2,
        COLORS.WHITE,
        1.0,
        'center'
      );
    }
  }

  private renderGameOver(state: GameState, screenWidth: number, screenHeight: number): void {
    const cx = screenWidth / 2;
    const cy = screenHeight / 2;

    // GAME OVER - big magenta title
    this.drawText('GAME OVER', cx, cy - 160, COLORS.MAGENTA, 2.0, 'center');

    // Score
    this.drawText(`SCORE  ${state.score.toLocaleString()}`, cx, cy - 40, COLORS.WHITE, 1.0, 'center');

    // High score
    if (state.score >= state.highScore && state.score > 0) {
      this.drawText('NEW HIGH SCORE', cx, cy + 40, COLORS.YELLOW, 1.0, 'center');
    } else {
      this.drawText(`HIGH  ${state.highScore.toLocaleString()}`, cx, cy + 40, COLORS.CYAN, 1.0, 'center');
    }

    // Wave reached
    this.drawText(`WAVE  ${state.waveNumber}`, cx, cy + 120, COLORS.WHITE, 1.0, 'center');

    // Restart prompt
    this.drawText('PRESS ANY BUTTON TO RESTART', cx, cy + 200, COLORS.CYAN, 0.8, 'center');
  }

  /**
   * Draw a world-space circle (for smart bomb effect)
   */
  drawWorldCircle(
    worldX: number,
    worldY: number,
    radius: number,
    color: readonly number[],
    cameraX: number,
    cameraY: number,
    cameraZoom: number,
    screenWidth: number,
    screenHeight: number,
    segments: number = 64,
    thickness: number = 6
  ): void {
    // Transform world to screen coordinates
    const screenX = (worldX - cameraX) * cameraZoom + screenWidth / 2;
    const screenY = (worldY - cameraY) * cameraZoom + screenHeight / 2;
    const screenRadius = radius * cameraZoom;

    // Draw circle as line segments
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * Math.PI * 2;
      const a2 = ((i + 1) / segments) * Math.PI * 2;
      this.addLineSegment(
        screenX + Math.cos(a1) * screenRadius,
        screenY + Math.sin(a1) * screenRadius,
        screenX + Math.cos(a2) * screenRadius,
        screenY + Math.sin(a2) * screenRadius,
        color,
        thickness
      );
    }
  }

  /**
   * Draw a world-space line segment
   */
  drawWorldLine(
    worldX1: number,
    worldY1: number,
    worldX2: number,
    worldY2: number,
    color: readonly number[],
    cameraX: number,
    cameraY: number,
    cameraZoom: number,
    screenWidth: number,
    screenHeight: number,
    thickness: number = 3
  ): void {
    // Transform world to screen coordinates
    const screenX1 = (worldX1 - cameraX) * cameraZoom + screenWidth / 2;
    const screenY1 = (worldY1 - cameraY) * cameraZoom + screenHeight / 2;
    const screenX2 = (worldX2 - cameraX) * cameraZoom + screenWidth / 2;
    const screenY2 = (worldY2 - cameraY) * cameraZoom + screenHeight / 2;

    this.addLineSegment(screenX1, screenY1, screenX2, screenY2, color, thickness);
  }

  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (this.vertexCount === 0) return;

    // Update uniforms
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([screenWidth, screenHeight, 0, 0])
    );

    // Upload vertex data
    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      this.vertexData.subarray(0, this.vertexCount * FLOATS_PER_VERTEX)
    );

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
    pass.end();
  }

  /**
   * Render directly to swap chain (for loading screen before HDR pipeline is ready)
   */
  renderToSwapChain(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (this.vertexCount === 0) return;

    // Update uniforms
    this.device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array([screenWidth, screenHeight, 0, 0])
    );

    // Upload vertex data
    this.device.queue.writeBuffer(
      this.vertexBuffer,
      0,
      this.vertexData.subarray(0, this.vertexCount * FLOATS_PER_VERTEX)
    );

    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: target,
        loadOp: 'load',  // Don't clear - loading screen already cleared
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.swapChainPipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
    pass.end();
  }
}
