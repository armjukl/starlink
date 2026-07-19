import { handleWebSocketError, generateRequestId } from './utils';

export interface QwenOmniTurnDetectionConfig {
  type: 'server_vad' | string;
  threshold?: number;
  prefix_padding_ms?: number;
  silence_duration_ms?: number;
}

export interface QwenOmniSessionConfig {
  modalities?: string[];
  voice?: string;
  instructions?: string;
  input_audio_format?: string;
  output_audio_format?: string;
  input_audio_transcription?: {
    model: string;
  };
  turn_detection?: QwenOmniTurnDetectionConfig | null;
}

export interface QwenOmniMessage {
  event_id: string;
  type: string;
  session?: QwenOmniSessionConfig;
  audio?: string;
  [key: string]: any;
}

export interface QwenOmniResponse {
  type: string;
  event_id?: string;
  session?: {
    id: string;
  };
  response?: {
    id?: string;
  };
  transcript?: {
    delta?: string;
    text?: string;
  };
  audio?: {
    delta?: string;
  };
  delta?: string;
  text?: string;
  error?: {
    message: string;
    type: string;
  };
  [key: string]: any;
}

export interface QwenOmniCallbacks {
  onSessionCreated?: (sessionId: string) => void;
  onSessionUpdated?: () => void;

  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onAudioCommitted?: () => void;

  onResponseCreated?: (responseId?: string) => void;
  onResponseDone?: () => void;

  onAudioTranscriptDelta?: (delta: string) => void;
  onAudioTranscriptDone?: (text: string) => void;

  onInputAudioTranscriptionCompleted?: (text: string) => void;

  onAudioData?: (audioData: ArrayBuffer) => void;
  onAudioDone?: () => void;

  onError?: (error: string, type?: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

export interface QwenOmniConnectOptions {
  model?: string;
  sessionConfig?: QwenOmniSessionConfig;
}

export class QwenOmniClient {
  private ws: WebSocket | null = null;
  private callbacks: QwenOmniCallbacks;
  private apiKey: string;

  private isConnected = false;
  private sessionId: string | null = null;

  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private isResponding = false;
  private currentResponseId: string | null = null;

  constructor(apiKey: string, callbacks: QwenOmniCallbacks = {}) {
    this.callbacks = callbacks;
    this.apiKey = apiKey;
  }

  async connect(options: QwenOmniConnectOptions = {}): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('QwenOmniClient.connect() must be called in a browser environment');
    }

    if (this.ws && this.isConnected) {
      return;
    }

    const model = options.model || 'qwen-omni-turbo-realtime';

    const url = new URL('wss://dashscope.aliyuncs.com/api-ws/v1/realtime');
    url.searchParams.set('model', model);

    // Browser WebSocket cannot set headers; try passing api_key via query param.
    // If the backend ignores this parameter, the server may still reject requests.
    if (this.apiKey) {
      url.searchParams.set('api_key', this.apiKey);
    }

    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(url.toString());

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          this.callbacks.onOpen?.();

          if (options.sessionConfig) {
            this.updateSession(options.sessionConfig);
          }

          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const response: QwenOmniResponse = JSON.parse(event.data);
            this.handleMessage(response);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
            this.callbacks.onError?.('Error parsing message');
          }
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.stopHeartbeat();
          this.callbacks.onClose?.();

          if (this.shouldReconnect) {
            this.handleReconnect();
          }

          // Helpful log
          console.log('Qwen-Omni WebSocket closed:', event.code, event.reason);
        };

        this.ws.onerror = (error) => {
          console.error('Qwen-Omni WebSocket error:', error);
          this.callbacks.onError?.('WebSocket connection error');
          reject(error);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;

    if (this.ws) {
      this.stopHeartbeat();
      try {
        this.ws.close(1000, 'Client disconnect');
      } catch {
        // ignore
      }
      this.ws = null;
    }

    this.isConnected = false;
    this.sessionId = null;
    this.isResponding = false;
    this.currentResponseId = null;
  }

  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  getIsResponding(): boolean {
    return this.isResponding;
  }

  updateSession(config: QwenOmniSessionConfig = {}): void {
    if (!this.isConnected) {
      console.warn('WebSocket not connected, cannot update session');
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'session.update',
      session: {
        modalities: config.modalities || ['text', 'audio'],
        voice: config.voice || 'Cherry',
        input_audio_format: config.input_audio_format || 'pcm16',
        output_audio_format: config.output_audio_format || 'pcm16',
        instructions: config.instructions || '你是一个友好的 AI 助手，请自然地进行对话。',
        input_audio_transcription: config.input_audio_transcription,
        turn_detection: config.turn_detection ?? null
      }
    };

    this.sendMessage(message);
  }

  appendAudio(audioData: ArrayBuffer): void {
    if (!this.isConnected) {
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'input_audio_buffer.append',
      audio: this.arrayBufferToBase64(audioData)
    };

    this.sendMessage(message);
  }

  commit(): void {
    if (!this.isConnected) {
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'input_audio_buffer.commit'
    };

    this.sendMessage(message);
  }

  cancelResponse(): void {
    if (!this.isConnected) {
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'response.cancel'
    };

    this.sendMessage(message);
  }

  finish(): void {
    if (!this.isConnected) {
      return;
    }

    const message: QwenOmniMessage = {
      event_id: generateRequestId(),
      type: 'session.finish'
    };

    this.sendMessage(message);
  }

  addEventListener(event: keyof QwenOmniCallbacks, callback: Function): void {
    (this.callbacks as any)[event] = callback;
  }

  removeEventListener(event: keyof QwenOmniCallbacks): void {
    (this.callbacks as any)[event] = undefined;
  }

  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  private handleMessage(response: QwenOmniResponse): void {
    switch (response.type) {
      case 'session.created': {
        if (response.session?.id) {
          this.sessionId = response.session.id;
          this.callbacks.onSessionCreated?.(response.session.id);
        }
        break;
      }

      case 'session.updated': {
        this.callbacks.onSessionUpdated?.();
        break;
      }

      case 'input_audio_buffer.speech_started': {
        this.callbacks.onSpeechStarted?.();

        // Interruption: if assistant is still responding, cancel the previous response.
        if (this.isResponding) {
          this.cancelResponse();
          this.isResponding = false;
          this.currentResponseId = null;
        }
        break;
      }

      case 'input_audio_buffer.speech_stopped': {
        this.callbacks.onSpeechStopped?.();
        break;
      }

      case 'input_audio_buffer.committed': {
        this.callbacks.onAudioCommitted?.();
        break;
      }

      case 'response.created': {
        this.isResponding = true;
        this.currentResponseId = response.response?.id || null;
        this.callbacks.onResponseCreated?.(this.currentResponseId || undefined);
        break;
      }

      case 'response.audio.delta': {
        const base64 = response.audio?.delta || response.delta;
        if (typeof base64 === 'string') {
          const audioBuffer = this.base64ToArrayBuffer(base64);
          this.callbacks.onAudioData?.(audioBuffer);
        }
        break;
      }

      case 'response.audio.done': {
        this.callbacks.onAudioDone?.();
        break;
      }

      case 'response.audio_transcript.delta': {
        const delta = response.transcript?.delta || response.delta;
        if (typeof delta === 'string') {
          this.callbacks.onAudioTranscriptDelta?.(delta);
        }
        break;
      }

      case 'response.audio_transcript.done': {
        const text = response.transcript?.text || response.text;
        if (typeof text === 'string') {
          this.callbacks.onAudioTranscriptDone?.(text);
        }
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const text =
          (typeof response.transcript === 'string' ? response.transcript : undefined) ||
          (typeof (response as any).transcription === 'string' ? (response as any).transcription : undefined) ||
          (typeof response.text === 'string' ? response.text : undefined) ||
          (typeof (response as any).transcript?.text === 'string' ? (response as any).transcript.text : undefined);

        if (text) {
          this.callbacks.onInputAudioTranscriptionCompleted?.(text);
        }
        break;
      }

      case 'response.done': {
        this.isResponding = false;
        this.currentResponseId = null;
        this.callbacks.onResponseDone?.();
        break;
      }

      case 'error': {
        if (response.error) {
          this.callbacks.onError?.(response.error.message, response.error.type);
        } else {
          this.callbacks.onError?.('Unknown error');
        }
        break;
      }

      default: {
        // Keep quiet in production; log in dev
        if (process.env.NODE_ENV === 'development') {
          console.log('Unhandled message type:', response.type, response);
        }
      }
    }
  }

  private sendMessage(message: QwenOmniMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      setTimeout(() => {
        this.connect().catch((error) => {
          handleWebSocketError(error, 'reconnection');
        });
      }, 1000 * this.reconnectAttempts);
    } else {
      this.callbacks.onError?.('Max reconnection attempts reached');
    }
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.ws) {
        const heartbeatMessage: QwenOmniMessage = {
          event_id: generateRequestId(),
          type: 'ping'
        };
        this.sendMessage(heartbeatMessage);
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
