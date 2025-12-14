export const GRID_COLS = 38;
export const GRID_ROWS = 22;
export const VERTEX_COUNT = GRID_COLS * GRID_ROWS;

export interface GridState {
  // Current positions
  x: Float32Array;
  y: Float32Array;
  // Velocities
  vx: Float32Array;
  vy: Float32Array;
  // Rest positions (where vertices want to return to)
  restX: Float32Array;
  restY: Float32Array;
}

export function createGrid(worldWidth: number, worldHeight: number): GridState {
  const grid: GridState = {
    x: new Float32Array(VERTEX_COUNT),
    y: new Float32Array(VERTEX_COUNT),
    vx: new Float32Array(VERTEX_COUNT),
    vy: new Float32Array(VERTEX_COUNT),
    restX: new Float32Array(VERTEX_COUNT),
    restY: new Float32Array(VERTEX_COUNT),
  };

  // Add padding so grid doesn't touch canvas edges (prevents bloom edge artifacts)
  const padding = 40;
  const gridWidth = worldWidth - padding * 2;
  const gridHeight = worldHeight - padding * 2;
  const cellWidth = gridWidth / (GRID_COLS - 1);
  const cellHeight = gridHeight / (GRID_ROWS - 1);

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const i = row * GRID_COLS + col;
      const x = padding + col * cellWidth;
      const y = padding + row * cellHeight;

      grid.x[i] = x;
      grid.y[i] = y;
      grid.restX[i] = x;
      grid.restY[i] = y;
      grid.vx[i] = 0;
      grid.vy[i] = 0;
    }
  }

  return grid;
}

function springForce(
  grid: GridState,
  i: number,
  n: number,
  stiffness: number
): { fx: number; fy: number } {
  const dx = grid.x[n] - grid.x[i];
  const dy = grid.y[n] - grid.y[i];
  const restDx = grid.restX[n] - grid.restX[i];
  const restDy = grid.restY[n] - grid.restY[i];
  const restLen = Math.sqrt(restDx * restDx + restDy * restDy);
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len > 0) {
    const stretch = len - restLen;
    return {
      fx: (dx / len) * stretch * stiffness,
      fy: (dy / len) * stretch * stiffness,
    };
  }
  return { fx: 0, fy: 0 };
}

export function simulateGrid(grid: GridState, dt: number): void {
  const k = 400;        // Spring stiffness (Hooke's Law constant)
  const kNeighbour = 200; // Neighbour spring stiffness
  const damping = 5;    // Velocity damping coefficient

  // Fixed timestep for stability - subdivide large dt
  // With k=400 + 4*kNeighbour=800 = 1200 max stiffness, need small steps
  const fixedStep = 1 / 240; // 4.17ms fixed step
  const clampedDt = Math.min(dt, 0.1); // Cap at 100ms
  const steps = Math.max(1, Math.round(clampedDt / fixedStep));
  const stepDt = fixedStep; // Use fixed step, not variable

  for (let step = 0; step < steps; step++) {
    for (let i = 0; i < VERTEX_COUNT; i++) {
      let fx = 0;
      let fy = 0;

      // Anchor spring - pulls vertex back to rest position
      fx += (grid.restX[i] - grid.x[i]) * k;
      fy += (grid.restY[i] - grid.y[i]) * k;

      // Get grid coordinates
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);

      // Neighbour springs (structural connections)
      if (col > 0) {
        const f = springForce(grid, i, i - 1, kNeighbour);
        fx += f.fx;
        fy += f.fy;
      }
      if (col < GRID_COLS - 1) {
        const f = springForce(grid, i, i + 1, kNeighbour);
        fx += f.fx;
        fy += f.fy;
      }
      if (row > 0) {
        const f = springForce(grid, i, i - GRID_COLS, kNeighbour);
        fx += f.fx;
        fy += f.fy;
      }
      if (row < GRID_ROWS - 1) {
        const f = springForce(grid, i, i + GRID_COLS, kNeighbour);
        fx += f.fx;
        fy += f.fy;
      }

      // Damping - bleeds energy from the system
      fx -= grid.vx[i] * damping;
      fy -= grid.vy[i] * damping;

      // Semi-implicit Euler integration
      grid.vx[i] += fx * stepDt;
      grid.vy[i] += fy * stepDt;
      grid.x[i] += grid.vx[i] * stepDt;
      grid.y[i] += grid.vy[i] * stepDt;
    }
  }
}

export function applyGridImpulse(
  grid: GridState,
  worldX: number,
  worldY: number,
  radius: number,
  force: number
): void {
  for (let i = 0; i < VERTEX_COUNT; i++) {
    const dx = grid.x[i] - worldX;
    const dy = grid.y[i] - worldY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius && dist > 0) {
      const falloff = 1 - dist / radius;
      const impulse = force * falloff * falloff; // Quadratic falloff
      grid.vx[i] += (dx / dist) * impulse;
      grid.vy[i] += (dy / dist) * impulse;
    }
  }
}
