import { Entity, entities, destroyEntity } from '../engine/ecs/entity';
import { transforms, velocities, bullets, LAYER, SHAPE } from '../engine/ecs/components';
import { applyGridImpulse, GridState } from '../engine/grid/grid';
import { isShooting } from '../engine/core/input';

const BULLET_SPEED = 1200;
const BULLET_SIZE = 12;
const BULLET_LIFETIME = 1.5; // seconds

// Enemy bullet constants (tweakable)
export const ENEMY_BULLET_SPEED = 280;      // How fast enemy bullets travel
export const ENEMY_BULLET_SIZE = 10;        // Size of enemy bullets
export const ENEMY_BULLET_LIFETIME = 4.0;   // How long enemy bullets live (seconds)

// Track active bullet entities by their index
const activeBullets = new Set<number>();
const activeEnemyBullets = new Set<number>();

export function createBullet(x: number, y: number, angle: number): Entity {
  const bullet = Entity.create();

  // Spawn slightly ahead in the direction
  const spawnOffset = 30;
  const spawnX = x + Math.cos(angle) * spawnOffset;
  const spawnY = y + Math.sin(angle) * spawnOffset;

  bullet.transform.setPosition(spawnX, spawnY);
  bullet.transform.rotation = angle;
  bullet.transform.setScale(1);

  // Velocity in direction of angle
  const vx = Math.cos(angle) * BULLET_SPEED;
  const vy = Math.sin(angle) * BULLET_SPEED;
  bullet.velocity.set(vx, vy);

  bullet.sprite.setSize(BULLET_SIZE, BULLET_SIZE * 2.5); // Elongated
  bullet.sprite.setTint(1.5, 1.5, 0.4); // Bright yellow (HDR)
  bullet.sprite.shape = SHAPE.BULLET;

  bullet.collider.setSize(BULLET_SIZE / 2);
  bullet.collider.setLayerMask(LAYER.BULLET, LAYER.ENEMY);

  bullet.bullet.setup(BULLET_LIFETIME);

  activeBullets.add(bullet.index);

  return bullet;
}

export function destroyBullet(index: number): void {
  activeBullets.delete(index);
  const handle = (entities.generation[index] << 16) | index;
  destroyEntity(handle);
}

export function getActiveBulletIndices(): Set<number> {
  return activeBullets;
}

export function getBulletCount(): number {
  return activeBullets.size;
}

export function updateBullets(dt: number, grid: GridState): void {
  const toDestroy: number[] = [];

  for (const index of activeBullets) {
    // Update lifetime
    bullets.lifetime[index] -= dt;

    if (bullets.lifetime[index] <= 0) {
      toDestroy.push(index);
      continue;
    }

    // Move bullet
    transforms.x[index] += velocities.vx[index] * dt;
    transforms.y[index] += velocities.vy[index] * dt;

    // Small grid wake effect
    applyGridImpulse(grid, transforms.x[index], transforms.y[index], 30, 40);
  }

  // Destroy expired bullets
  for (const index of toDestroy) {
    destroyBullet(index);
  }
}

// Shooting system with fire rate control
export class ShootingSystem {
  private fireTimer = 0;
  private fireRate = 0.08; // seconds between shots (~12.5 shots/sec)
  private onShoot: (() => void) | null = null;

  setOnShoot(callback: () => void): void {
    this.onShoot = callback;
  }

  update(dt: number, playerX: number, playerY: number, aimAngle: number, grid: GridState): void {
    this.fireTimer -= dt;

    if (isShooting() && this.fireTimer <= 0) {
      this.fireTimer = this.fireRate;

      createBullet(playerX, playerY, aimAngle);

      // Grid recoil (push grid behind player)
      const recoilX = playerX - Math.cos(aimAngle) * 20;
      const recoilY = playerY - Math.sin(aimAngle) * 20;
      applyGridImpulse(grid, recoilX, recoilY, 40, 80);

      // Call shoot callback for sound effects etc.
      this.onShoot?.();
    }
  }

  setFireRate(rate: number): void {
    this.fireRate = rate;
  }
}

// ===== Enemy Bullets =====

export function createEnemyBullet(x: number, y: number, angle: number): Entity {
  const bullet = Entity.create();

  bullet.transform.setPosition(x, y);
  bullet.transform.rotation = angle;
  bullet.transform.setScale(1);

  // Velocity in direction of angle
  const vx = Math.cos(angle) * ENEMY_BULLET_SPEED;
  const vy = Math.sin(angle) * ENEMY_BULLET_SPEED;
  bullet.velocity.set(vx, vy);

  bullet.sprite.setSize(ENEMY_BULLET_SIZE, ENEMY_BULLET_SIZE);
  bullet.sprite.setTint(1.5, 0.3, 0.3); // Red/pink (HDR)
  bullet.sprite.shape = SHAPE.ENEMY_BULLET;

  bullet.collider.setSize(ENEMY_BULLET_SIZE / 2);
  bullet.collider.setLayerMask(LAYER.ENEMY_BULLET, LAYER.PLAYER);

  bullet.bullet.setup(ENEMY_BULLET_LIFETIME);

  activeEnemyBullets.add(bullet.index);

  return bullet;
}

export function destroyEnemyBullet(index: number): void {
  activeEnemyBullets.delete(index);
  const handle = (entities.generation[index] << 16) | index;
  destroyEntity(handle);
}

export function getActiveEnemyBulletIndices(): Set<number> {
  return activeEnemyBullets;
}

export function getEnemyBulletCount(): number {
  return activeEnemyBullets.size;
}

export function updateEnemyBullets(dt: number, grid: GridState): void {
  const toDestroy: number[] = [];

  for (const index of activeEnemyBullets) {
    // Update lifetime
    bullets.lifetime[index] -= dt;

    if (bullets.lifetime[index] <= 0) {
      toDestroy.push(index);
      continue;
    }

    // Move bullet
    transforms.x[index] += velocities.vx[index] * dt;
    transforms.y[index] += velocities.vy[index] * dt;

    // Smaller grid wake effect than player bullets
    applyGridImpulse(grid, transforms.x[index], transforms.y[index], 20, 20);
  }

  // Destroy expired bullets
  for (const index of toDestroy) {
    destroyEnemyBullet(index);
  }
}
