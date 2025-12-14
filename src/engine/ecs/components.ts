import { MAX_ENTITIES } from './constants';

// Transform component storage (struct-of-arrays)
export const transforms = {
  x: new Float32Array(MAX_ENTITIES),
  y: new Float32Array(MAX_ENTITIES),
  rotation: new Float32Array(MAX_ENTITIES),
  scaleX: new Float32Array(MAX_ENTITIES),
  scaleY: new Float32Array(MAX_ENTITIES),
};

// Velocity component storage
export const velocities = {
  vx: new Float32Array(MAX_ENTITIES),
  vy: new Float32Array(MAX_ENTITIES),
};

// Sprite component storage
export const sprites = {
  width: new Float32Array(MAX_ENTITIES),
  height: new Float32Array(MAX_ENTITIES),
  tintR: new Float32Array(MAX_ENTITIES),
  tintG: new Float32Array(MAX_ENTITIES),
  tintB: new Float32Array(MAX_ENTITIES),
  tintA: new Float32Array(MAX_ENTITIES),
  shape: new Float32Array(MAX_ENTITIES), // 0=circle, 1=player ship
};

// Shape types for sprites
export const SHAPE = {
  CIRCLE: 0,
  PLAYER_SHIP: 1,
  BULLET: 2,
  ENEMY_DIAMOND: 3,   // Wanderer
  ENEMY_ARROW: 4,     // Chaser
  ENEMY_WAVE: 5,      // Weaver
  ENEMY_TRIANGLE: 6,  // Grunt
  ENEMY_SHY: 7,       // Shy (runs when looked at)
  ENEMY_SPINNER: 8,   // Spinner (shoots bullets)
  ENEMY_BULLET: 9,    // Enemy bullet
  MINE: 10,           // Player mine
} as const;

// Collider component storage
export const colliders = {
  halfWidth: new Float32Array(MAX_ENTITIES),
  halfHeight: new Float32Array(MAX_ENTITIES),
  layer: new Uint8Array(MAX_ENTITIES),
  mask: new Uint8Array(MAX_ENTITIES),
};

// Bullet component storage
export const bullets = {
  lifetime: new Float32Array(MAX_ENTITIES),
  maxLifetime: new Float32Array(MAX_ENTITIES),
};

// Enemy types
export const ENEMY_TYPE = {
  WANDERER: 0,   // Drifts randomly, slight player bias
  CHASER: 1,     // Direct pursuit
  WEAVER: 2,     // Sine-wave movement
  GRUNT: 3,      // Slow, spawns in groups
  SHY: 4,        // Approaches, but flees when player looks at it
  SPINNER: 5,    // Stationary, spins and shoots bullets
} as const;

// Enemy component storage
export const enemies = {
  type: new Uint8Array(MAX_ENTITIES),
  stateTimer: new Float32Array(MAX_ENTITIES),
  statePhase: new Float32Array(MAX_ENTITIES),
};

// Collision layers
export const LAYER = {
  NONE: 0,
  PLAYER: 1,
  ENEMY: 2,
  BULLET: 4,
  ENEMY_BULLET: 8,
  MINE: 16,
} as const;

// Initialize default values
for (let i = 0; i < MAX_ENTITIES; i++) {
  transforms.scaleX[i] = 1;
  transforms.scaleY[i] = 1;
  sprites.tintR[i] = 1;
  sprites.tintG[i] = 1;
  sprites.tintB[i] = 1;
  sprites.tintA[i] = 1;
}

// Component view classes for convenient access

export class Transform {
  constructor(private _index: number) {}

  get x(): number { return transforms.x[this._index]; }
  set x(v: number) { transforms.x[this._index] = v; }

  get y(): number { return transforms.y[this._index]; }
  set y(v: number) { transforms.y[this._index] = v; }

  get rotation(): number { return transforms.rotation[this._index]; }
  set rotation(v: number) { transforms.rotation[this._index] = v; }

  get scaleX(): number { return transforms.scaleX[this._index]; }
  set scaleX(v: number) { transforms.scaleX[this._index] = v; }

  get scaleY(): number { return transforms.scaleY[this._index]; }
  set scaleY(v: number) { transforms.scaleY[this._index] = v; }

  setPosition(x: number, y: number): void {
    transforms.x[this._index] = x;
    transforms.y[this._index] = y;
  }

  setScale(sx: number, sy: number = sx): void {
    transforms.scaleX[this._index] = sx;
    transforms.scaleY[this._index] = sy;
  }
}

export class Velocity {
  constructor(private _index: number) {}

  get vx(): number { return velocities.vx[this._index]; }
  set vx(v: number) { velocities.vx[this._index] = v; }

  get vy(): number { return velocities.vy[this._index]; }
  set vy(v: number) { velocities.vy[this._index] = v; }

  set(vx: number, vy: number): void {
    velocities.vx[this._index] = vx;
    velocities.vy[this._index] = vy;
  }

  get speed(): number {
    const vx = velocities.vx[this._index];
    const vy = velocities.vy[this._index];
    return Math.sqrt(vx * vx + vy * vy);
  }
}

export class Sprite {
  constructor(private _index: number) {}

  get width(): number { return sprites.width[this._index]; }
  set width(v: number) { sprites.width[this._index] = v; }

  get height(): number { return sprites.height[this._index]; }
  set height(v: number) { sprites.height[this._index] = v; }

  get shape(): number { return sprites.shape[this._index]; }
  set shape(v: number) { sprites.shape[this._index] = v; }

  setSize(w: number, h: number = w): void {
    sprites.width[this._index] = w;
    sprites.height[this._index] = h;
  }

  setTint(r: number, g: number, b: number, a: number = 1): void {
    sprites.tintR[this._index] = r;
    sprites.tintG[this._index] = g;
    sprites.tintB[this._index] = b;
    sprites.tintA[this._index] = a;
  }
}

export class Collider {
  constructor(private _index: number) {}

  get halfWidth(): number { return colliders.halfWidth[this._index]; }
  set halfWidth(v: number) { colliders.halfWidth[this._index] = v; }

  get halfHeight(): number { return colliders.halfHeight[this._index]; }
  set halfHeight(v: number) { colliders.halfHeight[this._index] = v; }

  get layer(): number { return colliders.layer[this._index]; }
  set layer(v: number) { colliders.layer[this._index] = v; }

  get mask(): number { return colliders.mask[this._index]; }
  set mask(v: number) { colliders.mask[this._index] = v; }

  setSize(halfW: number, halfH: number = halfW): void {
    colliders.halfWidth[this._index] = halfW;
    colliders.halfHeight[this._index] = halfH;
  }

  setLayerMask(layer: number, mask: number): void {
    colliders.layer[this._index] = layer;
    colliders.mask[this._index] = mask;
  }
}

export class Bullet {
  constructor(private _index: number) {}

  get lifetime(): number { return bullets.lifetime[this._index]; }
  set lifetime(v: number) { bullets.lifetime[this._index] = v; }

  get maxLifetime(): number { return bullets.maxLifetime[this._index]; }
  set maxLifetime(v: number) { bullets.maxLifetime[this._index] = v; }

  setup(lifetime: number): void {
    bullets.lifetime[this._index] = lifetime;
    bullets.maxLifetime[this._index] = lifetime;
  }
}
