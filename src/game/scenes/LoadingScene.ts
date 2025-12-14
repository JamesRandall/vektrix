import { BaseScene, ISceneManager } from './Scene';
import { SceneContext } from './SceneContext';
import { updateInput, isAnyStartInputPressed } from '../../engine/core/input';
import { addCameraShake } from '../../engine/core/cameraShake';
import { explodeText } from '../../engine/particles';
import { WORLD_WIDTH, WORLD_HEIGHT } from '../constants';
import { audioManager, MusicPlayer } from '../../engine/audio';
import { GridDrawScene } from './GridDrawScene';

/**
 * Loading scene - shows preload progress and "Press any key to start"
 */
export class LoadingScene extends BaseScene {
  private allTracksPreloaded = false;

  constructor(ctx: SceneContext, sceneManager: ISceneManager) {
    super(ctx, sceneManager);
  }

  onEnter(): void {
    // Start preloading music files immediately (doesn't need user gesture)
    this.ctx.musicPlayer = new MusicPlayer(audioManager);
    this.ctx.musicPlayer.preloadFiles((loaded, total, _ready) => {
      // Mark complete when all tracks are preloaded (or if no tracks found)
      this.allTracksPreloaded = (loaded >= total) || (total === 0);
    });
  }

  update(_dt: number, _time: number): void {
    const { canvas, particleSystem } = this.ctx;

    const screenHeight = canvas.height;
    const centerY = screenHeight / 2;

    // Check for key/mouse press to proceed (need real user gesture for AudioContext)
    if (this.allTracksPreloaded && isAnyStartInputPressed()) {
      // Explode the start screen text
      const worldCenterX = WORLD_WIDTH / 2;
      const worldCenterY = WORLD_HEIGHT / 2;
      const screenCenterY = screenHeight / 2;
      const worldScale = WORLD_HEIGHT / screenHeight;

      // "PRESS ANY KEY TO START" at centerY - 20
      const startTextYOffset = ((screenHeight / 2) - 20 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'PRESS ANY KEY TO START', worldCenterX, worldCenterY, startTextYOffset, 1.2, worldScale, [0.3, 0.6, 1.2], 15);

      // "GAMEPAD RECOMMENDED" at centerY + 60
      const subTextYOffset = (centerY + 60 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'GAMEPAD RECOMMENDED', worldCenterX, worldCenterY, subTextYOffset, 0.7, worldScale, [0.4, 0.4, 0.5], 10);

      // Warning text at bottom
      const warningYOffset = (screenHeight - 100 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'CONTAINS INTENSE FLASHING IMAGERY', worldCenterX, worldCenterY, warningYOffset, 0.7, worldScale, [0.4, 0.4, 0.5], 10);
      const warningYOffset2 = (screenHeight - 50 - screenCenterY) * worldScale;
      explodeText(particleSystem, 'NOT SUITABLE FOR THOSE WITH PHOTOSENSITIVE EPILEPSY', worldCenterX, worldCenterY, warningYOffset2, 0.7, worldScale, [0.4, 0.4, 0.5], 10);

      // Camera shake
      addCameraShake(8);

      // Initialize audio
      this.initAudio();

      // Transition to grid draw scene
      this.sceneManager.setScene(new GridDrawScene(this.ctx, this.sceneManager));
      return;
    }

    updateInput();
  }

  render(): void {
    const { canvas, vectorHud, gpuContext } = this.ctx;
    const encoder = gpuContext.device.createCommandEncoder();
    const textureView = gpuContext.context.getCurrentTexture().createView();

    // Clear to black
    const renderPass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      }],
    });
    renderPass.end();

    vectorHud.beginFrame();

    const screenWidth = canvas.width;
    const screenHeight = canvas.height;
    const centerX = screenWidth / 2;
    const centerY = screenHeight / 2;

    if (!this.allTracksPreloaded) {
      // Still loading - pulsing "LOADING" text
      const pulse = 0.7 + 0.3 * Math.sin(this.ctx.loadingAnimTime * 3);
      vectorHud.drawText('LOADING', centerX, centerY, [0.3 * pulse, 0.6 * pulse, 1.2 * pulse], 2.0, 'center');
    } else {
      // Ready - "Press any key to start"
      const pulse = 0.7 + 0.3 * Math.sin(this.ctx.loadingAnimTime * 3);
      vectorHud.drawText('PRESS ANY KEY TO START', centerX, centerY - 20, [0.3 * pulse, 0.6 * pulse, 1.2 * pulse], 1.2, 'center');
      vectorHud.drawText('GAMEPAD RECOMMENDED', centerX, centerY + 60, [0.4, 0.4, 0.5], 0.7, 'center');

      // Warning text at bottom
      vectorHud.drawText('CONTAINS INTENSE FLASHING IMAGERY', centerX, screenHeight - 100, [0.4, 0.4, 0.5], 0.7, 'center');
      vectorHud.drawText('NOT SUITABLE FOR THOSE WITH PHOTOSENSITIVE EPILEPSY', centerX, screenHeight - 50, [0.4, 0.4, 0.5], 0.7, 'center');
    }

    vectorHud.renderToSwapChain(encoder, textureView, screenWidth, screenHeight);

    gpuContext.device.queue.submit([encoder.finish()]);
  }

  private async initAudio(): Promise<void> {
    await audioManager.init();
    await audioManager.resume();

    const context = audioManager.getContext();
    const sfxGain = audioManager.getSFXGain();

    if (context && sfxGain) {
      const { ProceduralSounds } = await import('../../engine/audio');
      this.ctx.proceduralSounds = new ProceduralSounds(context, sfxGain);
    }

    // Decode preloaded tracks (or load fresh if preload didn't complete)
    if (this.ctx.musicPlayer) {
      await this.ctx.musicPlayer.loadTracksFromFolder();

      // Auto-play music if tracks available
      if (this.ctx.musicPlayer.hasMusic()) {
        this.ctx.musicPlayer.play();
      }
    }

    console.log('Audio initialized');
  }
}
