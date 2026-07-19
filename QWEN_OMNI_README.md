# Qwen-Omni Realtime WebSocket 客户端

本项目实现了一个完整的 WebSocket 客户端，用于连接阿里百炼 Qwen-Omni-Realtime 服务。

## 功能特性

### 🎯 核心功能
- **WebSocket 连接**：自动连接到 `wss://dashscope.aliyuncs.com/api-ws/v1/realtime`
- **会话管理**：完整的会话生命周期管理
- **音频流处理**：实时音频数据发送和接收
- **事件驱动**：完整的事件回调系统
- **自动重连**：网络断开时自动重连
- **心跳检测**：保持连接稳定

### 📡 支持的事件
**发送事件：**
- `session.update` - 初始化会话配置
- `input_audio_buffer.append` - 追加音频数据
- `input_audio_buffer.commit` - 提交音频缓冲区
- `session.finish` - 结束会话

**接收事件：**
- `session.created` - 会话创建成功
- `session.updated` - 会话配置更新成功
- `input_audio_buffer.speech_started` - 检测到语音开始
- `input_audio_buffer.speech_stopped` - 检测到语音结束
- `input_audio_buffer.committed` - 音频缓冲区提交成功
- `response.audio_transcript.delta` - 流式文本转录
- `response.audio.delta` - 流式音频数据
- `response.audio_transcript.done` - 文本转录完成
- `response.audio.done` - 音频生成完成
- `response.done` - 完整响应完成
- `error` - 错误事件

## 项目结构

```
/home/engine/project/
├── lib/
│   ├── qwen-omni-client.ts      # 核心客户端实现
│   ├── qwen-omni-examples.ts    # 使用示例
│   ├── constants.ts             # 配置常量
│   ├── utils.ts                 # 工具函数
│   └── audio/                   # 音频处理模块
├── components/
│   └── OmniChat.tsx             # React 聊天界面组件
├── pages/
│   └── index.tsx                # 主页面
└── .env.local                   # 环境变量配置
```

## 快速开始

### 1. 环境配置

创建 `.env.local` 文件并配置你的 API Key：

```bash
# 从阿里云百炼平台获取的 API Key
DASHSCOPE_API_KEY=your_actual_api_key_here
NEXT_PUBLIC_DASHSCOPE_API_KEY=your_actual_api_key_here
```

### 2. 基本使用

```typescript
import { QwenOmniClient, QwenOmniCallbacks } from './lib/qwen-omni-client';

// 定义事件回调
const callbacks: QwenOmniCallbacks = {
  onOpen: () => console.log('连接成功'),
  onClose: () => console.log('连接断开'),
  onError: (error, type) => console.error(`错误 [${type}]:`, error),
  
  // 会话事件
  onSessionCreated: (sessionId) => console.log('会话创建:', sessionId),
  onSessionUpdated: () => console.log('会话更新'),
  
  // 音频事件
  onSpeechStarted: () => console.log('语音开始'),
  onSpeechStopped: () => console.log('语音结束'),
  onAudioCommitted: () => console.log('音频已提交'),
  
  // 响应事件
  onAudioTranscriptDelta: (delta) => console.log('转录:', delta),
  onAudioTranscriptDone: (text) => console.log('最终转录:', text),
  onAudioData: (audioData) => console.log('收到音频数据:', audioData.byteLength),
  onResponseDone: () => console.log('响应完成')
};

// 创建客户端实例
const client = new QwenOmniClient('your_api_key', callbacks);

// 连接并初始化
async function initChat() {
  try {
    await client.connect();
    
    // 初始化会话
    client.updateSession({
      modalities: ['text', 'audio'],
      voice: 'Cherry',
      input_audio_format: 'pcm16',
      output_audio_format: 'pcm24',
      instructions: '你是一个友好的 AI 助手，请自然地进行对话。'
    });
    
  } catch (error) {
    console.error('连接失败:', error);
  }
}

// 发送音频数据
function sendAudio(audioData: ArrayBuffer) {
  client.appendAudio(audioData);
  client.commit();
}

// 结束会话
function endChat() {
  client.finish();
  client.disconnect();
}
```

### 3. React 组件使用

```tsx
import OmniChat from './components/OmniChat';

export default function App() {
  return (
    <div className="app">
      <OmniChat />
    </div>
  );
}
```

## API 参考

### QwenOmniClient 类

#### 构造函数
```typescript
constructor(apiKey: string, callbacks: QwenOmniCallbacks = {})
```

#### 主要方法

**连接管理**
```typescript
async connect(): Promise<void>
disconnect(): void
getConnectionStatus(): boolean
```

**会话管理**
```typescript
updateSession(config?: {
  modalities?: string[];
  voice?: string;
  input_audio_format?: string;
  output_audio_format?: string;
  instructions?: string;
}): void

finish(): void
```

**音频处理**
```typescript
appendAudio(audioData: ArrayBuffer): void
commit(): void
```

**事件管理**
```typescript
addEventListener(event: keyof QwenOmniCallbacks, callback: Function): void
removeEventListener(event: keyof QwenOmniCallbacks): void
```

### QwenOmniCallbacks 接口

```typescript
interface QwenOmniCallbacks {
  // 连接事件
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: string, type?: string) => void;
  
  // 会话事件
  onSessionCreated?: (sessionId: string) => void;
  onSessionUpdated?: () => void;
  
  // 音频输入事件
  onSpeechStarted?: () => void;
  onSpeechStopped?: () => void;
  onAudioCommitted?: () => void;
  
  // 响应事件
  onAudioTranscriptDelta?: (delta: string) => void;
  onAudioTranscriptDone?: (text: string) => void;
  onAudioData?: (audioData: ArrayBuffer) => void;
  onAudioDone?: () => void;
  onResponseDone?: () => void;
}
```

## 音频配置

### 默认配置
- **模型**: `qwen3-omni-flash-realtime`
- **语音**: `Cherry`
- **输入格式**: `pcm16`
- **输出格式**: `pcm24`
- **模态**: `["text", "audio"]`

### 自定义配置
```typescript
client.updateSession({
  modalities: ['text', 'audio'],
  voice: 'Cherry', // 或其他可用语音
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm24',
  instructions: '自定义指令...',
  turn_detection: null // 关闭语音检测
});
```

## 错误处理

### 连接错误
```typescript
onError: (error, type) => {
  switch (type) {
    case 'connection':
      console.error('连接失败:', error);
      // 处理连接错误，可能需要重试
      break;
    case 'auth':
      console.error('认证失败:', error);
      // 检查 API Key
      break;
    default:
      console.error('其他错误:', error);
  }
}
```

### 自动重连
客户端会自动处理网络断开和重连：
- 最大重试次数：5 次
- 重连间隔：递增延迟（1s, 2s, 3s, 4s, 5s）
- 心跳检测：每 30 秒发送 ping

## 开发指南

### 运行项目
```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 类型检查
npm run type-check
```

### 音频处理注意事项

1. **音频格式**：客户端支持 PCM16 输入，PCM24 输出
2. **采样率**：建议使用 16kHz
3. **声道数**：单声道
4. **实时性**：音频数据会实时发送给服务器

### 调试技巧

1. **启用详细日志**：
```typescript
const client = new QwenOmniClient(apiKey, {
  onError: (error, type) => console.error(`[${type}]`, error)
});
```

2. **监控连接状态**：
```typescript
console.log('连接状态:', client.getConnectionStatus());
```

3. **检查音频数据**：
```typescript
onAudioData: (audioData) => {
  console.log('音频数据大小:', audioData.byteLength, 'bytes');
}
```

## 常见问题

### Q: 如何处理 API Key？
A: 建议将 API Key 存储在环境变量中，不要在前端代码中硬编码。

### Q: 如何优化音频质量？
A: 
- 使用高质量麦克风
- 开启回声消除和噪声抑制
- 调整音频缓冲区大小

### Q: 如何处理网络异常？
A: 
- 客户端已内置自动重连机制
- 可以监听 `onClose` 事件进行自定义处理
- 建议添加离线状态提示

### Q: 如何自定义 UI？
A: 
- 组件使用 TailwindCSS
- 可以修改 `OmniChat.tsx` 自定义界面
- 参考示例代码添加新的状态显示

## 许可证

MIT License