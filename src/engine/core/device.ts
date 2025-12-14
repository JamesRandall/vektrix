export const ASPECT_RATIO = 16 / 9;

export interface GPUContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

export async function initWebGPU(canvas: HTMLCanvasElement): Promise<GPUContext> {
  if (!navigator.gpu) {
    throw new Error('WebGPU not supported');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('No suitable GPU adapter found');
  }

  const device = await adapter.requestDevice();

  const context = canvas.getContext('webgpu');
  if (!context) {
    throw new Error('Failed to get WebGPU context');
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  context.configure({
    device,
    format,
    alphaMode: 'premultiplied',
  });

  return { device, context, format, canvas };
}

/**
 * Resize canvas to fit window while maintaining 16:9 aspect ratio.
 * Canvas is centered with letterboxing/pillarboxing as needed.
 */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  device: GPUDevice,
  context: GPUCanvasContext,
  format: GPUTextureFormat
): void {
  const dpr = window.devicePixelRatio || 1;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  // Calculate display size maintaining 16:9
  let displayWidth: number;
  let displayHeight: number;

  if (windowWidth / windowHeight > ASPECT_RATIO) {
    // Window is wider than 16:9 - fit to height (pillarbox)
    displayHeight = windowHeight;
    displayWidth = Math.floor(displayHeight * ASPECT_RATIO);
  } else {
    // Window is taller than 16:9 - fit to width (letterbox)
    displayWidth = windowWidth;
    displayHeight = Math.floor(displayWidth / ASPECT_RATIO);
  }

  // Set CSS size and center the canvas
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  canvas.style.position = 'absolute';
  canvas.style.left = `${Math.floor((windowWidth - displayWidth) / 2)}px`;
  canvas.style.top = `${Math.floor((windowHeight - displayHeight) / 2)}px`;

  // Set actual canvas resolution with DPR
  const width = Math.floor(displayWidth * dpr);
  const height = Math.floor(displayHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;

    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });
  }
}
