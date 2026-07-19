// Configuration constants for the Starlink application

export const APP_CONFIG = {
  // WebSocket configuration
  WEBSOCKET_URL: 'wss://dashscope.aliyuncs.com/ws/v1/services/aigc-audio-generation/voice-generation',
  
  // Audio configuration
  AUDIO: {
    SAMPLE_RATE: 24000,
    CHANNELS: 1,
    BIT_DEPTH: 16,
    CHUNK_SIZE: 1024,
    FORMAT: 'audio/pcm'
  },
  
  // WebRTC configuration
  WEBRTC: {
    ICE_SERVERS: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  },
  
  // API endpoints
  API: {
    AUTH: '/api/auth',
    WEBSOCKET: '/api/ws'
  },
  
  // UI configuration
  UI: {
    MAX_AUDIO_LEVEL: 100,
    AUDIO_UPDATE_INTERVAL: 100
  }
};

// Environment-specific settings
export const getEnvironmentConfig = () => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return {
    isDevelopment,
    apiKey: process.env.DASHSCOPE_API_KEY,
    wsUrl: isDevelopment 
      ? 'ws://localhost:8080' 
      : APP_CONFIG.WEBSOCKET_URL
  };
};
