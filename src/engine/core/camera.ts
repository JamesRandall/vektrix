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
   */
  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    const visible = this.getVisibleSize();

    // Screen coords are relative to canvas (0,0 at top-left)
    // Convert to world coords centered on camera
    const normalizedX = screenX / this.screenWidth - 0.5;  // -0.5 to 0.5
    const normalizedY = screenY / this.screenHeight - 0.5;

    return {
      x: this.x + normalizedX * visible.width,
      y: this.y + normalizedY * visible.height,
    };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
    const visible = this.getVisibleSize();

    const normalizedX = (worldX - this.x) / visible.width;
    const normalizedY = (worldY - this.y) / visible.height;

    return {
      x: (normalizedX + 0.5) * this.screenWidth,
      y: (normalizedY + 0.5) * this.screenHeight,
    };
  }
}

// Global camera instance
export const camera = new Camera();
