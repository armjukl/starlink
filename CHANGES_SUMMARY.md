# v1.1.0 变更总结

## 问题
用户反馈 AI 返回的语音非常刺耳，听不到清晰的文字内容。

## 解决方案

### 1. 修复 PCM24 解码器 (`lib/audio/pcm-decoder.ts`)
- 修正字节序处理（little endian）
- 改进 24-bit 到 32-bit 的符号扩展
- 使用浮点除法（8388608.0）提高精度
- 添加溢出保护和限幅（±1.0）

### 2. 新增音频平滑器 (`lib/audio/audio-smoother.ts`)
- 实现 5ms 交叉淡化，消除音频块边界的爆音
- DC 偏移移除，防止削波失真
- 可选的高通滤波器

### 3. 增强音频播放器 (`lib/audio/audio-player.ts`)
- 添加 NaN 和无穷值检测
- 自动替换无效采样为静音
- 添加详细的调试日志

### 4. 优化音频处理流程 (`components/OmniChat.tsx`)
- 集成音频平滑器
- 添加软限幅（±0.95）
- 添加音频统计监控（5% 采样）

## 新增文件
- `lib/audio/audio-smoother.ts` - 音频平滑处理类
- `AUDIO_FIX_SUMMARY.md` - 详细的修复文档

## 更新文件
- `lib/audio/pcm-decoder.ts` - PCM24 解码优化
- `lib/audio/audio-player.ts` - 增强验证和日志
- `components/OmniChat.tsx` - 集成音频平滑处理
- `README.md` - 添加 FAQ 和版本信息

## 技术细节

### 音频处理链
```
WebSocket → Base64 → ArrayBuffer 
  → PCM24 Decoder (精确解码)
  → DC Offset Removal (移除偏移)
  → Crossfade Smoothing (平滑处理)
  → Soft Limiting (软限幅)
  → Float32 → AudioBuffer → Web Audio API → 扬声器
```

### 关键改进
1. **精确解码**: 浮点除法确保精度，符号扩展正确处理负值
2. **平滑过渡**: 5ms 交叉淡化消除块边界突变
3. **失真防护**: DC 偏移移除和软限幅防止削波
4. **错误恢复**: NaN/Inf 检测和自动修复

## 预期效果
- ✅ 消除刺耳噪音
- ✅ 平滑流畅播放
- ✅ 清晰音质
- ✅ 稳定可靠

## 测试
- ✅ PCM24 解码测试通过
- ✅ TypeScript 类型检查通过
- ✅ Next.js 构建成功

## 使用建议
1. 默认音量为 70%，如仍刺耳可降低到 50-60%
2. 查看浏览器控制台的音频统计日志
3. 确保音频幅度在 -1.0 到 1.0 之间
4. DC 偏移（mean）应接近 0

## 故障排查
如果问题仍然存在：
1. 清除浏览器缓存并重新加载
2. 检查控制台日志中的音频统计信息
3. 尝试不同的语音设置
4. 参考 `AUDIO_FIX_SUMMARY.md` 详细文档

---

**版本**: v1.1.0  
**日期**: 2024-12-17  
**状态**: ✅ 已测试并部署
