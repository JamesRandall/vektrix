// Sound effect definitions and configuration

export enum SoundEffect {
  // Player sounds
  PLAYER_SHOOT = 'player_shoot',
  PLAYER_DEATH = 'player_death',
  PLAYER_RESPAWN = 'player_respawn',

  // Enemy sounds
  ENEMY_DEATH = 'enemy_death',
  ENEMY_SPAWN = 'enemy_spawn',
  ENEMY_SHOOT = 'enemy_shoot',

  // Combat
  BULLET_IMPACT = 'bullet_impact',
  EXPLOSION_SMALL = 'explosion_small',
  EXPLOSION_LARGE = 'explosion_large',

  // Game events
  WAVE_START = 'wave_start',
  WAVE_COMPLETE = 'wave_complete',
  GAME_OVER = 'game_over',
  SCORE_MULTIPLIER = 'score_multiplier',

  // UI
  UI_SELECT = 'ui_select',
  UI_CONFIRM = 'ui_confirm',
}

// Sound configuration with variation parameters
export interface SoundConfig {
  baseVolume: number;
  pitchMin: number;
  pitchMax: number;
  cooldown?: number; // Minimum ms between plays (prevents spam)
}

export const SOUND_CONFIGS: Record<SoundEffect, SoundConfig> = {
  [SoundEffect.PLAYER_SHOOT]: {
    baseVolume: 0.3,
    pitchMin: 0.95,
    pitchMax: 1.05,
    cooldown: 50,
  },
  [SoundEffect.PLAYER_DEATH]: {
    baseVolume: 0.8,
    pitchMin: 0.9,
    pitchMax: 1.0,
  },
  [SoundEffect.PLAYER_RESPAWN]: {
    baseVolume: 0.6,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
  [SoundEffect.ENEMY_DEATH]: {
    baseVolume: 0.5,
    pitchMin: 0.8,
    pitchMax: 1.2,
  },
  [SoundEffect.ENEMY_SPAWN]: {
    baseVolume: 0.3,
    pitchMin: 0.9,
    pitchMax: 1.1,
    cooldown: 100,
  },
  [SoundEffect.ENEMY_SHOOT]: {
    baseVolume: 0.2,
    pitchMin: 0.9,
    pitchMax: 1.1,
    cooldown: 80,
  },
  [SoundEffect.BULLET_IMPACT]: {
    baseVolume: 0.4,
    pitchMin: 0.9,
    pitchMax: 1.1,
  },
  [SoundEffect.EXPLOSION_SMALL]: {
    baseVolume: 0.5,
    pitchMin: 0.85,
    pitchMax: 1.15,
  },
  [SoundEffect.EXPLOSION_LARGE]: {
    baseVolume: 0.8,
    pitchMin: 0.8,
    pitchMax: 1.0,
  },
  [SoundEffect.WAVE_START]: {
    baseVolume: 0.6,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
  [SoundEffect.WAVE_COMPLETE]: {
    baseVolume: 0.7,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
  [SoundEffect.GAME_OVER]: {
    baseVolume: 0.8,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
  [SoundEffect.SCORE_MULTIPLIER]: {
    baseVolume: 0.4,
    pitchMin: 1.0,
    pitchMax: 1.5, // Pitch up with multiplier
  },
  [SoundEffect.UI_SELECT]: {
    baseVolume: 0.3,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
  [SoundEffect.UI_CONFIRM]: {
    baseVolume: 0.4,
    pitchMin: 1.0,
    pitchMax: 1.0,
  },
};
