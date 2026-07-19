/**
 * Audio Smoother - Applies smoothing and crossfade to reduce pops and clicks
 * in streaming audio playback
 */

export class AudioSmoother {
  private previousChunk: Float32Array | null = null;
  private crossfadeSamples: number;

  constructor(crossfadeDurationMs: number = 5, sampleRate: number = 24000) {
    // Calculate crossfade length in samples (default 5ms)
    this.crossfadeSamples = Math.floor((crossfadeDurationMs / 1000) * sampleRate);
  }

  /**
   * Apply smoothing and crossfade between audio chunks
   */
  smooth(chunk: Float32Array): Float32Array {
    if (!this.previousChunk || this.previousChunk.length === 0) {
      // First chunk, no crossfade needed
      this.previousChunk = chunk.slice();
      return chunk;
    }

    const result = new Float32Array(chunk.length);
    const fadeLength = Math.min(this.crossfadeSamples, chunk.length, this.previousChunk.length);

    // Apply crossfade at the beginning
    for (let i = 0; i < fadeLength; i++) {
      const fadeIn = i / fadeLength;
      const fadeOut = 1 - fadeIn;
      
      // Get the last sample from previous chunk
      const prevIndex = this.previousChunk.length - fadeLength + i;
      const prevSample = this.previousChunk[prevIndex];
      const currSample = chunk[i];
      
      // Crossfade
      result[i] = prevSample * fadeOut + currSample * fadeIn;
    }

    // Copy the rest without modification
    for (let i = fadeLength; i < chunk.length; i++) {
      result[i] = chunk[i];
    }

    // Store for next iteration
    this.previousChunk = chunk.slice();

    return result;
  }

  /**
   * Reset the smoother state
   */
  reset(): void {
    this.previousChunk = null;
  }

  /**
   * Apply DC offset removal (removes any constant bias in the signal)
   */
  removeDCOffset(chunk: Float32Array): Float32Array {
    // Calculate mean
    let sum = 0;
    for (let i = 0; i < chunk.length; i++) {
      sum += chunk[i];
    }
    const mean = sum / chunk.length;

    // Subtract mean if it's significant
    if (Math.abs(mean) > 0.001) {
      const result = new Float32Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        result[i] = chunk[i] - mean;
      }
      return result;
    }

    return chunk;
  }

  /**
   * Apply simple high-pass filter to remove very low frequencies (rumble)
   */
  applyHighPass(chunk: Float32Array, alpha: number = 0.95): Float32Array {
    if (chunk.length === 0) return chunk;

    const result = new Float32Array(chunk.length);
    result[0] = chunk[0];

    // Simple first-order high-pass filter
    for (let i = 1; i < chunk.length; i++) {
      result[i] = alpha * (result[i - 1] + chunk[i] - chunk[i - 1]);
    }

    return result;
  }
}
