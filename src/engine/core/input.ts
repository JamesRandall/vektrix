// Key states
const keysDown = new Set<string>();
const keysPressed = new Set<string>();
const keysReleased = new Set<string>();

// Mouse state
export const mouse = {
  x: 0,
  y: 0,
  worldX: 0,
  worldY: 0,
  down: false,
  pressed: false,
  released: false,
  // Left mouse button (for shooting)
  leftDown: false,
  leftPressed: false,
  leftReleased: false,
  // Right mouse button (for smart bomb)
  rightDown: false,
  rightPressed: false,
  rightReleased: false,
};

// Pointer lock state
export const pointerLock = {
  active: false,
  deltaX: 0,
  deltaY: 0,
};

// Reticle offset from player (used when pointer locked)
// This is the offset in screen pixels from the player position
export const reticleOffset = {
  x: 0,
  y: 0,
};

// Virtual cursor position (used when pointer locked, for backwards compat)
let virtualCursorX = 0;
let virtualCursorY = 0;

// Gamepad state
export const gamepad = {
  connected: false,
  // Left stick (movement)
  leftStickX: 0,
  leftStickY: 0,
  // Right stick (aim)
  rightStickX: 0,
  rightStickY: 0,
  // Triggers
  leftTrigger: 0,
  rightTrigger: 0,
  // Buttons (pressed this frame)
  buttons: new Map<number, boolean>(),
  buttonsPressed: new Set<number>(),
};

// PS5 DualSense button mapping
export const GAMEPAD_BUTTONS = {
  CROSS: 0,      // X / A
  CIRCLE: 1,     // O / B
  SQUARE: 2,     // Square / X
  TRIANGLE: 3,   // Triangle / Y
  L1: 4,
  R1: 5,
  L2: 6,
  R2: 7,
  SHARE: 8,
  OPTIONS: 9,
  L3: 10,        // Left stick click
  R3: 11,        // Right stick click
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
  PS: 16,
  TOUCHPAD: 17,
};

const STICK_DEADZONE = 0.15;

let canvas: HTMLCanvasElement | null = null;

export function initInput(targetCanvas: HTMLCanvasElement): void {
  canvas = targetCanvas;

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (!keysDown.has(e.code)) {
      keysPressed.add(e.code);
    }
    keysDown.add(e.code);
  });

  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.code);
    keysReleased.add(e.code);
  });

  // Mouse - handle both normal and pointer lock modes
  canvas.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === canvas) {
      // Pointer locked - use movement deltas
      pointerLock.deltaX = e.movementX;
      pointerLock.deltaY = e.movementY;

      // Update reticle offset (relative to player)
      // Clamp to reasonable range (max ~200px from player)
      const maxOffset = 200;
      reticleOffset.x = Math.max(-maxOffset, Math.min(maxOffset, reticleOffset.x + e.movementX));
      reticleOffset.y = Math.max(-maxOffset, Math.min(maxOffset, reticleOffset.y + e.movementY));

      // Also update virtual cursor for backwards compat
      const rect = canvas!.getBoundingClientRect();
      virtualCursorX = Math.max(0, Math.min(rect.width, virtualCursorX + e.movementX));
      virtualCursorY = Math.max(0, Math.min(rect.height, virtualCursorY + e.movementY));
      mouse.x = virtualCursorX;
      mouse.y = virtualCursorY;
    } else {
      // Normal mode - use absolute position
      mouse.x = e.offsetX;
      mouse.y = e.offsetY;
    }
    updateMouseWorld();
  });

  // Pointer lock state change listener
  document.addEventListener('pointerlockchange', () => {
    pointerLock.active = document.pointerLockElement === canvas;
    if (pointerLock.active && canvas) {
      // Initialize virtual cursor to center of CSS display size
      const rect = canvas.getBoundingClientRect();
      virtualCursorX = rect.width / 2;
      virtualCursorY = rect.height / 2;
      // Initialize reticle offset pointing right (default aim direction)
      reticleOffset.x = 100;
      reticleOffset.y = 0;
    }
  });

  document.addEventListener('pointerlockerror', () => {
    console.warn('Pointer lock request failed');
  });

  canvas.addEventListener('mousedown', (e) => {
    if (!mouse.down) {
      mouse.pressed = true;
    }
    mouse.down = true;

    // Track left mouse button specifically (for shooting)
    if (e.button === 0) {
      if (!mouse.leftDown) {
        mouse.leftPressed = true;
      }
      mouse.leftDown = true;
    }

    // Track right mouse button (for smart bomb)
    if (e.button === 2) {
      if (!mouse.rightDown) {
        mouse.rightPressed = true;
      }
      mouse.rightDown = true;
    }
  });

  // Prevent context menu on right-click
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });

  canvas.addEventListener('mouseup', (e) => {
    mouse.down = false;
    mouse.released = true;

    // Track left mouse button specifically
    if (e.button === 0) {
      mouse.leftDown = false;
      mouse.leftReleased = true;
    }

    // Track right mouse button
    if (e.button === 2) {
      mouse.rightDown = false;
      mouse.rightReleased = true;
    }
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.down = false;
    mouse.leftDown = false;
    mouse.rightDown = false;
  });

  // Gamepad connection events
  window.addEventListener('gamepadconnected', (e) => {
    console.log(`Gamepad connected: ${e.gamepad.id}`);
    gamepad.connected = true;
  });

  window.addEventListener('gamepaddisconnected', () => {
    console.log('Gamepad disconnected');
    gamepad.connected = false;
  });

  // Clear all input state when window loses focus (prevents stuck keys)
  window.addEventListener('blur', () => {
    keysDown.clear();
    keysPressed.clear();
    keysReleased.clear();
    mouse.down = false;
    mouse.pressed = false;
    mouse.released = false;
    mouse.leftDown = false;
    mouse.leftPressed = false;
    mouse.leftReleased = false;
    mouse.rightDown = false;
    mouse.rightPressed = false;
    mouse.rightReleased = false;
  });

  // Also handle visibility change (tab switching, minimizing)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      keysDown.clear();
      keysPressed.clear();
      keysReleased.clear();
      mouse.down = false;
      mouse.pressed = false;
      mouse.released = false;
      mouse.leftDown = false;
      mouse.leftPressed = false;
      mouse.leftReleased = false;
      mouse.rightDown = false;
      mouse.rightPressed = false;
      mouse.rightReleased = false;
    }
  });
}

function updateMouseWorld(): void {
  if (!canvas) return;

  // mouse.x/y are already canvas-relative (from offsetX/Y or virtual cursor)
  // Just need to account for CSS scaling (display size vs actual canvas size)
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mouse.worldX = mouse.x * scaleX;
  mouse.worldY = mouse.y * scaleY;
}

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  // Rescale so output starts at 0 after deadzone
  const sign = Math.sign(value);
  return sign * (Math.abs(value) - deadzone) / (1 - deadzone);
}

function pollGamepad(): void {
  const gamepads = navigator.getGamepads();
  const gp = gamepads[0]; // Use first connected gamepad

  if (!gp) {
    gamepad.connected = false;
    return;
  }

  gamepad.connected = true;

  // Left stick (axes 0, 1)
  gamepad.leftStickX = applyDeadzone(gp.axes[0] || 0, STICK_DEADZONE);
  gamepad.leftStickY = applyDeadzone(gp.axes[1] || 0, STICK_DEADZONE);

  // Right stick (axes 2, 3)
  gamepad.rightStickX = applyDeadzone(gp.axes[2] || 0, STICK_DEADZONE);
  gamepad.rightStickY = applyDeadzone(gp.axes[3] || 0, STICK_DEADZONE);

  // Triggers (L2=button 6, R2=button 7 as analog on PS5)
  gamepad.leftTrigger = gp.buttons[6]?.value || 0;
  gamepad.rightTrigger = gp.buttons[7]?.value || 0;

  // Track button presses
  gamepad.buttonsPressed.clear();
  for (let i = 0; i < gp.buttons.length; i++) {
    const wasPressed = gamepad.buttons.get(i) || false;
    const isPressed = gp.buttons[i]?.pressed || false;

    if (isPressed && !wasPressed) {
      gamepad.buttonsPressed.add(i);
    }

    gamepad.buttons.set(i, isPressed);
  }
}

/**
 * Call at start of frame to poll gamepad
 */
export function pollInput(): void {
  pollGamepad();
}

/**
 * Call at end of frame to clear per-frame states
 */
export function updateInput(): void {
  keysPressed.clear();
  keysReleased.clear();
  mouse.pressed = false;
  mouse.released = false;
  mouse.leftPressed = false;
  mouse.leftReleased = false;
  mouse.rightPressed = false;
  mouse.rightReleased = false;
}

export function isKeyDown(code: string): boolean {
  return keysDown.has(code);
}

export function isKeyPressed(code: string): boolean {
  return keysPressed.has(code);
}

export function isKeyReleased(code: string): boolean {
  return keysReleased.has(code);
}

export function isButtonDown(button: number): boolean {
  return gamepad.buttons.get(button) || false;
}

export function isButtonPressed(button: number): boolean {
  return gamepad.buttonsPressed.has(button);
}

/**
 * Get movement input as normalized vector (keyboard + left stick)
 */
export function getMovementInput(): { x: number; y: number } {
  let x = 0;
  let y = 0;

  // Keyboard
  if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) y -= 1;
  if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) y += 1;
  if (isKeyDown('KeyA') || isKeyDown('ArrowLeft')) x -= 1;
  if (isKeyDown('KeyD') || isKeyDown('ArrowRight')) x += 1;

  // Gamepad left stick (overrides keyboard if active)
  if (gamepad.connected && (gamepad.leftStickX !== 0 || gamepad.leftStickY !== 0)) {
    x = gamepad.leftStickX;
    y = gamepad.leftStickY;
  } else if (x !== 0 && y !== 0) {
    // Normalize diagonal keyboard movement
    const len = Math.sqrt(x * x + y * y);
    x /= len;
    y /= len;
  }

  return { x, y };
}

/**
 * Get aim direction from right stick (returns null if stick is idle)
 */
export function getAimInput(): { x: number; y: number } | null {
  if (!gamepad.connected) return null;

  const x = gamepad.rightStickX;
  const y = gamepad.rightStickY;

  if (x === 0 && y === 0) return null;

  return { x, y };
}

/**
 * Check if shooting input is active
 * - Keyboard/Mouse: Left mouse button
 * - Gamepad: Right stick deflection (auto-shoot when aiming)
 */
export function isShooting(): boolean {
  const STICK_THRESHOLD = 0.3;
  const rightStickActive = gamepad.connected &&
    (Math.abs(gamepad.rightStickX) > STICK_THRESHOLD || Math.abs(gamepad.rightStickY) > STICK_THRESHOLD);
  return mouse.leftDown || rightStickActive;
}

/**
 * Check if smart bomb input was pressed this frame
 * - Keyboard: Space bar
 * - Mouse: Right click
 * - Gamepad: R1/RB (button 5)
 */
export function isSmartBombPressed(): boolean {
  const gamepadBomb = gamepad.connected && gamepad.buttonsPressed.has(GAMEPAD_BUTTONS.R1);
  return keysPressed.has('Space') || mouse.rightPressed || gamepadBomb;
}

/**
 * Check if pause input was pressed this frame
 * - Keyboard: Q key
 * - Gamepad: L1/LB (button 4)
 */
export function isPausePressed(): boolean {
  const gamepadPause = gamepad.connected && gamepad.buttonsPressed.has(GAMEPAD_BUTTONS.L1);
  return keysPressed.has('KeyQ') || gamepadPause;
}

/**
 * Check if any input is currently held (keyboard, mouse, or gamepad)
 */
export function isAnyInputPressed(): boolean {
  return keysPressed.size > 0 ||
         mouse.leftPressed ||
         (gamepad.connected && gamepad.buttonsPressed.size > 0);
}

// Keys to exclude from restart detection (window management keys)
const EXCLUDED_KEYS = new Set([
  'AltLeft', 'AltRight', 'Alt',
  'Tab',
  'MetaLeft', 'MetaRight', 'Meta',
  'ControlLeft', 'ControlRight', 'Control',
  'Escape'
]);

// Track game over input state
let waitingForInput = false;
let gameOverTime = 0;
let mouseWasReleased = false;
const MIN_DELAY_MS = 500;

/**
 * Call when entering game over - starts waiting for clean input
 */
export function resetInputReleaseState(): void {
  waitingForInput = true;
  gameOverTime = Date.now();
  mouseWasReleased = false;

  // Clear any pending "just pressed" states
  keysPressed.clear();
  gamepad.buttonsPressed.clear();
}

/**
 * Check if any input was pressed this frame (for start screen)
 * Simpler version without game-over delay logic
 */
export function isAnyStartInputPressed(): boolean {
  // Check keyboard (excluding modifier keys)
  for (const key of keysPressed) {
    if (!EXCLUDED_KEYS.has(key)) {
      return true;
    }
  }

  // Check mouse click
  if (mouse.leftPressed) {
    return true;
  }

  // Note: gamepad buttons don't count as user gesture for AudioContext
  return false;
}

/**
 * Check if any NEW input was pressed this frame
 */
export function isAnyNewInputPressed(): boolean {
  if (!waitingForInput) {
    return false;
  }

  // Enforce minimum delay after game over
  if (Date.now() - gameOverTime < MIN_DELAY_MS) {
    return false;
  }

  // Track mouse release state - must see a clean frame before accepting clicks
  if (!mouse.leftDown && !mouse.down && !mouse.leftPressed) {
    mouseWasReleased = true;
  }

  // Check keyboard (excluding modifier keys)
  for (const key of keysPressed) {
    if (!EXCLUDED_KEYS.has(key)) {
      waitingForInput = false;
      return true;
    }
  }

  // Check mouse - only after it was fully released
  if (mouse.leftPressed && mouseWasReleased) {
    waitingForInput = false;
    return true;
  }

  // Check gamepad
  if (gamepad.connected && gamepad.buttonsPressed.size > 0) {
    waitingForInput = false;
    return true;
  }

  return false;
}

// Pointer lock functions
export function requestPointerLock(): void {
  canvas?.requestPointerLock();
}

export function exitPointerLock(): void {
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

export function isPointerLocked(): boolean {
  return document.pointerLockElement === canvas;
}
