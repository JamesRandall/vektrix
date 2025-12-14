import { BaseScene, ISceneManager } from './Scene';
import { SceneContext } from './SceneContext';
import { updateInput, isKeyPressed, isSmartBombPressed, isPausePressed, isAnyNewInputPressed, requestPointerLock, gamepad, reticleOffset, pointerLock } from '../../engine/core/input';
import { camera } from '../../engine/core/camera';
import { addCameraShake, updateCameraShake, getShakeOffset } from '../../engine/core/cameraShake';
import { simulateGrid, applyGridImpulse } from '../../engine/grid/grid';
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLORS } from '../constants';
import { MenuState } from '../gameMenu';
import { MenuScene } from './MenuScene';
import { explodeText, PARTICLE_EFFECTS } from '../../engine/particles';
import { audioManager } from '../../engine/audio';

// Game imports
import { updatePlayer, getPlayerPosition, getPlayerIndex, getPlayerAimAngle, respawnPlayer } from '../player';
import { updateEnemies, getActiveEnemyIndices, destroyEnemy, getEnemyCount, createEnemy, ENEMY_TYPE, setupFormation } from '../enemies';
import { enemies, sprites, transforms } from '../../engine/ecs/components';
import { detectCollisions } from '../../engine/collision/collision';
import { destroyEntity, entities, getLiveEntityCount } from '../../engine/ecs/entity';
import { updateBullets, getActiveBulletIndices, destroyBullet, updateEnemyBullets, getActiveEnemyBulletIndices, destroyEnemyBullet, getBulletCount, getEnemyBulletCount } from '../bullets';
import {
  gameState,
  addScore,
  updateMultiplier,
  updatePlayerState,
  onPlayerHit,
  restartGame,
  isPlayerAlive,
  isPlayerInvulnerable,
  useBomb,
  addBombOnWaveStart,
  addLife,
} from '../gameState';
import { BudgetStats } from '../hud';
import {
  triggerSmartBomb,
  updateSmartBomb,
  getSmartBombState,
  resetSmartBomb,
} from '../smartBomb';
import {
  spawnBlackHole,
  updateBlackHole,
  collidesWithBlackHole,
  hitByBullet,
  getBlackHoleState,
  getBlackHoleWarp,
  isBlackHoleActive,
  resetBlackHole,
} from '../blackHole';
import {
  updatePlasmaBands,
  checkPlasmaCollision,
  resetPlasmaGraceTimer,
  clearPlasmaBands,
  getActiveBands,
  getClosestBandDistance,
  hasActiveBands,
} from '../plasmaBands';
import { getPlayer } from '../player';

/**
 * Main game scene - all gameplay logic
 */
export class GameScene extends BaseScene {
  // Wave tracking for audio events
  private lastWaveNumber = 0;
  private wasInIntermission = false;

  // FPS tracking
  private frameCount = 0;
  private fpsAccumulator = 0;
  private currentFps = 60;
  private currentFrameTime = 16.67;

  constructor(ctx: SceneContext, sceneManager: ISceneManager) {
    super(ctx, sceneManager);
  }

  onEnter(): void {
    // Reset tracking vars
    this.lastWaveNumber = gameState.waveNumber;
    this.wasInIntermission = false;
    // Lock pointer to prevent Mac menu bar appearing in fullscreen
    requestPointerLock();
  }

  update(dt: number, time: number): void {
    const { gameMenu } = this.ctx;

    // Check if back to menu
    if (gameMenu.getState() !== MenuState.PLAYING) {
      this.sceneManager.setScene(new MenuScene(this.ctx, this.sceneManager));
      return;
    }

    // Track frame timing
    this.frameCount++;
    this.fpsAccumulator += dt;
    this.currentFrameTime = dt * 1000;

    if (this.fpsAccumulator >= 0.5) {
      this.currentFps = this.frameCount / this.fpsAccumulator;
      this.frameCount = 0;
      this.fpsAccumulator = 0;
    }

    // Pause toggle (Q / L1) - for screenshots
    if (isPausePressed() && !gameState.isGameOver) {
      gameState.isPaused = !gameState.isPaused;
    }

    // Check for restart
    let justRestarted = false;
    if (isAnyNewInputPressed() && gameState.isGameOver) {
      this.handleRestart();
      justRestarted = true;
    }

    // Skip game updates when paused
    if (!gameState.isPaused) {
      this.updateGameLogic(dt, time, justRestarted);
    }

    updateInput();
  }

  private updateGameLogic(dt: number, time: number, justRestarted: boolean): void {
    const { canvas, grid, waveManager, shootingSystem, renderer, hud, particleSystem } = this.ctx;
    const proceduralSounds = this.ctx.proceduralSounds;
    const musicPlayer = this.ctx.musicPlayer;

    // Test mode: T key skips ahead 2 waves (disables high score)
    if (isKeyPressed('KeyT')) {
      gameState.cheatsUsed = true;
      // Clear all enemies
      for (const idx of getActiveEnemyIndices()) {
        destroyEnemy(idx);
        const handle = (entities.generation[idx] << 16) | idx;
        destroyEntity(handle);
      }
      // Clear all bullets
      for (const idx of getActiveBulletIndices()) {
        destroyBullet(idx);
      }
      // Clear all enemy bullets
      for (const idx of getActiveEnemyBulletIndices()) {
        destroyEnemyBullet(idx);
      }
      waveManager.skipToWave(gameState.waveNumber + 2);
    }

    // Test mode: I key toggles invulnerability (disables high score)
    if (isKeyPressed('KeyI')) {
      if (gameState.invulnerableTimer > 100) {
        gameState.invulnerableTimer = 0;
      } else {
        gameState.invulnerableTimer = 99999;
        gameState.cheatsUsed = true;
      }
    }

    // B key toggles budget display
    if (isKeyPressed('KeyB')) {
      hud.toggleBudget();
    }

    // H key spawns black hole (test mode)
    if (isKeyPressed('KeyH') && !isBlackHoleActive()) {
      const playerPos = getPlayerPosition();
      let bhX = WORLD_WIDTH / 2 + (Math.random() - 0.5) * 600;
      let bhY = WORLD_HEIGHT / 2 + (Math.random() - 0.5) * 400;
      const dx = bhX - playerPos.x;
      const dy = bhY - playerPos.y;
      if (Math.sqrt(dx * dx + dy * dy) < 300) {
        bhX = playerPos.x + (dx > 0 ? 400 : -400);
        bhY = playerPos.y + (dy > 0 ? 300 : -300);
      }
      spawnBlackHole(bhX, bhY);
    }

    // Music controls
    if (isKeyPressed('BracketLeft')) {
      musicPlayer?.previousTrack();
    }
    if (isKeyPressed('BracketRight')) {
      musicPlayer?.nextTrack();
    }

    // M key toggles mute
    if (isKeyPressed('KeyM')) {
      const current = audioManager.getMasterVolume();
      audioManager.setMasterVolume(current > 0 ? 0 : 1);
    }

    // +/- keys adjust music volume
    if (isKeyPressed('Equal')) {
      const current = audioManager.getMusicVolume();
      audioManager.setMusicVolume(Math.min(1, current + 0.1));
    }
    if (isKeyPressed('Minus')) {
      const current = audioManager.getMusicVolume();
      audioManager.setMusicVolume(Math.max(0, current - 0.1));
    }

    // F key toggles fullscreen
    if (isKeyPressed('KeyF')) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    }

    // Wave audio events and grid color
    const currentInIntermission = waveManager.isInIntermission();
    if (gameState.waveNumber > this.lastWaveNumber) {
      this.lastWaveNumber = gameState.waveNumber;
      proceduralSounds?.playWaveStart();

      const colorIndex = (gameState.waveNumber - 1) % GRID_COLORS.length;
      renderer.setGridColor(GRID_COLORS[colorIndex]);

      if (gameState.waveNumber > 1) {
        addBombOnWaveStart();
      }

      if (gameState.waveNumber % 4 === 0) {
        addLife();
      }
    }
    if (currentInIntermission && !this.wasInIntermission) {
      proceduralSounds?.playWaveComplete();
    }
    this.wasInIntermission = currentInIntermission;

    // Update game state
    updateMultiplier(dt);
    const { shouldRespawn } = updatePlayerState(dt);

    if (shouldRespawn) {
      respawnPlayer();
      proceduralSounds?.playRespawn();
      resetPlasmaGraceTimer();
      clearPlasmaBands();
    }

    // Update player
    updatePlayer(dt, WORLD_WIDTH, WORLD_HEIGHT, grid, time);

    // Update wave manager
    waveManager.update(dt);

    // Update enemies
    const playerPos = getPlayerPosition();
    const aimAngle = getPlayerAimAngle();
    updateEnemies(dt, playerPos.x, playerPos.y, aimAngle, grid, WORLD_WIDTH, WORLD_HEIGHT, gameState.isGameOver);

    // Update shooting
    if (isPlayerAlive()) {
      shootingSystem.update(dt, playerPos.x, playerPos.y, aimAngle, grid);
    }

    // Update bullets
    updateBullets(dt, grid);
    updateEnemyBullets(dt, grid);

    // Update plasma bands (anti-camping mechanic)
    if (isPlayerAlive()) {
      const player = getPlayer();
      const playerSpeed = player ? player.velocity.speed : 0;
      updatePlasmaBands(dt, playerSpeed, playerPos.x, playerPos.y);

      // Update plasma audio
      if (hasActiveBands()) {
        if (!proceduralSounds?.isPlasmaHumActive()) {
          proceduralSounds?.startPlasmaHum();
        }
        // Calculate intensity based on closest band distance
        const closestDist = getClosestBandDistance(playerPos.x, playerPos.y);
        const maxDist = 400; // Distance at which intensity is 0
        const intensity = Math.max(0, 1 - closestDist / maxDist);
        proceduralSounds?.updatePlasmaHum(intensity);
      } else {
        if (proceduralSounds?.isPlasmaHumActive()) {
          proceduralSounds?.stopPlasmaHum();
        }
      }

      // Check plasma collision
      if (!isPlayerInvulnerable() && checkPlasmaCollision(playerPos.x, playerPos.y)) {
        const wasHit = onPlayerHit();
        if (wasHit) {
          applyGridImpulse(grid, playerPos.x, playerPos.y, 300, 800);
          particleSystem.emit(PARTICLE_EFFECTS.playerDeath(playerPos.x, playerPos.y));
          proceduralSounds?.playPlayerDeath();
          proceduralSounds?.stopPlasmaHum();
          clearPlasmaBands();

          if (gameState.isGameOver) {
            proceduralSounds?.playGameOver();
            renderer.setSceneFade(0.25);
          }
        }
      }
    }

    // Update black hole
    this.updateBlackHole(dt, playerPos);

    // Smart bomb
    if (isPlayerAlive() && !justRestarted && isSmartBombPressed() && gameState.bombs > 0) {
      if (triggerSmartBomb(playerPos.x, playerPos.y)) {
        useBomb();
        addCameraShake(10);
        applyGridImpulse(grid, playerPos.x, playerPos.y, 300, 1200);
        proceduralSounds?.playMineExplosion();
      }
    }

    // Collision detection
    this.handleCollisions(playerPos);

    // Update smart bomb
    this.updateSmartBomb(dt);

    // Follow player with camera
    camera.follow(playerPos.x, playerPos.y, 0.1);

    // Update camera shake
    updateCameraShake(dt);

    // Simulate grid physics
    simulateGrid(grid, dt);

    // Update vector HUD
    this.ctx.vectorHud.update(gameState, canvas.width, canvas.height, time);

    // Draw smart bomb circle if active
    const bombState = getSmartBombState();
    if (bombState.active) {
      const bombColor: readonly number[] = [8.0, 2.0, 0.5];
      const shakeTemp = getShakeOffset();
      this.ctx.vectorHud.drawWorldCircle(
        bombState.centerX,
        bombState.centerY,
        bombState.radius,
        bombColor,
        camera.x + shakeTemp.x,
        camera.y + shakeTemp.y,
        camera.zoom,
        canvas.width,
        canvas.height,
        96,
        14
      );
    }
  }

  private updateBlackHole(dt: number, playerPos: { x: number; y: number }): void {
    const { grid, particleSystem } = this.ctx;
    const proceduralSounds = this.ctx.proceduralSounds;

    const bhResult = updateBlackHole(dt, playerPos.x, playerPos.y);
    if (bhResult) {
      const bhState = getBlackHoleState();
      addCameraShake(20);
      applyGridImpulse(grid, bhResult.x, bhResult.y, 500, 3000);
      proceduralSounds?.playMineExplosion();
      particleSystem.emit({
        x: bhResult.x, y: bhResult.y,
        count: 400,
        type: 0,
        color: [bhState.color[0] * 2, bhState.color[1] * 2, bhState.color[2] * 2],
        speedMin: 300, speedMax: 1200,
        sizeMin: 6, sizeMax: 20,
        lifetimeMin: 0.6, lifetimeMax: 2.0,
        spread: Math.PI * 2, direction: 0,
      });

      if (bhResult.shouldSpawn) {
        this.spawnBlackHoleEnemies(bhResult.x, bhResult.y);
      }
    }

    if (isBlackHoleActive()) {
      this.handleBlackHoleCollisions(playerPos);
      this.updateBlackHoleEffects(dt);
    }
  }

  private spawnBlackHoleEnemies(x: number, y: number): void {
    const spawnRadius = 100;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5;
      createEnemy(x + Math.cos(angle) * spawnRadius, y + Math.sin(angle) * spawnRadius, ENEMY_TYPE.WANDERER);
    }
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + Math.random() * 0.5 + 0.3;
      createEnemy(x + Math.cos(angle) * spawnRadius * 1.5, y + Math.sin(angle) * spawnRadius * 1.5, ENEMY_TYPE.WEAVER);
    }
    for (let i = 0; i < 2; i++) {
      const angle = (i / 2) * Math.PI * 2 + Math.random() * 0.5;
      createEnemy(x + Math.cos(angle) * spawnRadius * 0.5, y + Math.sin(angle) * spawnRadius * 0.5, ENEMY_TYPE.SPINNER);
    }

    const chaserIndices: number[] = [];
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const formationRadius = 60;
      const chaser = createEnemy(
        x + Math.cos(angle) * formationRadius,
        y + Math.sin(angle) * formationRadius,
        ENEMY_TYPE.CHASER
      );
      chaserIndices.push(chaser.index);
    }
    if (chaserIndices.length > 0) {
      setupFormation(chaserIndices[0], chaserIndices);
    }
  }

  private handleBlackHoleCollisions(playerPos: { x: number; y: number }): void {
    const { grid, particleSystem } = this.ctx;
    const proceduralSounds = this.ctx.proceduralSounds;
    const bhState = getBlackHoleState();

    // Player collision
    if (isPlayerAlive() && !isPlayerInvulnerable()) {
      const playerRadius = 20;
      if (collidesWithBlackHole(playerPos.x, playerPos.y, playerRadius)) {
        const wasHit = onPlayerHit();
        if (wasHit) {
          applyGridImpulse(grid, playerPos.x, playerPos.y, 300, 800);
          particleSystem.emit(PARTICLE_EFFECTS.playerDeath(playerPos.x, playerPos.y));
          proceduralSounds?.playPlayerDeath();
          if (gameState.isGameOver) {
            proceduralSounds?.playGameOver();
          }
        }
      }
    }

    // Enemy collision
    for (const idx of getActiveEnemyIndices()) {
      const ex = transforms.x[idx];
      const ey = transforms.y[idx];
      const enemyRadius = sprites.width[idx] / 2;
      if (collidesWithBlackHole(ex, ey, enemyRadius)) {
        particleSystem.emit(PARTICLE_EFFECTS.enemyDeath(ex, ey, [bhState.color[0], bhState.color[1], bhState.color[2]]));
        proceduralSounds?.playEnemyDeath();
        destroyEnemy(idx);
        const handle = (entities.generation[idx] << 16) | idx;
        destroyEntity(handle);
      }
    }

    // Bullet collision
    for (const idx of getActiveBulletIndices()) {
      const bx = transforms.x[idx];
      const by = transforms.y[idx];
      const bulletRadius = 4;
      if (collidesWithBlackHole(bx, by, bulletRadius)) {
        hitByBullet();
        destroyBullet(idx);
      }
    }
  }

  private updateBlackHoleEffects(dt: number): void {
    const { grid, particleSystem } = this.ctx;
    const bhState = getBlackHoleState();
    const warp = getBlackHoleWarp();

    if (warp) {
      applyGridImpulse(grid, warp.x, warp.y, warp.radius, -warp.strength * dt * 3);

      const edgePoints = 6;
      for (let i = 0; i < edgePoints; i++) {
        const angle = (i / edgePoints) * Math.PI * 2;
        const edgeX = warp.x + Math.cos(angle) * bhState.radius;
        const edgeY = warp.y + Math.sin(angle) * bhState.radius;
        applyGridImpulse(grid, edgeX, edgeY, 100, -warp.strength * dt * 0.5);
      }
    }

    // Fizz particles
    if (bhState.radius > 5) {
      const particleCount = Math.floor(3 + bhState.radius * 0.04);
      for (let p = 0; p < particleCount; p++) {
        const angle = Math.random() * Math.PI * 2;
        const edgeOffset = (Math.random() - 0.3) * 8;
        const px = bhState.x + Math.cos(angle) * (bhState.radius + edgeOffset);
        const py = bhState.y + Math.sin(angle) * (bhState.radius + edgeOffset);

        const directionType = Math.random();
        let particleAngle: number;
        if (directionType < 0.5) {
          particleAngle = angle + (Math.random() - 0.5) * 0.8;
        } else if (directionType < 0.7) {
          particleAngle = angle + Math.PI + (Math.random() - 0.5) * 0.6;
        } else {
          particleAngle = angle + Math.PI / 2 * (Math.random() > 0.5 ? 1 : -1) + (Math.random() - 0.5) * 0.4;
        }

        const brightness = 1.0 + Math.random() * 1.5;

        particleSystem.emit({
          x: px, y: py,
          count: 1,
          type: 0,
          color: [bhState.color[0] * brightness, bhState.color[1] * brightness, bhState.color[2] * brightness],
          speedMin: 20, speedMax: 180,
          sizeMin: 2, sizeMax: 8,
          lifetimeMin: 0.1, lifetimeMax: 0.5,
          spread: 0.5,
          direction: particleAngle,
        });
      }
    }
  }

  private handleCollisions(playerPos: { x: number; y: number }): void {
    const { grid, particleSystem, renderer } = this.ctx;
    const proceduralSounds = this.ctx.proceduralSounds;

    const playerIndex = getPlayerIndex();
    const enemyIndices = getActiveEnemyIndices();
    const bulletIndices = getActiveBulletIndices();
    const enemyBulletIndices = getActiveEnemyBulletIndices();
    const collisions = detectCollisions();

    for (const { a, b } of collisions) {
      const aIsPlayer = a === playerIndex;
      const bIsPlayer = b === playerIndex;
      const aIsEnemy = enemyIndices.has(a);
      const bIsEnemy = enemyIndices.has(b);
      const aIsBullet = bulletIndices.has(a);
      const bIsBullet = bulletIndices.has(b);
      const aIsEnemyBullet = enemyBulletIndices.has(a);
      const bIsEnemyBullet = enemyBulletIndices.has(b);

      // Player collides with enemy
      if ((aIsPlayer && bIsEnemy) || (bIsPlayer && aIsEnemy)) {
        if (isPlayerAlive() && !isPlayerInvulnerable()) {
          const enemyIdx = aIsEnemy ? a : b;
          const wasHit = onPlayerHit();

          if (wasHit) {
            applyGridImpulse(grid, playerPos.x, playerPos.y, 300, 800);
            particleSystem.emit(PARTICLE_EFFECTS.playerDeath(playerPos.x, playerPos.y));
            proceduralSounds?.playPlayerDeath();

            if (gameState.isGameOver) {
              proceduralSounds?.playGameOver();
              renderer.setSceneFade(0.25);
            }
          }

          const enemyColor: [number, number, number] = [
            sprites.tintR[enemyIdx],
            sprites.tintG[enemyIdx],
            sprites.tintB[enemyIdx],
          ];
          particleSystem.emit(PARTICLE_EFFECTS.enemyDeath(transforms.x[enemyIdx], transforms.y[enemyIdx], enemyColor));
          proceduralSounds?.playEnemyDeath();

          applyGridImpulse(grid, transforms.x[enemyIdx], transforms.y[enemyIdx], 300, 1000);
          addCameraShake();
          destroyEnemy(enemyIdx);
          const handle = (entities.generation[enemyIdx] << 16) | enemyIdx;
          destroyEntity(handle);
        }
      }

      // Enemy bullet collides with player
      if ((aIsPlayer && bIsEnemyBullet) || (bIsPlayer && aIsEnemyBullet)) {
        if (isPlayerAlive() && !isPlayerInvulnerable()) {
          const enemyBulletIdx = aIsEnemyBullet ? a : b;
          const wasHit = onPlayerHit();

          if (wasHit) {
            applyGridImpulse(grid, playerPos.x, playerPos.y, 300, 800);
            particleSystem.emit(PARTICLE_EFFECTS.playerDeath(playerPos.x, playerPos.y));
            proceduralSounds?.playPlayerDeath();

            if (gameState.isGameOver) {
              proceduralSounds?.playGameOver();
              renderer.setSceneFade(0.25);
            }
          }

          destroyEnemyBullet(enemyBulletIdx);
        }
      }

      // Bullet collides with enemy
      if ((aIsBullet && bIsEnemy) || (bIsBullet && aIsEnemy)) {
        const enemyIdx = aIsEnemy ? a : b;
        const bulletIdx = aIsBullet ? a : b;

        addScore(enemies.type[enemyIdx]);

        const enemyColor: [number, number, number] = [
          sprites.tintR[enemyIdx],
          sprites.tintG[enemyIdx],
          sprites.tintB[enemyIdx],
        ];
        particleSystem.emit(PARTICLE_EFFECTS.enemyDeath(transforms.x[enemyIdx], transforms.y[enemyIdx], enemyColor));

        const bulletAngle = transforms.rotation[bulletIdx];
        particleSystem.emit(PARTICLE_EFFECTS.bulletImpact(transforms.x[enemyIdx], transforms.y[enemyIdx], bulletAngle));

        proceduralSounds?.playEnemyDeath();
        proceduralSounds?.playBulletImpact();

        applyGridImpulse(grid, transforms.x[enemyIdx], transforms.y[enemyIdx], 300, 1000);
        addCameraShake();

        destroyEnemy(enemyIdx);
        const enemyHandle = (entities.generation[enemyIdx] << 16) | enemyIdx;
        destroyEntity(enemyHandle);

        destroyBullet(bulletIdx);
      }
    }
  }

  private updateSmartBomb(dt: number): void {
    const { grid, particleSystem } = this.ctx;
    const proceduralSounds = this.ctx.proceduralSounds;

    const enemyIndices = getActiveEnemyIndices();
    const bombHitEnemies = updateSmartBomb(
      dt,
      enemyIndices,
      (idx) => ({ x: transforms.x[idx], y: transforms.y[idx] })
    );

    const currentBombState = getSmartBombState();

    // Destroy enemy bullets caught in the blast
    if (currentBombState.active && currentBombState.radius > 0) {
      const enemyBulletIndices = getActiveEnemyBulletIndices();
      for (const bulletIdx of enemyBulletIndices) {
        const bx = transforms.x[bulletIdx];
        const by = transforms.y[bulletIdx];
        const dx = bx - currentBombState.centerX;
        const dy = by - currentBombState.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= currentBombState.radius) {
          destroyEnemyBullet(bulletIdx);
        }
      }
    }

    if (currentBombState.active && currentBombState.radius > 0) {
      const numImpulsePoints = 16;
      const impulseForce = 600;
      const impulseRadius = 80;

      for (let i = 0; i < numImpulsePoints; i++) {
        const angle = (i / numImpulsePoints) * Math.PI * 2;
        const px = currentBombState.centerX + Math.cos(angle) * currentBombState.radius;
        const py = currentBombState.centerY + Math.sin(angle) * currentBombState.radius;
        applyGridImpulse(grid, px, py, impulseRadius, impulseForce);
      }
    }

    if (bombHitEnemies.length > 0) {
      addCameraShake(Math.min(bombHitEnemies.length * 2, 8));
    }

    for (const enemyIdx of bombHitEnemies) {
      addScore(enemies.type[enemyIdx]);

      const enemyColor: [number, number, number] = [
        sprites.tintR[enemyIdx],
        sprites.tintG[enemyIdx],
        sprites.tintB[enemyIdx],
      ];
      const bombMixColor: [number, number, number] = [
        enemyColor[0] * 0.5 + 1.5,
        enemyColor[1] * 0.5 + 0.5,
        enemyColor[2] * 0.5 + 0.2,
      ];
      particleSystem.emit({
        x: transforms.x[enemyIdx],
        y: transforms.y[enemyIdx],
        count: 150,
        type: 0,
        color: bombMixColor,
        speedMin: 400,
        speedMax: 1000,
        sizeMin: 4,
        sizeMax: 14,
        lifetimeMin: 0.5,
        lifetimeMax: 1.2,
        spread: Math.PI * 2,
        direction: 0,
      });

      applyGridImpulse(grid, transforms.x[enemyIdx], transforms.y[enemyIdx], 250, 800);
      proceduralSounds?.playEnemyDeath();

      destroyEnemy(enemyIdx);
      const enemyHandle = (entities.generation[enemyIdx] << 16) | enemyIdx;
      destroyEntity(enemyHandle);
    }
  }

  private handleRestart(): void {
    const { grid, particleSystem, renderer, waveManager, proceduralSounds } = this.ctx;

    if (gameState.isGameOver) {
      proceduralSounds?.stopPlasmaHum();
      camera.x = WORLD_WIDTH / 2;
      camera.y = WORLD_HEIGHT / 2;
      const centerX = camera.x;
      const centerY = camera.y;
      const worldScale = 1 / camera.zoom;

      explodeText(particleSystem, 'GAME OVER', centerX, centerY, -160, 2.0, worldScale, [2.0, 0, 1.5], 30);
      explodeText(particleSystem, `SCORE  ${gameState.score.toLocaleString()}`, centerX, centerY, -40, 1.0, worldScale, [1.8, 1.8, 1.8], 20);
      explodeText(particleSystem, `HIGH  ${gameState.highScore.toLocaleString()}`, centerX, centerY, 40, 1.0, worldScale, [0, 2.0, 2.0], 20);
      explodeText(particleSystem, `WAVE  ${gameState.waveNumber}`, centerX, centerY, 120, 1.0, worldScale, [1.8, 1.8, 1.8], 20);
      explodeText(particleSystem, 'PRESS SPACE TO RESTART', centerX, centerY, 200, 0.8, worldScale, [0, 2.0, 2.0], 15);

      addCameraShake(12);
      applyGridImpulse(grid, centerX, centerY, 400, 800);

      for (const idx of getActiveEnemyIndices()) {
        destroyEnemy(idx);
        const handle = (entities.generation[idx] << 16) | idx;
        destroyEntity(handle);
      }

      for (const idx of getActiveBulletIndices()) {
        destroyBullet(idx);
      }

      resetSmartBomb();
      resetBlackHole();
      clearPlasmaBands();
      restartGame();
      waveManager.reset();
      respawnPlayer();

      renderer.setSceneFade(1.0);
      renderer.setGridColor(GRID_COLORS[0]);

      this.lastWaveNumber = 0;
      this.wasInIntermission = false;
    }
  }

  render(): void {
    const { canvas, grid, renderer, spriteRenderer, blackHoleRenderer, plasmaRenderer, particleSystem, vectorHud, hud } = this.ctx;
    const time = this.ctx.time;
    const dt = 1 / 60;

    const shake = getShakeOffset();
    const camX = camera.x + shake.x;
    const camY = camera.y + shake.y;

    const effectiveDt = gameState.isPaused ? 0 : dt;

    renderer.render(
      grid, dt, time, camX, camY, camera.zoom, WORLD_WIDTH, WORLD_HEIGHT,
      (encoder, hdrTarget) => {
        spriteRenderer.render(
          encoder,
          hdrTarget,
          WORLD_WIDTH,
          WORLD_HEIGHT,
          time,
          camX,
          camY,
          camera.zoom,
          renderer.getSceneFade()
        );

        particleSystem.update(encoder, effectiveDt, time);
        particleSystem.render(
          encoder,
          hdrTarget,
          WORLD_WIDTH,
          WORLD_HEIGHT,
          camX,
          camY,
          camera.zoom,
          time
        );
      },
      (encoder, hudTarget) => {
        // Draw reticle relative to player (only when not using gamepad)
        if (!gameState.isGameOver && !gamepad.connected && pointerLock.active) {
          const playerPos = getPlayerPosition();

          // Convert player world position to screen position
          const playerScreen = camera.worldToScreen(playerPos.x, playerPos.y);

          // Place reticle at player position + offset (offset is in screen pixels)
          const reticleX = playerScreen.x + reticleOffset.x;
          const reticleY = playerScreen.y + reticleOffset.y;

          vectorHud.drawReticle(reticleX, reticleY, 32, [0.4, 1.8, 2.0]);
        }
        vectorHud.render(encoder, hudTarget, canvas.width, canvas.height);
      },
      1.0,
      false,
      (encoder, sceneTarget) => {
        const bhFillState = getBlackHoleState();
        if (bhFillState.active) {
          const ringColor: readonly number[] = [
            bhFillState.color[0] * 2.0,
            bhFillState.color[1] * 2.0,
            bhFillState.color[2] * 2.0
          ];
          blackHoleRenderer.render(
            encoder, sceneTarget,
            WORLD_WIDTH, WORLD_HEIGHT,
            camX, camY, camera.zoom,
            bhFillState.x, bhFillState.y, bhFillState.radius,
            time, ringColor
          );
        }

        // Render plasma bands (using next wave's color)
        const activeBands = getActiveBands();
        if (activeBands.length > 0) {
          const nextWaveColorIndex = gameState.waveNumber % GRID_COLORS.length;
          plasmaRenderer.render(
            encoder, sceneTarget,
            WORLD_WIDTH, WORLD_HEIGHT,
            camX, camY, camera.zoom,
            time, activeBands,
            GRID_COLORS[nextWaveColorIndex]
          );
        }
      }
    );

    // Render budget display
    const budgetStats: BudgetStats = {
      fps: this.currentFps,
      frameTime: this.currentFrameTime,
      entityCount: getLiveEntityCount(),
      enemyCount: getEnemyCount(),
      bulletCount: getBulletCount(),
      enemyBulletCount: getEnemyBulletCount(),
      particleCount: particleSystem.getApproximateParticleCount(),
      drawCalls: 4,
    };
    hud.renderBudgetOnly(budgetStats);
  }
}
