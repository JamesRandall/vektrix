// Spatial audio helpers for position-based sound

/**
 * Calculate stereo pan value based on world position relative to listener
 * @param soundX - X position of the sound source
 * @param soundY - Y position of the sound source
 * @param listenerX - X position of the listener (usually player)
 * @param listenerY - Y position of the listener
 * @param worldWidth - Width of the game world
 * @returns Pan value from -1 (left) to 1 (right)
 */
export function calculatePan(
  soundX: number,
  _soundY: number,
  listenerX: number,
  _listenerY: number,
  worldWidth: number
): number {
  // Calculate relative X position
  const relativeX = soundX - listenerX;

  // Normalize to -1 to 1 based on world width
  // Sounds at world edges will be fully panned
  const maxDistance = worldWidth / 2;
  const pan = Math.max(-1, Math.min(1, relativeX / maxDistance));

  return pan;
}

/**
 * Calculate volume falloff based on distance from listener
 * @param soundX - X position of the sound source
 * @param soundY - Y position of the sound source
 * @param listenerX - X position of the listener
 * @param listenerY - Y position of the listener
 * @param maxDistance - Maximum distance at which sound is audible
 * @returns Volume multiplier from 0 to 1
 */
export function calculateVolume(
  soundX: number,
  soundY: number,
  listenerX: number,
  listenerY: number,
  maxDistance: number
): number {
  const dx = soundX - listenerX;
  const dy = soundY - listenerY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Linear falloff with minimum volume
  const volume = Math.max(0.2, 1 - distance / maxDistance);

  return volume;
}
