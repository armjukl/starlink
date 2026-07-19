// Test script for PCM24 decoder and AudioPlayer integration
import { PCMDecoder } from './pcm-decoder';
import { AudioPlayer } from './audio-player';

// Create a test PCM24 data buffer
function createTestPCM24Data(sampleCount: number = 1600): ArrayBuffer {
  const buffer = new ArrayBuffer(sampleCount * 3); // 3 bytes per 24-bit sample
  const view = new DataView(buffer);
  
  // Generate a simple sine wave at 440Hz (A note)
  const sampleRate = 16000;
  const frequency = 440;
  const amplitude = 0x7FFFFF * 0.1; // 10% of max amplitude
  
  for (let i = 0; i < sampleCount; i++) {
    const time = i / sampleRate;
    const value = Math.sin(2 * Math.PI * frequency * time) * amplitude;
    
    // Convert to 24-bit signed integer and store
    const int24Value = Math.max(-0x800000, Math.min(0x7FFFFF, Math.floor(value)));
    const byteOffset = i * 3;
    
    // Little-endian format
    view.setUint8(byteOffset, int24Value & 0xFF);
    view.setUint8(byteOffset + 1, (int24Value >> 8) & 0xFF);
    view.setUint8(byteOffset + 2, (int24Value >> 16) & 0xFF);
  }
  
  return buffer;
}

async function testPCM24Player() {
  console.log('Testing PCM24 Decoder and AudioPlayer...');
  
  try {
    // Initialize PCM Decoder
    const decoder = new PCMDecoder({
      sampleRate: 16000,
      channels: 1,
      bitDepth: 24
    });
    console.log('✓ PCM Decoder initialized');
    
    // Initialize Audio Player
    const player = new AudioPlayer({
      sampleRate: 16000,
      channels: 1,
      volume: 0.7,
      onPlay: () => console.log('🔊 Audio playback started'),
      onPause: () => console.log('⏸️  Audio playback paused'),
      onEnded: () => console.log('✅ Audio playback finished'),
      onError: (error) => console.error('❌ Audio player error:', error)
    });
    
    await player.initialize();
    console.log('✓ Audio Player initialized');
    
    // Create test PCM24 data
    const testData = createTestPCM24Data(1600); // 100ms of audio
    console.log(`✓ Generated test PCM24 data: ${testData.byteLength} bytes`);
    
    // Decode PCM24 data
    const float32Audio = decoder.decodePCM(testData, 24);
    console.log(`✓ Decoded PCM24 to Float32Array: ${float32Audio.length} samples`);
    
    // Create AudioBuffer for playback
    const audioBuffer = decoder.createAudioBuffer(float32Audio);
    console.log(`✓ Created AudioBuffer: ${audioBuffer.duration.toFixed(3)}s duration`);
    
    // Add to queue
    player.addToQueue(audioBuffer);
    console.log('✓ Added audio to playback queue');
    
    // Start playback
    await player.play();
    console.log('✓ Started playback');
    
    // Test volume control
    player.setVolume(0.5);
    console.log(`✓ Volume set to ${player.getVolume()}`);
    
    // Test status
    const status = player.getStatus();
    console.log('✓ Player status:', status);
    
    // Wait for playback to finish
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Clean up
    player.dispose();
    decoder.dispose();
    console.log('✓ Cleanup completed');
    
    console.log('\n🎉 All tests passed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

// Base64 encoding test
function testBase64Encoding() {
  console.log('\nTesting Base64 encoding/decoding...');
  
  const testData = createTestPCM24Data(800);
  
  // Convert to base64
  const bytes = new Uint8Array(testData);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);
  console.log(`✓ Encoded to base64: ${base64Data.length} characters`);
  
  // Convert back from base64
  const binaryString = atob(base64Data);
  const decodedBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    decodedBytes[i] = binaryString.charCodeAt(i);
  }
  
  // Verify data integrity
  const original = Array.from(bytes).slice(0, 100);
  const decoded = Array.from(decodedBytes).slice(0, 100);
  
  const isMatch = JSON.stringify(original) === JSON.stringify(decoded);
  console.log(`${isMatch ? '✓' : '❌'} Base64 roundtrip test: ${isMatch ? 'PASSED' : 'FAILED'}`);
  
  return base64Data;
}

// Queue management test
async function testAudioQueue() {
  console.log('\nTesting audio queue management...');
  
  const player = new AudioPlayer({
    sampleRate: 16000,
    channels: 1,
    autoPlay: false
  });
  
  await player.initialize();
  
  // Add multiple audio chunks
  for (let i = 0; i < 3; i++) {
    const testData = createTestPCM24Data(800);
    const decoder = new PCMDecoder({ sampleRate: 16000, channels: 1, bitDepth: 24 });
    const float32Audio = decoder.decodePCM(testData, 24);
    const audioBuffer = decoder.createAudioBuffer(float32Audio);
    
    player.addToQueue(audioBuffer);
    console.log(`✓ Added audio chunk ${i + 1} to queue`);
  }
  
  const status = player.getStatus();
  console.log(`✓ Queue status: ${status.queueLength} items`);
  
  // Play all items in queue
  await player.play();
  
  // Wait for all playback to complete
  await new Promise(resolve => setTimeout(resolve, 4000));
  
  player.dispose();
  console.log('✓ Queue test completed');
}

// Run all tests
if (require.main === module) {
  (async () => {
    await testPCM24Player();
    testBase64Encoding();
    await testAudioQueue();
    
    console.log('\n🎯 All test suites completed successfully!');
    process.exit(0);
  })().catch(error => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

export { testPCM24Player, testBase64Encoding, testAudioQueue };