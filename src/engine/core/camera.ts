export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private worldWidth = 0;
  private worldHeight = 0;
  private screenWidth = 0;
  private screenHeight = 0;

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }

  setScreenSize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  /**
   * Get visible world dimensions at current zoom
   * Uses world size (not screen size) for consistency with sprite rendering
   */
  getVisibleSize(): { width: number; height: number } {
    return {
      width: this.worldWidth / this.zoom,
      height: this.worldHeight / this.zoom,
    };
  }

  /**
   * Follow a target position, clamping to world bounds
   */
  follow(targetX: number, targetY: number, lerp: number = 1): void {
    const visible = this.getVisibleSize();

    // Clamp so we don't see outside world bounds
    const minX = visible.width / 2;
    const maxX = this.worldWidth - visible.width / 2;
    const minY = visible.height / 2;
    const maxY = this.worldHeight - visible.height / 2;

    let camX = targetX;
    let camY = targetY;

    // Handle case where world is smaller than view
    if (minX >= maxX) {
      camX = this.worldWidth / 2;
    } else {
      camX = Math.max(minX, Math.min(maxX, camX));
    }

    if (minY >= maxY) {
      camY = this.worldHeight / 2;
    } else {
      camY = Math.max(minY, Math.min(maxY, camY));
    }

    // Smooth follow
    this.x += (camX - this.x) * lerp;
    this.y += (camY - this.y) * lerp;
  }

  /**
   * Convert screen coordinates to world coordinates
   * Inverse of worldToScreen (accounts for virtual screen scaling)
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    // Convert actual screen pixels to virtual screen
    const virtualX = screenX * this.worldWidth / this.screenWidth;
    const virtualY = screenY * this.worldHeight / this.screenHeight;
    // Convert virtual screen to world
    return {
      x: (virtualX - this.worldWidth / 2) / this.zoom + this.x,
      y: (virtualY - this.worldHeight / 2) / this.zoom + this.y,
    };
  }

  /**
   * Convert world coordinates to screen coordinates (actual canvas pixels)
   * Sprites use WORLD_WIDTH/HEIGHT as virtual screen, so we scale to actual screen
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    // Virtual screen position (matches sprite shader with WORLD_WIDTH/HEIGHT)
    const virtualX = (worldX - this.x) * this.zoom + this.worldWidth / 2;
    const virtualY = (worldY - this.y) * this.zoom + this.worldHeight / 2;
    // Scale to actual screen pixels
    return {
      x: virtualX * this.screenWidth / this.worldWidth,
      y: virtualY * this.screenHeight / this.worldHeight,
    };
  }
}

// Global camera instance
export const camera = new Camera();
