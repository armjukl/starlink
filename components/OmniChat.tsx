'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Play,
  Trash2,
  Activity,
  Loader2,
  Shield,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import Live2DModelPanel from './Live2DModelPanel';
import { QwenOmniClient, QwenOmniCallbacks } from '../lib/qwen-omni-client';
import { PCMDecoder } from '../lib/audio/pcm-decoder';
import { AudioPlayer } from '../lib/audio/audio-player';
import { AudioProcessor } from '../lib/audio/audio-processor';
import { AudioSmoother } from '../lib/audio/audio-smoother';
import {
  requestMicrophonePermission,
  checkBrowserCompatibility,
  BrowserCompatibility,
} from '../lib/audio/microphone-permission';
import { testQwenConnection, validateApiKey, getEnvironmentInfo } from '../lib/test-connection';

// Types for component status
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type AppStatus = 'idle' | 'listening' | 'processing' | 'speaking';
type PermissionStatus = 'not_requested' | 'requesting' | 'granted' | 'denied' | 'error';
type ConnectionTestStatus = 'not_tested' | 'testing' | 'success' | 'failed';

export default function OmniChat() {
  // Application State
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [conversationHistory, setConversationHistory] = useState<{role: 'user' | 'assistant', text: string}[]>([]);
  const [volume, setVolume] = useState(0.7);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [voice, setVoice] = useState('Cherry');

  const defaultLive2DModelPath =
    process.env.NEXT_PUBLIC_LIVE2D_MODEL_PATH ||
    process.env.NEXT_PUBLIC_LIVE2D_DEFAULT_MODEL_PATH ||
    '/live2d/chara/chara.model3.json';
  
  // 权限和连接测试状态
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('not_requested');
  const [connectionTestStatus, setConnectionTestStatus] = useState<ConnectionTestStatus>('not_tested');
  const [connectionTestMessage, setConnectionTestMessage] = useState<string>('');
  const [connectionLatency, setConnectionLatency] = useState<number | null>(null);
  const [browserCompatibility, setBrowserCompatibility] = useState<BrowserCompatibility | null>(null);
  const [isRetryingPermission, setIsRetryingPermission] = useState(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState(false);

  // Refs for instances
  const clientRef = useRef<QwenOmniClient | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  const pcmDecoderRef = useRef<PCMDecoder | null>(null);
  const audioPlayerRef = useRef<AudioPlayer | null>(null);
  const audioSmootherRef = useRef<AudioSmoother | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  
  // 检查浏览器兼容性
  useEffect(() => {
    const compatibility = checkBrowserCompatibility();
    setBrowserCompatibility(compatibility);
    
    if (!compatibility.recommended) {
      setErrorMsg(`浏览器兼容性警告: ${compatibility.issues.join(', ')}`);
    }
  }, []);
  
  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, conversationHistory]);

  // Initialize Audio Components
  useEffect(() => {
    const initAudioComponents = async () => {
      try {
        // Initialize PCM Decoder
        pcmDecoderRef.current = new PCMDecoder({
          sampleRate: 24000, // Output format is usually 24kHz for high quality text-to-speech
          channels: 1,
          bitDepth: 16
        });

        // Initialize Audio Smoother
        audioSmootherRef.current = new AudioSmoother(5, 24000); // 5ms crossfade

        // Initialize Audio Player
        audioPlayerRef.current = new AudioPlayer({
          sampleRate: 24000, // Match decoder sample rate
          channels: 1,
          volume: volume,
          autoPlay: false,
          onPlay: () => {
            setAppStatus('speaking');
          },
          onEnded: () => {
            setAppStatus('listening');
          },
          onError: (error) => {
            console.error('Audio player error:', error);
            setErrorMsg(`Audio player error: ${error}`);
          }
        });

        await audioPlayerRef.current.initialize();
        
        // Initialize Audio Processor (Microphone)
        audioProcessorRef.current = new AudioProcessor({
          sampleRate: 16000, // Input sample rate required by Qwen
          channels: 1,
          chunkDurationMs: 100, // Send chunk every 100ms
          onAudioChunk: (buffer) => {
            // Forward audio chunk to WebSocket
            if (clientRef.current && clientRef.current.getConnectionStatus()) {
              clientRef.current.appendAudio(buffer);
            }
          },
          onAudioLevel: (level) => {
            setAudioLevel(level);
          },
          onError: (error) => {
            console.error('Audio processor error:', error);
            setErrorMsg(`Microphone error: ${error}`);
          }
        });
        
        // Initialize Audio Processor resources (request mic permission early or wait for start)
        // Note: initialization usually requires user interaction, so we might do it on "Start"
        
      } catch (error) {
        console.error('Failed to initialize audio components:', error);
        setErrorMsg('Failed to initialize audio components');
      }
    };

    initAudioComponents();

    return () => {
      // Clean up
      pcmDecoderRef.current?.dispose();
      audioPlayerRef.current?.dispose();
      audioProcessorRef.current?.dispose();
      clientRef.current?.disconnect();
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.setVolume(volume);
    }
  }, [volume]);

  // 处理麦克风权限请求
  const handleRequestMicrophonePermission = async () => {
    if (!browserCompatibility?.getUserMedia) {
      setErrorMsg('您的浏览器不支持麦克风功能，请使用 Chrome、Firefox 或 Edge 浏览器');
      return;
    }

    setIsRetryingPermission(true);
    setPermissionStatus('requesting');
    setErrorMsg(null);

    try {
      await requestMicrophonePermission();
      setPermissionStatus('granted');
      setErrorMsg(null);
    } catch (error: any) {
      console.error('麦克风权限请求失败:', error);
      setPermissionStatus('denied');
      setErrorMsg(error.message || '麦克风权限请求失败');
    } finally {
      setIsRetryingPermission(false);
    }
  };

  // 处理 API 连接测试
  const handleTestConnection = async () => {
    const apiKey = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || '';
    
    // 验证 API Key 格式
    const apiKeyValidation = validateApiKey(apiKey);
    if (!apiKeyValidation.valid) {
      setErrorMsg(apiKeyValidation.message);
      setConnectionTestStatus('failed');
      setConnectionTestMessage(apiKeyValidation.message);
      return;
    }

    setIsRetryingConnection(true);
    setConnectionTestStatus('testing');
    setConnectionTestMessage('🔄 正在测试连接...');
    setErrorMsg(null);

    try {
      const result = await testQwenConnection(apiKey);
      
      if (result.success) {
        setConnectionTestStatus('success');
        setConnectionTestMessage(result.message);
        setConnectionLatency(result.latency || null);
      } else {
        setConnectionTestStatus('failed');
        setConnectionTestMessage(result.message);
        setConnectionLatency(null);
        
        if (result.errorType === 'invalid_api_key') {
          setErrorMsg('API Key 无效，请检查 .env.local 文件中的 NEXT_PUBLIC_DASHSCOPE_API_KEY');
        } else {
          setErrorMsg(result.message);
        }
      }
    } catch (error: any) {
      console.error('连接测试失败:', error);
      setConnectionTestStatus('failed');
      setConnectionTestMessage(`❌ 连接测试失败: ${error.message}`);
      setConnectionLatency(null);
      setErrorMsg(`连接测试失败: ${error.message}`);
    } finally {
      setIsRetryingConnection(false);
    }
  };

  // 重试麦克风权限
  const retryMicrophonePermission = () => {
    handleRequestMicrophonePermission();
  };

  // 重试 API 连接
  const retryConnection = () => {
    handleTestConnection();
  };

  // Process and Queue Audio Logic
  const processAndQueueAudio = useCallback((audioData: ArrayBuffer) => {
    if (!pcmDecoderRef.current || !audioPlayerRef.current || !audioSmootherRef.current) return;

    try {
      // Decode PCM16 (S16LE) to Float32
      let processedAudio = pcmDecoderRef.current.decodePCM(audioData, 16);
      if (processedAudio.length === 0) return;

      // Calculate audio statistics for debugging (only log occasionally)
      if (Math.random() < 0.05) { // Log 5% of chunks
        let min = Infinity, max = -Infinity, sum = 0, sumAbs = 0;
        for (let i = 0; i < processedAudio.length; i++) {
          const sample = processedAudio[i];
          if (sample < min) min = sample;
          if (sample > max) max = sample;
          sum += sample;
          sumAbs += Math.abs(sample);
        }
        console.log('Audio chunk stats (before processing):', {
          samples: processedAudio.length,
          min: min.toFixed(3),
          max: max.toFixed(3),
          mean: (sum / processedAudio.length).toFixed(3),
          rms: Math.sqrt(sumAbs / processedAudio.length).toFixed(3)
        });
      }

      // Apply DC offset removal
      processedAudio = audioSmootherRef.current.removeDCOffset(processedAudio);

      // Apply smoothing and crossfade
      processedAudio = audioSmootherRef.current.smooth(processedAudio);

      // Apply soft limiting to prevent clipping
      const limitedAudio = new Float32Array(processedAudio.length);
      let clippedCount = 0;
      for (let i = 0; i < processedAudio.length; i++) {
        const sample = processedAudio[i];
        // Hard limit at ±0.95 to prevent distortion
        if (sample > 0.95) {
          limitedAudio[i] = 0.95;
          clippedCount++;
        } else if (sample < -0.95) {
          limitedAudio[i] = -0.95;
          clippedCount++;
        } else {
          limitedAudio[i] = sample;
        }
      }

      if (clippedCount > 0) {
        console.warn(`Clipped ${clippedCount} samples out of ${processedAudio.length}`);
      }

      // Enqueue for playback at 24kHz
      audioPlayerRef.current.enqueueFloat32Chunk(limitedAudio, 24000);
    } catch (error) {
      console.error('Error processing audio data:', error);
    }
  }, []);

  // Start Voice Session
  const startSession = async () => {
    setErrorMsg(null);
    
    // 检查前置条件
    if (permissionStatus !== 'granted') {
      setErrorMsg('请先请求麦克风权限');
      return;
    }
    
    if (connectionTestStatus !== 'success') {
      setErrorMsg('请先测试 API 连接');
      return;
    }
    
    setConnectionStatus('connecting');
    
    try {
      // 1. Initialize Microphone first to ensure permission
      if (audioProcessorRef.current) {
        await audioProcessorRef.current.initialize();
      }

      // 2. Setup Client
      const callbacks: QwenOmniCallbacks = {
        onOpen: () => {
          console.log('Connected to Qwen-Omni');
          setConnectionStatus('connected');

          // 2.1 VAD (server_vad) session config
          clientRef.current?.updateSession({
            modalities: ['text', 'audio'],
            voice: voice,
            instructions: '你是丰川祥子，风趣幽默的好助手，请自然地进行对话。',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'gummy-realtime-v1'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.1,
              prefix_padding_ms: 500,
              silence_duration_ms: 900
            }
          });
        },

        onSessionCreated: (sessionId) => {
          console.log('Session created:', sessionId);

          // 3. Start Capture after session is ready
          audioProcessorRef.current?.startCapture().then(() => {
            setAppStatus('listening');
          }).catch(err => {
            setErrorMsg(`Failed to start mic: ${err}`);
            setConnectionStatus('error');
          });
        },

        onSessionUpdated: () => {
           console.log('Session updated');
        },
        
        onClose: () => {
          console.log('Disconnected');
          setConnectionStatus('disconnected');
          setAppStatus('idle');
          setAudioLevel(0);
        },
        
        onError: (error, type) => {
          console.error(`Error (${type}):`, error);
          setErrorMsg(`${type || 'Error'}: ${error}`);
          // Don't necessarily disconnect on all errors, but for connection error we might
          if (type === 'WebSocket connection error' || type === 'reconnection') {
             setConnectionStatus('error');
             setAppStatus('idle');
          }
        },
        
        onResponseCreated: () => {
          setTranscript('');
          setAppStatus('processing');
        },

        onInputAudioTranscriptionCompleted: (text) => {
          setConversationHistory(prev => [...prev, { role: 'user', text }]);
        },

        onAudioTranscriptDelta: (delta) => {
          setTranscript(prev => prev + delta);
          setAppStatus('processing');
        },

        onAudioTranscriptDone: (text) => {
          setTranscript('');
          if (text) {
            setConversationHistory(prev => [...prev, { role: 'assistant', text }]);
          }
        },

        onResponseDone: () => {
          setAppStatus('listening');
        },

        onAudioData: (audioData) => {
          processAndQueueAudio(audioData);
        },

        onSpeechStarted: () => {
          // If user starts speaking while assistant audio is playing, stop local playback immediately.
          audioPlayerRef.current?.stop();
          audioPlayerRef.current?.clearQueue();
          setTranscript('');
          setAppStatus('listening');
        },

        onSpeechStopped: () => {
          console.log('Speech stopped');
        }
      };

      const apiKey = process.env.NEXT_PUBLIC_DASHSCOPE_API_KEY || '';
      if (!apiKey) {
        throw new Error('API Key is missing');
      }

      clientRef.current = new QwenOmniClient(apiKey, callbacks);
      await clientRef.current.connect();

    } catch (error: any) {
      console.error('Failed to start session:', error);
      setErrorMsg(error.message || 'Failed to start session');
      setConnectionStatus('error');
    }
  };

  // Stop Voice Session
  const stopSession = async () => {
    if (audioProcessorRef.current?.isActive()) {
      audioProcessorRef.current.stopCapture();
    }

    audioPlayerRef.current?.stop();
    audioPlayerRef.current?.clearQueue();
    audioSmootherRef.current?.reset(); // Reset audio smoother state
    setTranscript('');
    setAppStatus('idle');

    if (clientRef.current && clientRef.current.getConnectionStatus()) {
      // VAD 模式下无需 commit，直接结束会话并断开连接
      clientRef.current.finish();
      setTimeout(() => {
        clientRef.current?.disconnect();
      }, 200);
    } else {
      clientRef.current?.disconnect();
    }
  };

  const clearHistory = () => {
    setConversationHistory([]);
    setTranscript('');
  };

  const isConnected = connectionStatus === 'connected';
  const isBrowserSupported = browserCompatibility?.getUserMedia && browserCompatibility?.webAudioAPI;
  
  // 环境信息状态，只在客户端初始化
  const [environmentInfo, setEnvironmentInfo] = useState<any>(null);

  // 在客户端初始化环境信息
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setEnvironmentInfo(getEnvironmentInfo());
    }
  }, []);

  return (
    <div className="w-full max-w-6xl mx-auto p-4 md:p-6 bg-white rounded-xl shadow-lg my-8">
      {/* Header */}
      <header className="flex justify-between items-center mb-8 border-b pb-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
             <Activity className="text-blue-600" />
             OmniChat
           </h1>
           <p className="text-gray-500 text-sm mt-1">Real-time Voice Interaction</p>
        </div>
        
        {/* Connection Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-full border">
          {connectionStatus === 'connecting' ? (
             <Loader2 className="animate-spin text-orange-500" size={16} />
          ) : isConnected ? (
             <Wifi className="text-green-500" size={16} />
          ) : (
             <WifiOff className="text-gray-400" size={16} />
          )}
          <span className={`text-sm font-medium ${
            isConnected ? 'text-green-600' : 
            connectionStatus === 'connecting' ? 'text-orange-600' :
            connectionStatus === 'error' ? 'text-red-600' : 'text-gray-500'
          }`}>
            {connectionStatus === 'connected' ? 'Connected' : 
             connectionStatus === 'connecting' ? 'Connecting...' : 
             connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-1 space-y-6">
           
           {/* Browser Compatibility Warning */}
           {browserCompatibility && !browserCompatibility.recommended && (
             <div className="bg-red-50 border border-red-200 rounded-lg p-4">
               <div className="flex items-start gap-2">
                 <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={16} />
                 <div className="text-sm">
                   <div className="font-medium text-red-800 mb-1">浏览器兼容性警告</div>
                   <ul className="text-red-700 text-xs space-y-1">
                     {browserCompatibility.issues.map((issue, idx) => (
                       <li key={idx}>• {issue}</li>
                     ))}
                   </ul>
                 </div>
               </div>
             </div>
           )}

           {/* Permission & Connection Status Panel */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex flex-col gap-4">
                 
                 {/* Step 1: Request Microphone Permission */}
                 {permissionStatus === 'not_requested' && (
                   <button
                     onClick={handleRequestMicrophonePermission}
                     disabled={!isBrowserSupported || isRetryingPermission}
                     className={`w-full py-3 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                       !isBrowserSupported 
                         ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                         : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                     }`}
                   >
                     <Shield size={20} />
                     <span className="font-medium text-sm">请求麦克风权限</span>
                   </button>
                 )}

                 {permissionStatus === 'requesting' && (
                   <div className="w-full py-3 rounded-xl flex flex-col items-center justify-center gap-2 bg-blue-100 text-blue-700">
                     <Loader2 className="animate-spin" size={20} />
                     <span className="font-medium text-sm">正在请求权限...</span>
                   </div>
                 )}

                 {(permissionStatus === 'granted' || permissionStatus === 'error' || permissionStatus === 'denied') && (
                   <div className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 ${
                     permissionStatus === 'granted' 
                       ? 'bg-green-100 text-green-700' 
                       : 'bg-red-100 text-red-700'
                   }`}>
                     {permissionStatus === 'granted' ? (
                       <>
                         <ShieldCheck size={18} />
                         <span className="font-medium text-sm">✅ 麦克风已就绪</span>
                       </>
                     ) : (
                       <>
                         <AlertCircle size={18} />
                         <span className="font-medium text-sm">
                           {permissionStatus === 'denied' ? '❌ 麦克风权限被拒绝' : '❌ 权限请求失败'}
                         </span>
                       </>
                     )}
                   </div>
                 )}

                 {/* Step 2: Test API Connection */}
                 {permissionStatus === 'granted' && connectionTestStatus === 'not_tested' && (
                   <button
                     onClick={handleTestConnection}
                     disabled={isRetryingConnection}
                     className="w-full py-3 rounded-xl flex flex-col items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg transition-all"
                   >
                     <Wifi size={20} />
                     <span className="font-medium text-sm">测试 API 连接</span>
                   </button>
                 )}

                 {connectionTestStatus === 'testing' && (
                   <div className="w-full py-3 rounded-xl flex flex-col items-center justify-center gap-2 bg-green-100 text-green-700">
                     <Loader2 className="animate-spin" size={20} />
                     <span className="font-medium text-sm">🔄 测试连接中...</span>
                   </div>
                 )}

                 {connectionTestStatus === 'success' && (
                   <div className="w-full py-3 rounded-xl flex flex-col items-center justify-center gap-1 bg-green-100 text-green-700">
                     <div className="flex items-center gap-2">
                       <Wifi className="text-green-600" size={18} />
                       <span className="font-medium text-sm">✅ API 连接正常</span>
                     </div>
                     {connectionLatency && (
                       <span className="text-xs text-green-600">延迟: {connectionLatency}ms</span>
                     )}
                   </div>
                 )}

                 {(connectionTestStatus === 'failed' || connectionTestStatus === 'not_tested') && permissionStatus !== 'granted' && (
                   <div className="text-center py-2 text-xs text-gray-500">
                     {connectionTestStatus === 'failed' ? connectionTestMessage : '请先完成麦克风权限设置'}
                   </div>
                 )}

                 {/* Connection Test Failed - Show Retry */}
                 {connectionTestStatus === 'failed' && (
                   <button
                     onClick={retryConnection}
                     disabled={isRetryingConnection}
                     className="w-full py-2 rounded-lg flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all"
                   >
                     <RefreshCw size={16} className={isRetryingConnection ? 'animate-spin' : ''} />
                     <span className="font-medium text-sm">重试连接</span>
                   </button>
                 )}

                 {/* Permission Failed - Show Retry */}
                 {permissionStatus === 'denied' && (
                   <button
                     onClick={retryMicrophonePermission}
                     disabled={isRetryingPermission}
                     className="w-full py-2 rounded-lg flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all"
                   >
                     <RefreshCw size={16} className={isRetryingPermission ? 'animate-spin' : ''} />
                     <span className="font-medium text-sm">重新请求权限</span>
                   </button>
                 )}

                 {/* Step 3: Start Voice Session */}
                 {!isConnected && permissionStatus === 'granted' && connectionTestStatus === 'success' && (
                   <button
                     onClick={startSession}
                     disabled={connectionStatus === 'connecting'}
                     className={`w-full py-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all ${
                       connectionStatus === 'connecting' 
                         ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                         : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
                     }`}
                   >
                     <Mic size={24} />
                     <span className="font-semibold">开始语音</span>
                   </button>
                 )}

                 {/* Stop Voice Button */}
                 {isConnected && (
                   <button
                     onClick={stopSession}
                     className="w-full py-4 rounded-xl flex flex-col items-center justify-center gap-2 bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg transition-all"
                   >
                     <MicOff size={24} />
                     <span className="font-semibold">停止语音</span>
                   </button>
                 )}

                 {/* Status Detail */}
                 {isConnected && (
                    <div className="text-center py-2 bg-white rounded-lg border border-gray-100">
                      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">状态</div>
                      <div className="font-medium text-blue-600 capitalize flex items-center justify-center gap-2">
                        {appStatus === 'listening' && <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span></span>}
                        {appStatus === 'speaking' && <Play size={14} className="animate-pulse" />}
                        {appStatus === 'processing' && <Loader2 size={14} className="animate-spin" />}
                        {appStatus === 'idle' && <span className="w-3 h-3 rounded-full bg-gray-400"></span>}
                        {appStatus === 'listening' && '监听中'}
                        {appStatus === 'speaking' && '播放中'}
                        {appStatus === 'processing' && '处理中'}
                        {appStatus === 'idle' && '空闲'}
                      </div>
                    </div>
                 )}
              </div>
           </div>

           {/* Audio Visualizer / Level */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-500">MICROPHONE</span>
                <span className="text-xs text-gray-400">{Math.round(audioLevel)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                   className="h-full bg-blue-500 transition-all duration-75"
                   style={{ width: `${audioLevel}%` }}
                 />
              </div>
           </div>

           {/* Volume Control */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="flex items-center gap-3">
                 <button onClick={() => setVolume(v => v === 0 ? 0.7 : 0)}>
                   {volume === 0 ? <VolumeX size={18} className="text-gray-400"/> : <Volume2 size={18} className="text-gray-600"/>}
                 </button>
                 <input 
                   type="range" 
                   min="0" max="1" step="0.05"
                   value={volume}
                   onChange={(e) => setVolume(parseFloat(e.target.value))}
                   className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                 />
              </div>
           </div>

           {/* Settings (Voice) */}
           <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <label className="block text-xs font-semibold text-gray-500 mb-2">VOICE</label>
              <select 
                value={voice} 
                onChange={(e) => setVoice(e.target.value)}
                disabled={isConnected}
                className="w-full p-2 bg-white border border-gray-200 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Cherry">Cherry (Default)</option>
                <option value="Harry">Harry</option>
              </select>
           </div>
        </div>

        {/* Right Column: Live2D with Floating Chat Window */}
        <div className="lg:col-span-3 relative">
           {/* Live2D Area - Full Height */}
           <div className="h-[320px] lg:h-[440px]">
             <Live2DModelPanel defaultModelPath={defaultLive2DModelPath} />
           </div>

           {/* Floating Chat Window - Bottom overlay with glassmorphism */}
           <div className="absolute bottom-4 right-4 left-4 h-1/3 bg-white/80 backdrop-blur-sm rounded-t-2xl border border-white/20 shadow-2xl overflow-hidden z-20">
              {/* Chat Header */}
              <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 flex justify-between items-center">
                 <span className="text-xs font-medium text-gray-700">💬 Chat</span>
                 <button 
                   onClick={clearHistory}
                   className="text-gray-600 hover:text-red-500 flex items-center gap-1 text-xs transition-colors bg-gray-100 hover:bg-red-100 px-1.5 py-0.5 rounded-md"
                 >
                   <Trash2 size={10} /> Clear
                 </button>
              </div>

              {/* Chat Content Area */}
              <div 
                ref={transcriptRef}
                className="flex-1 p-3 overflow-y-auto space-y-3 bg-gradient-to-b from-transparent to-black/5"
                style={{ height: 'calc(100% - 40px)' }}
              >
                 {conversationHistory.length === 0 && !transcript && (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500">
                       <Activity size={16} className="mb-1 opacity-30" />
                       <p className="text-xs drop-shadow-sm text-center leading-tight">Start voice chat to see transcription</p>
                    </div>
                 )}

                 {conversationHistory.map((msg, idx) => (
                   <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] rounded-lg px-2 py-1.5 text-xs shadow-sm backdrop-blur-sm ${
                         msg.role === 'user' 
                           ? 'bg-blue-500/80 text-white rounded-tr-md border border-blue-400/30' 
                           : 'bg-white/80 text-gray-800 rounded-tl-md border border-white/40'
                      }`}>
                         {msg.text}
                      </div>
                   </div>
                 ))}

                 {/* Current Live Transcript */}
                 {transcript && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] bg-amber-100/80 backdrop-blur-sm text-gray-800 rounded-lg rounded-tl-md border border-amber-200/50 shadow-sm px-2 py-1.5 text-xs">
                         <div className="flex items-center gap-1.5">
                            <span className="animate-pulse w-1 h-1 bg-amber-500 rounded-full"></span>
                            <span className="font-medium text-xs">🎤</span>
                            <span className="leading-tight">{transcript}</span>
                         </div>
                      </div>
                    </div>
                 )}
              </div>

              {/* Error Message */}
              {errorMsg && (
                 <div className="absolute bottom-2 left-2 right-2">
                    <div className="text-red-700 text-xs bg-red-100/80 backdrop-blur-sm px-3 py-2 rounded-lg border border-red-200/50 animate-fade-in">
                       {errorMsg}
                    </div>
                 </div>
              )}
           </div>

           {/* Debug Information Panel */}
           {process.env.NODE_ENV === 'development' && environmentInfo && (
             <div className="mt-6 bg-gray-800 text-gray-300 rounded-lg p-4 text-xs font-mono">
               <div className="flex items-center gap-2 mb-2">
                 <AlertCircle size={14} />
                 <span className="font-semibold">调试信息</span>
               </div>
               <div className="space-y-1">
                 <div>浏览器: {environmentInfo.secure ? 'HTTPS' : 'HTTP'} ({environmentInfo.hostname})</div>
                 <div>支持: WebSocket={environmentInfo.webSocketSupported ? '✅' : '❌'}</div>
                 <div>麦克风权限: {permissionStatus}</div>
                 <div>连接测试: {connectionTestStatus}</div>
                 <div>网络状态: {connectionStatus}</div>
                 {connectionTestMessage && (
                   <div className="pt-1 border-t border-gray-700">
                     <div className="text-yellow-300">连接测试: {connectionTestMessage}</div>
                   </div>
                 )}
                 {browserCompatibility && (
                   <div className="pt-1 border-t border-gray-700">
                     <div>兼容性: getUserMedia={browserCompatibility.getUserMedia ? '✅' : '❌'}</div>
                     <div>推荐: {browserCompatibility.recommended ? '✅' : '❌'}</div>
                     {browserCompatibility.issues.length > 0 && (
                       <div className="text-yellow-300 mt-1">
                         问题: {browserCompatibility.issues.join(', ')}
                       </div>
                     )}
                   </div>
                 )}
               </div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
  }
