// Fixed world size (16:9) - never changes regardless of window size
export const WORLD_WIDTH = 1920;
export const WORLD_HEIGHT = 1080;

// Grid colors for each wave phase (blue, green, yellow, red - cycling)
export const GRID_COLORS: [number, number, number][] = [
  [0.2, 0.45, 1.2],   // Blue (wave 1, 5, 9, ...)
  [0.2, 0.75, 0.25],  // Green (wave 2, 6, 10, ...)
  [0.7, 0.6, 0.1],    // Yellow (wave 3, 7, 11, ...)
  [1.2, 0.2, 0.3],    // Red (wave 4, 8, 12, ...)
];
