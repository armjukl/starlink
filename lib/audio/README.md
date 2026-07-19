# Audio Processing Module

This module provides continuous audio capture, PCM16 encoding, and real-time audio processing for the Starlink voice chat application.

## Components

### AudioProcessor

The main class for continuous audio capture and PCM16 encoding. It captures audio from the microphone every 20ms and encodes it to PCM16 format suitable for WebSocket transmission.

**Features:**
- Continuous audio capture using Web Audio API (ScriptProcessorNode)
- Automatic PCM16 encoding (16-bit signed integer, 16000Hz sample rate)
- Real-time audio level monitoring
- Optional Voice Activity Detection (VAD)
- Automatic resampling if browser sample rate differs from target
- Proper microphone permission handling

**Usage:**

```typescript
import { AudioProcessor } from './audio/audio-processor';
import { arrayBufferToBase64 } from './utils';

// Create processor with callback
const processor = new AudioProcessor({
  sampleRate: 16000,
  channels: 1,
  chunkDurationMs: 20,
  onAudioChunk: (buffer: ArrayBuffer) => {
    // Convert to base64 for WebSocket transmission
    const base64Audio = arrayBufferToBase64(buffer);
    
    // Send to WebSocket
    websocket.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
  },
  onAudioLevel: (level: number) => {
    // Update UI with audio level (0-100)
    console.log('Audio level:', level);
  },
  onError: (error: string) => {
    console.error('Audio error:', error);
  }
});

// Initialize and start capture
async function startVoiceChat() {
  try {
    // Request microphone permission
    await processor.initialize();
    
    // Start continuous capture
    await processor.startCapture();
    
    console.log('Voice capture started');
  } catch (error) {
    console.error('Failed to start capture:', error);
  }
}

// Stop capture
function stopVoiceChat() {
  processor.stopCapture();
}

// Clean up when done
function cleanup() {
  processor.dispose();
}
```

**Audio Parameters:**
- Sample Rate: 16000Hz (required by Qwen-Omni-Realtime)
- Bit Depth: 16-bit PCM
- Channels: Mono (1 channel)
- Chunk Duration: 20ms (320 samples at 16000Hz)
- Format: PCM16 (signed 16-bit integer)

### AudioCapturer

A flexible audio capturer that supports both continuous and buffered capture modes.

**Usage:**

```typescript
import { AudioCapturer } from './audio/audio-capturer';

// Continuous capture mode
const capturer = new AudioCapturer({
  sampleRate: 16000,
  channels: 1,
  useContinuousCapture: true,
  onData: (audioData: Float32Array) => {
    // Process Float32 audio data
    console.log('Received audio chunk:', audioData.length, 'samples');
  }
});

await capturer.initialize();
await capturer.startCapture();
```

### PCMEncoder

Encodes Float32 audio data to PCM16 format with buffering support.

**Usage:**

```typescript
import { PCMEncoder } from './audio/pcm-encoder';

const encoder = new PCMEncoder({
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16
});

// Add audio data (Float32Array from microphone)
encoder.addAudioData(audioData);

// Encode to PCM16 frames (20ms chunks)
const frames = encoder.encodeFrames();

// Each frame contains:
frames.forEach(frame => {
  console.log('PCM16 data:', frame.data); // Int16Array
  console.log('Sample rate:', frame.sampleRate);
  console.log('Timestamp:', frame.timestamp);
});

// Or encode single buffer directly
const pcm16Data = encoder.encodeSingle(audioData);
const arrayBuffer = encoder.encodeSingleToBuffer(audioData);
```

## Technical Details

### PCM16 Encoding

PCM16 is a raw audio format that represents audio as 16-bit signed integers:
- Range: -32768 to 32767
- Conversion from Float32: `value * 0x7FFF` (for positive) or `value * 0x8000` (for negative)
- Float32 range: -1.0 to 1.0

### Web Audio API

The implementation uses:
- **ScriptProcessorNode** for continuous audio processing (deprecated but widely supported)
- **AudioWorklet** can be used as an alternative (requires separate worker file)
- **AnalyserNode** for real-time audio level visualization
- **MediaStreamSource** to capture microphone input

### Resampling

If the browser's audio context sample rate (typically 44100Hz or 48000Hz) differs from the target rate (16000Hz), linear interpolation resampling is applied automatically.

### Voice Activity Detection (VAD)

Optional VAD can be enabled to filter out silence:

```typescript
const processor = new AudioProcessor({
  vadEnabled: true,
  vadThreshold: 0.01, // RMS threshold
  onAudioChunk: (buffer) => {
    // Only called when speech is detected
  }
});
```

## Integration with WebSocket

Example integration with Qwen-Omni WebSocket API:

```typescript
import { AudioProcessor } from './audio/audio-processor';
import { arrayBufferToBase64 } from './utils';

const processor = new AudioProcessor({
  onAudioChunk: (buffer: ArrayBuffer) => {
    const base64Audio = arrayBufferToBase64(buffer);
    
    // Send to Qwen-Omni API
    websocket.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
  }
});

// Start continuous streaming
await processor.initialize();
await processor.startCapture();

// When user stops speaking
processor.stopCapture();

// Signal end of audio input
websocket.send(JSON.stringify({
  type: 'input_audio_buffer.commit'
}));
```

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires user gesture for audio context)
- Mobile browsers: Supported (may require HTTPS)

## Error Handling

Always handle errors properly:

```typescript
try {
  await processor.initialize();
  await processor.startCapture();
} catch (error) {
  if (error.name === 'NotAllowedError') {
    console.error('Microphone permission denied');
  } else if (error.name === 'NotFoundError') {
    console.error('No microphone found');
  } else {
    console.error('Audio error:', error);
  }
}
```

## Performance

- Chunk duration: 20ms (320 samples at 16000Hz)
- Memory per chunk: 640 bytes (320 samples × 2 bytes per sample)
- Throughput: ~32KB/s of PCM16 audio data
- CPU usage: Minimal (native Web Audio API processing)
