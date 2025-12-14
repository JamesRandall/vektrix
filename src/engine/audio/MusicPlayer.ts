// Music player - cycles through tracks from ./music folder

import { AudioManager } from './AudioManager';

export interface MusicTrack {
  name: string;
  url: string;
  buffer: AudioBuffer | null;
}

interface PreloadedTrack {
  name: string;
  url: string;
  arrayBuffer: ArrayBuffer;
}

export class MusicPlayer {
  private audioManager: AudioManager;
  private tracks: MusicTrack[] = [];
  private preloadedTracks: PreloadedTrack[] = [];
  private currentTrackIndex = -1;
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlaying = false;
  private startTime = 0;
  private pauseTime = 0;
  private preloadComplete = false;
  private preloadPromise: Promise<void> | null = null;

  constructor(audioManager: AudioManager) {
    this.audioManager = audioManager;
  }

  /**
   * Preload music files (fetch only, no AudioContext needed)
   * Call this early to start downloading music in background
   * @param onProgress - Callback with (loaded, total, firstTrackReady)
   */
  async preloadFiles(
    onProgress?: (loaded: number, total: number, firstTrackReady: boolean) => void
  ): Promise<void> {
    this.preloadPromise = this.doPreload(onProgress);
    await this.preloadPromise;
  }

  private async doPreload(
    onProgress?: (loaded: number, total: number, firstTrackReady: boolean) => void
  ): Promise<void> {
    const musicFiles = await this.discoverMusicFiles();

    if (musicFiles.length === 0) {
      console.log('No music files found in ./music folder');
      this.preloadComplete = true;
      onProgress?.(0, 0, true);
      return;
    }

    console.log(`Preloading ${musicFiles.length} music files...`);
    const total = musicFiles.length;
    let loaded = 0;

    // Load sequentially so first track finishes ASAP
    for (const file of musicFiles) {
      try {
        const response = await fetch(`/music/${file}`);
        if (!response.ok) {
          loaded++;
          onProgress?.(loaded, total, this.preloadedTracks.length >= 1);
          continue;
        }

        const arrayBuffer = await response.arrayBuffer();
        console.log(`Preloaded: ${file}`);

        this.preloadedTracks.push({
          name: this.formatTrackName(file),
          url: `/music/${file}`,
          arrayBuffer,
        });

        loaded++;
        onProgress?.(loaded, total, this.preloadedTracks.length >= 1);
      } catch (e) {
        console.warn(`Failed to preload: ${file}`, e);
        loaded++;
        onProgress?.(loaded, total, this.preloadedTracks.length >= 1);
      }
    }

    this.preloadComplete = true;
    console.log(`Preloaded ${this.preloadedTracks.length} music files`);
  }

  /**
   * Check if at least one track is preloaded and ready
   */
  isFirstTrackPreloaded(): boolean {
    return this.preloadedTracks.length >= 1;
  }

  /**
   * Check if all tracks have finished preloading
   */
  isPreloadComplete(): boolean {
    return this.preloadComplete;
  }

  /**
   * Decode preloaded files into AudioBuffers (requires AudioContext)
   * Call this after user interaction when AudioContext is available
   */
  async decodePreloadedTracks(): Promise<void> {
    const context = this.audioManager.getContext();
    if (!context) return;

    if (this.preloadedTracks.length === 0) {
      console.log('No preloaded tracks to decode');
      return;
    }

    console.log(`Decoding ${this.preloadedTracks.length} preloaded tracks...`);

    for (const preloaded of this.preloadedTracks) {
      try {
        // Need to clone the ArrayBuffer since decodeAudioData detaches it
        const bufferCopy = preloaded.arrayBuffer.slice(0);
        const audioBuffer = await context.decodeAudioData(bufferCopy);

        this.tracks.push({
          name: preloaded.name,
          url: preloaded.url,
          buffer: audioBuffer,
        });

        console.log(`Decoded: ${preloaded.name}`);
      } catch (e) {
        console.warn(`Failed to decode: ${preloaded.name}`, e);
      }
    }

    // Clear preloaded data to free memory
    this.preloadedTracks = [];
    console.log(`Ready: ${this.tracks.length} music tracks`);
  }

  /**
   * Scan and load all MP3 files from the music folder
   * @param onProgress - Callback with (loaded, total, firstTrackReady)
   */
  async loadTracksFromFolder(
    onProgress?: (loaded: number, total: number, firstTrackReady: boolean) => void
  ): Promise<void> {
    const context = this.audioManager.getContext();
    if (!context) return;

    // If we have preloaded tracks, decode those instead
    if (this.preloadedTracks.length > 0) {
      await this.decodePreloadedTracks();
      onProgress?.(this.tracks.length, this.tracks.length, true);
      return;
    }

    const musicFiles = await this.discoverMusicFiles();

    if (musicFiles.length === 0) {
      console.log('No music files found in ./music folder');
      onProgress?.(0, 0, true);
      return;
    }

    let loaded = 0;
    const total = musicFiles.length;

    // Load each track
    for (const file of musicFiles) {
      try {
        const response = await fetch(`/music/${file}`);
        if (!response.ok) continue;

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await context.decodeAudioData(arrayBuffer);

        this.tracks.push({
          name: this.formatTrackName(file),
          url: `/music/${file}`,
          buffer: audioBuffer,
        });

        loaded++;
        const firstTrackReady = this.tracks.length >= 1;
        onProgress?.(loaded, total, firstTrackReady);

        console.log(`Loaded music track: ${file} (${loaded}/${total})`);
      } catch (e) {
        console.warn(`Failed to load music track: ${file}`, e);
        loaded++;
        onProgress?.(loaded, total, this.tracks.length >= 1);
      }
    }

    console.log(`Loaded ${this.tracks.length} music tracks`);
  }

  /**
   * Format filename into display name
   */
  private formatTrackName(filename: string): string {
    return filename
      .replace('.mp3', '')
      .replace(/[-_]/g, ' ')
      .replace(/\s+\d+$/, '') // Remove trailing numbers
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Discover music files
   */
  private async discoverMusicFiles(): Promise<string[]> {
    // Try to fetch a manifest file first
    try {
      const response = await fetch('/music/manifest.json');
      if (response.ok) {
        const manifest = await response.json();
        return manifest.files || [];
      }
    } catch {
      /* ignore */
    }

    // Fallback: try known files
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
      } catch {
        /* ignore */
      }
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

    // Auto-advance when track ends
    this.currentSource.loop = false;
    this.currentSource.onended = () => {
      if (this.isPlaying) {
        console.log(`Track ended, advancing from ${this.currentTrackIndex} to next (${this.tracks.length} tracks total)`);
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
    this.currentTrackIndex =
      (this.currentTrackIndex - 1 + this.tracks.length) % this.tracks.length;

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
      } catch {
        /* ignore */
      }
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
    if (
      this.currentTrackIndex < 0 ||
      this.currentTrackIndex >= this.tracks.length
    ) {
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
