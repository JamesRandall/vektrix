import { EmissionRequest, ParticleType, createEmission } from './types';
import type { ParticleSystem } from './ParticleSystem';

// HUD text constants (must match vectorHud.ts)
const CHAR_WIDTH = 28;
const CHAR_SPACING = 4;

// Pre-configured particle effects for common game events

export const PARTICLE_EFFECTS = {
  // Enemy death - burst in enemy color
  enemyDeath(x: number, y: number, color: [number, number, number]): EmissionRequest {
    return createEmission(x, y, 200, color, {
      type: ParticleType.SPARK,
      speedMin: 300,
      speedMax: 800,
      sizeMin: 3,
      sizeMax: 10,
      lifetimeMin: 0.4,
      lifetimeMax: 1.0,
      spread: Math.PI * 2,
      direction: 0,
    });
  },

  // Player death - massive cyan explosion
  playerDeath(x: number, y: number): EmissionRequest {
    return createEmission(x, y, 250, [0.4, 1.2, 1.5], {
      type: ParticleType.SPARK,
      speedMin: 400,
      speedMax: 1200,
      sizeMin: 5,
      sizeMax: 18,
      lifetimeMin: 0.6,
      lifetimeMax: 1.5,
      spread: Math.PI * 2,
      direction: 0,
    });
  },

  // Bullet impact - small directional burst
  bulletImpact(x: number, y: number, angle: number): EmissionRequest {
    return createEmission(x, y, 25, [1.5, 1.5, 0.4], {
      type: ParticleType.SPARK,
      speedMin: 150,
      speedMax: 450,
      sizeMin: 2,
      sizeMax: 6,
      lifetimeMin: 0.2,
      lifetimeMax: 0.5,
      spread: Math.PI * 0.6, // ~110 degree cone
      direction: angle + Math.PI, // Opposite to bullet direction
    });
  },

  // Muzzle flash - brief forward burst
  muzzleFlash(x: number, y: number, angle: number): EmissionRequest {
    return createEmission(x, y, 6, [1.5, 1.2, 0.3], {
      type: ParticleType.SPARK,
      speedMin: 250,
      speedMax: 450,
      sizeMin: 2,
      sizeMax: 4,
      lifetimeMin: 0.04,
      lifetimeMax: 0.12,
      spread: Math.PI * 0.25,
      direction: angle,
    });
  },

  // Engine trail - continuous emission while moving
  engineTrail(x: number, y: number, angle: number): EmissionRequest {
    return createEmission(x, y, 2, [0.3, 0.8, 1.2], {
      type: ParticleType.TRAIL,
      speedMin: 30,
      speedMax: 80,
      sizeMin: 2,
      sizeMax: 3,
      lifetimeMin: 0.08,
      lifetimeMax: 0.2,
      spread: Math.PI * 0.3,
      direction: angle + Math.PI, // Behind player
    });
  },

  // Wave complete celebration
  waveCelebration(x: number, y: number): EmissionRequest {
    return createEmission(x, y, 60, [1.0, 1.0, 0.3], {
      type: ParticleType.EMBER,
      speedMin: 100,
      speedMax: 300,
      sizeMin: 3,
      sizeMax: 7,
      lifetimeMin: 0.8,
      lifetimeMax: 1.5,
      spread: Math.PI * 2,
      direction: 0,
    });
  },

  // Small debris from impacts
  debris(x: number, y: number, color: [number, number, number]): EmissionRequest {
    return createEmission(x, y, 8, color, {
      type: ParticleType.DEBRIS,
      speedMin: 50,
      speedMax: 150,
      sizeMin: 2,
      sizeMax: 5,
      lifetimeMin: 0.5,
      lifetimeMax: 1.0,
      spread: Math.PI * 2,
      direction: 0,
    });
  },
};

/**
 * Explode text into particles - each character gets its own burst
 * Used for game over screen restart effect
 */
export function explodeText(
  particleSystem: ParticleSystem,
  text: string,
  centerX: number,
  centerY: number,
  yOffset: number,
  textScale: number,
  worldScale: number,
  color: [number, number, number],
  particlesPerChar: number
): void {
  const charStep = (CHAR_WIDTH + CHAR_SPACING) * worldScale;
  const scaledCharStep = charStep * textScale;
  const totalWidth = text.length * scaledCharStep - (CHAR_SPACING * worldScale * textScale);
  const startX = centerX - totalWidth / 2 + (scaledCharStep / 2);
  const y = centerY + (yOffset * worldScale);

  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ') continue; // Skip spaces
    const x = startX + i * scaledCharStep;
    particleSystem.emit({
      x, y,
      count: particlesPerChar,
      type: ParticleType.SPARK,
      color,
      speedMin: 150, speedMax: 500,
      sizeMin: 2, sizeMax: 8,
      lifetimeMin: 0.6, lifetimeMax: 1.5,
      spread: Math.PI * 2, direction: 0,
    });
  }
}
