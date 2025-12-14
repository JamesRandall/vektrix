# Vektrix Delivery Plan - Part 4

Continuation of the phased delivery plan covering audio systems including sound effects and background music.

---

## Phase 8: Audio System

**Goal:** Add immersive audio feedback through sound effects and background music. Sound effects provide immediate feedback for game events, while background music creates atmosphere and intensity. The music system cycles through available tracks with player controls.

### 8.1 Architecture Overview

Web Audio API provides low-latency sound playback with mixing, effects, and spatial positioning.

```
┌─────────────────────────────────────────────────────────────────┐
│                      Audio Architecture                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AudioManager                                                   │
│    ├── AudioContext (Web Audio API)                             │
│    ├── MasterGain (volume control)                              │
│    │     ├── SFXGain (sound effects bus)                        │
│    │     │     └── Individual sound sources                     │
│    │     └── MusicGain (music bus)                              │
│    │           └── Current track source                         │
│    └── Sound pool (pre-decoded audio buffers)                   │
│                                                                 │
│  MusicPlayer                                                    │
│    ├── Track list (loaded from ./music/*.mp3)                   │
│    ├── Current track index                                      │
│    ├── Playback state (playing, paused)                         │
│    └── Crossfade support                                        │
│                                                                 │
│  SoundEffects                                                   │
│    ├── Pre-loaded buffers for each effect type                  │
│    ├── Pooled sources for concurrent playback                   │
│    └── Pitch/volume variation for organic feel                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key Design Decisions:**
- **Single AudioContext**: Shared across all audio, created on first user interaction
- **Gain node hierarchy**: Master → Category (SFX/Music) → Individual sounds
- **Pre-decoded buffers**: All sounds decoded at load time for instant playback
- **Sound pooling**: Reuse AudioBufferSourceNodes to reduce garbage collection
- **Graceful degradation**: No music if ./music folder is empty

### 8.2 AudioManager Core

Central audio system managing context and routing.

```typescript
// src/engine/audio/AudioManager.ts

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
      pan?: number;  // -1 (left) to 1 (right)
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

  getMasterVolume(): number { return this.masterVolume; }
  getSFXVolume(): number { return this.sfxVolume; }
  getMusicVolume(): number { return this.musicVolume; }

  isInitialized(): boolean {
    return this.initialized;
  }
}

// Singleton instance
export const audioManager = new AudioManager();
```

**Deliverable:** Core audio manager with context, routing, and sound loading.

### 8.3 Music Player

Background music system that cycles through tracks from the ./music folder.

```typescript
// src/engine/audio/MusicPlayer.ts

export interface MusicTrack {
  name: string;
  url: string;
  buffer: AudioBuffer | null;
}

export class MusicPlayer {
  private audioManager: AudioManager;
  private tracks: MusicTrack[] = [];
  private currentTrackIndex = -1;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseTime = 0;

  constructor(audioManager: AudioManager) {
    this.audioManager = audioManager;
  }

  /**
   * Scan and load all MP3 files from the music folder
   */
  async loadTracksFromFolder(): Promise<void> {
    const context = this.audioManager.getContext();
    if (!context) return;

    // Fetch list of music files
    // In production, this would be a manifest or API endpoint
    // For dev, we'll try known files or use a manifest
    const musicFiles = await this.discoverMusicFiles();

    if (musicFiles.length === 0) {
      console.log('No music files found in ./music folder');
      return;
    }

    // Load each track
    for (const file of musicFiles) {
      try {
        const response = await fetch(`/music/${file}`);
        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);

        this.tracks.push({
          name: file.replace('.mp3', '').replace(/-/g, ' '),
          url: `/music/${file}`,
          buffer: audioBuffer,
        });

        console.log(`Loaded music track: ${file}`);
      } catch (e) {
        console.warn(`Failed to load music track: ${file}`, e);
      }
    }

    console.log(`Loaded ${this.tracks.length} music tracks`);
  }

  /**
   * Discover music files (implementation depends on build setup)
   */
  private async discoverMusicFiles(): Promise<string[]> {
    // Option 1: Try to fetch a manifest file
    try {
      const response = await fetch('/music/manifest.json');
      if (response.ok) {
        const manifest = await response.json();
        return manifest.files || [];
      }
    } catch { /* ignore */ }

    // Option 2: Try known files (from Vite's static asset handling)
    // In production, generate manifest at build time
    const knownFiles = [
      'club-ready-407769.mp3',
      'road-to-nowhere_medium-2-188062.mp3',
      'super-soldier-126282.mp3',
      'thrash-metal-instrumental-for-intense-gaming-265085.mp3',
    ];

    const validFiles: string[] = [];
    for (const file of knownFiles) {
      try {
        const response = await fetch(`/music/${file}`, { method: 'HEAD' });
        if (response.ok) {
          validFiles.push(file);
        }
      } catch { /* ignore */ }
    }

    return validFiles;
  }

  /**
   * Start playing music from current track (or first if none selected)
   */
  play(): void {
    if (this.tracks.length === 0) return;

    if (this.currentTrackIndex < 0) {
      this.currentTrackIndex = 0;
    }

    this.playTrack(this.currentTrackIndex);
  }

  /**
   * Play a specific track by index
   */
  private playTrack(index: number): void {
    const context = this.audioManager.getContext();
    const musicGain = this.audioManager.getMusicGain();
    if (!context || !musicGain) return;

    // Stop current track
    this.stopCurrentSource();

    const track = this.tracks[index];
    if (!track?.buffer) return;

    this.currentSource = context.createBufferSource();
    this.currentSource.buffer = track.buffer;
    this.currentSource.connect(musicGain);

    // Loop within track and auto-advance when done
    this.currentSource.loop = false;
    this.currentSource.onended = () => {
      if (this.isPlaying) {
        this.nextTrack();
      }
    };

    const offset = this.pauseTime > 0 ? this.pauseTime : 0;
    this.currentSource.start(0, offset);
    this.startTime = context.currentTime - offset;
    this.pauseTime = 0;
    this.isPlaying = true;

    console.log(`Now playing: ${track.name}`);
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isPlaying || !this.currentSource) return;

    const context = this.audioManager.getContext();
    if (context) {
      this.pauseTime = context.currentTime - this.startTime;
    }

    this.stopCurrentSource();
    this.isPlaying = false;
  }

  /**
   * Resume playback
   */
  resume(): void {
    if (this.isPlaying || this.currentTrackIndex < 0) return;
    this.playTrack(this.currentTrackIndex);
  }

  /**
   * Toggle play/pause
   */
  togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  /**
   * Skip to next track
   */
  nextTrack(): void {
    if (this.tracks.length === 0) return;

    this.pauseTime = 0;
    this.currentTrackIndex = (this.currentTrackIndex + 1) % this.tracks.length;

    if (this.isPlaying || this.currentSource) {
      this.playTrack(this.currentTrackIndex);
    }
  }

  /**
   * Go to previous track
   */
  previousTrack(): void {
    if (this.tracks.length === 0) return;

    this.pauseTime = 0;
    this.currentTrackIndex = (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;

    if (this.isPlaying || this.currentSource) {
      this.playTrack(this.currentTrackIndex);
    }
  }

  /**
   * Stop current source node
   */
  private stopCurrentSource(): void {
    if (this.currentSource) {
      try {
        this.currentSource.onended = null;
        this.currentSource.stop();
      } catch { /* ignore */ }
      this.currentSource.disconnect();
      this.currentSource = null;
    }
  }

  /**
   * Stop all music playback
   */
  stop(): void {
    this.stopCurrentSource();
    this.isPlaying = false;
    this.pauseTime = 0;
  }

  // Getters
  getCurrentTrackName(): string | null {
    if (this.currentTrackIndex < 0 || this.currentTrackIndex >= this.tracks.length) {
      return null;
    }
    return this.tracks[this.currentTrackIndex].name;
  }

  getTrackCount(): number {
    return this.tracks.length;
  }

  getCurrentTrackIndex(): number {
    return this.currentTrackIndex;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  hasMusic(): boolean {
    return this.tracks.length > 0;
  }
}
```

**Deliverable:** Music player with track cycling and play controls.

### 8.4 Sound Effect Definitions

Pre-defined sound effects for game events.

```typescript
// src/engine/audio/SoundEffects.ts

export enum SoundEffect {
  // Player sounds
  PLAYER_SHOOT = 'player_shoot',
  PLAYER_DEATH = 'player_death',
  PLAYER_RESPAWN = 'player_respawn',

  // Enemy sounds
  ENEMY_DEATH = 'enemy_death',
  ENEMY_SPAWN = 'enemy_spawn',

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
  cooldown?: number;  // Minimum ms between plays (prevents spam)
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
    pitchMax: 1.5,  // Pitch up with multiplier
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
```

**Deliverable:** Sound effect definitions with variation parameters.

### 8.5 Procedural Sound Generation

Generate simple sound effects using Web Audio oscillators (no external assets required).

```typescript
// src/engine/audio/ProceduralSounds.ts

export class ProceduralSounds {
  private context: AudioContext;
  private destination: AudioNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.context = context;
    this.destination = destination;
  }

  /**
   * Laser/shoot sound - quick frequency sweep down
   */
  playShoot(volume = 0.3): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.1);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Explosion sound - noise burst with low frequency rumble
   */
  playExplosion(volume = 0.5, duration = 0.3): void {
    const now = this.context.currentTime;

    // Noise burst
    const bufferSize = this.context.sampleRate * duration;
    const buffer = this.context.createBuffer(1, bufferSize, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }

    const noise = this.context.createBufferSource();
    noise.buffer = buffer;

    // Low-pass filter for rumble
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + duration);

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.destination);

    noise.start(now);
  }

  /**
   * Enemy death - quick descending tone
   */
  playEnemyDeath(volume = 0.4): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sawtooth';
    const startFreq = 400 + Math.random() * 200;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Player death - longer, more dramatic explosion
   */
  playPlayerDeath(volume = 0.7): void {
    const now = this.context.currentTime;

    // Multiple oscillators for richer sound
    for (let i = 0; i < 3; i++) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = i === 0 ? 'sawtooth' : 'square';
      const startFreq = 300 - i * 100;
      osc.frequency.setValueAtTime(startFreq, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5 + i * 0.1);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume * (1 - i * 0.2), now + 0.02 + i * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5 + i * 0.1);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    }

    // Add noise component
    this.playExplosion(volume * 0.5, 0.4);
  }

  /**
   * Wave start - rising tone
   */
  playWaveStart(volume = 0.5): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.1);
    gain.gain.linearRampToValueAtTime(volume, now + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Score/multiplier increase - quick ascending beep
   */
  playScoreBeep(pitch = 1.0, volume = 0.3): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(660 * pitch, now);
    osc.frequency.setValueAtTime(880 * pitch, now + 0.05);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Game over - descending sad tones
   */
  playGameOver(volume = 0.6): void {
    const now = this.context.currentTime;
    const notes = [440, 392, 349, 330]; // A, G, F, E

    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.2);

      gain.gain.setValueAtTime(0, now + i * 0.2);
      gain.gain.linearRampToValueAtTime(volume, now + i * 0.2 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.25);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.3);
    });
  }
}
```

**Deliverable:** Procedurally generated sounds for all game events.

### 8.6 Spatial Audio (Optional Enhancement)

Position-based sound for stereo panning based on world position.

```typescript
// src/engine/audio/SpatialAudio.ts

export function calculatePan(
  soundX: number,
  soundY: number,
  listenerX: number,
  listenerY: number,
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
```

**Deliverable:** Helper functions for spatial sound positioning.

### 8.7 Audio Integration

Wire audio system into game events.

```typescript
// src/engine/audio/index.ts

export { AudioManager, audioManager } from './AudioManager';
export { MusicPlayer } from './MusicPlayer';
export { ProceduralSounds } from './ProceduralSounds';
export { SoundEffect, SOUND_CONFIGS } from './SoundEffects';
export { calculatePan, calculateVolume } from './SpatialAudio';
```

```typescript
// In main.ts - Audio setup and integration

import { audioManager, MusicPlayer, ProceduralSounds } from './engine/audio';

// Initialize audio on first user interaction
let audioInitialized = false;
let musicPlayer: MusicPlayer | null = null;
let proceduralSounds: ProceduralSounds | null = null;

async function initAudio(): Promise<void> {
  if (audioInitialized) return;

  await audioManager.init();

  const context = audioManager.getContext();
  const sfxGain = audioManager.getMusicGain(); // Connect procedural sounds to SFX bus

  if (context && sfxGain) {
    proceduralSounds = new ProceduralSounds(context, sfxGain);
  }

  // Initialize music player
  musicPlayer = new MusicPlayer(audioManager);
  await musicPlayer.loadTracksFromFolder();

  // Auto-play music if tracks available
  if (musicPlayer.hasMusic()) {
    musicPlayer.play();
  }

  audioInitialized = true;
}

// Call on first click/key
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('keydown', () => initAudio(), { once: true });

// In game loop - handle music controls
if (isKeyPressed('BracketRight')) {  // ] key
  musicPlayer?.nextTrack();
}
if (isKeyPressed('BracketLeft')) {   // [ key
  musicPlayer?.previousTrack();
}

// Play sounds on game events
function onPlayerShoot(): void {
  proceduralSounds?.playShoot();
}

function onEnemyDeath(x: number, y: number): void {
  const pan = calculatePan(x, y, playerPos.x, playerPos.y, WORLD_WIDTH);
  // Could use pan for positioned audio
  proceduralSounds?.playEnemyDeath();
}

function onPlayerDeath(): void {
  proceduralSounds?.playPlayerDeath();
}

function onWaveStart(): void {
  proceduralSounds?.playWaveStart();
}

function onGameOver(): void {
  proceduralSounds?.playGameOver();
}
```

**Deliverable:** Full audio integration with game events.

### 8.8 Music Track Manifest

For production builds, generate a manifest of available music files.

```json
// public/music/manifest.json
{
  "files": [
    "club-ready-407769.mp3",
    "road-to-nowhere_medium-2-188062.mp3",
    "super-soldier-126282.mp3",
    "thrash-metal-instrumental-for-intense-gaming-265085.mp3"
  ]
}
```

**Deliverable:** Music manifest for track discovery.

### 8.9 HUD Music Display (Optional)

Show current track info on screen.

```typescript
// Add to HUD class

renderMusicInfo(musicPlayer: MusicPlayer | null): void {
  if (!musicPlayer?.hasMusic()) return;

  const ctx = this.ctx;
  const trackName = musicPlayer.getCurrentTrackName();

  if (trackName) {
    ctx.font = '14px "Courier New", monospace';
    ctx.fillStyle = '#666666';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';

    const status = musicPlayer.getIsPlaying() ? '♫' : '❚❚';
    ctx.fillText(`${status} ${trackName}`, 24, this.canvas.height - 60);

    // Track navigation hint
    ctx.font = '12px "Courier New", monospace';
    ctx.fillStyle = '#444444';
    ctx.fillText('[ ] prev/next track', 24, this.canvas.height - 80);
  }
}
```

**Deliverable:** On-screen music track display.

### 8.10 Volume Controls

Keyboard controls for volume adjustment.

```typescript
// Volume control keys
const VOLUME_STEP = 0.1;

// M key - toggle mute
if (isKeyPressed('KeyM')) {
  const current = audioManager.getMasterVolume();
  audioManager.setMasterVolume(current > 0 ? 0 : 1);
}

// +/- keys for music volume
if (isKeyPressed('Equal')) {  // + key
  const current = audioManager.getMusicVolume();
  audioManager.setMusicVolume(Math.min(1, current + VOLUME_STEP));
}
if (isKeyPressed('Minus')) {  // - key
  const current = audioManager.getMusicVolume();
  audioManager.setMusicVolume(Math.max(0, current - VOLUME_STEP));
}
```

**Deliverable:** Keyboard volume controls.

### Phase 8 Exit Criteria

- [ ] AudioManager initializes Web Audio API context
- [ ] Gain node hierarchy (Master → SFX/Music)
- [ ] MusicPlayer loads MP3 files from ./music folder
- [ ] Music cycles through available tracks automatically
- [ ] [ and ] keys switch to previous/next track
- [ ] Graceful handling when no music files present
- [ ] Procedural sound effects for all game events:
  - [ ] Player shooting
  - [ ] Player death
  - [ ] Enemy death
  - [ ] Wave start
  - [ ] Game over
  - [ ] Score/multiplier feedback
- [ ] M key toggles mute
- [ ] +/- keys adjust music volume
- [ ] Audio only starts after user interaction (browser policy)
- [ ] No errors when audio unavailable

---

## Audio Controls Summary

| Key | Action |
|-----|--------|
| `[` | Previous music track |
| `]` | Next music track |
| `M` | Toggle mute |
| `+` | Increase music volume |
| `-` | Decrease music volume |

---

## Updated Phase Summary

| Phase | Focus | Key Systems | Result |
|-------|-------|-------------|--------|
| 0 | Setup | Vite, TypeScript, WebGPU | Dev environment |
| 1 | Grid | Mass-spring simulation, bloom | Glowing deformable grid |
| 2 | Player | ECS, sprites, input | Controllable ship |
| 3 | Enemy | Collision, AI, spawning | Enemies to fight |
| 4 | Shooting | Bullets, fire rate | Combat |
| 5 | Enemy Types | Behaviours, formations | Tactical variety |
| 6 | Scoring | Points, waves, lives | Progression |
| 7 | Particles | GPU compute explosions | Visual spectacle |
| 8 | Audio | Music, sound effects | Immersive feedback |

**After Phase 8**, the game has full audiovisual polish. Remaining phases:

- **Phase 9:** Performance (Worker threads, SharedArrayBuffer)
- **Phase 10:** Polish (Screen shake, power-ups, leaderboards)
