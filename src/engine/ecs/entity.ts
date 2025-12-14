import { Transform, Velocity, Sprite, Collider, Bullet } from './components';
export {
  MAX_ENTITIES,
  FLAG_ALIVE,
  FLAG_ACTIVE,
  COMP_TRANSFORM,
  COMP_VELOCITY,
  COMP_SPRITE,
  COMP_COLLIDER,
  COMP_BULLET,
} from './constants';
import {
  MAX_ENTITIES,
  FLAG_ALIVE,
  FLAG_ACTIVE,
  COMP_TRANSFORM,
  COMP_VELOCITY,
  COMP_SPRITE,
  COMP_COLLIDER,
  COMP_BULLET,
} from './constants';

// Entity storage - parallel arrays
export const entities = {
  generation: new Uint16Array(MAX_ENTITIES),
  flags: new Uint16Array(MAX_ENTITIES),
};

// Component presence bitmask per entity
export const componentMask = new Uint32Array(MAX_ENTITIES);

// Freelist for entity recycling
const freeList = new Uint32Array(MAX_ENTITIES);
let freeCount = MAX_ENTITIES;

// Initialize freelist with all indices
for (let i = 0; i < MAX_ENTITIES; i++) {
  freeList[i] = i;
}

/**
 * Create a new entity and return its handle.
 * Handle format: (generation << 16) | index
 */
export function createEntity(): number {
  if (freeCount === 0) {
    throw new Error('Entity limit reached');
  }

  freeCount--;
  const index = freeList[freeCount];

  entities.flags[index] = FLAG_ALIVE | FLAG_ACTIVE;
  componentMask[index] = 0;

  // Pack handle: (generation << 16) | index
  return (entities.generation[index] << 16) | index;
}

/**
 * Destroy an entity by handle.
 */
export function destroyEntity(handle: number): void {
  const index = handle & 0xFFFF;
  const generation = handle >>> 16;

  // Validate handle
  if (entities.generation[index] !== generation) {
    return; // Stale handle
  }

  // Clear flags and components
  entities.flags[index] = 0;
  componentMask[index] = 0;

  // Increment generation for next use (invalidates old handles)
  entities.generation[index]++;

  // Return to freelist
  freeList[freeCount] = index;
  freeCount++;
}

/**
 * Check if an entity handle is valid.
 */
export function isEntityValid(handle: number): boolean {
  const index = handle & 0xFFFF;
  const generation = handle >>> 16;
  return entities.generation[index] === generation && (entities.flags[index] & FLAG_ALIVE) !== 0;
}

/**
 * Get the index from a handle (for direct array access).
 */
export function getEntityIndex(handle: number): number {
  return handle & 0xFFFF;
}

/**
 * Add a component to an entity.
 */
export function addComponent(handle: number, componentType: number): void {
  const index = handle & 0xFFFF;
  componentMask[index] |= componentType;
}

/**
 * Remove a component from an entity.
 */
export function removeComponent(handle: number, componentType: number): void {
  const index = handle & 0xFFFF;
  componentMask[index] &= ~componentType;
}

/**
 * Check if an entity has a component.
 */
export function getLiveEntityCount(): number {
  return MAX_ENTITIES - freeCount;
}

export function hasComponent(handle: number, componentType: number): boolean {
  const index = handle & 0xFFFF;
  return (componentMask[index] & componentType) !== 0;
}

/**
 * Entity wrapper class providing convenient access to components.
 *
 * Usage:
 *   const entity = new Entity(handle);
 *   entity.transform.setPosition(100, 200);
 *   entity.velocity.set(10, 0);
 *   entity.sprite.setTint(1, 0, 0);
 *
 * For performance-critical code, use the raw arrays directly:
 *   transforms.x[index] = 100;
 */
export class Entity {
  readonly handle: number;
  readonly index: number;

  private _transform: Transform | null = null;
  private _velocity: Velocity | null = null;
  private _sprite: Sprite | null = null;
  private _collider: Collider | null = null;
  private _bullet: Bullet | null = null;

  constructor(handle: number) {
    this.handle = handle;
    this.index = getEntityIndex(handle);
  }

  /** Create a new entity and return an Entity wrapper */
  static create(): Entity {
    return new Entity(createEntity());
  }

  /** Check if this entity is still valid (alive and same generation) */
  get isValid(): boolean {
    return isEntityValid(this.handle);
  }

  /** Destroy this entity */
  destroy(): void {
    destroyEntity(this.handle);
    this._transform = null;
    this._velocity = null;
    this._sprite = null;
    this._collider = null;
    this._bullet = null;
  }

  // Component presence checks

  get hasTransform(): boolean {
    return hasComponent(this.handle, COMP_TRANSFORM);
  }

  get hasVelocity(): boolean {
    return hasComponent(this.handle, COMP_VELOCITY);
  }

  get hasSprite(): boolean {
    return hasComponent(this.handle, COMP_SPRITE);
  }

  get hasCollider(): boolean {
    return hasComponent(this.handle, COMP_COLLIDER);
  }

  get hasBullet(): boolean {
    return hasComponent(this.handle, COMP_BULLET);
  }

  // Component accessors (lazy-initialized views, auto-adds component)

  /** Get Transform component view. Adds component if not present. */
  get transform(): Transform {
    if (!this._transform) {
      if (!this.hasTransform) {
        addComponent(this.handle, COMP_TRANSFORM);
      }
      this._transform = new Transform(this.index);
    }
    return this._transform;
  }

  /** Get Velocity component view. Adds component if not present. */
  get velocity(): Velocity {
    if (!this._velocity) {
      if (!this.hasVelocity) {
        addComponent(this.handle, COMP_VELOCITY);
      }
      this._velocity = new Velocity(this.index);
    }
    return this._velocity;
  }

  /** Get Sprite component view. Adds component if not present. */
  get sprite(): Sprite {
    if (!this._sprite) {
      if (!this.hasSprite) {
        addComponent(this.handle, COMP_SPRITE);
      }
      this._sprite = new Sprite(this.index);
    }
    return this._sprite;
  }

  /** Get Collider component view. Adds component if not present. */
  get collider(): Collider {
    if (!this._collider) {
      if (!this.hasCollider) {
        addComponent(this.handle, COMP_COLLIDER);
      }
      this._collider = new Collider(this.index);
    }
    return this._collider;
  }

  /** Get Bullet component view. Adds component if not present. */
  get bullet(): Bullet {
    if (!this._bullet) {
      if (!this.hasBullet) {
        addComponent(this.handle, COMP_BULLET);
      }
      this._bullet = new Bullet(this.index);
    }
    return this._bullet;
  }

  // Explicit component management

  addTransform(): Transform {
    addComponent(this.handle, COMP_TRANSFORM);
    this._transform = new Transform(this.index);
    return this._transform;
  }

  addVelocity(): Velocity {
    addComponent(this.handle, COMP_VELOCITY);
    this._velocity = new Velocity(this.index);
    return this._velocity;
  }

  addSprite(): Sprite {
    addComponent(this.handle, COMP_SPRITE);
    this._sprite = new Sprite(this.index);
    return this._sprite;
  }

  removeTransform(): void {
    removeComponent(this.handle, COMP_TRANSFORM);
    this._transform = null;
  }

  removeVelocity(): void {
    removeComponent(this.handle, COMP_VELOCITY);
    this._velocity = null;
  }

  removeSprite(): void {
    removeComponent(this.handle, COMP_SPRITE);
    this._sprite = null;
  }

  addCollider(): Collider {
    addComponent(this.handle, COMP_COLLIDER);
    this._collider = new Collider(this.index);
    return this._collider;
  }

  removeCollider(): void {
    removeComponent(this.handle, COMP_COLLIDER);
    this._collider = null;
  }

  addBullet(): Bullet {
    addComponent(this.handle, COMP_BULLET);
    this._bullet = new Bullet(this.index);
    return this._bullet;
  }

  removeBullet(): void {
    removeComponent(this.handle, COMP_BULLET);
    this._bullet = null;
  }
}
