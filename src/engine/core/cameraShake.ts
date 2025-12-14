// Camera shake system for impact feedback

const SHAKE_DECAY = 14.0;       // How fast shake decays per second
const SHAKE_PER_EXPLOSION = 2;  // Default shake added per explosion
const SHAKE_MAX = 10;           // Maximum shake intensity

let shakeIntensity = 0;
let shakeOffsetX = 0;
let shakeOffsetY = 0;

export function addCameraShake(amount: number = SHAKE_PER_EXPLOSION): void {
  shakeIntensity = Math.min(SHAKE_MAX, shakeIntensity + amount);
}

export function updateCameraShake(dt: number): void {
  if (shakeIntensity > 0) {
    // Random offset based on intensity
    const angle = Math.random() * Math.PI * 2;
    shakeOffsetX = Math.cos(angle) * shakeIntensity;
    shakeOffsetY = Math.sin(angle) * shakeIntensity;

    // Decay shake
    shakeIntensity = Math.max(0, shakeIntensity - SHAKE_DECAY * dt);
  } else {
    shakeOffsetX = 0;
    shakeOffsetY = 0;
  }
}

export function getShakeOffset(): { x: number; y: number } {
  return { x: shakeOffsetX, y: shakeOffsetY };
}

export function resetCameraShake(): void {
  shakeIntensity = 0;
  shakeOffsetX = 0;
  shakeOffsetY = 0;
}
