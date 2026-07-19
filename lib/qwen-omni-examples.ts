/**
 * Examples and usage demonstrations for Qwen-Omni client
 */

import { QwenOmniClient, QwenOmniCallbacks } from './qwen-omni-client';

/**
 * Basic usage example
 */
export const basicExample = async () => {
  const callbacks: QwenOmniCallbacks = {
    onOpen: () => console.log('Connected to Qwen-Omni service'),
    onClose: () => console.log('Disconnected from service'),
    onError: (error, type) => console.error(`Error (${type}):`, error),
    
    // Session events
    onSessionCreated: (sessionId) => console.log('Session created:', sessionId),
    onSessionUpdated: () => console.log('Session updated'),
    
    // Audio input events
    onSpeechStarted: () => console.log('Speech started'),
    onSpeechStopped: () => console.log('Speech stopped'),
    onAudioCommitted: () => console.log('Audio committed'),
    
    // Response events
    onAudioTranscriptDelta: (delta) => console.log('Transcript delta:', delta),
    onAudioTranscriptDone: (text) => console.log('Final transcript:', text),
    onAudioData: (audioData) => console.log('Received audio data:', audioData.byteLength, 'bytes'),
    onAudioDone: () => console.log('Audio response done'),
    onResponseDone: () => console.log('Full response completed')
  };

  const apiKey = process.env.DASHSCOPE_API_KEY || 'your_api_key_here';
  const client = new QwenOmniClient(apiKey, callbacks);

  try {
    // Connect to the service
    await client.connect();
    console.log('WebSocket connected successfully');

    // Initialize session with custom configuration
    client.updateSession({
      modalities: ['text', 'audio'],
      voice: 'Cherry',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm24',
      instructions: '你是一个友好的AI助手，请用中文自然地进行对话。'
    });

    // Simulate audio data sending
    // Note: In real usage, this would be actual audio data from microphone
    const mockAudioData = new ArrayBuffer(1024);
    client.appendAudio(mockAudioData);
    
    // Commit the audio to trigger processing
    client.commit();

    // Finish when done
    client.finish();

  } catch (error) {
    console.error('Connection failed:', error);
  }
};

/**
 * Advanced usage with custom event listeners
 */
export const advancedExample = async () => {
  const apiKey = process.env.DASHSCOPE_API_KEY || 'your_api_key_here';
  const client = new QwenOmniClient(apiKey);

  // Add custom event listeners
  client.addEventListener('onOpen', () => {
    console.log('Connection established');
    client.updateSession(); // Auto-initialize session
  });

  client.addEventListener('onSessionCreated', (sessionId: string) => {
    console.log('Session initialized with ID:', sessionId);
    
    // Start streaming audio after session creation
    startAudioStreaming(client);
  });

  client.addEventListener('onAudioData', (audioData: ArrayBuffer) => {
    // Handle received audio data
    console.log('Processing audio response:', audioData.byteLength, 'bytes');
  });

  client.addEventListener('onAudioTranscriptDone', (text: string) => {
    console.log('AI Response transcript:', text);
  });

  client.addEventListener('onError', (error: string, type?: string) => {
    console.error(`Error [${type}]:`, error);
    if (type === 'connection') {
      // Attempt to reconnect after connection errors
      setTimeout(() => client.connect(), 5000);
    }
  });

  await client.connect();
};

/**
 * Simulate audio streaming
 */
const startAudioStreaming = (client: QwenOmniClient) => {
  // This would be replaced with real audio capture in production
  const interval = setInterval(() => {
    if (client.getConnectionStatus()) {
      // Generate mock audio data (in production, this would be real microphone data)
      const audioData = new ArrayBuffer(512);
      client.appendAudio(audioData);
    } else {
      clearInterval(interval);
    }
  }, 100); // Send audio every 100ms

  // Stop after 5 seconds for demo purposes
  setTimeout(() => {
    clearInterval(interval);
    client.commit();
    client.finish();
  }, 5000);
};

/**
 * Event handling with multiple listeners
 */
export const eventHandlingExample = async () => {
  const callbacks: QwenOmniCallbacks = {
    onOpen: () => {
      console.log('✓ Connection established');
      document.getElementById('connection-status')?.classList.add('connected');
    },
    
    onClose: () => {
      console.log('✗ Connection lost');
      document.getElementById('connection-status')?.classList.remove('connected');
    },
    
    onError: (error) => {
      console.error('✗ Error occurred:', error);
      showErrorNotification(error);
    },
    
    onSessionCreated: (sessionId) => {
      console.log('✓ Session initialized:', sessionId);
      updateUIState('session-ready');
    },
    
    onAudioData: (audioData) => {
      console.log('🎵 Received audio data');
      playAudioData(audioData);
    },
    
    onAudioTranscriptDone: (text) => {
      console.log('💬 AI Response:', text);
      updateChatHistory(text);
    }
  };

  const client = new QwenOmniClient(process.env.DASHSCOPE_API_KEY!, callbacks);
  await client.connect();
};

/**
 * Helper functions for UI updates
 */
const showErrorNotification = (error: string) => {
  // Implementation for showing error notifications
  console.error('Error notification:', error);
};

const updateUIState = (state: string) => {
  // Implementation for updating UI state
  console.log('UI state updated:', state);
};

const playAudioData = (audioData: ArrayBuffer) => {
  // Implementation for playing audio data
  console.log('Playing audio data:', audioData.byteLength, 'bytes');
};

const updateChatHistory = (text: string) => {
  // Implementation for updating chat history
  console.log('Chat history updated:', text);
};

/**
 * Cleanup and resource management
 */
export const cleanupExample = () => {
  const client = new QwenOmniClient(process.env.DASHSCOPE_API_KEY!);
  
  // Connect and use
  client.connect().then(() => {
    console.log('Client connected');
    
    // Set up cleanup on window unload
    const cleanup = () => {
      console.log('Cleaning up resources');
      client.disconnect();
    };
    
    window.addEventListener('beforeunload', cleanup);
    
    // Or manual cleanup
    return () => {
      window.removeEventListener('beforeunload', cleanup);
      cleanup();
    };
  });
};