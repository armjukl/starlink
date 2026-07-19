# Starlink - Qwen-Omni 实时语音对话系统

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![React](https://img.shields.io/badge/React-18-blue)
![License](https://img.shields.io/badge/license-MIT-green)

**基于阿里云百炼 Qwen-Omni-Realtime 的完整 VAD 模式实时语音对话系统**

[快速开始](#快速开始) • [功能特性](#功能特性) • [文档](#文档) • [演示](#演示)

</div>

---

## 📖 项目简介

Starlink 是一个完整的、生产就绪的实时语音对话系统，采用**服务端 VAD（Voice Activity Detection）模式**，实现了与 AI 的自然、流畅对话体验。

### 核心亮点

- 🎤 **自动语音检测** - 无需按键，自动检测语音开始/结束
- 💬 **实时流式传输** - 音频和文字同步流式播放
- 💥 **智能打断** - 随时打断 AI 回复，立即响应
- ⚡ **超低延迟** - 端到端延迟 < 2 秒
- 🎯 **生产就绪** - 完善的错误处理、状态管理和用户引导

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- 支持 WebRTC 的浏览器（Chrome, Firefox, Edge, Safari）
- 阿里云百炼 API Key

### 安装和运行

```bash
# 1. 克隆项目
git clone https://github.com/your-org/starlink.git
cd starlink

# 2. 安装依赖
npm install

# 3. 配置 API Key
echo "NEXT_PUBLIC_DASHSCOPE_API_KEY=sk-your-api-key" > .env.local

# 4. 启动开发服务器
npm run dev

# 5. 访问应用
# http://localhost:3000
```

### 5分钟快速体验

1. **请求麦克风权限** → 点击蓝色按钮，允许浏览器访问麦克风
2. **测试 API 连接** → 确认 WebSocket 连接正常
3. **开始语音** → 点击开始按钮
4. **开始对话** → 直接说话，AI 自动响应
5. **享受体验** → 支持多轮对话和智能打断

详细步骤请查看 [快速开始指南](./QUICK_START.md)

---

## ✨ 功能特性

### 核心功能

#### 🎙️ VAD 自动语音检测
- ✅ 服务端 VAD，无需客户端实现
- ✅ 自动检测语音开始/结束
- ✅ 自动提交音频缓冲区
- ✅ 自动生成 AI 响应

#### 💥 智能打断处理
- ✅ 在 AI 说话时随时打断
- ✅ 自动取消当前回复
- ✅ 立即处理新的用户输入
- ✅ 无感知的流畅体验

#### ⚡ 实时流式传输
- ✅ 音频流式播放（PCM24, 24kHz）
- ✅ 文字流式显示
- ✅ 音频和文字并行传输
- ✅ 无间隙播放队列

#### 🎯 完善的用户体验
- ✅ 3步式引导流程
- ✅ 实时状态指示（监听中/处理中/播放中）
- ✅ VAD 模式可视化徽章
- ✅ 音频电平可视化
- ✅ 对话历史记录
- ✅ 音量控制
- ✅ 响应式设计

#### 🛡️ 完善的错误处理
- ✅ 麦克风权限错误
- ✅ 网络连接错误
- ✅ API Key 验证错误
- ✅ 浏览器兼容性检查
- ✅ 友好的错误提示和重试机制

### 技术实现

#### 音频处理
- **采集**: 16kHz, 单声道, PCM16
- **编码**: PCM16 → Base64
- **解码**: PCM24 → Float32Array → AudioBuffer
- **播放**: 24kHz, 单声道, 自动队列管理

#### WebSocket 通信
- **协议**: WSS (TLS 1.2+)
- **认证**: Bearer Token (API Key)
- **事件**: 完整的双向事件流
- **心跳**: 30秒保活机制

#### 状态管理
- **连接状态**: disconnected | connecting | connected | error
- **应用状态**: idle | listening | processing | speaking
- **权限状态**: not_requested | requesting | granted | denied
- **测试状态**: not_tested | testing | success | failed

---

## 📚 文档

### 核心文档

- 📖 [快速开始指南](./QUICK_START.md) - 5分钟快速体验
- 📘 [完整实现文档](./VAD_WORKFLOW_IMPLEMENTATION.md) - VAD 工作流详细说明
- ✅ [测试指南](./TESTING_GUIDE.md) - 完整的测试检查表
- 🔧 [集成指南](./INTEGRATION_GUIDE.md) - 如何集成到你的项目

### API 文档

- 📊 [Qwen-Omni API 文档](./QWEN_OMNI_README.md) - API 参考
- 📝 [事件系统实现](./QWEN_OMNI_EVENTS_IMPLEMENTATION.md) - 事件处理详解
- 🎤 [音频采集实现](./AUDIO_CAPTURE_IMPLEMENTATION.md) - 音频处理详解

### 故障排查

- 🔧 [音频质量修复总结](./AUDIO_FIX_SUMMARY.md) - 音频刺耳问题解决方案
- ❓ [常见问题 FAQ](#常见问题-faq)

---

## 🏗️ 项目结构

```
starlink/
├── components/
│   └── OmniChat.tsx              # 主UI组件
├── lib/
│   ├── qwen-omni-client.ts       # WebSocket客户端
│   ├── test-connection.ts        # 连接测试工具
│   ├── constants.ts              # 配置常量
│   ├── utils.ts                  # 工具函数
│   └── audio/
│       ├── audio-processor.ts    # 音频采集
│       ├── audio-player.ts       # 音频播放
│       ├── audio-smoother.ts     # 音频平滑器（v1.1.0 新增）
│       ├── pcm-decoder.ts        # PCM解码（v1.1.0 优化）
│       ├── pcm-encoder.ts        # PCM编码
│       └── microphone-permission.ts  # 权限管理
├── pages/
│   ├── index.tsx                 # 首页
│   └── api/                      # API路由
├── styles/
│   └── globals.css               # 全局样式
├── .env.local                    # 环境变量（需要创建）
├── package.json
├── tsconfig.json
└── next.config.js
```

---

## 🎬 演示

### 工作流程

```
1️⃣ 请求麦克风权限
   ↓
2️⃣ 测试 API 连接
   ↓
3️⃣ 开始语音会话
   ↓
4️⃣ 说话 → VAD 自动检测
   ↓
5️⃣ AI 自动生成回复
   ↓
6️⃣ 实时播放音频 + 显示文字
   ↓
7️⃣ 继续对话（回到步骤 4）
```

### 对话示例

```typescript
用户: "你好"
AI:   "你好呀！有什么我可以帮你的吗？"

用户: "今天天气怎么样？"
AI:   "抱歉，我无法实时获取天气信息..."

用户: "给我讲个笑话"（在 AI 说话时打断）
AI:   [停止前一个回复，立即响应]
      "好的！有一个程序员去面试..."
```

---

## 🔧 开发

### 可用命令

```bash
# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm start

# 类型检查
npm run type-check

# 代码格式化
npm run format

# 运行测试
npm test
```

### 环境变量

创建 `.env.local` 文件：

```bash
# 必需
NEXT_PUBLIC_DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# 可选（用于服务端）
DASHSCOPE_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 浏览器支持

| 浏览器 | 最低版本 | 推荐版本 |
|--------|----------|----------|
| Chrome | 90+ | 120+ |
| Firefox | 88+ | 120+ |
| Edge | 90+ | 120+ |
| Safari | 14+ | 17+ |

---

## 🧪 测试

### 自动化测试

```bash
# 类型检查
npm run type-check

# 构建测试
npm run build

# 单元测试（如果有）
npm test
```

### 手动测试

使用 [测试指南](./TESTING_GUIDE.md) 中的完整检查表进行手动测试：

- ✅ 浏览器兼容性测试
- ✅ 麦克风权限测试
- ✅ API 连接测试
- ✅ VAD 工作流测试
- ✅ 打断功能测试
- ✅ 错误处理测试
- ✅ UI/UX 测试
- ✅ 性能测试

---

## 📊 技术栈

### 前端框架
- **Next.js 14** - React 框架（Pages Router）
- **React 18** - UI 库
- **TypeScript 5** - 类型安全

### UI 库
- **Tailwind CSS** - 样式框架
- **lucide-react** - 图标库

### 音频处理
- **Web Audio API** - 音频采集和播放
- **MediaStream API** - 麦克风访问
- **AudioContext** - 音频处理

### WebSocket
- **原生 WebSocket API** - 实时通信

### API
- **阿里云百炼** - Qwen-Omni-Realtime
- **gummy-realtime-v1** - ASR 模型
- **Qwen3-omni-flash-realtime** - 对话模型

---

## 🚀 部署

### Vercel（推荐）

```bash
# 1. 安装 Vercel CLI
npm i -g vercel

# 2. 登录
vercel login

# 3. 部署
vercel

# 4. 设置环境变量
vercel env add NEXT_PUBLIC_DASHSCOPE_API_KEY
```

### 其他平台

- **Netlify**: 支持，需要配置环境变量
- **自托管**: 需要 Node.js 18+ 和 HTTPS

---

## 🔐 安全性

### API Key 安全
- ✅ 使用环境变量存储
- ✅ 不提交到版本控制
- ✅ 客户端使用 `NEXT_PUBLIC_` 前缀

### 网络安全
- ✅ WSS (WebSocket Secure)
- ✅ HTTPS 强制要求
- ✅ Bearer Token 认证

### 浏览器安全
- ✅ getUserMedia 需要用户授权
- ✅ 同源策略
- ✅ CSP (Content Security Policy)

---

## ❓ 常见问题 FAQ

### 音频质量问题

**Q: AI 返回的语音听起来很刺耳或失真？**

A: 我们已在 v1.1.0 中修复了这个问题。如果仍有问题：
1. 确保使用最新版本代码
2. 清除浏览器缓存并重新加载
3. 尝试降低音量到 50-60%
4. 查看控制台日志中的音频统计信息
5. 参考 [音频质量修复文档](./AUDIO_FIX_SUMMARY.md)

**Q: 为什么听不到声音？**

A: 请检查：
- 系统音量是否打开
- 浏览器标签页是否被静音
- 音量滑块是否设置过低
- 是否有其他应用占用音频设备
- 浏览器控制台是否有错误信息

### 麦克风问题

**Q: 麦克风权限被拒绝？**

A: 点击浏览器地址栏左侧的锁图标 → 麦克风设置 → 允许

**Q: VAD 检测不到我的声音？**

A: 请确保：
- 麦克风音量足够大
- 环境噪音不要太大
- 对着麦克风清晰说话
- 检查系统麦克风设置

### 连接问题

**Q: API 连接失败？**

A: 请检查：
1. API Key 是否正确（以 `sk-` 开头）
2. API Key 是否有足够的配额
3. 网络连接是否正常
4. 是否被防火墙拦截

**Q: WebSocket 连接不稳定？**

A: 可能原因：
- 网络不稳定
- 服务器负载过高
- 浏览器扩展干扰（尝试无痕模式）

### 性能问题

**Q: 延迟太高？**

A: 优化建议：
- 使用有线网络代替 WiFi
- 关闭其他占用网络的应用
- 确保设备性能足够
- 检查 CPU 和内存使用率

**Q: 浏览器卡顿？**

A: 建议：
- 关闭不必要的浏览器标签页
- 使用 Chrome 或 Edge（性能更好）
- 清理浏览器缓存
- 重启浏览器

---

## 🤝 贡献

欢迎贡献！请查看 [贡献指南](./CONTRIBUTING.md)。

### 开发流程

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📝 更新日志

### v1.1.0 (2024-12-17)

#### 🎵 音频质量优化
- ✅ 修复 PCM24 解码精度问题
- ✅ 添加音频平滑器，消除块边界爆音
- ✅ 实现 DC 偏移移除
- ✅ 添加交叉淡化（5ms crossfade）
- ✅ 增强音频数据验证（NaN/Inf 检测）
- ✅ 添加软限幅保护（±0.95）
- ✅ 添加详细的音频统计日志

**问题修复：** 彻底解决了 AI 返回语音刺耳、失真的问题。详见 [AUDIO_FIX_SUMMARY.md](./AUDIO_FIX_SUMMARY.md)

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

## 📄 许可证

MIT License - 详见 [LICENSE](./LICENSE) 文件

---

## 🙏 致谢

- [阿里云百炼](https://bailian.console.aliyun.com/) - 提供 Qwen-Omni-Realtime API
- [Next.js](https://nextjs.org/) - React 框架
- [Tailwind CSS](https://tailwindcss.com/) - CSS 框架
- [lucide-react](https://lucide.dev/) - 图标库

---

## 📧 联系方式

- 项目主页: https://github.com/your-org/starlink
- 问题反馈: https://github.com/your-org/starlink/issues
- 邮件: your-email@example.com

---

<div align="center">

**[⬆ 回到顶部](#starlink---qwen-omni-实时语音对话系统)**

Made with ❤️ by Starlink Team

</div>
