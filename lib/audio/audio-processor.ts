import { APP_CONFIG } from '../constants';
import { createAudioContext, float32ToInt16, calculateAudioLevel } from '../utils';

export interface AudioProcessorOptions {
  sampleRate?: number;
  channels?: number;
  chunkDurationMs?: number;
  vadEnabled?: boolean;
  vadThreshold?: number;
  onAudioChunk?: (buffer: ArrayBuffer) => void;
  onAudioLevel?: (level: number) => void;
  onError?: (error: string) => void;
}

export class AudioProcessor {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  
  private options: Required<AudioProcessorOptions>;
  private isCapturing: boolean = false;
  private chunkSize: number;
  private audioBuffer: Float32Array[] = [];
  private bufferSampleCount: number = 0;
  
  constructor(options: AudioProcessorOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      chunkDurationMs: options.chunkDurationMs || 20,
      vadEnabled: options.vadEnabled || false,
      vadThreshold: options.vadThreshold || 0.01,
      onAudioChunk: options.onAudioChunk || (() => {}),
      onAudioLevel: options.onAudioLevel || (() => {}),
      onError: options.onError || ((error) => console.error(error))
    };
    
    // Calculate chunk size: for 16000Hz and 20ms -> 320 samples
    this.chunkSize = Math.floor(this.options.sampleRate * this.options.chunkDurationMs / 1000);
  }
  
  /**
   * Initialize audio processor and request microphone permission
   */
  async initialize(): Promise<void> {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }
      
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.options.sampleRate,
          channelCount: this.options.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log('Microphone permission granted');
    } catch (error) {
      const errorMessage = `Failed to initialize audio processor: ${error}`;
      this.options.onError(errorMessage);
      throw error;
    }
  }
  
  /**
   * Start continuous audio capture
   */
  async startCapture(): Promise<void> {
    if (!this.mediaStream) {
      throw new Error('Audio processor not initialized. Call initialize() first.');
    }
    
    if (this.isCapturing) {
      console.warn('Audio capture already in progress');
      return;
    }
    
    try {
      // Create audio context with specified sample rate
      this.audioContext = createAudioContext();
      
      // Check if we need to resample
      if (this.audioContext.sampleRate !== this.options.sampleRate) {
        console.warn(
          `Audio context sample rate (${this.audioContext.sampleRate}Hz) differs from target (${this.options.sampleRate}Hz). ` +
          `Resampling will be applied.`
        );
      }
      
      // Create audio nodes
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      
      // Create ScriptProcessor for continuous audio capture
      // Buffer size should be a power of 2 between 256 and 16384
      const bufferSize = this.getOptimalBufferSize();
      this.processor = this.audioContext.createScriptProcessor(bufferSize, this.options.channels, this.options.channels);
      
      // Connect audio nodes: source -> analyser -> processor -> destination
      this.source.connect(this.analyser);
      this.analyser.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
      
      // Set up audio processing callback
      this.processor.onaudioprocess = (event) => {
        this.processAudioBuffer(event);
      };
      
      this.isCapturing = true;
      this.audioBuffer = [];
      this.bufferSampleCount = 0;
      
      console.log(`Audio capture started: ${this.options.sampleRate}Hz, ${this.chunkSize} samples per chunk (${this.options.chunkDurationMs}ms)`);
    } catch (error) {
      this.isCapturing = false;
      const errorMessage = `Failed to start audio capture: ${error}`;
      this.options.onError(errorMessage);
      throw error;
    }
  }
  
  /**
   * Stop audio capture
   */
  stopCapture(): void {
    if (!this.isCapturing) {
      return;
    }
    
    this.isCapturing = false;
    
    // Disconnect and clean up audio nodes
    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    // Clear buffer
    this.audioBuffer = [];
    this.bufferSampleCount = 0;
    
    console.log('Audio capture stopped');
  }
  
  /**
   * Process audio buffer from ScriptProcessor
   */
  private processAudioBuffer(event: AudioProcessingEvent): void {
    if (!this.isCapturing) {
      return;
    }
    
    // Get mono channel data (Float32Array)
    const inputData = event.inputBuffer.getChannelData(0);
    
    // Apply VAD if enabled
    if (this.options.vadEnabled && !this.isSpeechPresent(inputData)) {
      return;
    }
    
    // Resample if needed
    const processedData = this.resampleIfNeeded(inputData);
    
    // Calculate and emit audio level
    const audioLevel = calculateAudioLevel(processedData);
    this.options.onAudioLevel(audioLevel);
    
    // Add to buffer
    this.audioBuffer.push(new Float32Array(processedData));
    this.bufferSampleCount += processedData.length;
    
    // Check if we have enough samples for a chunk
    while (this.bufferSampleCount >= this.chunkSize) {
      const chunk = this.extractChunk();
      const pcm16Buffer = this.encodeToPCM16(chunk);
      this.options.onAudioChunk(pcm16Buffer);
    }
  }
  
  /**
   * Extract a chunk of audio from the buffer
   */
  private extractChunk(): Float32Array {
    const chunk = new Float32Array(this.chunkSize);
    let chunkIndex = 0;
    
    while (chunkIndex < this.chunkSize && this.audioBuffer.length > 0) {
      const buffer = this.audioBuffer[0];
      const remaining = this.chunkSize - chunkIndex;
      const available = buffer.length;
      
      if (available <= remaining) {
        // Use entire buffer
        chunk.set(buffer, chunkIndex);
        chunkIndex += available;
        this.audioBuffer.shift();
        this.bufferSampleCount -= available;
      } else {
        // Use partial buffer
        chunk.set(buffer.slice(0, remaining), chunkIndex);
        this.audioBuffer[0] = buffer.slice(remaining);
        chunkIndex += remaining;
        this.bufferSampleCount -= remaining;
      }
    }
    
    return chunk;
  }
  
  /**
   * Encode Float32Array to PCM16 ArrayBuffer
   */
  private encodeToPCM16(audioData: Float32Array): ArrayBuffer {
    const int16Data = float32ToInt16(audioData);
    const buffer = new ArrayBuffer(int16Data.length * 2);
    const view = new Int16Array(buffer);
    view.set(int16Data);
    return buffer;
  }
  
  /**
   * Resample audio if context sample rate differs from target
   */
  private resampleIfNeeded(inputData: Float32Array): Float32Array {
    if (!this.audioContext) {
      return inputData;
    }
    
    const contextSampleRate = this.audioContext.sampleRate;
    const targetSampleRate = this.options.sampleRate;
    
    if (contextSampleRate === targetSampleRate) {
      return inputData;
    }
    
    // Simple linear resampling
    const ratio = targetSampleRate / contextSampleRate;
    const outputLength = Math.floor(inputData.length * ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      
      // Linear interpolation
      output[i] = inputData[srcIndexFloor] * (1 - fraction) + inputData[srcIndexCeil] * fraction;
    }
    
    return output;
  }
  
  /**
   * Check if speech is present in audio data (VAD)
   */
  private isSpeechPresent(audioData: Float32Array): boolean {
    // Calculate RMS energy
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    
    return rms > this.options.vadThreshold;
  }
  
  /**
   * Get optimal buffer size for ScriptProcessor
   */
  private getOptimalBufferSize(): number {
    // Valid buffer sizes are: 256, 512, 1024, 2048, 4096, 8192, 16384
    const validSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
    
    // Try to find a size close to our chunk size
    for (const size of validSizes) {
      if (size >= this.chunkSize / 2) {
        return size;
      }
    }
    
    // Default to 4096 if nothing matches
    return 4096;
  }
  
  /**
   * Get current audio level (0-100)
   */
  getCurrentAudioLevel(): number {
    if (!this.analyser) {
      return 0;
    }
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(100, rms * 200);
  }
  
  /**
   * Check if currently capturing
   */
  isActive(): boolean {
    return this.isCapturing;
  }
  
  /**
   * Get processor statistics
   */
  getStats(): {
    sampleRate: number;
    channels: number;
    chunkSize: number;
    chunkDurationMs: number;
    bufferSampleCount: number;
    isCapturing: boolean;
  } {
    return {
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      chunkSize: this.chunkSize,
      chunkDurationMs: this.options.chunkDurationMs,
      bufferSampleCount: this.bufferSampleCount,
      isCapturing: this.isCapturing
    };
  }
  
  /**
   * Clean up all resources
   */
  dispose(): void {
    this.stopCapture();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }
}
