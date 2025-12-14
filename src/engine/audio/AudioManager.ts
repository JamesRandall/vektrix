// Audio manager - central audio system with Web Audio API

export class AudioManager {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;

  private soundBuffers: Map<string, AudioBuffer> = new Map();
  private initialized = false;

  // Volume levels (0-1)
  private masterVolume = 1.0;
  private sfxVolume = 0.7;
  private musicVolume = 0.5;

  /**
   * Initialize audio context (must be called from user gesture)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      this.context = new AudioContext();

      // Create gain node hierarchy
      this.masterGain = this.context.createGain();
      this.masterGain.connect(this.context.destination);
      this.masterGain.gain.value = this.masterVolume;

      this.sfxGain = this.context.createGain();
      this.sfxGain.connect(this.masterGain);
      this.sfxGain.gain.value = this.sfxVolume;

      this.musicGain = this.context.createGain();
      this.musicGain.connect(this.masterGain);
      this.musicGain.gain.value = this.musicVolume;

      this.initialized = true;
      console.log('Audio system initialized');
    } catch (e) {
      console.warn('Audio initialization failed:', e);
    }
  }

  /**
   * Resume context if suspended (browser autoplay policy)
   */
  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') {
      await this.context.resume();
    }
  }

  /**
   * Load and decode an audio file
   */
  async loadSound(name: string, url: string): Promise<void> {
    if (!this.context || this.soundBuffers.has(name)) return;

    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.context.decodeAudioData(arrayBuffer);
      this.soundBuffers.set(name, audioBuffer);
    } catch (e) {
      console.warn(`Failed to load sound "${name}":`, e);
    }
  }

  /**
   * Play a sound effect with optional variation
   */
  playSound(
    name: string,
    options: {
      volume?: number;
      pitch?: number;
      pan?: number; // -1 (left) to 1 (right)
    } = {}
  ): void {
    if (!this.context || !this.sfxGain) return;

    const buffer = this.soundBuffers.get(name);
    if (!buffer) return;

    const source = this.context.createBufferSource();
    source.buffer = buffer;

    // Pitch variation
    source.playbackRate.value = options.pitch ?? 1.0;

    // Create gain for this sound
    const gainNode = this.context.createGain();
    gainNode.gain.value = options.volume ?? 1.0;

    // Optional stereo panning
    if (options.pan !== undefined && options.pan !== 0) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      source.connect(panner);
      panner.connect(gainNode);
    } else {
      source.connect(gainNode);
    }

    gainNode.connect(this.sfxGain);
    source.start();
  }

  /**
   * Get the SFX gain node for ProceduralSounds connection
   */
  getSFXGain(): GainNode | null {
    return this.sfxGain;
  }

  /**
   * Get the music gain node for MusicPlayer connection
   */
  getMusicGain(): GainNode | null {
    return this.musicGain;
  }

  /**
   * Get the audio context
   */
  getContext(): AudioContext | null {
    return this.context;
  }

  // Volume controls
  setMasterVolume(v: number): void {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  setSFXVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) {
      this.musicGain.gain.value = this.musicVolume;
    }
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }
  getSFXVolume(): number {
    return this.sfxVolume;
  }
  getMusicVolume(): number {
    return this.musicVolume;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
export const audioManager = new AudioManager();
