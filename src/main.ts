import { initWebGPU, resizeCanvas } from './engine/core/device';
import { GameLoop } from './engine/core/loop';
import { initInput, pollInput } from './engine/core/input';
import { camera } from './engine/core/camera';
import { createGrid, GridState } from './engine/grid/grid';
import { Renderer } from './engine/rendering/renderer';
import { SpriteRenderer } from './engine/rendering/spriteRenderer';
import { createPlayer, respawnPlayer } from './game/player';
import { WaveManager } from './game/waveManager';
import { loadHighScore } from './game/gameState';
import { HUD } from './game/hud';
import { VectorHUD } from './game/vectorHud';
import { GameMenu } from './game/gameMenu';
import hudLineShader from './engine/rendering/shaders/hudLine.wgsl';
import { ParticleSystem, PARTICLE_EFFECTS } from './engine/particles';
import { WORLD_WIDTH, WORLD_HEIGHT } from './game/constants';
import { BlackHoleRenderer } from './engine/rendering/blackHoleRenderer';
import { PlasmaRenderer } from './engine/rendering/plasmaRenderer';
import { ShootingSystem } from './game/bullets';
import { applyGridImpulse } from './engine/grid/grid';
import { addCameraShake } from './engine/core/cameraShake';
import { explodeText } from './engine/particles';

// Scene system
import { SceneManager } from './game/scenes/SceneManager';
import { createSceneContext } from './game/scenes/SceneContext';
import { LoadingScene } from './game/scenes/LoadingScene';

async function main() {
  const canvas = document.getElementById('canvas') as HTMLCanvasElement;

  if (!navigator.gpu) {
    document.body.innerHTML = '<h1 style="color:white;padding:2rem;">WebGPU not supported</h1>';
    return;
  }

  console.log('Vektrix initialising...');

  // Initialize WebGPU
  const gpuContext = await initWebGPU(canvas);
  console.log('WebGPU initialized');

  // Initial canvas resize
  resizeCanvas(canvas, gpuContext.device, gpuContext.context, gpuContext.format);

  // Setup input
  initInput(canvas);

  // Load saved data
  loadHighScore();

  // Create grid with FIXED world size (never recreated on resize)
  const grid: GridState = createGrid(WORLD_WIDTH, WORLD_HEIGHT);

  // Create renderers
  const renderer = new Renderer(gpuContext);
  const spriteRenderer = new SpriteRenderer(gpuContext.device);
  const blackHoleRenderer = new BlackHoleRenderer(gpuContext.device);
  const plasmaRenderer = new PlasmaRenderer(gpuContext.device);

  // Create particle system
  const particleSystem = new ParticleSystem(gpuContext.device, 'rgba16float');

  // Create HUD (Canvas 2D for budget display only)
  const hud = new HUD();

  // Create Vector HUD (WebGPU for main game HUD)
  const vectorHud = new VectorHUD(gpuContext.device);

  // Create shader module for menu (reuse HUD shader)
  const menuShaderModule = gpuContext.device.createShaderModule({
    code: hudLineShader,
    label: 'Menu Shader',
  });

  // Create game menu
  const gameMenu = new GameMenu(gpuContext.device, menuShaderModule);

  // Setup camera
  camera.zoom = 2;
  camera.setWorldSize(WORLD_WIDTH, WORLD_HEIGHT);
  camera.setScreenSize(canvas.width, canvas.height);
  camera.x = WORLD_WIDTH / 2;
  camera.y = WORLD_HEIGHT / 2;

  // Create player at center
  createPlayer(WORLD_WIDTH / 2, WORLD_HEIGHT / 2);

  // Create wave manager
  const waveManager = new WaveManager(WORLD_WIDTH, WORLD_HEIGHT);

  // Create shooting system
  const shootingSystem = new ShootingSystem();

  // Create scene context
  const sceneContext = createSceneContext(
    gpuContext,
    renderer,
    spriteRenderer,
    blackHoleRenderer,
    plasmaRenderer,
    particleSystem,
    vectorHud,
    hud,
    grid,
    gameMenu,
    waveManager,
    shootingSystem,
    canvas
  );

  // Create scene manager and start with loading scene
  const sceneManager = new SceneManager(sceneContext);
  sceneManager.setScene(new LoadingScene(sceneContext, sceneManager));

  // Menu callbacks (need access to scene context resources)
  gameMenu.setCallbacks(
    // onStartGame - called immediately when New Game selected
    () => {
      respawnPlayer();
      particleSystem.emit(PARTICLE_EFFECTS.playerDeath(WORLD_WIDTH / 2, WORLD_HEIGHT / 2));
      applyGridImpulse(grid, WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 200, 800);
    },
    // onToggleFullscreen
    () => {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        document.documentElement.requestFullscreen();
      }
    },
    // onStartAnimation - explode menu text when New Game selected
    (_screenWidth: number, screenHeight: number) => {
      const centerX = WORLD_WIDTH / 2;
      const centerY = WORLD_HEIGHT / 2;
      const worldScale = 1 / camera.zoom;
      const screenCenterY = screenHeight / 2;

      // Explode title "VECTRIX" at y=100
      const titleYOffset = (100 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'VECTRIX', centerX, centerY, titleYOffset, 3.5, worldScale, [0.5, 0.8, 2.0], 25);

      // Explode menu items
      const menuY = screenHeight / 2 - 40;
      const itemHeight = 60;
      const menuItems = ['NEW GAME', 'FULL SCREEN  F', 'CONTROLS'];
      for (let i = 0; i < menuItems.length; i++) {
        const itemYOffset = (menuY + i * itemHeight - screenCenterY) * worldScale;
        explodeText(particleSystem, menuItems[i], centerX, centerY, itemYOffset, 1.0, worldScale, [2.0, 0.5, 0.3], 15);
      }

      // Explode website link
      const linkYOffset = (screenHeight - 50 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'JAMESDRANDALL.COM', centerX, centerY, linkYOffset, 0.5, worldScale, [0.3, 1.5, 1.5], 10);

      // Sound and shake
      addCameraShake(8);
      sceneContext.proceduralSounds?.playEnemyDeath();
    },
    // onNavigate - ripple when moving between menu items
    (screenX: number, screenY: number) => {
      const worldX = WORLD_WIDTH / 2 + (screenX - canvas.width / 2) / camera.zoom;
      const worldY = WORLD_HEIGHT / 2 + (screenY - canvas.height / 2) / camera.zoom;
      applyGridImpulse(grid, worldX, worldY, 200, 1200);
    }
  );

  // Setup shooting system callback
  shootingSystem.setOnShoot(() => {
    sceneContext.proceduralSounds?.playShoot();
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    resizeCanvas(canvas, gpuContext.device, gpuContext.context, gpuContext.format);
    camera.setScreenSize(canvas.width, canvas.height);
  });

  // Game loop
  let time = 0;

  const loop = new GameLoop((dt) => {
    time += dt;

    // Poll gamepad state
    pollInput();

    // Update and render current scene
    sceneManager.update(dt, time);
    sceneManager.render();
  });

  loop.start();
  console.log('Game loop started - Use WASD to move, mouse to aim, left-click to shoot');
}

main().catch(console.error);
