# 完整 VAD 模式工作流实现文档

## 概述

本文档说明了 starlink 项目中完整的 Qwen-Omni-Realtime 实时语音对话系统的 VAD（Voice Activity Detection）模式实现。

## VAD 模式工作流程

### 第 0 步：初始化（用户点击"开始语音"）

```
用户操作：
1. 请求麦克风权限 ✓
2. 测试 API 连接 ✓
3. 点击"开始语音"按钮

前端状态：
- permissionStatus = 'granted'
- connectionTestStatus = 'success'
- isRecording = false → true
```

### 第 1 步：WebSocket 连接和会话初始化

```typescript
// 1.1 建立 WebSocket 连接
URL: wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3-omni-flash-realtime&authorization=Bearer sk-xxxx

// 1.2 收到 session.created 事件
{
  type: "session.created",
  session: {
    id: "sess_xxxxx",
    model: "qwen3-omni-flash-realtime"
  }
}

// 1.3 发送 session.update 事件（第一个客户端事件）
{
  type: "session.update",
  session: {
    modalities: ["text", "audio"],
    voice: "Cherry",
    instructions: "你是一个友好的 AI 助手，请自然地进行对话。",
    turnDetection: {
      type: "server_vad",
      threshold: 0.1,              // VAD 灵敏度（0-1，越低越灵敏）
      prefix_padding_ms: 500,      // 前导填充（毫秒）
      silence_duration_ms: 900     // 停顿检测（毫秒）
    },
    temperature: 0.9,
    ...
  }
}

// 1.4 收到 session.updated 事件
{
  type: "session.updated"
}

// 1.5 启动音频采集
audioProcessor.startCapture()
```

**实现位置：** `components/OmniChat.tsx` - `startSession()` 函数

### 第 2 步：持续音频采集和流转发

```typescript
// 音频采集配置
- 采样率: 16000 Hz
- 声道: 单声道 (Mono)
- 位深度: 16-bit PCM
- 块大小: 100ms (3200 字节)

// 持续发送音频块
setInterval(() => {
  client.streamAudio(pcm16Buffer);  // 发送 input_audio_buffer.append 事件
}, 100);
```

**关键特性：**
- ✅ 音频持续采集，无需手动控制
- ✅ VAD 检测完全由服务端自动处理
- ✅ 客户端不需要调用 `commitAudioBuffer()`

**实现位置：**
- `lib/audio/audio-processor.ts` - 音频采集
- `lib/qwen-omni-client.ts` - `streamAudio()` 方法

### 第 3 步：服务端自动检测语音开始

```typescript
// 服务端发送 input_audio_buffer.speech_started 事件
{
  type: "input_audio_buffer.speech_started",
  audio_start_ms: 3647,
  item_id: "item_YbAiGvK2H7YaS34o4R6Ba"
}

// 前端处理
onSpeechStarted: (audioStartMs) => {
  console.log(`✓ 检测到语音开始 (${audioStartMs}ms)`);
  setAppStatus('listening');
  setTranscript('🎤 正在听...');
  
  // 关键：如果正在播放回复，立即中断
  if (isResponding) {
    await client.cancelResponse();
  }
}
```

**打断处理：**
- 用户说话时，服务端发送 `speech_started` 事件
- 如果 AI 正在回复（`_isResponding = true`），客户端自动发送 `response.cancel` 事件
- 服务端中断当前回复，开始处理新的用户输入

**实现位置：**
- `lib/qwen-omni-client.ts` - `handleMessage()` 中的 `input_audio_buffer.speech_started` 处理
- 自动打断逻辑已内置

### 第 4 步：服务端自动检测语音停止

```typescript
// 服务端发送 input_audio_buffer.speech_stopped 事件
{
  type: "input_audio_buffer.speech_stopped",
  audio_end_ms: 4453,
  item_id: "item_YbAiGvK2H7YaS34o4R6Ba"
}

// 服务端自动提交缓冲区
{
  type: "input_audio_buffer.committed",
  item_id: "item_YbAiGvK2H7YaS34o4R6Ba"
}

// 服务端创建用户消息项
{
  type: "conversation.item.created",
  item: {
    id: "item_YbAiGvK2H7YaS34o4R6Ba",
    role: "user",
    status: "in_progress"
  }
}

// 前端处理
onSpeechStopped: (audioEndMs) => {
  console.log(`✓ 检测到语音结束 (${audioEndMs}ms)`);
  setAppStatus('processing');
  setTranscript('🤔 处理中...');
}
```

**关键特性：**
- ✅ 检测到 900ms 沉默后自动停止
- ✅ 自动提交音频缓冲区
- ✅ 自动创建对话项

### 第 5 步：用户音频转录

```typescript
// 服务端使用 ASR (gummy-realtime-v1) 转录用户音频
{
  type: "conversation.item.input_audio_transcription.completed",
  item_id: "item_YbAiGvK2H7YaS34o4R6Ba",
  transcript: {
    text: "你好，今天天气怎么样？"
  }
}

// 前端处理
onUserTranscript: (transcript) => {
  console.log(`👤 用户: ${transcript}`);
  setTranscript('');
  setConversationHistory(prev => [...prev, { 
    role: 'user', 
    text: transcript 
  }]);
}
```

### 第 6 步：服务端自动生成响应

```typescript
// VAD 模式下，服务端自动生成响应（无需客户端调用 response.create）
{
  type: "response.created",
  response: {
    id: "resp_HaVOPdbmX6vifiV5pAfJY",
    status: "in_progress",
    modalities: ["text", "audio"]
  }
}

// 前端处理
onResponseCreated: (response) => {
  console.log(`→ 开始生成回复 (ID: ${response.id})`);
  setAppStatus('processing');
  setTranscript('💭 AI 正在思考...');
  _isResponding = true;
  _currentResponseId = response.id;
}
```

### 第 7 步：实时流式响应

```typescript
// 流 1：音频输出流
{
  type: "response.audio.delta",
  delta: "SUQzBAAAI1A...",  // Base64 编码的 PCM24 音频
  response_id: "resp_HaVOPdbmX6vifiV5pAfJY"
}

// 前端处理 - 音频播放
onAudioDelta: (audioBytes: Uint8Array) => {
  // 1. 解码 PCM24 → Float32Array
  const float32Audio = pcmDecoder.decodePCM(audioBytes.buffer, 24);
  
  // 2. 创建 AudioBuffer
  const audioBuffer = pcmDecoder.createAudioBuffer(float32Audio);
  
  // 3. 添加到播放队列
  audioPlayer.addToQueue(audioBuffer);
  
  // 4. 自动播放（如果没有正在播放）
  if (!audioPlayer.isPlaying) {
    audioPlayer.play();
  }
}

// 流 2：文本转录流
{
  type: "response.audio_transcript.delta",
  delta: "你好",
  response_id: "resp_HaVOPdbmX6vifiV5pAfJY"
}

// 前端处理 - 实时文本显示
onAudioTranscriptDelta: (delta: string) => {
  console.log(`🤖 助手: ${delta}`);
  setTranscript(prev => prev + delta);
  setAppStatus('speaking');
}
```

**关键特性：**
- ✅ 音频和文本并行流式传输
- ✅ 音频自动播放，无间隙
- ✅ 文本实时显示

### 第 8 步：响应完成

```typescript
// 转录完成
{
  type: "response.audio_transcript.done",
  transcript: {
    text: "你好呀！有什么我可以帮你的吗？"
  }
}

// 音频完成
{
  type: "response.audio.done"
}

// 响应完成
{
  type: "response.done",
  response: {
    id: "resp_HaVOPdbmX6vifiV5pAfJY",
    status: "completed",
    usage: {
      total_tokens: 377,
      input_tokens: 336,
      output_tokens: 41
    }
  }
}

// 前端处理
onAudioTranscriptDone: (transcript) => {
  console.log(`✓ 音频转录: "${transcript}"`);
  setTranscript('');
  setConversationHistory(prev => [...prev, { 
    role: 'assistant', 
    text: transcript 
  }]);
}

onResponseDone: (response) => {
  console.log(`✓ 回复完成 (状态: ${response.status})`);
  setAppStatus('listening');  // 回到监听状态，准备下一轮
  _isResponding = false;
}
```

### 第 9 步：对话持续（循环）

```
✓ 回到第 2 步
✓ 用户可以立即继续说话
✓ VAD 自动检测下一句话
✓ 无需任何手动操作
```

---

## 核心技术实现

### 1. WebSocket 客户端（`lib/qwen-omni-client.ts`）

**核心方法：**

```typescript
// 连接
await client.connect()

// 配置 VAD 会话
await client.updateSession({
  turnDetection: {
    type: 'server_vad',
    threshold: 0.1,
    silence_duration_ms: 900
  }
})

// 流式发送音频
await client.streamAudio(pcm16Buffer)

// 取消当前回复（打断）
await client.cancelResponse()
```

**状态管理：**

```typescript
private _isResponding: boolean = false;
private _currentResponseId: string | null = null;
private _currentInputItemId: string | null = null;
```

**自动打断处理：**

```typescript
case 'input_audio_buffer.speech_started':
  if (this._isResponding) {
    console.log('用户打断，中断前一个回复');
    await this.cancelResponse();
  }
  break;
```

### 2. 音频采集（`lib/audio/audio-processor.ts`）

**配置：**

```typescript
const audioProcessor = new AudioProcessor({
  sampleRate: 16000,       // 16kHz
  channels: 1,             // 单声道
  chunkDurationMs: 100,    // 100ms 块
  onAudioChunk: (buffer) => {
    client.streamAudio(buffer);  // 持续发送
  },
  onAudioLevel: (level) => {
    setAudioLevel(level);  // 显示音量
  }
});
```

**持续采集：**

```typescript
await audioProcessor.initialize();  // 请求麦克风权限
await audioProcessor.startCapture(); // 开始采集

// 内部自动处理：
// 1. 采集麦克风音频
// 2. 转换为 PCM16
// 3. 分块（100ms）
// 4. 调用 onAudioChunk 回调
```

### 3. 音频播放（`lib/audio/audio-player.ts` + `lib/audio/pcm-decoder.ts`）

**解码 PCM24：**

```typescript
const pcmDecoder = new PCMDecoder({
  sampleRate: 24000,
  channels: 1,
  bitDepth: 24
});

// 解码
const float32Audio = pcmDecoder.decodePCM24(pcm24Data);

// 创建 AudioBuffer
const audioBuffer = pcmDecoder.createAudioBuffer(float32Audio);
```

**播放队列：**

```typescript
const audioPlayer = new AudioPlayer({
  sampleRate: 24000,
  channels: 1,
  volume: 0.7,
  onPlay: () => setAppStatus('speaking'),
  onEnded: () => setAppStatus('listening')
});

// 添加到队列
audioPlayer.addToQueue(audioBuffer);

// 自动播放
if (!audioPlayer.isPlaying) {
  await audioPlayer.play();
}
```

### 4. UI 组件（`components/OmniChat.tsx`）

**3步式用户引导：**

```
Step 1: 请求麦克风权限
  ↓ permissionStatus = 'granted'
Step 2: 测试 API 连接
  ↓ connectionTestStatus = 'success'
Step 3: 开始语音
  ↓ isConnected = true
```

**状态管理：**

```typescript
- connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
- appStatus: 'idle' | 'listening' | 'processing' | 'speaking'
- permissionStatus: 'not_requested' | 'requesting' | 'granted' | 'denied'
- connectionTestStatus: 'not_tested' | 'testing' | 'success' | 'failed'
```

**实时状态显示：**

```typescript
// listening - 红色脉冲动画
// processing - 加载旋转动画
// speaking - 播放动画
// VAD 模式徽章 - 紫色渐变
```

---

## 验收标准检查表

- ✅ VAD 模式的完整流程可正常运行
- ✅ 用户点击"开始"后，能自动采集并持续发送音频
- ✅ 服务端能自动检测语音开始/停止
- ✅ 用户音频转录正确显示
- ✅ AI 生成的音频正确解码并播放
- ✅ AI 转录文本实时显示且正确
- ✅ 用户打断时（再次说话），前一个回复被正确中断
- ✅ 对话可以连续进行多轮
- ✅ 点击"停止"后，正确断开连接
- ✅ 所有错误情况都有妥善处理
- ✅ 整个系统无崩溃、内存泄漏

---

## 部署检查清单

- ✅ .env.local 包含 NEXT_PUBLIC_DASHSCOPE_API_KEY
- ✅ 使用 localhost 或 HTTPS（getUserMedia 要求）
- ✅ 浏览器允许麦克风权限
- ✅ WebSocket 连接成功
- ✅ API Key 有效且有配额

---

## 使用说明

### 启动开发服务器

```bash
npm install
npm run dev
```

### 访问应用

```
http://localhost:3000
```

### 使用流程

1. **请求麦克风权限**
   - 点击"请求麦克风权限"按钮
   - 在浏览器弹窗中允许麦克风访问

2. **测试 API 连接**
   - 点击"测试 API 连接"按钮
   - 确认显示"✅ API 连接正常"

3. **开始语音对话**
   - 点击"开始语音"按钮
   - 等待状态变为"监听中"
   - 开始说话（VAD 自动检测）
   - AI 自动回复
   - 继续说话（支持打断）

4. **停止对话**
   - 点击"停止语音"按钮

---

## 调试信息

开发环境下，页面底部会显示调试信息面板：

- 浏览器环境信息
- WebSocket 支持状态
- 麦克风权限状态
- 连接测试状态
- 网络连接状态
- 浏览器兼容性信息

---

## 技术亮点

### 1. 完全自动化的 VAD 工作流
- 无需手动提交音频
- 无需手动触发响应
- 服务端全自动检测和处理

### 2. 智能打断处理
- 用户说话时自动中断 AI 回复
- 无感知的流畅体验

### 3. 实时流式传输
- 音频和文本并行流式传输
- 无间隙音频播放
- 实时文本显示

### 4. 完善的错误处理
- 麦克风权限错误
- 网络连接错误
- API Key 错误
- 浏览器兼容性错误
- 所有错误都有友好提示和重试机制

### 5. 优秀的用户体验
- 3步式引导流程
- 实时状态反馈
- VAD 模式可视化指示
- 音频电平可视化
- 对话历史记录

---

## 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                     OmniChat Component                      │
│  (用户界面 + 状态管理)                                         │
└───────┬────────────────────────────────────┬────────────────┘
        │                                    │
        ↓                                    ↓
┌────────────────┐                  ┌─────────────────┐
│ AudioProcessor │                  │ QwenOmniClient  │
│   (音频采集)    │ ─ PCM16 data → │  (WebSocket)    │
└────────────────┘                  └─────────────────┘
        ↓                                    ↓
  麦克风输入                            服务端 VAD 检测
   (16kHz)                                  ↓
                                    自动语音识别 (ASR)
                                           ↓
┌────────────────┐                  大模型生成响应
│   PCMDecoder   │ ← PCM24 data ←        ↓
│   (音频解码)    │                  TTS 语音合成
└───────┬────────┘                        ↓
        ↓                            音频 + 文本流
┌────────────────┐
│  AudioPlayer   │
│  (音频播放)     │
└────────────────┘
        ↓
   扬声器输出
   (24kHz)
```

---

## 常见问题

### Q: 为什么麦克风权限被拒绝？

A: 需要在浏览器设置中允许麦克风访问。Chrome: 设置 → 隐私和安全 → 网站设置 → 麦克风

### Q: 为什么 API 连接测试失败？

A: 请检查：
1. .env.local 中的 API Key 是否正确
2. API Key 是否有足够配额
3. 网络连接是否正常

### Q: 为什么听不到 AI 的声音？

A: 请检查：
1. 音量滑块是否调整到合适位置
2. 系统音量是否打开
3. 浏览器是否允许自动播放音频

### Q: 如何打断 AI 的回复？

A: 直接开始说话即可，VAD 会自动检测并中断当前回复

---

## 更新日志

### v1.0.0 (2024-12-17)
- ✅ 完整实现 VAD 模式工作流
- ✅ 自动语音检测和响应生成
- ✅ 智能打断处理
- ✅ 实时流式音频播放
- ✅ 实时文本转录显示
- ✅ 完善的错误处理和用户引导
- ✅ SSR 兼容性修复
- ✅ 生产环境就绪

---

## 技术栈

- **前端框架**: Next.js 13+ (React 18+)
- **语言**: TypeScript
- **UI 库**: Tailwind CSS + lucide-react
- **音频处理**: Web Audio API
- **WebSocket**: 原生 WebSocket API
- **API**: 阿里云百炼 Qwen-Omni-Realtime

---

## 作者

starlink 开发团队

## 许可证

MIT
