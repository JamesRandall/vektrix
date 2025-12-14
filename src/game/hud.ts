import { GameState } from './gameState';

export interface BudgetStats {
  fps: number;
  frameTime: number;        // ms
  entityCount: number;
  enemyCount: number;
  bulletCount: number;
  enemyBulletCount: number;
  particleCount: number;
  drawCalls: number;
}

export class HUD {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private showBudget = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'hud-canvas';
    this.canvas.style.position = 'absolute';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '10';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;

    // Handle resize
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  toggleBudget(): void {
    this.showBudget = !this.showBudget;
  }

  isBudgetVisible(): boolean {
    return this.showBudget;
  }

  renderBudgetOnly(budgetStats: BudgetStats): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (this.showBudget) {
      this.renderBudget(budgetStats);
    }
  }

  render(state: GameState, time: number, budgetStats?: BudgetStats): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (state.isGameOver) {
      this.renderGameOver(state);
      return;
    }

    // Score (top left)
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(state.score.toLocaleString(), 24, 24);

    // Multiplier (below score)
    if (state.multiplier > 1) {
      const isDecaying = state.multiplierTimer <= 0;
      const pulse = isDecaying ? 0.5 + Math.sin(time * 8) * 0.3 : 1;
      ctx.globalAlpha = pulse;
      ctx.font = 'bold 24px "Courier New", monospace';
      ctx.fillStyle = '#ffff00';
      ctx.fillText(`x${state.multiplier.toFixed(1)}`, 24, 68);
      ctx.globalAlpha = 1;
    }

    // Wave number (top right)
    ctx.textAlign = 'right';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.fillStyle = '#ffffff';
    if (state.waveNumber > 0) {
      ctx.fillText(`WAVE ${state.waveNumber}`, w - 24, 24);
    }

    // High score (below wave)
    ctx.font = '18px "Courier New", monospace';
    ctx.fillStyle = '#666666';
    ctx.fillText(`HI ${state.highScore.toLocaleString()}`, w - 24, 60);

    // Lives (bottom left)
    ctx.textAlign = 'left';
    ctx.font = 'bold 24px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    const livesText = '♦'.repeat(state.lives);
    ctx.fillText(livesText, 24, h - 36);

    // Mines (below lives)
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillStyle = '#ffff00';
    const minesText = '●'.repeat(state.mines);
    const emptyMines = '○'.repeat(5 - state.mines);
    ctx.fillText(minesText + emptyMines, 24, h - 64);

    // Invulnerability indicator (flashing player indicator)
    if (state.invulnerableTimer > 0 && state.isAlive) {
      const flash = Math.sin(time * 15) > 0;
      if (flash) {
        ctx.font = '16px "Courier New", monospace';
        ctx.fillStyle = '#00ffff';
        ctx.fillText('SHIELD', 24, h - 64);
      }
    }

    // Respawn countdown
    if (!state.isAlive && !state.isGameOver) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 32px "Courier New", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`RESPAWNING...`, w / 2, h / 2);
    }

    // Budget display (bottom right)
    if (this.showBudget && budgetStats) {
      this.renderBudget(budgetStats);
    }
  }

  private renderBudget(stats: BudgetStats): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    const lineHeight = 18;
    const padding = 12;
    const panelWidth = 200;
    const lines = [
      `FPS: ${stats.fps.toFixed(0)}`,
      `Frame: ${stats.frameTime.toFixed(2)}ms`,
      `───────────────`,
      `Entities: ${stats.entityCount}`,
      `Enemies: ${stats.enemyCount}`,
      `Bullets: ${stats.bulletCount}`,
      `Enemy Bullets: ${stats.enemyBulletCount}`,
      `Particles: ${stats.particleCount}`,
      `───────────────`,
      `Draw Calls: ${stats.drawCalls}`,
    ];
    const panelHeight = lines.length * lineHeight + padding * 2;

    const x = w - panelWidth - 24;
    const y = h - panelHeight - 24;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(x, y, panelWidth, panelHeight);

    // Border
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, panelWidth, panelHeight);

    // Title
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillStyle = '#00ff00';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Stats
    ctx.font = '13px "Courier New", monospace';
    lines.forEach((line, i) => {
      // Color code based on content
      if (line.startsWith('FPS')) {
        ctx.fillStyle = stats.fps >= 55 ? '#00ff00' : stats.fps >= 30 ? '#ffff00' : '#ff0000';
      } else if (line.startsWith('Frame')) {
        ctx.fillStyle = stats.frameTime <= 18 ? '#00ff00' : stats.frameTime <= 33 ? '#ffff00' : '#ff0000';
      } else if (line.includes('───')) {
        ctx.fillStyle = '#444444';
      } else {
        ctx.fillStyle = '#00ff00';
      }
      ctx.fillText(line, x + padding, y + padding + i * lineHeight);
    });
  }

  private renderGameOver(state: GameState): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Darken background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Game Over text
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillStyle = '#ff0066';
    ctx.fillText('GAME OVER', w / 2, h / 2 - 80);

    // Final score
    ctx.font = 'bold 36px "Courier New", monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${state.score.toLocaleString()}`, w / 2, h / 2);

    // High score
    if (state.score >= state.highScore && state.score > 0) {
      ctx.font = 'bold 28px "Courier New", monospace';
      ctx.fillStyle = '#ffff00';
      ctx.fillText('NEW HIGH SCORE!', w / 2, h / 2 + 50);
    } else {
      ctx.font = '24px "Courier New", monospace';
      ctx.fillStyle = '#666666';
      ctx.fillText(`HIGH SCORE: ${state.highScore.toLocaleString()}`, w / 2, h / 2 + 50);
    }

    // Wave reached
    ctx.font = '24px "Courier New", monospace';
    ctx.fillStyle = '#00ffff';
    ctx.fillText(`WAVE ${state.waveNumber}`, w / 2, h / 2 + 100);

    // Restart prompt
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = '#888888';
    ctx.fillText('PRESS SPACE OR CLICK TO RESTART', w / 2, h / 2 + 160);
  }

  destroy(): void {
    this.canvas.remove();
  }
}
