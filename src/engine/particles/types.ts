// Particle system constants
export const MAX_PARTICLES = 131072; // 128k particles
export const MAX_EMISSIONS_PER_FRAME = 64;
export const PARTICLE_STRIDE = 16; // 4 floats per particle attribute set

// Particle types - different visual/physics behaviours
export enum ParticleType {
  SPARK = 0,    // Fast-fading point, high drag
  EMBER = 1,    // Slow-fading, gravity-affected
  DEBRIS = 2,   // Larger, slower, tumbling with gravity
  TRAIL = 3,    // Elongated in velocity direction
}

// Emission request - queued on CPU, processed by GPU
export interface EmissionRequest {
  x: number;
  y: number;
  count: number;
  type: ParticleType;
  color: [number, number, number];
  speedMin: number;
  speedMax: number;
  sizeMin: number;
  sizeMax: number;
  lifetimeMin: number;
  lifetimeMax: number;
  spread: number;      // Angular spread in radians (2π = omnidirectional)
  direction: number;   // Base direction in radians
}

// Default emission for convenience
export function createEmission(
  x: number,
  y: number,
  count: number,
  color: [number, number, number],
  options: Partial<Omit<EmissionRequest, 'x' | 'y' | 'count' | 'color'>> = {}
): EmissionRequest {
  return {
    x,
    y,
    count,
    color,
    type: options.type ?? ParticleType.SPARK,
    speedMin: options.speedMin ?? 100,
    speedMax: options.speedMax ?? 300,
    sizeMin: options.sizeMin ?? 2,
    sizeMax: options.sizeMax ?? 6,
    lifetimeMin: options.lifetimeMin ?? 0.2,
    lifetimeMax: options.lifetimeMax ?? 0.6,
    spread: options.spread ?? Math.PI * 2,
    direction: options.direction ?? 0,
  };
}
