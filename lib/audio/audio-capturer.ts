import { APP_CONFIG } from '../constants';
import { createAudioContext, float32ToInt16, calculateAudioLevel } from '../utils';

export interface AudioCapturerOptions {
  sampleRate?: number;
  channels?: number;
  bufferSize?: number;
  chunkDurationMs?: number;
  useContinuousCapture?: boolean;

  // Float32 frames (native AudioContext sample rate)
  onData?: (audioData: Float32Array) => void;

  // PCM16 chunks for realtime streaming (e.g. Qwen input_audio_buffer.append)
  onPCM16Chunk?: (buffer: ArrayBuffer) => void;

  // For visualization
  onAudioLevel?: (level: number) => void;

  onError?: (error: string) => void;
}

export class AudioCapturer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private processor: ScriptProcessorNode | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrame: number | null = null;
  private options: AudioCapturerOptions;
  private isRecording: boolean = false;

  private floatBuffer: Float32Array[] = [];
  private bufferedSampleCount: number = 0;
  private silenceGain: GainNode | null = null;

  constructor(options: AudioCapturerOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bufferSize: options.bufferSize || 4096,
      chunkDurationMs: options.chunkDurationMs || 100,
      useContinuousCapture: options.useContinuousCapture || false,
      onData: options.onData,
      onPCM16Chunk: options.onPCM16Chunk,
      onAudioLevel: options.onAudioLevel,
      onError: options.onError
    };
  }

  /**
   * Initialize audio capture
   */
  async initialize(): Promise<void> {
    try {
      // Check browser support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia is not supported in this browser');
      }

      // Create audio context
      this.audioContext = createAudioContext();

      // Get user media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.options.sampleRate,
          channelCount: this.options.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Create audio nodes
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyser
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      // Connect nodes
      this.source.connect(this.analyser);

      console.log('Audio capturer initialized successfully');
    } catch (error) {
      const errorMessage = `Failed to initialize audio capturer: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Start audio capture
   */
  async startCapture(): Promise<void> {
    if (!this.audioContext || !this.mediaStream) {
      throw new Error('Audio capturer not initialized');
    }

    if (this.isRecording) {
      console.warn('Audio capture already in progress');
      return;
    }

    try {
      this.isRecording = true;
      
      if (this.options.useContinuousCapture) {
        // Use ScriptProcessorNode for continuous real-time capture
        this.startContinuousCapture();
      } else {
        // Use MediaRecorder for buffered capture
        this.startMediaRecorderCapture();
      }

      // Start real-time audio analysis
      this.startAudioAnalysis();

      console.log('Audio capture started');
    } catch (error) {
      this.isRecording = false;
      const errorMessage = `Failed to start audio capture: ${error}`;
      console.error(errorMessage);
      this.options.onError?.(errorMessage);
      throw error;
    }
  }

  /**
   * Start continuous capture using ScriptProcessorNode
   */
  private startContinuousCapture(): void {
    if (!this.audioContext || !this.source || !this.analyser) {
      throw new Error('Audio context not properly initialized');
    }

    const bufferSize = this.options.bufferSize || 4096;

    // ScriptProcessor buffer size must be a power of two.
    this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

    // Prevent mic audio from being played through speakers.
    this.silenceGain = this.audioContext.createGain();
    this.silenceGain.gain.value = 0;

    // Connect graph: source -> analyser -> processor -> (silence) -> destination
    // source -> analyser is already connected in initialize().
    this.analyser.connect(this.processor);
    this.processor.connect(this.silenceGain);
    this.silenceGain.connect(this.audioContext.destination);

    this.floatBuffer = [];
    this.bufferedSampleCount = 0;

    const targetSampleRate = this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    const chunkDurationMs = this.options.chunkDurationMs || 100;
    const chunkSamples = Math.floor(targetSampleRate * chunkDurationMs / 1000);

    this.processor.onaudioprocess = (event) => {
      if (!this.isRecording || !this.audioContext) {
        return;
      }

      const inputData = event.inputBuffer.getChannelData(0);
      const floatFrame = new Float32Array(inputData);

      this.options.onData?.(floatFrame);

      const audioLevel = calculateAudioLevel(floatFrame);
      this.options.onAudioLevel?.(audioLevel);

      const processedFrame = this.resampleIfNeeded(floatFrame, this.audioContext.sampleRate, targetSampleRate);

      this.floatBuffer.push(processedFrame);
      this.bufferedSampleCount += processedFrame.length;

      while (this.bufferedSampleCount >= chunkSamples) {
        const chunk = this.extractChunk(chunkSamples);
        const pcm16 = float32ToInt16(chunk);
        const buffer = new ArrayBuffer(pcm16.length * 2);
        new Int16Array(buffer).set(pcm16);
        this.options.onPCM16Chunk?.(buffer);
      }
    };

    console.log(`Continuous capture mode enabled (${chunkDurationMs}ms chunks)`);
  }

  /**
   * Start MediaRecorder-based capture
   */
  private startMediaRecorderCapture(): void {
    if (!this.mediaStream) {
      throw new Error('Media stream not available');
    }

    // Create media recorder for high-quality audio
    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    const audioChunks: Blob[] = [];

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioData = await this.decodeAudioData(arrayBuffer);
      
      if (audioData && this.options.onData) {
        this.options.onData(audioData);
      }
    };

    this.mediaRecorder.start(100); // Collect data every 100ms

    console.log('MediaRecorder capture mode enabled');
  }

  /**
   * Stop audio capture
   */
  stopCapture(): void {
    if (!this.isRecording) {
      return;
    }

    this.isRecording = false;

    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    if (this.processor) {
      try {
        this.processor.disconnect();
      } catch {
        // ignore
      }
      this.processor.onaudioprocess = null;
      this.processor = null;
    }

    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        // ignore
      }
    }

    if (this.silenceGain) {
      try {
        this.silenceGain.disconnect();
      } catch {
        // ignore
      }
      this.silenceGain = null;
    }

    this.floatBuffer = [];
    this.bufferedSampleCount = 0;

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }

    console.log('Audio capture stopped');
  }

  /**
   * Start real-time audio analysis for visualization
   */
  private startAudioAnalysis(): void {
    if (!this.analyser || !this.isRecording) {
      return;
    }

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const analyze = () => {
      if (!this.isRecording || !this.analyser) {
        return;
      }

      this.analyser.getByteTimeDomainData(dataArray);
      
      // Calculate audio level for visualization
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      const audioLevel = Math.min(100, rms * 200);

      this.options.onAudioLevel?.(audioLevel);

      this.animationFrame = requestAnimationFrame(analyze);
    };

    analyze();
  }

  /**
   * Decode audio data from ArrayBuffer
   */
  private async decodeAudioData(arrayBuffer: ArrayBuffer): Promise<Float32Array | null> {
    if (!this.audioContext) {
      return null;
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Convert to mono if stereo
      const channelData = audioBuffer.numberOfChannels === 1 
        ? audioBuffer.getChannelData(0)
        : this.mixToMono(audioBuffer);

      return channelData;
    } catch (error) {
      console.error('Error decoding audio data:', error);
      return null;
    }
  }

  /**
   * Mix stereo audio to mono
   */
  private mixToMono(audioBuffer: AudioBuffer): Float32Array {
    const length = audioBuffer.length;
    const result = new Float32Array(length);
    
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        result[i] += channelData[i] / audioBuffer.numberOfChannels;
      }
    }
    
    return result;
  }

  private resampleIfNeeded(inputData: Float32Array, inputSampleRate: number, targetSampleRate: number): Float32Array {
    if (inputSampleRate === targetSampleRate) {
      return inputData;
    }

    const ratio = targetSampleRate / inputSampleRate;
    const outputLength = Math.floor(inputData.length * ratio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / ratio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      output[i] = inputData[srcIndexFloor] * (1 - fraction) + inputData[srcIndexCeil] * fraction;
    }

    return output;
  }

  private extractChunk(chunkSize: number): Float32Array {
    const chunk = new Float32Array(chunkSize);
    let chunkIndex = 0;

    while (chunkIndex < chunkSize && this.floatBuffer.length > 0) {
      const buffer = this.floatBuffer[0];
      const remaining = chunkSize - chunkIndex;

      if (buffer.length <= remaining) {
        chunk.set(buffer, chunkIndex);
        chunkIndex += buffer.length;
        this.floatBuffer.shift();
        this.bufferedSampleCount -= buffer.length;
      } else {
        chunk.set(buffer.slice(0, remaining), chunkIndex);
        this.floatBuffer[0] = buffer.slice(remaining);
        chunkIndex += remaining;
        this.bufferedSampleCount -= remaining;
      }
    }

    return chunk;
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
      const sample = (dataArray[i] - 128) / 128;
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / dataArray.length);
    return Math.min(100, rms * 200);
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stopCapture();
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.source = null;
    this.analyser = null;
    this.mediaRecorder = null;
    this.processor = null;
    this.silenceGain = null;
    this.floatBuffer = [];
    this.bufferedSampleCount = 0;
  }
}