import { MAX_ENTITIES, componentMask, COMP_TRANSFORM, COMP_COLLIDER } from '../ecs/entity';
import { transforms, colliders } from '../ecs/components';

export interface CollisionPair {
  a: number; // entity index
  b: number; // entity index
}

/**
 * AABB overlap test between two entity indices.
 */
function aabbOverlap(a: number, b: number): boolean {
  const ax = transforms.x[a];
  const ay = transforms.y[a];
  const ahw = colliders.halfWidth[a];
  const ahh = colliders.halfHeight[a];

  const bx = transforms.x[b];
  const by = transforms.y[b];
  const bhw = colliders.halfWidth[b];
  const bhh = colliders.halfHeight[b];

  return Math.abs(ax - bx) < (ahw + bhw) &&
         Math.abs(ay - by) < (ahh + bhh);
}

/**
 * Brute-force collision detection.
 * Returns all pairs of colliding entity indices that pass layer/mask check.
 */
export function detectCollisions(): CollisionPair[] {
  const pairs: CollisionPair[] = [];
  const required = COMP_TRANSFORM | COMP_COLLIDER;

  for (let a = 0; a < MAX_ENTITIES; a++) {
    if ((componentMask[a] & required) !== required) continue;

    for (let b = a + 1; b < MAX_ENTITIES; b++) {
      if ((componentMask[b] & required) !== required) continue;

      // Layer/mask check: do these entities care about each other?
      const aLayer = colliders.layer[a];
      const aMask = colliders.mask[a];
      const bLayer = colliders.layer[b];
      const bMask = colliders.mask[b];

      // A collides with B if A's layer is in B's mask OR B's layer is in A's mask
      if (!(aLayer & bMask) && !(bLayer & aMask)) continue;

      if (aabbOverlap(a, b)) {
        pairs.push({ a, b });
      }
    }
  }

  return pairs;
}
