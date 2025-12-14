// Procedural sound generation using Web Audio oscillators

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
   * Explosion sound - layered noise burst with rumble
   */
  playExplosion(volume = 0.5, duration = 0.4): void {
    const now = this.context.currentTime;

    // Layer 1: High-frequency crackle (unfiltered noise, fast decay)
    const crackleSize = Math.floor(this.context.sampleRate * duration * 0.5);
    const crackleBuffer = this.context.createBuffer(1, crackleSize, this.context.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleSize; i++) {
      // Sharp attack, fast decay with some randomness
      const env = Math.pow(1 - i / crackleSize, 3);
      crackleData[i] = (Math.random() * 2 - 1) * env;
    }
    const crackle = this.context.createBufferSource();
    crackle.buffer = crackleBuffer;
    const crackleGain = this.context.createGain();
    crackleGain.gain.setValueAtTime(volume * 0.6, now);
    crackleGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 0.4);
    crackle.connect(crackleGain);
    crackleGain.connect(this.destination);
    crackle.start(now);

    // Layer 2: Mid-frequency noise burst
    const burstSize = Math.floor(this.context.sampleRate * duration);
    const burstBuffer = this.context.createBuffer(1, burstSize, this.context.sampleRate);
    const burstData = burstBuffer.getChannelData(0);
    for (let i = 0; i < burstSize; i++) {
      const env = Math.pow(1 - i / burstSize, 1.5);
      burstData[i] = (Math.random() * 2 - 1) * env;
    }
    const burst = this.context.createBufferSource();
    burst.buffer = burstBuffer;
    const burstFilter = this.context.createBiquadFilter();
    burstFilter.type = 'bandpass';
    burstFilter.frequency.setValueAtTime(800, now);
    burstFilter.frequency.exponentialRampToValueAtTime(200, now + duration);
    burstFilter.Q.value = 1;
    const burstGain = this.context.createGain();
    burstGain.gain.setValueAtTime(volume * 0.8, now);
    burstGain.gain.exponentialRampToValueAtTime(0.01, now + duration);
    burst.connect(burstFilter);
    burstFilter.connect(burstGain);
    burstGain.connect(this.destination);
    burst.start(now);

    // Layer 3: Low-frequency rumble
    const rumbleSize = Math.floor(this.context.sampleRate * duration * 1.2);
    const rumbleBuffer = this.context.createBuffer(1, rumbleSize, this.context.sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    for (let i = 0; i < rumbleSize; i++) {
      const env = Math.pow(1 - i / rumbleSize, 1);
      rumbleData[i] = (Math.random() * 2 - 1) * env;
    }
    const rumble = this.context.createBufferSource();
    rumble.buffer = rumbleBuffer;
    const rumbleFilter = this.context.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(300, now);
    rumbleFilter.frequency.exponentialRampToValueAtTime(60, now + duration * 1.2);
    const rumbleGain = this.context.createGain();
    rumbleGain.gain.setValueAtTime(volume * 0.7, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + duration * 1.2);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.destination);
    rumble.start(now);
  }

  /**
   * Enemy death - punchy explosion with thump
   */
  playEnemyDeath(volume = 0.7): void {
    const now = this.context.currentTime;

    // Low thump for impact - sine wave punch
    const thump = this.context.createOscillator();
    const thumpGain = this.context.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(150, now);
    thump.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    thumpGain.gain.setValueAtTime(volume * 1.2, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
    thump.connect(thumpGain);
    thumpGain.connect(this.destination);
    thump.start(now);
    thump.stop(now + 0.12);

    // Harsh noise burst - unfiltered for maximum impact
    const noiseSize = Math.floor(this.context.sampleRate * 0.15);
    const noiseBuffer = this.context.createBuffer(1, noiseSize, this.context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseSize; i++) {
      // Sharp attack, medium decay
      const env = i < noiseSize * 0.1
        ? i / (noiseSize * 0.1)  // Quick ramp up
        : Math.pow(1 - (i - noiseSize * 0.1) / (noiseSize * 0.9), 1.5);
      noiseData[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.8, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    noise.connect(noiseGain);
    noiseGain.connect(this.destination);
    noise.start(now);

    // Mid-frequency crunch
    const crunchSize = Math.floor(this.context.sampleRate * 0.1);
    const crunchBuffer = this.context.createBuffer(1, crunchSize, this.context.sampleRate);
    const crunchData = crunchBuffer.getChannelData(0);
    for (let i = 0; i < crunchSize; i++) {
      const env = Math.pow(1 - i / crunchSize, 3);
      crunchData[i] = (Math.random() * 2 - 1) * env;
    }
    const crunch = this.context.createBufferSource();
    crunch.buffer = crunchBuffer;
    const crunchFilter = this.context.createBiquadFilter();
    crunchFilter.type = 'bandpass';
    crunchFilter.frequency.value = 600 + Math.random() * 400;
    crunchFilter.Q.value = 2;
    const crunchGain = this.context.createGain();
    crunchGain.gain.setValueAtTime(volume * 0.6, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
    crunch.connect(crunchFilter);
    crunchFilter.connect(crunchGain);
    crunchGain.connect(this.destination);
    crunch.start(now);
  }

  /**
   * Player death - longer, more dramatic explosion with heavy noise
   */
  playPlayerDeath(volume = 0.7): void {
    const now = this.context.currentTime;

    // Multiple oscillators for richer tonal base
    for (let i = 0; i < 3; i++) {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = i === 0 ? 'sawtooth' : 'square';
      const startFreq = 300 - i * 100;
      osc.frequency.setValueAtTime(startFreq, now + i * 0.05);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.5 + i * 0.1);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        volume * 0.4 * (1 - i * 0.2),
        now + 0.02 + i * 0.05
      );
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5 + i * 0.1);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(now);
      osc.stop(now + 0.6);
    }

    // Heavy noise explosion - main component
    this.playExplosion(volume * 0.9, 0.5);

    // Extra crackle layer for more chaos
    const crackleSize = Math.floor(this.context.sampleRate * 0.3);
    const crackleBuffer = this.context.createBuffer(1, crackleSize, this.context.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleSize; i++) {
      const env = Math.pow(1 - i / crackleSize, 2);
      // Add some discontinuities for crackle effect
      const crackle = Math.random() < 0.1 ? (Math.random() * 2 - 1) * 2 : 1;
      crackleData[i] = (Math.random() * 2 - 1) * env * crackle;
    }
    const crackle = this.context.createBufferSource();
    crackle.buffer = crackleBuffer;
    const crackleGain = this.context.createGain();
    crackleGain.gain.setValueAtTime(volume * 0.4, now + 0.02);
    crackleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    crackle.connect(crackleGain);
    crackleGain.connect(this.destination);
    crackle.start(now + 0.02);
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
   * Wave complete - fanfare
   */
  playWaveComplete(volume = 0.5): void {
    const now = this.context.currentTime;
    const notes = [523, 659, 784]; // C5, E5, G5

    notes.forEach((freq, i) => {
      const osc = this.context.createOscillator();
      const gain = this.context.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.1);

      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(volume, now + i * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);

      osc.connect(gain);
      gain.connect(this.destination);

      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.35);
    });
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

  /**
   * Bullet impact - short click
   */
  playBulletImpact(volume = 0.25): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.05);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Respawn - rising woosh
   */
  playRespawn(volume = 0.4): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(600, now + 0.2);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  /**
   * Enemy bullet fired - higher pitched laser
   */
  playEnemyShoot(volume = 0.2): void {
    const now = this.context.currentTime;

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  /**
   * Mine explosion - VERY loud bang with massive bass thump
   */
  playMineExplosion(volume = 1.0): void {
    const now = this.context.currentTime;

    // Massive bass thump
    const thump = this.context.createOscillator();
    const thumpGain = this.context.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(80, now);
    thump.frequency.exponentialRampToValueAtTime(20, now + 0.3);
    thumpGain.gain.setValueAtTime(volume * 1.5, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    thump.connect(thumpGain);
    thumpGain.connect(this.destination);
    thump.start(now);
    thump.stop(now + 0.4);

    // Heavy distorted mid
    const mid = this.context.createOscillator();
    const midGain = this.context.createGain();
    mid.type = 'sawtooth';
    mid.frequency.setValueAtTime(200, now);
    mid.frequency.exponentialRampToValueAtTime(50, now + 0.2);
    midGain.gain.setValueAtTime(volume * 0.8, now);
    midGain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    mid.connect(midGain);
    midGain.connect(this.destination);
    mid.start(now);
    mid.stop(now + 0.25);

    // Harsh noise blast - unfiltered for maximum impact
    const noiseSize = Math.floor(this.context.sampleRate * 0.5);
    const noiseBuffer = this.context.createBuffer(1, noiseSize, this.context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseSize; i++) {
      const env = i < noiseSize * 0.05
        ? i / (noiseSize * 0.05)
        : Math.pow(1 - (i - noiseSize * 0.05) / (noiseSize * 0.95), 1.2);
      noiseData[i] = (Math.random() * 2 - 1) * env;
    }
    const noise = this.context.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = this.context.createGain();
    noiseGain.gain.setValueAtTime(volume * 1.0, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    noise.connect(noiseGain);
    noiseGain.connect(this.destination);
    noise.start(now);

    // Extra crackle layer
    const crackleSize = Math.floor(this.context.sampleRate * 0.3);
    const crackleBuffer = this.context.createBuffer(1, crackleSize, this.context.sampleRate);
    const crackleData = crackleBuffer.getChannelData(0);
    for (let i = 0; i < crackleSize; i++) {
      const env = Math.pow(1 - i / crackleSize, 2);
      const crackle = Math.random() < 0.15 ? (Math.random() * 2 - 1) * 3 : 1;
      crackleData[i] = (Math.random() * 2 - 1) * env * crackle;
    }
    const crackleNode = this.context.createBufferSource();
    crackleNode.buffer = crackleBuffer;
    const crackleGain = this.context.createGain();
    crackleGain.gain.setValueAtTime(volume * 0.6, now + 0.02);
    crackleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    crackleNode.connect(crackleGain);
    crackleGain.connect(this.destination);
    crackleNode.start(now + 0.02);

    // Low rumble tail
    const rumbleSize = Math.floor(this.context.sampleRate * 0.6);
    const rumbleBuffer = this.context.createBuffer(1, rumbleSize, this.context.sampleRate);
    const rumbleData = rumbleBuffer.getChannelData(0);
    for (let i = 0; i < rumbleSize; i++) {
      const env = Math.pow(1 - i / rumbleSize, 0.8);
      rumbleData[i] = (Math.random() * 2 - 1) * env;
    }
    const rumble = this.context.createBufferSource();
    rumble.buffer = rumbleBuffer;
    const rumbleFilter = this.context.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 150;
    const rumbleGain = this.context.createGain();
    rumbleGain.gain.setValueAtTime(volume * 0.8, now + 0.05);
    rumbleGain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(this.destination);
    rumble.start(now + 0.05);
  }
}
