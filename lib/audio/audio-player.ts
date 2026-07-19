import { APP_CONFIG } from '../constants';

export interface AudioPlayerOptions {
  sampleRate?: number;
  channels?: number;
  volume?: number;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onError?: (error: string) => void;
  autoPlay?: boolean;
}

export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private options: AudioPlayerOptions;
  private isPlaying: boolean = false;
  private currentAudioBuffer: AudioBuffer | null = null;
  private queue: AudioBuffer[] = [];
  private playbackStartTime: number = 0;
  private pauseOffset: number = 0;

  // Streaming (chunked) playback: schedule AudioBufferSourceNodes back-to-back.
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private nextScheduledTime: number = 0;

  constructor(options: AudioPlayerOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      volume: options.volume || 1.0,
      onPlay: options.onPlay,
      onPause: options.onPause,
      onEnded: options.onEnded,
      onError: options.onError,
      autoPlay: options.autoPlay || false
    };
  }

  /**
   * Initialize audio context
   */
  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });

      // Create gain node for volume control
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.setVolume(this.options.volume || 1.0);

      console.log('Audio player initialized:', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state,
        channels: this.options.channels
      });
    } catch (error) {
      const errorMessage = `Failed to initialize audio player: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Load audio data from Float32Array
   */
  async loadFromFloat32Array(audioData: Float32Array): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    try {
      const audioBuffer = this.audioContext.createBuffer(
        this.options.channels || APP_CONFIG.AUDIO.CHANNELS,
        audioData.length,
        this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE
      );

      // Create properly typed Float32Array for copyToChannel
      const channelData = new Float32Array(audioData);
      
      if ((this.options.channels || APP_CONFIG.AUDIO.CHANNELS) === 1) {
        audioBuffer.copyToChannel(channelData, 0);
      } else {
        // For multi-channel, assume mono data needs to be duplicated
        for (let channel = 0; channel < (this.options.channels || APP_CONFIG.AUDIO.CHANNELS); channel++) {
          audioBuffer.copyToChannel(channelData, channel);
        }
      }

      this.currentAudioBuffer = audioBuffer;
      
      if (this.options.autoPlay) {
        await this.play();
      }
    } catch (error) {
      const errorMessage = `Failed to load audio data: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Enqueue Float32 PCM chunk for continuous playback.
   */
  enqueueFloat32Chunk(audioData: Float32Array, sampleRate?: number): void {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    if (audioData.length === 0) {
      console.warn('Empty audio data, skipping');
      return;
    }

    // Validate audio data
    let hasInvalidSamples = false;
    for (let i = 0; i < audioData.length; i++) {
      if (isNaN(audioData[i]) || !isFinite(audioData[i])) {
        hasInvalidSamples = true;
        audioData[i] = 0; // Replace invalid samples with silence
      }
    }

    if (hasInvalidSamples) {
      console.warn('Invalid audio samples detected and replaced with silence');
    }

    const targetSampleRate = sampleRate || this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    const audioBuffer = this.audioContext.createBuffer(
      this.options.channels || APP_CONFIG.AUDIO.CHANNELS,
      audioData.length,
      targetSampleRate
    );

    const channelData = new Float32Array(audioData);
    if ((this.options.channels || APP_CONFIG.AUDIO.CHANNELS) === 1) {
      audioBuffer.copyToChannel(channelData, 0);
    } else {
      for (let channel = 0; channel < (this.options.channels || APP_CONFIG.AUDIO.CHANNELS); channel++) {
        audioBuffer.copyToChannel(channelData, channel);
      }
    }

    this.enqueueAudioBuffer(audioBuffer);
  }

  /**
   * Load audio data from ArrayBuffer (WAV or raw PCM)
   */
  async loadFromArrayBuffer(arrayBuffer: ArrayBuffer): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      this.currentAudioBuffer = audioBuffer;
      
      if (this.options.autoPlay) {
        await this.play();
      }
    } catch (error) {
      const errorMessage = `Failed to decode audio data: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Start playback
   */
  async play(startTime: number = 0): Promise<void> {
    if (!this.audioContext) {
      throw new Error('Audio player not initialized');
    }

    // If no buffer loaded but queue has items, load from queue
    if (!this.currentAudioBuffer && this.queue.length > 0) {
      const nextBuffer = this.queue.shift()!;
      await this.loadFromAudioBuffer(nextBuffer);
    }

    if (!this.currentAudioBuffer) {
      throw new Error('No audio data loaded or player not initialized');
    }

    try {
      // Resume audio context if suspended
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      // Stop current playback if playing
      this.stop();

      // Create new source
      this.currentSource = this.audioContext.createBufferSource();
      this.currentSource.buffer = this.currentAudioBuffer;
      this.currentSource.connect(this.gainNode!);

      // Set up event handlers
      this.currentSource.onended = () => {
        this.isPlaying = false;
        this.options.onEnded?.();
        this.playNextInQueue();
      };

      // Start playback
      const offset = this.pauseOffset + startTime;
      this.currentSource.start(0, offset);
      this.playbackStartTime = this.audioContext.currentTime - offset;
      this.isPlaying = true;
      this.pauseOffset = 0;

      this.options.onPlay?.();
    } catch (error) {
      const errorMessage = `Failed to start playback: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Pause playback
   */
  pause(): void {
    if (!this.isPlaying || !this.audioContext) {
      return;
    }

    try {
      // Calculate pause offset
      this.pauseOffset = this.audioContext.currentTime - this.playbackStartTime;

      // Stop current source
      if (this.currentSource) {
        this.currentSource.stop();
        this.currentSource = null;
      }

      this.isPlaying = false;
      this.options.onPause?.();
    } catch (error) {
      console.error('Error pausing playback:', error);
    }
  }

  /**
   * Stop playback (also stops any scheduled streaming chunks)
   */
  stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // ignore
      }
      this.currentSource = null;
    }

    for (const source of this.scheduledSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // ignore
      }
    }
    this.scheduledSources.clear();
    this.nextScheduledTime = 0;

    this.isPlaying = false;
    this.pauseOffset = 0;
    this.playbackStartTime = 0;
  }

  /**
   * Set playback volume (0.0 to 1.0)
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.setValueAtTime(
        Math.max(0, Math.min(1, volume)),
        this.audioContext?.currentTime || 0
      );
    }
  }

  /**
   * Get current volume
   */
  getVolume(): number {
    return this.gainNode?.gain.value || this.options.volume || 1.0;
  }

  /**
   * Get current playback time
   */
  getCurrentTime(): number {
    if (!this.audioContext) {
      return 0;
    }

    if (this.isPlaying) {
      return this.audioContext.currentTime - this.playbackStartTime;
    }

    return this.pauseOffset;
  }

  /**
   * Get total duration of current audio
   */
  getDuration(): number {
    return this.currentAudioBuffer?.duration || 0;
  }

  /**
   * Seek to specific time
   */
  seek(time: number): void {
    if (!this.currentAudioBuffer) {
      return;
    }

    const clampedTime = Math.max(0, Math.min(time, this.getDuration()));
    
    if (this.isPlaying) {
      this.pauseOffset = clampedTime;
      this.play();
    } else {
      this.pauseOffset = clampedTime;
    }
  }

  /**
   * Enqueue a chunk for continuous, gapless playback.
   *
   * This is intended for streaming audio (e.g. `response.audio.delta`).
   */
  enqueueAudioBuffer(audioBuffer: AudioBuffer): void {
    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio player not initialized');
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {
        // ignore
      });
    }

    const now = this.audioContext.currentTime;
    const startTime = Math.max(this.nextScheduledTime, now + 0.02);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode);

    if (!this.isPlaying) {
      this.isPlaying = true;
      this.playbackStartTime = startTime;
      this.options.onPlay?.();
    }

    source.onended = () => {
      this.scheduledSources.delete(source);

      if (this.scheduledSources.size === 0) {
        this.isPlaying = false;
        this.nextScheduledTime = 0;
        this.options.onEnded?.();
      }
    };

    this.scheduledSources.add(source);
    source.start(startTime);
    this.nextScheduledTime = startTime + audioBuffer.duration;
  }

  /**
   * Add audio to playback queue (non-streaming mode)
   */
  addToQueue(audioBuffer: AudioBuffer): void {
    this.queue.push(audioBuffer);
  }

  /**
   * Play next item in queue
   */
  private playNextInQueue(): void {
    if (this.queue.length > 0) {
      const nextBuffer = this.queue.shift()!;
      this.loadFromAudioBuffer(nextBuffer).then(() => {
        this.play();
      }).catch(error => {
        console.error('Error playing next in queue:', error);
        this.playNextInQueue(); // Try next item
      });
    } else {
      this.currentAudioBuffer = null;
    }
  }

  /**
   * Load audio from AudioBuffer
   */
  private async loadFromAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    this.currentAudioBuffer = audioBuffer;
  }

  /**
   * Clear playback queue.
   *
   * Note: for streaming playback, this also cancels any scheduled (not-yet-ended) sources.
   */
  clearQueue(): void {
    this.queue = [];

    for (const source of this.scheduledSources) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        // ignore
      }
    }
    this.scheduledSources.clear();
    this.nextScheduledTime = 0;
  }

  /**
   * Get player status
   */
  getStatus(): {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    queueLength: number;
  } {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.getCurrentTime(),
      duration: this.getDuration(),
      volume: this.getVolume(),
      queueLength: this.queue.length + this.scheduledSources.size
    };
  }

  /**
   * Set playback rate (speed)
   */
  setPlaybackRate(rate: number): void {
    if (this.currentSource) {
      this.currentSource.playbackRate.setValueAtTime(
        Math.max(0.25, Math.min(4.0, rate)),
        this.audioContext?.currentTime || 0
      );
    }
  }

  /**
   * Enable/disable looping
   */
  setLooping(loop: boolean): void {
    if (this.currentSource) {
      this.currentSource.loop = loop;
    }
  }

  /**
   * Apply audio effect (simple filter)
   */
  applyFilter(filterType: BiquadFilterType, frequency: number, Q: number = 1): void {
    if (!this.audioContext || !this.gainNode) {
      return;
    }

    // This is a simplified implementation
    // In a full implementation, you'd create and configure filter nodes
    console.warn('Audio filtering not fully implemented in this version');
  }

  /**
   * Fade in/out
   */
  fadeIn(duration: number = 1.0): void {
    if (!this.gainNode || !this.audioContext) {
      return;
    }

    const currentTime = this.audioContext.currentTime;
    this.gainNode.gain.setValueAtTime(0, currentTime);
    this.gainNode.gain.linearRampToValueAtTime(this.getVolume(), currentTime + duration);
  }

  fadeOut(duration: number = 1.0): void {
    if (!this.gainNode || !this.audioContext) {
      return;
    }

    const currentTime = this.audioContext.currentTime;
    this.gainNode.gain.setValueAtTime(this.getVolume(), currentTime);
    this.gainNode.gain.linearRampToValueAtTime(0, currentTime + duration);
  }

  /**
   * Create visual audio data for visualization
   */
  createVisualizationData(): Uint8Array {
    if (!this.audioContext || !this.currentAudioBuffer) {
      return new Uint8Array(0);
    }

    // This is a placeholder implementation
    // In a real application, you'd use AnalyserNode for real-time visualization
    const bufferLength = 256;
    const dataArray = new Uint8Array(bufferLength);
    
    // Generate simple visualization data based on current audio level
    const currentTime = this.getCurrentTime();
    const frequency = 2;
    const amplitude = 0.5;
    
    for (let i = 0; i < bufferLength; i++) {
      dataArray[i] = Math.floor((Math.sin(currentTime * frequency + i * 0.1) * amplitude + 0.5) * 255);
    }
    
    return dataArray;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    this.clearQueue();

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.currentAudioBuffer = null;
    this.gainNode = null;
  }
}