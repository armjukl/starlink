# 集成指南：AudioProcessor + QwenOmniClient

本指南说明如何将新实现的 `AudioProcessor` 集成到现有的 `QwenOmniClient` 中，实现连续音频流传输。

## 快速集成

### 方案一：直接替换现有录音逻辑（推荐）

在 `components/OmniChat.tsx` 中替换当前的录音实现：

```typescript
import { AudioProcessor } from '../lib/audio/audio-processor';
import { arrayBufferToBase64 } from '../lib/utils';

export default function OmniChat() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  
  const clientRef = useRef<QwenOmniClient | null>(null);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  
  // 初始化 AudioProcessor
  useEffect(() => {
    const processor = new AudioProcessor({
      sampleRate: 16000,
      channels: 1,
      chunkDurationMs: 20,
      
      // 每 20ms 自动发送 PCM16 音频到服务器
      onAudioChunk: (buffer: ArrayBuffer) => {
        if (clientRef.current && isRecording) {
          const base64Audio = arrayBufferToBase64(buffer);
          
          // 直接发送到 Qwen-Omni WebSocket
          clientRef.current.appendAudioBase64(base64Audio);
        }
      },
      
      // 实时音频电平
      onAudioLevel: (level: number) => {
        setAudioLevel(level);
      },
      
      // 错误处理
      onError: (error: string) => {
        console.error('Audio processor error:', error);
        setIsRecording(false);
      }
    });
    
    audioProcessorRef.current = processor;
    
    return () => {
      processor.dispose();
    };
  }, [isRecording]);
  
  // 开始录音
  const startRecording = async () => {
    try {
      const processor = audioProcessorRef.current;
      if (!processor) return;
      
      // 初始化麦克风
      await processor.initialize();
      
      // 开始连续采集
      await processor.startCapture();
      
      setIsRecording(true);
      console.log('Continuous audio streaming started');
    } catch (error) {
      console.error('Failed to start recording:', error);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alert('麦克风权限被拒绝，请允许访问麦克风');
        } else if (error.name === 'NotFoundError') {
          alert('未找到麦克风设备');
        }
      }
    }
  };
  
  // 停止录音
  const stopRecording = () => {
    const processor = audioProcessorRef.current;
    if (!processor) return;
    
    processor.stopCapture();
    setIsRecording(false);
    setAudioLevel(0);
    
    // 提交音频（告诉服务器音频输入结束）
    clientRef.current?.commit();
    
    console.log('Audio streaming stopped');
  };
  
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };
  
  // ... 其余 UI 代码保持不变
}
```

### 方案二：创建专用的音频流管理器

创建 `lib/audio/audio-stream-manager.ts`：

```typescript
import { AudioProcessor } from './audio-processor';
import { QwenOmniClient } from '../qwen-omni-client';
import { arrayBufferToBase64 } from '../utils';

export class AudioStreamManager {
  private processor: AudioProcessor;
  private client: QwenOmniClient;
  private isStreaming: boolean = false;
  
  constructor(
    client: QwenOmniClient,
    onAudioLevel?: (level: number) => void
  ) {
    this.client = client;
    
    this.processor = new AudioProcessor({
      sampleRate: 16000,
      channels: 1,
      chunkDurationMs: 20,
      
      onAudioChunk: (buffer: ArrayBuffer) => {
        if (this.isStreaming) {
          const base64Audio = arrayBufferToBase64(buffer);
          this.client.appendAudioBase64(base64Audio);
        }
      },
      
      onAudioLevel: (level: number) => {
        onAudioLevel?.(level);
      },
      
      onError: (error: string) => {
        console.error('Audio stream error:', error);
        this.stop();
      }
    });
  }
  
  async start(): Promise<void> {
    await this.processor.initialize();
    await this.processor.startCapture();
    this.isStreaming = true;
    console.log('Audio streaming started');
  }
  
  stop(): void {
    this.processor.stopCapture();
    this.isStreaming = false;
    this.client.commit();
    console.log('Audio streaming stopped');
  }
  
  isActive(): boolean {
    return this.isStreaming;
  }
  
  getAudioLevel(): number {
    return this.processor.getCurrentAudioLevel();
  }
  
  getStats() {
    return this.processor.getStats();
  }
  
  dispose(): void {
    this.stop();
    this.processor.dispose();
  }
}
```

然后在组件中使用：

```typescript
import { AudioStreamManager } from '../lib/audio/audio-stream-manager';

export default function OmniChat() {
  const [audioLevel, setAudioLevel] = useState(0);
  const streamManagerRef = useRef<AudioStreamManager | null>(null);
  
  useEffect(() => {
    if (clientRef.current) {
      const manager = new AudioStreamManager(
        clientRef.current,
        (level) => setAudioLevel(level)
      );
      streamManagerRef.current = manager;
      
      return () => manager.dispose();
    }
  }, [clientRef.current]);
  
  const toggleRecording = async () => {
    const manager = streamManagerRef.current;
    if (!manager) return;
    
    if (manager.isActive()) {
      manager.stop();
    } else {
      await manager.start();
    }
  };
}
```

## QwenOmniClient 增强

为了更好地支持连续音频流，可以在 `QwenOmniClient` 中添加一个便捷方法：

```typescript
// 在 lib/qwen-omni-client.ts 中添加

export class QwenOmniClient {
  // ... 现有代码 ...
  
  /**
   * 添加 base64 编码的音频数据（用于连续流）
   */
  appendAudioBase64(base64Audio: string): void {
    if (!this.isConnected() || !this.sessionId) {
      console.warn('Cannot append audio: not connected or no active session');
      return;
    }
    
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });
  }
  
  /**
   * 提交音频缓冲区（标记音频输入结束）
   */
  commit(): void {
    if (!this.isConnected() || !this.sessionId) {
      return;
    }
    
    this.send({
      type: 'input_audio_buffer.commit'
    });
  }
}
```

## 完整示例：Push-to-Talk（按住说话）

```typescript
export default function OmniChat() {
  const [isPushing, setIsPushing] = useState(false);
  const audioProcessorRef = useRef<AudioProcessor | null>(null);
  
  useEffect(() => {
    const processor = new AudioProcessor({
      onAudioChunk: (buffer: ArrayBuffer) => {
        if (isPushing && clientRef.current) {
          const base64Audio = arrayBufferToBase64(buffer);
          clientRef.current.appendAudioBase64(base64Audio);
        }
      }
    });
    
    audioProcessorRef.current = processor;
    
    // 预初始化（避免首次延迟）
    processor.initialize().catch(console.error);
    
    return () => processor.dispose();
  }, []);
  
  const handleMouseDown = async () => {
    const processor = audioProcessorRef.current;
    if (!processor) return;
    
    try {
      // 确保已初始化
      if (!processor.isActive()) {
        await processor.startCapture();
      }
      
      setIsPushing(true);
      console.log('Push-to-talk: recording started');
    } catch (error) {
      console.error('Failed to start push-to-talk:', error);
    }
  };
  
  const handleMouseUp = () => {
    setIsPushing(false);
    
    // 提交当前音频段
    clientRef.current?.commit();
    
    console.log('Push-to-talk: recording stopped');
  };
  
  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      className={`px-6 py-6 rounded-full ${
        isPushing ? 'bg-red-500' : 'bg-blue-500'
      }`}
    >
      <Mic size={32} />
      {isPushing ? '松开停止' : '按住说话'}
    </button>
  );
}
```

## 完整示例：自动 VAD（语音活动检测）

```typescript
export default function OmniChat() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  useEffect(() => {
    const processor = new AudioProcessor({
      vadEnabled: true,        // 启用 VAD
      vadThreshold: 0.01,      // 根据环境调整
      
      onAudioChunk: (buffer: ArrayBuffer) => {
        // 只有检测到语音时才会触发
        setIsSpeaking(true);
        
        const base64Audio = arrayBufferToBase64(buffer);
        clientRef.current?.appendAudioBase64(base64Audio);
        
        // 重置说话状态（用于 UI 指示）
        setTimeout(() => setIsSpeaking(false), 100);
      }
    });
    
    audioProcessorRef.current = processor;
    return () => processor.dispose();
  }, []);
  
  return (
    <div>
      <button onClick={() => toggleListening()}>
        {isListening ? '停止监听' : '开始监听'}
      </button>
      
      {isListening && (
        <div className={`status ${isSpeaking ? 'speaking' : 'silent'}`}>
          {isSpeaking ? '🗣️ 检测到语音' : '🤫 等待语音...'}
        </div>
      )}
    </div>
  );
}
```

## 性能优化建议

### 1. 预加载音频处理器

```typescript
useEffect(() => {
  // 在组件挂载时预初始化，避免首次点击延迟
  const processor = new AudioProcessor({ /* ... */ });
  processor.initialize().then(() => {
    console.log('Audio processor ready');
  });
  
  audioProcessorRef.current = processor;
  return () => processor.dispose();
}, []);
```

### 2. 错误重试机制

```typescript
const startRecordingWithRetry = async (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await processor.initialize();
      await processor.startCapture();
      return;
    } catch (error) {
      console.warn(`Retry ${i + 1}/${maxRetries}:`, error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Failed to start recording after retries');
};
```

### 3. 监控统计信息

```typescript
useEffect(() => {
  const interval = setInterval(() => {
    const stats = audioProcessorRef.current?.getStats();
    if (stats) {
      console.log('Audio stats:', {
        bufferSize: stats.bufferSampleCount,
        duration: `${stats.bufferDuration * 1000}ms`,
        chunkSize: stats.chunkSize
      });
    }
  }, 5000);
  
  return () => clearInterval(interval);
}, []);
```

## 故障排查

### 问题：音频断断续续

**解决方案：**
- 检查网络连接
- 增加缓冲区大小（虽然会增加延迟）
- 确保主线程不被阻塞

### 问题：麦克风权限被拒

**解决方案：**
```typescript
try {
  await processor.initialize();
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // 显示友好的提示
    showPermissionDialog();
  }
}
```

### 问题：音频电平总是 0

**解决方案：**
- 检查麦克风是否静音
- 在系统设置中检查麦克风音量
- 验证 `onAudioLevel` 回调是否正确设置

### 问题：编译错误 "ArrayBufferLike not assignable to ArrayBuffer"

**已解决：** 代码已修复，使用正确的 ArrayBuffer 创建方式

## 最佳实践

1. **总是处理权限错误**
2. **在组件卸载时调用 `dispose()`**
3. **使用 useRef 存储 processor 实例**
4. **不要在 render 函数中创建新的 processor**
5. **监控音频统计信息以诊断问题**
6. **考虑添加用户反馈（音频波形、电平指示器）**

## 总结

使用新的 `AudioProcessor` 可以实现：
- ✅ 连续、低延迟的音频流
- ✅ 自动 PCM16 编码
- ✅ 简单的 API 接口
- ✅ 完整的错误处理
- ✅ 可选的 VAD 支持

只需几行代码即可替换现有的录音逻辑！
