// Game menu system - title screen, options, controls
import { getCharDef } from './vectorFont';
import { GRID_COLORS } from './constants';
import { isKeyPressed, isButtonPressed, GAMEPAD_BUTTONS, mouse } from '../engine/core/input';

// Menu states
export enum MenuState {
  MAIN_MENU,
  CONTROLS,
  STARTING_GAME,
  PLAYING,
}

// Menu items
enum MenuItem {
  NEW_GAME,
  FULLSCREEN,
  CONTROLS,
  WEBSITE,
}

const MENU_ITEMS = ['NEW GAME', 'FULL SCREEN  F', 'CONTROLS', 'JAMESDRANDALL.COM'];

// Layout constants
const LINE_THICKNESS = 4.0;
const CHAR_WIDTH = 28;
const CHAR_HEIGHT = 42;
const CHAR_SPACING = 4;

// Max vertices
const MAX_VERTICES = 16384;
const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, edge

// Colors - values > 0.5 will bloom with menu bloom threshold
const COLOR_RED: readonly number[] = [1.2, 0.2, 0.2];
const COLOR_ORANGE: readonly number[] = [1.5, 0.8, 0.15];
const COLOR_CYAN: readonly number[] = [0.3, 1.2, 1.2];

export class GameMenu {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  private vertexBuffer: GPUBuffer;
  private uniformBuffer: GPUBuffer;
  private bindGroup: GPUBindGroup;
  private vertexData: Float32Array;
  private vertexCount = 0;

  // Menu state
  private state: MenuState = MenuState.MAIN_MENU;
  private selectedItem: MenuItem = MenuItem.NEW_GAME;

  // Animation
  private titleColorTime = 0;
  private gridDrawProgress = 0; // 0 to 1
  private startGameDelay = 0;
  private lastScreenWidth = 0;
  private lastScreenHeight = 0;

  // Cursor visibility (hide when using keyboard/gamepad)
  private cursorVisible = false;
  private lastMouseX = 0;
  private lastMouseY = 0;

  // Callbacks
  private onStartGame: (() => void) | null = null;
  private onToggleFullscreen: (() => void) | null = null;
  private onStartAnimation: ((screenWidth: number, screenHeight: number) => void) | null = null;
  private onNavigate: ((screenX: number, screenY: number) => void) | null = null;

  constructor(device: GPUDevice, shaderModule: GPUShaderModule) {
    this.device = device;
    this.vertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);

    // Hide cursor initially (shown when mouse moves)
    document.body.style.cursor = 'none';

    this.uniformBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: 'Menu Uniforms',
    });

    this.vertexBuffer = device.createBuffer({
      size: MAX_VERTICES * FLOATS_PER_VERTEX * 4,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      label: 'Menu Vertex Buffer',
    });

    const bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
      label: 'Menu Bind Group Layout',
    });

    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
      label: 'Menu Bind Group',
    });

    this.pipeline = device.createRenderPipeline({
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
          format: 'rgba16float',
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
      label: 'Menu Pipeline',
    });
  }

  setCallbacks(
    onStartGame: () => void,
    onToggleFullscreen: () => void,
    onStartAnimation?: (screenWidth: number, screenHeight: number) => void,
    onNavigate?: (screenX: number, screenY: number) => void
  ): void {
    this.onStartGame = onStartGame;
    this.onToggleFullscreen = onToggleFullscreen;
    this.onStartAnimation = onStartAnimation ?? null;
    this.onNavigate = onNavigate ?? null;
  }

  getState(): MenuState {
    return this.state;
  }

  isCursorVisible(): boolean {
    return this.cursorVisible;
  }

  private addLineSegment(
    x1: number, y1: number,
    x2: number, y2: number,
    color: readonly number[],
    thickness: number = LINE_THICKNESS
  ): void {
    if (this.vertexCount + 6 > MAX_VERTICES) return;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return;

    const nx = (-dy / len) * thickness * 0.5;
    const ny = (dx / len) * thickness * 0.5;

    const [r, g, b] = color;
    let i = this.vertexCount * FLOATS_PER_VERTEX;

    // Triangle 1
    this.vertexData[i++] = x1 - nx; this.vertexData[i++] = y1 - ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 0;

    this.vertexData[i++] = x1 + nx; this.vertexData[i++] = y1 + ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 1;

    this.vertexData[i++] = x2 + nx; this.vertexData[i++] = y2 + ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 1;

    // Triangle 2
    this.vertexData[i++] = x1 - nx; this.vertexData[i++] = y1 - ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 0;

    this.vertexData[i++] = x2 + nx; this.vertexData[i++] = y2 + ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 1;

    this.vertexData[i++] = x2 - nx; this.vertexData[i++] = y2 - ny;
    this.vertexData[i++] = r; this.vertexData[i++] = g; this.vertexData[i++] = b;
    this.vertexData[i++] = 0;

    this.vertexCount += 6;
  }

  private drawChar(
    char: string,
    x: number,
    y: number,
    color: readonly number[],
    scale: number = 1,
    thickness: number = LINE_THICKNESS
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
        thickness * scale
      );
    }

    return w + CHAR_SPACING * scale;
  }

  private drawText(
    text: string,
    x: number,
    y: number,
    color: readonly number[],
    scale: number = 1,
    align: 'left' | 'center' | 'right' = 'left',
    thickness: number = LINE_THICKNESS
  ): { width: number; height: number; x: number; y: number } {
    const charW = CHAR_WIDTH * scale + CHAR_SPACING * scale;
    const totalWidth = text.length * charW - CHAR_SPACING * scale;
    const totalHeight = CHAR_HEIGHT * scale;

    let startX = x;
    if (align === 'center') startX = x - totalWidth / 2;
    else if (align === 'right') startX = x - totalWidth;

    for (let i = 0; i < text.length; i++) {
      this.drawChar(text[i], startX + i * charW, y, color, scale, thickness);
    }

    return { width: totalWidth, height: totalHeight, x: startX, y };
  }

  private getTitleColor(time: number): readonly number[] {
    // Pulse through grid colors with HDR boost for bloom
    const cycleTime = 2.0; // seconds per color
    const t = (time % (cycleTime * 3)) / cycleTime;
    const colorIndex = Math.floor(t) % 3;
    const nextIndex = (colorIndex + 1) % 3;
    const blend = t - Math.floor(t);

    const c1 = GRID_COLORS[colorIndex];
    const c2 = GRID_COLORS[nextIndex];

    // Pulse with HDR boost (values > 0.5 will bloom)
    const pulse = 1.2 + Math.sin(time * 3) * 0.3;
    return [
      (c1[0] * (1 - blend) + c2[0] * blend) * pulse * 1.5,
      (c1[1] * (1 - blend) + c2[1] * blend) * pulse * 1.5,
      (c1[2] * (1 - blend) + c2[2] * blend) * pulse * 1.5,
    ];
  }

  update(dt: number, screenWidth: number, screenHeight: number): void {
    this.titleColorTime += dt;
    this.lastScreenWidth = screenWidth;
    this.lastScreenHeight = screenHeight;

    if (this.state === MenuState.STARTING_GAME) {
      // Animate grid draw-in
      if (this.gridDrawProgress < 1) {
        this.gridDrawProgress += dt * 1.0; // 1 second to complete
        if (this.gridDrawProgress >= 1) {
          this.gridDrawProgress = 1;
          this.startGameDelay = 0.3; // Brief pause before game starts
        }
      } else if (this.startGameDelay > 0) {
        this.startGameDelay -= dt;
        if (this.startGameDelay <= 0) {
          this.state = MenuState.PLAYING;
          this.onStartGame?.();
        }
      }
      return;
    }

    // Handle input
    this.handleInput(screenWidth, screenHeight);
  }

  private handleInput(screenWidth: number, screenHeight: number): void {
    const menuCount = this.state === MenuState.MAIN_MENU ? MENU_ITEMS.length : 1;
    const prevSelected = this.selectedItem;

    // Check for mouse movement - show cursor
    if (mouse.x !== this.lastMouseX || mouse.y !== this.lastMouseY) {
      this.lastMouseX = mouse.x;
      this.lastMouseY = mouse.y;
      if (!this.cursorVisible) {
        this.cursorVisible = true;
        document.body.style.cursor = 'default';
      }
    }

    // Keyboard/Gamepad navigation - hide cursor
    const keyboardUsed = isKeyPressed('ArrowUp') || isKeyPressed('KeyW') ||
                         isKeyPressed('ArrowDown') || isKeyPressed('KeyS');
    const gamepadUsed = isButtonPressed(GAMEPAD_BUTTONS.DPAD_UP) ||
                        isButtonPressed(GAMEPAD_BUTTONS.DPAD_DOWN);

    if (keyboardUsed || gamepadUsed) {
      if (this.cursorVisible) {
        this.cursorVisible = false;
        document.body.style.cursor = 'none';
      }
    }

    if (isKeyPressed('ArrowUp') || isKeyPressed('KeyW') || isButtonPressed(GAMEPAD_BUTTONS.DPAD_UP)) {
      if (this.state === MenuState.MAIN_MENU) {
        this.selectedItem = ((this.selectedItem - 1) + menuCount) % menuCount;
      }
    }
    if (isKeyPressed('ArrowDown') || isKeyPressed('KeyS') || isButtonPressed(GAMEPAD_BUTTONS.DPAD_DOWN)) {
      if (this.state === MenuState.MAIN_MENU) {
        this.selectedItem = (this.selectedItem + 1) % menuCount;
      }
    }

    // Trigger ripple on navigation
    if (this.state === MenuState.MAIN_MENU && this.selectedItem !== prevSelected) {
      const menuScale = 1.5;
      const textHeight = CHAR_HEIGHT * menuScale;
      const itemHeight = textHeight + textHeight / 2;
      const menuY = screenHeight / 2 - (MENU_ITEMS.length * itemHeight) / 2;
      const itemY = menuY + this.selectedItem * itemHeight + textHeight / 2;
      this.onNavigate?.(screenWidth / 2, itemY);
    }

    // Selection
    if (isKeyPressed('Enter') || isKeyPressed('Space') || isButtonPressed(GAMEPAD_BUTTONS.CROSS)) {
      this.selectCurrentItem();
    }

    // Back from controls
    if (this.state === MenuState.CONTROLS) {
      if (isKeyPressed('Escape') || isKeyPressed('Backspace') || isButtonPressed(GAMEPAD_BUTTONS.CIRCLE)) {
        this.state = MenuState.MAIN_MENU;
      }
    }

    // Fullscreen shortcut
    if (isKeyPressed('KeyF')) {
      this.onToggleFullscreen?.();
    }

    // Mouse hover detection for main menu
    // Scale mouse coords to match canvas (handles CSS scaling and fullscreen)
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    // Use actual canvas dimensions for hit detection
    const canvasW = canvas?.width ?? screenWidth;
    const canvasH = canvas?.height ?? screenHeight;
    const scaleX = canvasRect ? canvasW / canvasRect.width : 1;
    const scaleY = canvasRect ? canvasH / canvasRect.height : 1;
    const scaledMouseX = mouse.x * scaleX;
    const scaledMouseY = mouse.y * scaleY;

    // Use actual canvas dimensions for menu positioning
    const hitScreenWidth = canvasW;
    const hitScreenHeight = canvasH;

    if (this.state === MenuState.MAIN_MENU) {
      const menuScale = 1.5;
      const textHeight = CHAR_HEIGHT * menuScale;
      const itemHeight = textHeight + textHeight / 2;
      const websiteGap = textHeight; // Extra gap before website link
      const totalMenuHeight = (MENU_ITEMS.length - 1) * itemHeight + websiteGap + textHeight;
      const menuY = hitScreenHeight / 2 - totalMenuHeight / 2;

      for (let i = 0; i < MENU_ITEMS.length; i++) {
        // Add extra gap before the last item (website)
        const extraGap = (i === MENU_ITEMS.length - 1) ? websiteGap - itemHeight + textHeight : 0;
        const itemY = menuY + i * itemHeight + extraGap;
        const text = MENU_ITEMS[i];
        const charW = (CHAR_WIDTH + CHAR_SPACING) * menuScale;
        const textWidth = text.length * charW;
        const textX = hitScreenWidth / 2 - textWidth / 2;

        if (scaledMouseX >= textX && scaledMouseX <= textX + textWidth &&
            scaledMouseY >= itemY && scaledMouseY <= itemY + textHeight) {
          // Update selection to match hover so there's always a current selection
          this.selectedItem = i;
          if (mouse.leftPressed) {
            this.selectCurrentItem();
          }
        }
      }
    }

    // Mouse click for back button in controls
    if (this.state === MenuState.CONTROLS && mouse.leftPressed) {
      const backScale = 1.5;
      const backY = hitScreenHeight - 100;
      const backText = 'BACK';
      const charW = (CHAR_WIDTH + CHAR_SPACING) * backScale;
      const textWidth = backText.length * charW;
      const textX = hitScreenWidth / 2 - textWidth / 2;
      const textHeight = CHAR_HEIGHT * backScale;

      if (scaledMouseX >= textX && scaledMouseX <= textX + textWidth &&
          scaledMouseY >= backY && scaledMouseY <= backY + textHeight) {
        this.state = MenuState.MAIN_MENU;
      }
    }

  }

  private selectCurrentItem(): void {
    if (this.state === MenuState.CONTROLS) {
      this.state = MenuState.MAIN_MENU;
      return;
    }

    switch (this.selectedItem) {
      case MenuItem.NEW_GAME:
        // Trigger explosion callback, then immediately start game
        this.onStartAnimation?.(this.lastScreenWidth, this.lastScreenHeight);
        this.state = MenuState.PLAYING;
        this.onStartGame?.();
        break;
      case MenuItem.FULLSCREEN:
        this.onToggleFullscreen?.();
        break;
      case MenuItem.CONTROLS:
        this.state = MenuState.CONTROLS;
        break;
      case MenuItem.WEBSITE:
        window.open('https://www.jamesdrandall.com', '_blank');
        break;
    }
  }

  private renderMainMenu(screenWidth: number, screenHeight: number): void {
    // Menu items - bigger text with spacing = half the text height
    const menuScale = 1.5;
    const textHeight = CHAR_HEIGHT * menuScale;
    const itemHeight = textHeight + textHeight / 2; // text height + half for spacing
    const websiteGap = textHeight; // Extra gap before website link
    const totalMenuHeight = (MENU_ITEMS.length - 1) * itemHeight + websiteGap + textHeight;
    const menuY = screenHeight / 2 - totalMenuHeight / 2;

    // Title - positioned above menu items
    const titleColor = this.getTitleColor(this.titleColorTime);
    const titleY = menuY - 280; // 200px above first menu item
    this.drawText('VECTRIX', screenWidth / 2, titleY, titleColor, 3.5, 'center', 8);

    for (let i = 0; i < MENU_ITEMS.length; i++) {
      // selectedItem always tracks the current selection (keyboard or hover)
      const isSelected = this.selectedItem === i;
      const color = isSelected ? COLOR_ORANGE : COLOR_RED;
      // Add extra gap before the last item (website)
      const extraGap = (i === MENU_ITEMS.length - 1) ? websiteGap - itemHeight + textHeight : 0;
      this.drawText(MENU_ITEMS[i], screenWidth / 2, menuY + i * itemHeight + extraGap, color, menuScale, 'center');
    }

  }

  private renderControls(screenWidth: number, screenHeight: number): void {
    // Title - same as main menu
    const titleColor = this.getTitleColor(this.titleColorTime);
    this.drawText('VECTRIX', screenWidth / 2, 100, titleColor, 3.5, 'center', 8);

    // Control list - simple two columns: keys on left, action on right
    const controls = [
      ['WASD / ARROWS / LEFT STICK', 'MOVE'],
      ['MOUSE / RIGHT STICK', 'AIM'],
      ['CLICK / RIGHT STICK', 'SHOOT'],
      ['SPACE / RIGHT CLICK / R1', 'SMART BOMB'],
      ['F', 'FULLSCREEN'],
      ['M', 'MUTE'],
      ['[ ]', 'CHANGE TRACK'],
    ];

    const scale = 0.8;
    const textHeight = CHAR_HEIGHT * scale;
    const lineHeight = textHeight * 1.5;
    const totalHeight = controls.length * lineHeight;
    const startY = screenHeight / 2 - totalHeight / 2; // Center vertically
    const gap = 40; // gap between columns

    for (let i = 0; i < controls.length; i++) {
      const [keys, action] = controls[i];
      const y = startY + i * lineHeight;
      // Keys on left (right-aligned to center), action on right (left-aligned from center)
      this.drawText(keys, screenWidth / 2 - gap, y, COLOR_CYAN, scale, 'right');
      this.drawText(action, screenWidth / 2 + gap, y, COLOR_ORANGE, scale, 'left');
    }

    // Back button - same style as main menu items
    const backScale = 1.5;
    const backHovered = this.isBackButtonHovered(screenWidth, screenHeight);
    const backColor = backHovered ? COLOR_ORANGE : COLOR_RED;
    this.drawText('BACK', screenWidth / 2, screenHeight - 100, backColor, backScale, 'center');
  }

  private isBackButtonHovered(screenWidth: number, screenHeight: number): boolean {
    // Match the back button rendering: scale 1.5, y = screenHeight - 100
    const backScale = 1.5;
    const backY = screenHeight - 100;
    const backText = 'BACK';
    const charW = (CHAR_WIDTH + CHAR_SPACING) * backScale;
    const textWidth = backText.length * charW;
    const textX = screenWidth / 2 - textWidth / 2;
    const textHeight = CHAR_HEIGHT * backScale;

    // Scale mouse coords for canvas
    const canvas = document.querySelector('canvas');
    const canvasRect = canvas?.getBoundingClientRect();
    const canvasW = canvas?.width ?? screenWidth;
    const canvasH = canvas?.height ?? screenHeight;
    const scaleX = canvasRect ? canvasW / canvasRect.width : 1;
    const scaleY = canvasRect ? canvasH / canvasRect.height : 1;
    const scaledMouseX = mouse.x * scaleX;
    const scaledMouseY = mouse.y * scaleY;

    return scaledMouseX >= textX && scaledMouseX <= textX + textWidth &&
           scaledMouseY >= backY && scaledMouseY <= backY + textHeight;
  }

  render(
    encoder: GPUCommandEncoder,
    target: GPUTextureView,
    screenWidth: number,
    screenHeight: number
  ): void {
    if (this.state === MenuState.PLAYING) return;

    this.vertexCount = 0;

    if (this.state === MenuState.MAIN_MENU) {
      this.renderMainMenu(screenWidth, screenHeight);
    } else if (this.state === MenuState.CONTROLS) {
      this.renderControls(screenWidth, screenHeight);
    } else if (this.state === MenuState.STARTING_GAME) {
      // Just show title during grid animation
      const titleColor = this.getTitleColor(this.titleColorTime);
      this.drawText('VECTRIX', screenWidth / 2, 100, titleColor, 3.5, 'center', 8);
    }

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
        loadOp: 'load',  // Preserve existing content (grid)
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    pass.setVertexBuffer(0, this.vertexBuffer);
    pass.draw(this.vertexCount);
    pass.end();
  }
}
