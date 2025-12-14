export const MAX_ENTITIES = 65536;

// Entity flags
export const FLAG_ALIVE = 1 << 0;
export const FLAG_ACTIVE = 1 << 1;

// Component type bits
export const COMP_TRANSFORM = 1 << 0;
export const COMP_VELOCITY = 1 << 1;
export const COMP_SPRITE = 1 << 2;
export const COMP_COLLIDER = 1 << 3;
export const COMP_BULLET = 1 << 4;
