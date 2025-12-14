import { ENEMY_TYPE } from './enemies';
import { resetInputReleaseState } from '../engine/core/input';

// Score values per enemy type
const SCORE_VALUES: Record<number, number> = {
  [ENEMY_TYPE.GRUNT]: 25,
  [ENEMY_TYPE.WANDERER]: 50,
  [ENEMY_TYPE.CHASER]: 100,
  [ENEMY_TYPE.WEAVER]: 150,
  [ENEMY_TYPE.SHY]: 200,     // Harder to kill - runs when you look at it
  [ENEMY_TYPE.SPINNER]: 250, // Dangerous - shoots bullets
};

// Multiplier settings
const MULTIPLIER_DECAY_TIME = 2.0; // seconds before multiplier starts decaying
const MULTIPLIER_DECAY_RATE = 1.0; // per second once decaying
const MULTIPLIER_INCREMENT = 0.25;
const MULTIPLIER_MAX = 10;

// Lives
const INITIAL_LIVES = 3;
const MAX_LIVES = 5;
const RESPAWN_INVULNERABILITY = 2.0;
const RESPAWN_DELAY = 1.5;

// Smart bombs
const INITIAL_BOMBS = 3;
const MAX_BOMBS = 5;

export interface GameState {
  // Scoring
  score: number;
  multiplier: number;
  multiplierTimer: number;
  highScore: number;

  // Waves
  waveNumber: number;
  enemiesKilledThisWave: number;

  // Player state
  lives: number;
  isAlive: boolean;
  invulnerableTimer: number;
  respawnTimer: number;

  // Equipment
  mines: number;
  bombs: number;

  // Game flow
  isGameOver: boolean;
  isPaused: boolean;

  // Cheat tracking (disables high score)
  cheatsUsed: boolean;
}

// Global game state
export const gameState: GameState = {
  score: 0,
  multiplier: 1,
  multiplierTimer: 0,
  highScore: 0,

  waveNumber: 0,
  enemiesKilledThisWave: 0,

  lives: INITIAL_LIVES,
  isAlive: true,
  invulnerableTimer: 0,
  respawnTimer: 0,

  mines: 5,
  bombs: INITIAL_BOMBS,

  isGameOver: false,
  isPaused: false,

  cheatsUsed: false,
};

export function addScore(enemyType: number): void {
  if (gameState.isGameOver) return;

  const baseScore = SCORE_VALUES[enemyType] ?? 50;
  const points = Math.floor(baseScore * gameState.multiplier);
  gameState.score += points;

  // Reset multiplier decay timer
  gameState.multiplierTimer = MULTIPLIER_DECAY_TIME;

  // Increment multiplier (cap at max)
  gameState.multiplier = Math.min(MULTIPLIER_MAX, gameState.multiplier + MULTIPLIER_INCREMENT);

  gameState.enemiesKilledThisWave++;
}

export function updateMultiplier(dt: number): void {
  if (gameState.isGameOver) return;

  if (gameState.multiplierTimer > 0) {
    gameState.multiplierTimer -= dt;
  } else if (gameState.multiplier > 1) {
    // Decay multiplier back to 1x
    gameState.multiplier = Math.max(1, gameState.multiplier - MULTIPLIER_DECAY_RATE * dt);
  }
}

export function updatePlayerState(dt: number): { shouldRespawn: boolean } {
  let shouldRespawn = false;

  // Update invulnerability
  if (gameState.invulnerableTimer > 0) {
    gameState.invulnerableTimer -= dt;
  }

  // Update respawn timer
  if (!gameState.isAlive && !gameState.isGameOver) {
    gameState.respawnTimer -= dt;
    if (gameState.respawnTimer <= 0) {
      gameState.isAlive = true;
      gameState.invulnerableTimer = RESPAWN_INVULNERABILITY;
      shouldRespawn = true;
    }
  }

  return { shouldRespawn };
}

export function onPlayerHit(): boolean {
  // Check invulnerability
  if (gameState.invulnerableTimer > 0 || !gameState.isAlive) {
    return false;
  }

  gameState.lives--;
  gameState.multiplier = 1; // Reset multiplier on death
  gameState.multiplierTimer = 0;

  if (gameState.lives <= 0) {
    gameOver();
  } else {
    // Start respawn timer
    gameState.isAlive = false;
    gameState.respawnTimer = RESPAWN_DELAY;
  }

  return true; // Player was hit
}

export function gameOver(): void {
  gameState.isGameOver = true;
  gameState.isAlive = false;

  // Require all inputs to be released before accepting restart
  resetInputReleaseState();

  // Update high score (only if no cheats used)
  if (gameState.score > gameState.highScore && !gameState.cheatsUsed) {
    gameState.highScore = gameState.score;
    saveHighScore();
  }
}

export function restartGame(): void {
  gameState.score = 0;
  gameState.multiplier = 1;
  gameState.multiplierTimer = 0;
  gameState.waveNumber = 0;
  gameState.enemiesKilledThisWave = 0;
  gameState.lives = INITIAL_LIVES;
  gameState.isAlive = true;
  gameState.invulnerableTimer = RESPAWN_INVULNERABILITY; // Brief invuln on start
  gameState.respawnTimer = 0;
  gameState.mines = 5;
  gameState.bombs = INITIAL_BOMBS;
  gameState.isGameOver = false;
  gameState.isPaused = false;
  gameState.cheatsUsed = false;
}

export function loadHighScore(): void {
  const saved = localStorage.getItem('vektrix_highscore');
  if (saved) {
    gameState.highScore = parseInt(saved, 10) || 0;
  }
}

export function saveHighScore(): void {
  localStorage.setItem('vektrix_highscore', String(gameState.highScore));
}

export function isPlayerInvulnerable(): boolean {
  return gameState.invulnerableTimer > 0;
}

export function isPlayerAlive(): boolean {
  return gameState.isAlive && !gameState.isGameOver;
}

export function useBomb(): boolean {
  if (gameState.bombs <= 0) return false;
  gameState.bombs--;
  return true;
}

export function addBombOnWaveStart(): void {
  if (gameState.bombs < MAX_BOMBS) {
    gameState.bombs++;
  }
}

export function addLife(): void {
  if (gameState.lives < MAX_LIVES) {
    gameState.lives++;
  }
}

/**
 * Get game speed multiplier based on wave number
 * Speed increases by 10% every 4 waves
 * Waves 1-4: 1.0x, Waves 5-8: 1.1x, Waves 9-12: 1.2x, etc.
 */
export function getGameSpeed(): number {
  return 1.0 + 0.1 * Math.floor((gameState.waveNumber - 1) / 4);
}
