/**
 * Example Usage of AudioProcessor for Continuous Audio Capture
 * 
 * This demonstrates how to use AudioProcessor to capture microphone audio,
 * encode to PCM16, and send to WebSocket in real-time.
 */

import { AudioProcessor } from './audio-processor';
import { arrayBufferToBase64 } from '../utils';

/**
 * Example 1: Basic continuous audio capture with WebSocket
 */
export async function basicContinuousCapture(websocket: WebSocket) {
  // Create audio processor
  const processor = new AudioProcessor({
    sampleRate: 16000,      // 16kHz required by Qwen-Omni
    channels: 1,            // Mono
    chunkDurationMs: 20,    // 20ms chunks (320 samples)
    
    // Callback fired every 20ms with PCM16 audio data
    onAudioChunk: (buffer: ArrayBuffer) => {
      // Convert PCM16 to base64 for WebSocket transmission
      const base64Audio = arrayBufferToBase64(buffer);
      
      // Send to Qwen-Omni WebSocket API
      websocket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));
      
      console.log(`Sent ${buffer.byteLength} bytes of PCM16 audio`);
    },
    
    // Real-time audio level for visualization
    onAudioLevel: (level: number) => {
      // Update UI progress bar (0-100)
      updateAudioLevelUI(level);
    },
    
    // Error handling
    onError: (error: string) => {
      console.error('Audio processor error:', error);
      showErrorToUser(error);
    }
  });
  
  try {
    // Step 1: Request microphone permission
    console.log('Requesting microphone access...');
    await processor.initialize();
    console.log('Microphone permission granted');
    
    // Step 2: Start continuous capture
    console.log('Starting audio capture...');
    await processor.startCapture();
    console.log('Audio capture started - streaming PCM16 data every 20ms');
    
    // Get processor stats
    const stats = processor.getStats();
    console.log('Processor stats:', stats);
    
    // Return processor for later control
    return processor;
    
  } catch (error) {
    console.error('Failed to start audio capture:', error);
    
    if (error instanceof Error) {
      if (error.name === 'NotAllowedError') {
        console.error('Microphone permission denied by user');
      } else if (error.name === 'NotFoundError') {
        console.error('No microphone found');
      }
    }
    
    throw error;
  }
}

/**
 * Example 2: Voice chat session with start/stop
 */
export class VoiceChatSession {
  private processor: AudioProcessor;
  private websocket: WebSocket;
  private isActive: boolean = false;
  
  constructor(websocket: WebSocket) {
    this.websocket = websocket;
    
    this.processor = new AudioProcessor({
      onAudioChunk: (buffer: ArrayBuffer) => {
        if (this.isActive && this.websocket.readyState === WebSocket.OPEN) {
          const base64Audio = arrayBufferToBase64(buffer);
          this.websocket.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
        }
      },
      onAudioLevel: (level: number) => {
        this.onAudioLevelChange(level);
      },
      onError: (error: string) => {
        this.onError(error);
      }
    });
  }
  
  async start(): Promise<void> {
    await this.processor.initialize();
    await this.processor.startCapture();
    this.isActive = true;
    console.log('Voice chat session started');
  }
  
  stop(): void {
    this.processor.stopCapture();
    this.isActive = false;
    
    // Signal end of audio input to server
    if (this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(JSON.stringify({
        type: 'input_audio_buffer.commit'
      }));
    }
    
    console.log('Voice chat session stopped');
  }
  
  dispose(): void {
    this.stop();
    this.processor.dispose();
  }
  
  isRecording(): boolean {
    return this.processor.isActive();
  }
  
  getStats() {
    return this.processor.getStats();
  }
  
  protected onAudioLevelChange(level: number): void {
    // Override in subclass or set as callback
  }
  
  protected onError(error: string): void {
    console.error('Voice chat error:', error);
  }
}

/**
 * Example 3: With Voice Activity Detection (VAD)
 */
export async function captureWithVAD(websocket: WebSocket) {
  const processor = new AudioProcessor({
    vadEnabled: true,       // Enable VAD
    vadThreshold: 0.01,     // Silence threshold (RMS)
    
    onAudioChunk: (buffer: ArrayBuffer) => {
      // Only called when speech is detected
      const base64Audio = arrayBufferToBase64(buffer);
      websocket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));
      console.log('Speech detected - sending audio');
    }
  });
  
  await processor.initialize();
  await processor.startCapture();
  
  return processor;
}

/**
 * Example 4: React component integration
 * 
 * Note: This is pseudo-code for demonstration. 
 * In a real React component, you would import React and use proper hooks.
 * 
 * ```typescript
 * import React, { useState, useEffect } from 'react';
 * 
 * export function useAudioProcessor(websocket: WebSocket | null) {
 *   const [processor, setProcessor] = useState<AudioProcessor | null>(null);
 *   const [isRecording, setIsRecording] = useState(false);
 *   const [audioLevel, setAudioLevel] = useState(0);
 *   
 *   useEffect(() => {
 *     if (!websocket) return;
 *     
 *     const proc = new AudioProcessor({
 *       onAudioChunk: (buffer: ArrayBuffer) => {
 *         const base64Audio = arrayBufferToBase64(buffer);
 *         websocket.send(JSON.stringify({
 *           type: 'input_audio_buffer.append',
 *           audio: base64Audio
 *         }));
 *       },
 *       onAudioLevel: setAudioLevel
 *     });
 *     
 *     setProcessor(proc);
 *     return () => proc.dispose();
 *   }, [websocket]);
 *   
 *   const startRecording = async () => {
 *     await processor?.initialize();
 *     await processor?.startCapture();
 *     setIsRecording(true);
 *   };
 *   
 *   const stopRecording = () => {
 *     processor?.stopCapture();
 *     setIsRecording(false);
 *   };
 *   
 *   return { isRecording, audioLevel, startRecording, stopRecording };
 * }
 * ```
 */
export function exampleReactIntegration() {
  console.log('See code comments for React integration example');
}

/**
 * Example 5: Monitoring and debugging
 */
export async function captureWithMonitoring(websocket: WebSocket) {
  let chunkCount = 0;
  let totalBytes = 0;
  const startTime = Date.now();
  
  const processor = new AudioProcessor({
    onAudioChunk: (buffer: ArrayBuffer) => {
      chunkCount++;
      totalBytes += buffer.byteLength;
      
      // Calculate stats
      const elapsed = (Date.now() - startTime) / 1000;
      const bytesPerSecond = totalBytes / elapsed;
      const chunksPerSecond = chunkCount / elapsed;
      
      console.log(`Chunk #${chunkCount}: ${buffer.byteLength} bytes`);
      console.log(`Average: ${bytesPerSecond.toFixed(0)} bytes/s, ${chunksPerSecond.toFixed(1)} chunks/s`);
      
      // Expected: ~640 bytes per chunk, ~50 chunks per second (20ms intervals)
      
      const base64Audio = arrayBufferToBase64(buffer);
      websocket.send(JSON.stringify({
        type: 'input_audio_buffer.append',
        audio: base64Audio
      }));
    },
    
    onAudioLevel: (level: number) => {
      if (level > 50) {
        console.log(`High audio level: ${level.toFixed(0)}%`);
      }
    }
  });
  
  await processor.initialize();
  await processor.startCapture();
  
  console.log('Monitoring audio capture...');
  const stats = processor.getStats();
  console.log('Expected chunk size:', stats.chunkSize, 'samples');
  console.log('Expected bytes per chunk:', stats.chunkSize * 2, 'bytes');
  console.log('Expected chunks per second:', 1000 / stats.chunkDurationMs);
  
  return processor;
}

// Utility functions (placeholder implementations)
function updateAudioLevelUI(level: number): void {
  // Update progress bar or visualization
  const bar = document.getElementById('audio-level-bar');
  if (bar) {
    bar.style.width = `${level}%`;
  }
}

function showErrorToUser(error: string): void {
  // Show error message to user
  console.error(`Audio Error: ${error}`);
}
