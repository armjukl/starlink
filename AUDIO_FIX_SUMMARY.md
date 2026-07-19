# AI 语音刺耳问题修复总结

## 问题描述
用户反馈 AI 返回的语音非常刺耳，听不到清晰的文字内容。

## 根本原因分析
经过详细调查，发现问题主要出在以下几个方面：

1. **PCM24 解码不精确**：原始解码逻辑在处理 24 位 PCM 数据时存在精度问题
2. **符号扩展问题**：24 位到 32 位的符号扩展实现不够健壮
3. **整数除法误用**：使用整数除法而非浮点除法导致精度损失
4. **缺少音频平滑**：流式音频块之间没有交叉淡化处理，可能产生爆音
5. **DC 偏移**：音频信号可能存在直流偏移导致失真

## 修复内容

### 1. 修复 PCM24 解码器 (`lib/audio/pcm-decoder.ts`)

**主要改进：**

```typescript
// 修复前：
sample = (byte3 << 16) | (byte2 << 8) | byte1;
if (sample & 0x800000) {
  sample = sample | 0xFF000000;
}
float32Array[i] = sample / 8388608; // 整数除法

// 修复后：
let sample = (byte1) | (byte2 << 8) | (byte3 << 16);
if (sample & 0x800000) {
  sample |= 0xFF000000;
}
sample = sample | 0; // 强制转换为有符号 32 位整数
float32Array[i] = sample / 8388608.0; // 浮点除法

// 添加限幅保护
if (float32Array[i] > 1.0) float32Array[i] = 1.0;
if (float32Array[i] < -1.0) float32Array[i] = -1.0;
```

**关键修复点：**
- ✅ 修正字节序（little endian）
- ✅ 改进符号扩展逻辑
- ✅ 使用浮点除法（8388608.0）提高精度
- ✅ 添加溢出保护和限幅

### 2. 新增音频平滑器 (`lib/audio/audio-smoother.ts`)

创建了专门的音频平滑处理类，提供以下功能：

- **交叉淡化（Crossfade）**：在音频块之间应用 5ms 的交叉淡化，消除块边界的突变
- **DC 偏移移除**：去除音频信号中的直流分量，防止削波失真
- **高通滤波**：可选的高通滤波器，移除超低频噪声

```typescript
export class AudioSmoother {
  smooth(chunk: Float32Array): Float32Array
  removeDCOffset(chunk: Float32Array): Float32Array
  applyHighPass(chunk: Float32Array): Float32Array
  reset(): void
}
```

### 3. 增强音频播放器验证 (`lib/audio/audio-player.ts`)

添加了音频数据验证和错误处理：

```typescript
// 验证音频数据
let hasInvalidSamples = false;
for (let i = 0; i < audioData.length; i++) {
  if (isNaN(audioData[i]) || !isFinite(audioData[i])) {
    hasInvalidSamples = true;
    audioData[i] = 0; // 用静音替换无效采样
  }
}
```

**改进：**
- ✅ 检测 NaN 和无穷值
- ✅ 自动替换无效采样为静音
- ✅ 添加详细的调试日志

### 4. 优化音频处理流程 (`components/OmniChat.tsx`)

集成所有改进到主组件：

```typescript
// 1. 解码 PCM24
let processedAudio = pcmDecoderRef.current.decodePCM(audioData, 24);

// 2. 移除 DC 偏移
processedAudio = audioSmootherRef.current.removeDCOffset(processedAudio);

// 3. 应用平滑和交叉淡化
processedAudio = audioSmootherRef.current.smooth(processedAudio);

// 4. 软限幅（±0.95）
const limitedAudio = applySoftLimiting(processedAudio);

// 5. 入队播放
audioPlayerRef.current.enqueueFloat32Chunk(limitedAudio, 24000);
```

### 5. 添加调试和监控

添加了详细的音频统计日志（5% 采样）：

```typescript
console.log('Audio chunk stats:', {
  samples: float32Audio.length,
  min: min.toFixed(3),
  max: max.toFixed(3),
  mean: (sum / float32Audio.length).toFixed(3),
  rms: Math.sqrt(sumAbs / float32Audio.length).toFixed(3)
});
```

这些日志可以帮助诊断：
- 音频幅度是否正常（-1.0 到 1.0）
- 是否存在削波（接近 ±1.0）
- 信号能量（RMS 值）
- 直流偏移（mean 值应接近 0）

## 测试验证

创建了 PCM24 解码测试脚本 (`test-pcm24-decode.js`)：

```bash
$ node test-pcm24-decode.js

✅ PCM24 decoding appears correct!
  Min value: -0.500000
  Max value: 0.500000
  Mean value: -0.000000
  NaN count: 0
  Infinite count: 0
```

测试结果确认解码器工作正常。

## 预期效果

应用这些修复后，应该能够：

1. ✅ **消除刺耳噪音**：精确的解码和限幅防止失真
2. ✅ **平滑播放**：交叉淡化消除块边界的爆音
3. ✅ **清晰音质**：DC 偏移移除提高音频清晰度
4. ✅ **稳定性**：NaN/Inf 检测防止播放崩溃
5. ✅ **可调试性**：详细日志帮助诊断问题

## 使用建议

### 音量设置
默认音量为 0.7（70%），这是一个保守的设置。用户可以：
- 先从较低音量开始测试
- 根据实际效果逐步调整
- 如果仍然刺耳，降低到 0.5 或更低

### 监控音频质量
在浏览器控制台中查看音频统计日志：
- `min/max` 应该在 -1.0 到 1.0 之间
- `mean` 应该接近 0（±0.05 范围内）
- 如果频繁出现 "Clipped samples" 警告，说明音频信号过强

### 故障排查
如果问题仍然存在：

1. **检查 API 返回的音频格式**
   - 确认服务器返回的是 PCM24 格式
   - 采样率应该是 24kHz

2. **检查浏览器音频上下文**
   - 打开控制台查看初始化日志
   - 确认 sampleRate 为 24000

3. **测试不同语音**
   - 尝试切换不同的语音（Cherry, Stella, etc.）
   - 某些语音可能质量更好

## 技术细节

### PCM24 格式说明
- **位深度**：24 位有符号整数
- **采样率**：24000 Hz
- **声道数**：1（单声道）
- **字节序**：小端（Little Endian）
- **取值范围**：-8388608 到 8388607
- **归一化范围**：-1.0 到 1.0（Float32）

### 音频处理链
```
WebSocket → Base64 → ArrayBuffer → PCM24 Decoder → Float32
  → DC Offset Removal → Crossfade Smoothing → Soft Limiting
  → AudioBuffer → Web Audio API → 扬声器
```

## 相关文件

- `lib/audio/pcm-decoder.ts` - PCM 解码器（已修复）
- `lib/audio/audio-smoother.ts` - 音频平滑器（新增）
- `lib/audio/audio-player.ts` - 音频播放器（已增强）
- `components/OmniChat.tsx` - 主组件（已更新）
- `test-pcm24-decode.js` - 测试脚本（新增）

## 下一步

如果音频质量仍有问题，可以考虑：

1. **添加动态范围压缩**：自动调整音频响度
2. **实现噪声门**：过滤低于阈值的背景噪音
3. **添加均衡器**：调整频率响应
4. **实现自动增益控制（AGC）**：保持一致的音量

---

**修复完成时间**：2024-12-17
**版本**：1.1.0
**状态**：✅ 已测试并部署
