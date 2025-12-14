import { gameState } from './gameState';
import { createEnemy, ENEMY_TYPE, setupFormation, getActiveSpinnerCount } from './enemies';
import { spawnBlackHole, isBlackHoleActive } from './blackHole';

// Spinner spawn rules
const SPINNER_START_WAVE = 3;  // First wave spinners can appear

// Black hole spawn rules
const BLACK_HOLE_START_WAVE = 4;
const BLACK_HOLE_SPAWN_CHANCE = 0.002;  // Per frame chance (~0.2% per frame, roughly every 8-10 seconds at 60fps)

// Wave color influence on enemy spawns (subtle)
// Colors cycle: Blue (0), Yellow (1), Green (2), Red (3)
const COLOR_SPAWN_BONUS = 0.10;  // 10% increased likelihood for themed enemy
const COLOR_ENEMY_BONUS: Record<number, number> = {
  0: ENEMY_TYPE.GRUNT,     // Blue waves favor Grunts
  1: ENEMY_TYPE.WEAVER,    // Yellow waves favor Weavers
  2: ENEMY_TYPE.WANDERER,  // Green waves favor Wanderers
  3: ENEMY_TYPE.CHASER,    // Red waves favor Chasers
};

export interface WaveConfig {
  duration: number;
  spawnInterval: number;
  typeWeights: Record<number, number>;
  formationChance: number;
}

// Predefined waves - time-based, relentless spawning
const WAVE_CONFIGS: WaveConfig[] = [
  // Wave 1: Immediate action - grunts and chasers
  {
    duration: 20,
    spawnInterval: 1.0,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 2, [ENEMY_TYPE.CHASER]: 1 },
    formationChance: 0.4,
  },
  // Wave 2: Add wanderers
  {
    duration: 25,
    spawnInterval: 0.9,
    typeWeights: { [ENEMY_TYPE.GRUNT]: 2, [ENEMY_TYPE.CHASER]: 2, [ENEMY_TYPE.WANDERER]: 1 },
    formationChance: 0.5,
  },
  // Wave 3: Introduce weavers AND spinners (1 max)
  {
    duration: 25,
    spawnInterval: 0.8,
    typeWeights: {
      [ENEMY_TYPE.GRUNT]: 2,
      [ENEMY_TYPE.CHASER]: 2,
      [ENEMY_TYPE.WANDERER]: 2,
      [ENEMY_TYPE.WEAVER]: 1,
      [ENEMY_TYPE.SPINNER]: 1,
    },
    formationChance: 0.5,
  },
  // Wave 4: Introduce shy enemies (spinners: 2 max)
  {
    duration: 30,
    spawnInterval: 0.7,
    typeWeights: {
      [ENEMY_TYPE.GRUNT]: 2,
      [ENEMY_TYPE.CHASER]: 2,
      [ENEMY_TYPE.WANDERER]: 2,
      [ENEMY_TYPE.WEAVER]: 2,
      [ENEMY_TYPE.SHY]: 1,
      [ENEMY_TYPE.SPINNER]: 1,
    },
    formationChance: 0.6,
  },
  // Wave 5: Introduce spinners - things get dangerous
  {
    duration: 30,
    spawnInterval: 0.6,
    typeWeights: {
      [ENEMY_TYPE.GRUNT]: 2,
      [ENEMY_TYPE.CHASER]: 3,
      [ENEMY_TYPE.WANDERER]: 2,
      [ENEMY_TYPE.WEAVER]: 2,
      [ENEMY_TYPE.SHY]: 2,
      [ENEMY_TYPE.SPINNER]: 1,
    },
    formationChance: 0.6,
  },
];

function generateWave(waveNumber: number): WaveConfig {
  if (waveNumber <= WAVE_CONFIGS.length) {
    return WAVE_CONFIGS[waveNumber - 1];
  }

  // Procedural waves after predefined ones - spawn interval keeps decreasing
  const wavesPast = waveNumber - WAVE_CONFIGS.length;
  return {
    duration: 30 + waveNumber * 2,
    spawnInterval: Math.max(0.3, 0.6 - wavesPast * 0.03), // Gets faster, min 0.3s
    typeWeights: {
      [ENEMY_TYPE.GRUNT]: 2,
      [ENEMY_TYPE.CHASER]: 3 + Math.floor(wavesPast / 2),
      [ENEMY_TYPE.WANDERER]: 2 + Math.floor(wavesPast / 3),
      [ENEMY_TYPE.WEAVER]: 2 + Math.floor(wavesPast / 2),
      [ENEMY_TYPE.SHY]: 2 + Math.floor(wavesPast / 3),
      [ENEMY_TYPE.SPINNER]: 1 + Math.floor(wavesPast / 2),
    },
    formationChance: Math.min(0.8, 0.6 + wavesPast * 0.03),
  };
}

export class WaveManager {
  private currentWave: WaveConfig | null = null;
  private waveTimer = 0;
  private spawnTimer = 0;
  private intermissionTimer = 0;
  private isIntermission = false;
  private readonly worldWidth: number;
  private readonly worldHeight: number;

  // Difficulty scaling
  constructor(worldWidth: number, worldHeight: number) {
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  update(dt: number): void {
    if (gameState.isGameOver || gameState.isPaused) return;

    // Intermission between waves
    if (this.isIntermission) {
      this.intermissionTimer -= dt;
      if (this.intermissionTimer <= 0) {
        this.startNextWave();
      }
      return;
    }

    // Start first wave
    if (!this.currentWave) {
      this.startNextWave();
      return;
    }

    this.waveTimer -= dt;
    this.spawnTimer -= dt;

    // Spawn enemies continuously while wave is active
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.currentWave.spawnInterval;
      this.spawnEnemy();
    }

    // Try to spawn black hole (from wave 4+, low probability, only one at a time)
    if (gameState.waveNumber >= BLACK_HOLE_START_WAVE && !isBlackHoleActive()) {
      if (Math.random() < BLACK_HOLE_SPAWN_CHANCE) {
        // Spawn at random position (spawnBlackHole handles player distance check)
        const x = 200 + Math.random() * (this.worldWidth - 400);
        const y = 200 + Math.random() * (this.worldHeight - 400);
        spawnBlackHole(x, y);
      }
    }

    // Wave ends when timer expires - no waiting for screen clear
    if (this.waveTimer <= 0) {
      this.endWave();
    }
  }

  private startNextWave(): void {
    gameState.waveNumber++;
    this.currentWave = generateWave(gameState.waveNumber);
    this.waveTimer = this.currentWave.duration;
    this.spawnTimer = 0.5; // Brief delay before first spawn
    this.isIntermission = false;
    gameState.enemiesKilledThisWave = 0;
  }

  private endWave(): void {
    this.isIntermission = true;
    this.intermissionTimer = 3.0; // 3 second break between waves
    this.currentWave = null;

    // Bonus points for completing wave
    const waveBonus = gameState.waveNumber * 500;
    gameState.score += waveBonus;
  }

  private getMaxSpinners(): number {
    // Max spinners = wave + 1 - SPINNER_START_WAVE
    // Wave 3: 1, Wave 4: 2, Wave 5: 3, etc.
    if (gameState.waveNumber < SPINNER_START_WAVE) return 0;
    return gameState.waveNumber + 1 - SPINNER_START_WAVE;
  }

  private spawnEnemy(): void {
    if (!this.currentWave) return;

    let type = this.selectEnemyType();

    // Check spinner limit - if at max, pick a different type
    if (type === ENEMY_TYPE.SPINNER) {
      const maxSpinners = this.getMaxSpinners();
      const currentSpinners = getActiveSpinnerCount();
      if (currentSpinners >= maxSpinners) {
        // Pick a non-spinner type instead
        type = this.selectNonSpinnerType();
      }
    }

    // Spinners have special spawn rules: no formations, spawn singly
    if (type === ENEMY_TYPE.SPINNER) {
      const { x, y } = this.getEdgeSpawnPoint();
      createEnemy(x, y, type);
      return;
    }

    const useFormation = Math.random() < this.currentWave.formationChance;
    const { x, y, angle } = this.getEdgeSpawnPoint();

    if (useFormation) {
      this.spawnFormation(type, x, y, angle);
    } else {
      createEnemy(x, y, type);
    }
  }

  private selectNonSpinnerType(): number {
    if (!this.currentWave) return ENEMY_TYPE.GRUNT;

    // Build weights without spinner
    const weights = { ...this.currentWave.typeWeights };
    delete weights[ENEMY_TYPE.SPINNER];

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    if (totalWeight <= 0) return ENEMY_TYPE.GRUNT;

    let random = Math.random() * totalWeight;
    for (const [enemyType, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return parseInt(enemyType);
      }
    }
    return ENEMY_TYPE.GRUNT;
  }

  private selectEnemyType(): number {
    if (!this.currentWave) return ENEMY_TYPE.GRUNT;

    // Apply subtle color-based spawn bonus
    const colorIndex = (gameState.waveNumber - 1) % 4;
    const favoredType = COLOR_ENEMY_BONUS[colorIndex];

    // Copy weights and apply bonus if favored type is available
    const weights: Record<number, number> = { ...this.currentWave.typeWeights };
    if (weights[favoredType] !== undefined) {
      weights[favoredType] *= (1 + COLOR_SPAWN_BONUS);
    }

    const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (const [type, weight] of Object.entries(weights)) {
      random -= weight;
      if (random <= 0) {
        return parseInt(type);
      }
    }

    return ENEMY_TYPE.GRUNT;
  }

  private getEdgeSpawnPoint(): { x: number; y: number; angle: number } {
    const edge = Math.floor(Math.random() * 4);
    // Grid has 40px padding, so spawn just outside that
    const gridPadding = 40;
    const spawnOffset = 50; // Just outside visible grid
    const cornerPadding = 100;

    // Spawn area matches grid bounds (gridPadding to worldSize - gridPadding)
    const minX = gridPadding + cornerPadding;
    const maxX = this.worldWidth - gridPadding - cornerPadding;
    const minY = gridPadding + cornerPadding;
    const maxY = this.worldHeight - gridPadding - cornerPadding;

    switch (edge) {
      case 0: // left
        return { x: gridPadding - spawnOffset, y: minY + Math.random() * (maxY - minY), angle: 0 };
      case 1: // right
        return { x: this.worldWidth - gridPadding + spawnOffset, y: minY + Math.random() * (maxY - minY), angle: Math.PI };
      case 2: // top
        return { x: minX + Math.random() * (maxX - minX), y: gridPadding - spawnOffset, angle: Math.PI / 2 };
      default: // bottom
        return { x: minX + Math.random() * (maxX - minX), y: this.worldHeight - gridPadding + spawnOffset, angle: -Math.PI / 2 };
    }
  }

  private spawnFormation(type: number, baseX: number, baseY: number, angle: number): void {
    const formations = ['line', 'ring', 'random'] as const;
    const formation = formations[Math.floor(Math.random() * formations.length)];

    switch (formation) {
      case 'line':
        this.spawnLine(type, baseX, baseY, angle, 3 + Math.floor(Math.random() * 3));
        break;
      case 'ring':
        this.spawnRing(type, baseX, baseY, 5 + Math.floor(Math.random() * 4));
        break;
      case 'random':
        this.spawnRandom(type, baseX, baseY, 3 + Math.floor(Math.random() * 3));
        break;
    }
  }

  private clampSpawn(x: number, y: number): { x: number; y: number } {
    // Clamp to just outside grid bounds (grid has 40px padding)
    const gridPadding = 40;
    const margin = 50;
    return {
      x: Math.max(gridPadding - margin, Math.min(this.worldWidth - gridPadding + margin, x)),
      y: Math.max(gridPadding - margin, Math.min(this.worldHeight - gridPadding + margin, y)),
    };
  }

  private spawnLine(type: number, baseX: number, baseY: number, angle: number, count: number): void {
    const spacing = 40;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const startOffset = -((count - 1) * spacing) / 2;

    const indices: number[] = [];
    for (let i = 0; i < count; i++) {
      const offset = startOffset + i * spacing;
      const pos = this.clampSpawn(baseX + perpX * offset, baseY + perpY * offset);
      const enemy = createEnemy(pos.x, pos.y, type);
      indices.push(enemy.index);
    }

    // Set up formation with middle enemy as lead
    if (indices.length > 1) {
      const leadIdx = Math.floor(indices.length / 2);
      setupFormation(indices[leadIdx], indices);
    }
  }

  private spawnRing(type: number, baseX: number, baseY: number, count: number): void {
    const spacing = 50;
    const indices: number[] = [];

    // First spawn center enemy as the lead
    const centerPos = this.clampSpawn(baseX, baseY);
    const centerEnemy = createEnemy(centerPos.x, centerPos.y, type);
    indices.push(centerEnemy.index);

    // Then spawn ring around it
    for (let i = 0; i < count; i++) {
      const ringAngle = (i / count) * Math.PI * 2;
      const pos = this.clampSpawn(
        baseX + Math.cos(ringAngle) * spacing,
        baseY + Math.sin(ringAngle) * spacing
      );
      const enemy = createEnemy(pos.x, pos.y, type);
      indices.push(enemy.index);
    }

    // Set up formation with center enemy as lead
    if (indices.length > 1) {
      setupFormation(indices[0], indices);
    }
  }

  private spawnRandom(type: number, baseX: number, baseY: number, count: number): void {
    const spacing = 80;
    const indices: number[] = [];

    // First spawn center enemy as the lead
    const centerPos = this.clampSpawn(baseX, baseY);
    const centerEnemy = createEnemy(centerPos.x, centerPos.y, type);
    indices.push(centerEnemy.index);

    // Then spawn random positions around it
    for (let i = 1; i < count; i++) {
      const randAngle = Math.random() * Math.PI * 2;
      const randDist = Math.random() * spacing;
      const pos = this.clampSpawn(
        baseX + Math.cos(randAngle) * randDist,
        baseY + Math.sin(randAngle) * randDist
      );
      const enemy = createEnemy(pos.x, pos.y, type);
      indices.push(enemy.index);
    }

    // Set up formation with center enemy as lead
    if (indices.length > 1) {
      setupFormation(indices[0], indices);
    }
  }

  isInIntermission(): boolean {
    return this.isIntermission;
  }

  skipToWave(waveNumber: number): void {
    // Set wave number to one before target so startNextWave increments to target
    gameState.waveNumber = waveNumber - 1;
    this.currentWave = null;
    this.isIntermission = false;
    this.intermissionTimer = 0;
    this.startNextWave();
  }

  reset(): void {
    this.currentWave = null;
    this.waveTimer = 0;
    this.spawnTimer = 0;
    this.intermissionTimer = 0;
    this.isIntermission = false;
  }
}
