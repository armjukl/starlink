import { APP_CONFIG } from '../constants';
import { int16ToFloat32 } from '../utils';

export interface PCMDecoderOptions {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

export interface PCMFrame {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  bitDepth: number;
  timestamp: number;
}

export class PCMDecoder {
  private options: PCMDecoderOptions;
  private audioContext: AudioContext | null = null;

  constructor(options: PCMDecoderOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bitDepth: options.bitDepth || 16, // Default to 24-bit for high quality 12.19 default16bit
    };
  }

  /**
   * Initialize audio context for playback
   */
  initializeAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.options.sampleRate
      });
      console.log('PCM Decoder AudioContext initialized:', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });
    }
    return this.audioContext;
  }

  /**
   * Decode PCM24 data to Float32Array
   */
  decodePCM24(pcmData: ArrayBuffer): Float32Array {
    const dataView = new DataView(pcmData);
    const sampleCount = pcmData.byteLength / 3; // 3 bytes per sample for 24-bit
    const float32Array = new Float32Array(sampleCount);

    // Convert 24-bit PCM to Float32Array
    for (let i = 0; i < sampleCount; i++) {
      const byteOffset = i * 3;
      
      // Read 24-bit signed integer (little endian)
      const byte1 = dataView.getUint8(byteOffset);
      const byte2 = dataView.getUint8(byteOffset + 1);
      const byte3 = dataView.getUint8(byteOffset + 2);
      
      // Combine bytes to form 24-bit value (little endian)
      let sample = (byte1) | (byte2 << 8) | (byte3 << 16);
      
      // Sign extend from 24-bit to 32-bit
      if (sample & 0x800000) {
        sample |= 0xFF000000;
      }
      
      // Convert to signed 32-bit integer first
      sample = sample | 0; // Force to signed 32-bit
      
      // Convert to Float32 (-1.0 to 1.0 range)
      // Use 8388608.0 (2^23) for proper float division
      float32Array[i] = sample / 8388608.0;
      
      // Clamp to prevent any overflow
      if (float32Array[i] > 1.0) float32Array[i] = 1.0;
      if (float32Array[i] < -1.0) float32Array[i] = -1.0;
    }

    return float32Array;
  }

  /**
   * Decode PCM16 data to Float32Array
   */
  decodePCM16(pcmData: ArrayBuffer): Float32Array {
    const dataView = new DataView(pcmData);
    const sampleCount = pcmData.byteLength / 2; // 2 bytes per sample for 16-bit
    const int16Array = new Int16Array(sampleCount);

    // Read 16-bit samples
    for (let i = 0; i < sampleCount; i++) {
      int16Array[i] = dataView.getInt16(i * 2, true); // little endian
    }

    // Convert to Float32Array
    return int16ToFloat32(int16Array);
  }

  /**
   * Decode PCM32 data to Float32Array
   */
  decodePCM32(pcmData: ArrayBuffer): Float32Array {
    const dataView = new DataView(pcmData);
    const sampleCount = pcmData.byteLength / 4; // 4 bytes per sample for 32-bit
    const float32Array = new Float32Array(sampleCount);

    // Read 32-bit float samples directly
    for (let i = 0; i < sampleCount; i++) {
      float32Array[i] = dataView.getFloat32(i * 4, true); // little endian
    }

    return float32Array;
  }

  /**
   * Decode generic PCM data based on bit depth
   */
  decodePCM(pcmData: ArrayBuffer, bitDepth: number = (this.options.bitDepth || 16)): Float32Array {
    switch (bitDepth) {
      case 16:
        return this.decodePCM16(pcmData);
      case 24:
        return this.decodePCM24(pcmData);
      case 32:
        return this.decodePCM32(pcmData);
      default:
        throw new Error(`Unsupported bit depth: ${bitDepth}`);
    }
  }

  /**
   * Upsample audio data to target sample rate
   */
  resample(audioData: Float32Array, inputSampleRate: number, targetSampleRate: number): Float32Array {
    if (inputSampleRate === targetSampleRate) {
      return audioData;
    }

    const ratio = targetSampleRate / inputSampleRate;
    const newLength = Math.floor(audioData.length * ratio);
    const resampledData = new Float32Array(newLength);

    // Simple linear interpolation for resampling
    for (let i = 0; i < newLength; i++) {
      const originalIndex = i / ratio;
      const leftIndex = Math.floor(originalIndex);
      const rightIndex = Math.min(leftIndex + 1, audioData.length - 1);
      const fraction = originalIndex - leftIndex;

      if (leftIndex >= audioData.length - 1) {
        resampledData[i] = audioData[audioData.length - 1];
      } else {
        resampledData[i] = 
          audioData[leftIndex] * (1 - fraction) + 
          audioData[rightIndex] * fraction;
      }
    }

    return resampledData;
  }

  /**
   * Mix multiple audio channels to mono
   */
  mixToMono(audioData: Float32Array, channels: number = (this.options.channels || APP_CONFIG.AUDIO.CHANNELS)): Float32Array {
    if (channels === 1) {
      return audioData;
    }

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
   * Apply gain (volume adjustment)
   */
  applyGain(audioData: Float32Array, gain: number): Float32Array {
    const result = new Float32Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      result[i] = Math.max(-1, Math.min(1, audioData[i] * gain));
    }
    return result;
  }

  /**
   * Apply fade in/out
   */
  applyFade(audioData: Float32Array, fadeInDuration: number = 0.1, fadeOutDuration: number = 0.1): Float32Array {
    const result = new Float32Array(audioData.length);
    const sampleRate = this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE;
    const fadeInSamples = Math.floor(fadeInDuration * sampleRate);
    const fadeOutSamples = Math.floor(fadeOutDuration * sampleRate);
    
    const length = audioData.length;
    
    for (let i = 0; i < length; i++) {
      let gain = 1.0;
      
      // Fade in
      if (i < fadeInSamples) {
        gain = i / fadeInSamples;
      }
      
      // Fade out
      else if (i > length - fadeOutSamples) {
        gain = (length - i) / fadeOutSamples;
      }
      
      result[i] = audioData[i] * gain;
    }
    
    return result;
  }

  /**
   * Create AudioBuffer for playback
   */
  createAudioBuffer(audioData: Float32Array, sampleRate?: number): AudioBuffer {
    const audioContext = this.initializeAudioContext();
    const channels = this.options.channels || APP_CONFIG.AUDIO.CHANNELS;
    
    const audioBuffer = audioContext.createBuffer(
      channels,
      audioData.length,
      sampleRate || this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE
    );

    // Create properly typed Float32Array for copyToChannel
    const channelData = new Float32Array(audioData);
    
    if (channels === 1) {
      audioBuffer.copyToChannel(channelData, 0);
    } else {
      // For multi-channel, assume mono data needs to be duplicated
      for (let channel = 0; channel < channels; channel++) {
        audioBuffer.copyToChannel(channelData, channel);
      }
    }

    return audioBuffer;
  }

  /**
   * Decode base64 encoded PCM data
   */
  decodeBase64PCM(base64Data: string): Float32Array {
    try {
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      return this.decodePCM(bytes.buffer);
    } catch (error) {
      console.error('Error decoding base64 PCM data:', error);
      throw new Error('Invalid base64 PCM data');
    }
  }

  /**
   * Process audio frame with optional resampling and normalization
   */
  processFrame(
    pcmFrame: PCMFrame, 
    options: {
      targetSampleRate?: number;
      normalize?: boolean;
      applyFade?: boolean;
      gain?: number;
    } = {}
  ): Float32Array {
    const {
      targetSampleRate = this.options.sampleRate,
      normalize = true,
      applyFade = true,
      gain = 1.0
    } = options;

    // Decode PCM data
    let audioData = this.decodePCM(pcmFrame.data, pcmFrame.bitDepth);

    // Resample if necessary
    if (pcmFrame.sampleRate !== targetSampleRate) {
      audioData = this.resample(audioData, pcmFrame.sampleRate, targetSampleRate || this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE);
    }

    // Mix to mono if needed
    if (pcmFrame.channels > 1) {
      audioData = this.mixToMono(audioData, pcmFrame.channels);
    }

    // Apply fade
    if (applyFade) {
      audioData = this.applyFade(audioData);
    }

    // Apply gain
    if (gain !== 1.0) {
      audioData = this.applyGain(audioData, gain);
    }

    // Normalize if requested
    if (normalize) {
      let maxValue = 0;
      for (let i = 0; i < audioData.length; i++) {
        const absValue = Math.abs(audioData[i]);
        if (absValue > maxValue) {
          maxValue = absValue;
        }
      }
      if (maxValue > 0) {
        audioData = this.applyGain(audioData, 1.0 / maxValue * 0.95);
      }
    }

    return audioData;
  }

  /**
   * Get decoder statistics
   */
  getStats(): {
    sampleRate: number;
    channels: number;
    bitDepth: number;
    audioContextState: string | null;
  } {
    return {
      sampleRate: this.options.sampleRate || APP_CONFIG.AUDIO.SAMPLE_RATE,
      channels: this.options.channels || APP_CONFIG.AUDIO.CHANNELS,
      bitDepth: this.options.bitDepth || 16,
      audioContextState: this.audioContext?.state || null
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
