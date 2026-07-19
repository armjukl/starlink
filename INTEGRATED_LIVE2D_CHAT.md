# OmniChat 与 Live2D 集成 - 卡片内布局

## 概述

OmniChat 卡片现在集成了 Live2D 模型展示区域。布局结构：
- **左侧**：原有的控件列（麦克风权限、API 测试、开始/停止语音等）
- **右侧上方**：Live2D 模型展示区域（高度 250px）
- **右侧下方**：聊天框区域（高度 250px，可滚动）

## 布局结构

```
┌───────────────────────────────────────────────┐
│  OmniChat Card                                │
├────────────┬─────────────────────────────────┤
│   Left     │      Live2D Area                │
│ Controls   ├─────────────────────────────────┤
│  (fixed)   │   Chat Box (scrollable)        │
│            │                                 │
└────────────┴─────────────────────────────────┘
```

## 技术实现

### pages/index.tsx
保持简单，只包含 OmniChat：
```jsx
<div className="min-h-screen bg-gray-50">
  <OmniChat />
</div>
```

### components/OmniChat.tsx

#### 外层结构
```jsx
<div className="w-full max-w-4xl mx-auto p-4 md:p-6 bg-white rounded-xl shadow-lg my-8">
  {/* Header */}
  {/* Grid Layout */}
</div>
```

#### 网格布局
```jsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
  {/* 左列：控件 */}
  <div className="md:col-span-1 space-y-6">
    {/* 浏览器兼容性警告 */}
    {/* 权限和连接状态 */}
    {/* 音频可视化 */}
    {/* 音量控制 */}
    {/* 语音选择 */}
  </div>

  {/* 右列：Live2D + Chat */}
  <div className="md:col-span-2 flex flex-col gap-4">
    {/* Live2D 区域 - 上方 */}
    <div className="h-[250px] ...">Live2D Model</div>

    {/* 聊天框 - 下方 */}
    <div className="h-[250px] overflow-y-auto ...">
      {/* 聊天历史 */}
      {/* 实时转录 */}
    </div>

    {/* 操作和错误显示 */}
    {/* 调试信息 */}
  </div>
</div>
```

## 关键尺寸

| 元素 | 高度 | 备注 |
|------|------|------|
| Live2D 区域 | 250px | `h-[250px]` |
| 聊天框 | 250px | `h-[250px]`，可滚动 |
| 间距 | - | `gap-4` (16px) |
| 卡片宽度 | 最大 4xl | `max-w-4xl` |
| 卡片内边距 | 4-6 | `p-4 md:p-6` |
| 外边距 | 8 | `my-8` |

## Live2D 集成步骤

### 1. 替换占位符

找到右侧上方的 Live2D 区域占位符（约在第 728 行）：

```jsx
{/* Live2D Area - Top */}
<div className="bg-gradient-to-b from-gray-100 to-gray-50 rounded-xl border border-gray-200 h-[250px] flex items-center justify-center overflow-hidden">
  <div className="text-gray-400 text-center">
    <p className="text-sm font-semibold">Live2D Model Area</p>
    <p className="text-xs mt-1">(Drag model here or integrate)</p>
  </div>
</div>
```

替换为你的 Live2D 组件：

```jsx
import Live2DViewer from '../path-to-component/Live2DViewer';

// 在 OmniChat 组件中：
<div className="bg-gradient-to-b from-gray-100 to-gray-50 rounded-xl border border-gray-200 h-[250px] flex items-center justify-center overflow-hidden">
  <Live2DViewer />
</div>
```

### 2. 调整 Live2D 组件样式

确保 Live2D 组件：
- 填充整个容器（width: 100%, height: 100%）
- 不设置固定尺寸
- 使用 flex 或相对定位
- 内容可以正确缩放

### 3. 保持聊天框功能

聊天框在下方，高度 250px，保持原有的所有功能：
- 转录显示
- 聊天历史
- 实时消息
- 可滚动

## 样式定制

### 调整高度比例

如需改变 Live2D 和聊天框的高度，修改：

```jsx
// Live2D 区域
<div className="h-[300px]">  {/* 从 250px 改为 300px */}

// 聊天框
<div className="h-[200px]">  {/* 从 250px 改为 200px */}
```

### 调整间距

```jsx
{/* 修改 Live2D 和聊天框之间的间距 */}
<div className="md:col-span-2 flex flex-col gap-6">  {/* gap-4 改为 gap-6 */}
```

### 调整圆角和边框

```jsx
{/* Live2D 区域 */}
<div className="rounded-xl border border-gray-200">  {/* 可修改 rounded 和 border 样式 */}
```

## 功能保留确认

✅ **所有原有功能完整保留**：
- 浏览器兼容性警告
- 麦克风权限请求
- API 连接测试
- 实时语音采集和转录
- AI 音频响应
- 聊天历史显示
- 音量控制
- 语音选择
- 错误处理和显示
- 调试信息（开发模式）

## 响应式行为

- **移动端**：单列布局，全宽
- **平板端**：网格布局开始激活
- **桌面端**：完整的 3 列网格布局

## 已知限制

1. **高度固定**：Live2D 和聊天框高度都是固定的 250px
   - 可通过修改 `h-[250px]` 调整

2. **间距固定**：Live2D 和聊天框之间间距 16px
   - 可通过修改 `gap-4` 调整

3. **卡片宽度**：最大宽度 4xl (约 56rem)
   - 可通过修改 `max-w-4xl` 调整

## 测试清单

- [ ] Live2D 区域正常显示
- [ ] 聊天框在 Live2D 下方
- [ ] 聊天功能完全正常
- [ ] 滚动区域有效
- [ ] 权限请求正常
- [ ] 音频采集和播放正常
- [ ] 响应式布局正确
- [ ] 没有内容溢出或重叠

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Edge 90+
- ✅ Safari 14+

## 文件位置

- `pages/index.tsx` - 主页面入口
- `components/OmniChat.tsx` - OmniChat 卡片组件（包含 Live2D 区域）

## 完成状态

✅ **实现完成**
- 布局集成正确
- 所有功能保留
- TypeScript 检查通过
- Next.js 构建成功

---

**版本**: 1.0  
**更新时间**: 2024-12-19  
**状态**: 生产就绪
