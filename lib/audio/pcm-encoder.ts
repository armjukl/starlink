import { APP_CONFIG } from '../constants';
import { float32ToInt16 } from '../utils';

export interface PCMEncoderOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

export interface PCMFrame {
  data: Int16Array;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  timestamp: number;
}

export class PCMEncoder {
  private options: PCMEncoderOptions;
  private buffer: Float32Array[] = [];
  private bufferSize: number = 0;
  private readonly maxBufferSize: number;

  constructor(options: PCMEncoderOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bitDepth: options.bitDepth || APP_CONFIG.AUDIO.BIT_DEPTH,
    };
    
    // Set buffer size to 10 frames worth of audio at 44.1kHz or specified sample rate
    const sampleRate = this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    const samplesPerFrame = Math.floor(sampleRate * 0.02); // 20ms frames
    this.maxBufferSize = samplesPerFrame * 10; // 200ms buffer
  }

  /**
   * Add audio data to encoder buffer
   */
  addAudioData(audioData: Float32Array): void {
    // Ensure audio data is mono if multiple channels
    const monoData = this.options.channels === 1 ? audioData : this.mixToMono(audioData);
    
    // Add to buffer
    this.buffer.push(new Float32Array(monoData));
    this.bufferSize += monoData.length;

    // Remove old data if buffer is too large
    while (this.bufferSize > this.maxBufferSize && this.buffer.length > 0) {
      const removed = this.buffer.shift();
      if (removed) {
        this.bufferSize -= removed.length;
      }
    }
  }

  /**
   * Encode accumulated audio data to PCM16 frames
   */
  encodeFrames(): PCMFrame[] {
    const frames: PCMFrame[] = [];
    
    if (this.buffer.length === 0) {
      return frames;
    }

    // Target frame size (20ms of audio)
    const sampleRate = this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    const targetFrameSize = Math.floor(sampleRate * 0.02);
    
    while (this.buffer.length > 0 && this.getTotalBufferSize() >= targetFrameSize) {
      const frameData = this.collectFrameData(targetFrameSize);
      
      if (frameData.length > 0) {
        // Convert to PCM16
        const pcmData = float32ToInt16(frameData);
        
        frames.push({
          data: pcmData,
          sampleRate: this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
          channels: this.options.channels || APP_CONFIG.AUDIO.CHANNELS,
          bitDepth: this.options.bitDepth || APP_CONFIG.AUDIO.BIT_DEPTH,
          timestamp: Date.now()
        });
      }
    }

    return frames;
  }

  /**
   * Encode single audio buffer to PCM16
   */
  encodeSingle(audioData: Float32Array): Int16Array {
    const monoData = this.options.channels === 1 ? audioData : this.mixToMono(audioData);
    return float32ToInt16(monoData);
  }

  /**
   * Encode single audio buffer to PCM16 ArrayBuffer
   */
  encodeSingleToBuffer(audioData: Float32Array): ArrayBuffer {
    const int16Data = this.encodeSingle(audioData);
    const buffer = new ArrayBuffer(int16Data.length * 2);
    const view = new Int16Array(buffer);
    view.set(int16Data);
    return buffer;
  }

  /**
   * Convert audio data to WAV format
   */
  createWAVFromPCM(pcmFrames: PCMFrame[]): ArrayBuffer {
    if (pcmFrames.length === 0) {
      throw new Error('No PCM frames provided');
    }

    const sampleRate = pcmFrames[0].sampleRate;
    const channels = pcmFrames[0].channels;
    const bitDepth = pcmFrames[0].bitDepth;
    const samplesPerChannel = pcmFrames.reduce((total, frame) => total + frame.data.length / channels, 0);

    // Calculate buffer size
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samplesPerChannel * bytesPerSample * channels;
    const bufferSize = 44 + dataSize; // WAV header + data

    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    // WAV header
    this.writeWAVHeader(view, 0, bufferSize, sampleRate, channels, bitDepth, dataSize);

    // Write PCM data
    let offset = 44;
    for (const frame of pcmFrames) {
      const pcmData = frame.data;
      for (let i = 0; i < pcmData.length; i++) {
        view.setInt16(offset, pcmData[i], true);
        offset += 2;
      }
    }

    return buffer;
  }

  /**
   * Write WAV header to ArrayBuffer
   */
  private writeWAVHeader(
    view: DataView,
    offset: number,
    bufferSize: number,
    sampleRate: number,
    channels: number,
    bitDepth: number,
    dataSize: number
  ): void {
    const bytesPerSample = bitDepth / 8;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;

    // RIFF header
    this.writeString(view, offset, 'RIFF');
    view.setUint32(offset + 4, bufferSize - 8, true);
    this.writeString(view, offset + 8, 'WAVE');

    // fmt chunk
    this.writeString(view, offset + 12, 'fmt ');
    view.setUint32(offset + 16, 16, true); // fmt chunk size
    view.setUint16(offset + 20, 1, true); // PCM format
    view.setUint16(offset + 22, channels, true);
    view.setUint32(offset + 24, sampleRate, true);
    view.setUint32(offset + 28, byteRate, true);
    view.setUint16(offset + 32, blockAlign, true);
    view.setUint16(offset + 34, bitDepth, true);

    // data chunk
    this.writeString(view, offset + 36, 'data');
    view.setUint32(offset + 40, dataSize, true);
  }

  /**
   * Write string to DataView
   */
  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Collect frame data from buffer
   */
  private collectFrameData(targetSize: number): Float32Array {
    let collected = 0;
    const result: number[] = [];

    while (collected < targetSize && this.buffer.length > 0) {
      const buffer = this.buffer[0];
      const available = buffer.length;
      
      if (available <= targetSize - collected) {
        // Take entire buffer
        result.push(...Array.from(buffer));
        collected += available;
        this.buffer.shift();
      } else {
        // Take partial buffer
        const partial = buffer.slice(0, targetSize - collected);
        result.push(...Array.from(partial));
        
        // Replace buffer with remaining data
        this.buffer[0] = buffer.slice(targetSize - collected);
        collected = targetSize;
      }
    }

    this.bufferSize = Math.max(0, this.bufferSize - collected);
    return new Float32Array(result);
  }

  /**
   * Mix multi-channel audio to mono
   */
  private mixToMono(audioData: Float32Array): Float32Array {
    const channels = this.options.channels || APP_CONFIG.AUDIO.CHANNELS;
    if (channels === 1) {
      return audioData;
    }

    // Assume interleaved stereo for simplicity
    const length = Math.floor(audioData.length / channels);
    const monoData = new Float32Array(length);

    for (let i = 0; i < length; i++) {
      let sum = 0;
      for (let channel = 0; channel < channels; channel++) {
        sum += audioData[i * channels + channel];
      }
      monoData[i] = sum / channels;
    }

    return monoData;
  }

  /**
   * Get total buffer size in samples
   */
  private getTotalBufferSize(): number {
    return this.buffer.reduce((total, buffer) => total + buffer.length, 0);
  }

  /**
   * Get current buffer duration in seconds
   */
  getBufferDuration(): number {
    const sampleRate = this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    return this.getTotalBufferSize() / sampleRate;
  }

  /**
   * Clear buffer
   */
  clear(): void {
    this.buffer = [];
    this.bufferSize = 0;
  }

  /**
   * Get encoder statistics
   */
  getStats(): {
    bufferSize: number;
    bufferDuration: number;
    sampleRate: number;
    channels: number;
    bitDepth: number;
  } {
    return {
      bufferSize: this.bufferSize,
      bufferDuration: this.getBufferDuration(),
      sampleRate: this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: this.options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bitDepth: this.options.bitDepth || APP_CONFIG.AUDIO.BIT_DEPTH
    };
  }

  /**
   * Apply noise gate to remove silence
   */
  applyNoiseGate(audioData: Float32Array, threshold: number = 0.01): Float32Array {
    const gated = new Float32Array(audioData.length);
    let isSilencing = false;
    let silenceCounter = 0;
    const silenceThreshold = 10; // samples

    for (let i = 0; i < audioData.length; i++) {
      const sample = Math.abs(audioData[i]);
      
      if (sample < threshold) {
        silenceCounter++;
        if (silenceCounter > silenceThreshold) {
          isSilencing = true;
        }
      } else {
        silenceCounter = 0;
        isSilencing = false;
      }

      gated[i] = isSilencing ? 0 : audioData[i];
    }

    return gated;
  }

  /**
   * Apply gain (volume adjustment)
   */
  applyGain(audioData: Float32Array, gain: number): Float32Array {
    const result = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      result[i] = Math.max(-1, Math.min(1, audioData[i] * gain));
    }
    return result;
  }
}