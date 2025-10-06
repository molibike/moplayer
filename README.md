# MoPlayer - 高性能音视频播放器

基于 Tauri + React + TypeScript 的现代化桌面视频播放器。

## ✨ 功能特性

- 🎥 支持多种视频格式播放
- 🎨 现代化深色主题界面
- 🖱️ 拖拽文件加载
- ⏯️ 完整的播放控制（播放/暂停、进度条、音量）
- 📱 响应式设计
- 🚀 基于 Tauri 的高性能桌面应用

## 🎬 支持的视频格式

### 推荐格式（最佳兼容性）
- **MP4** (H.264 + AAC) - 推荐使用
- **WebM** (VP8/VP9 + Vorbis/Opus)
- **OGG** (Theora + Vorbis)

### 其他格式
- AVI, MKV, MOV, WMV, FLV, M4V

## 🚀 使用方法

1. **启动应用程序**
   ```bash
   npm run dev
   cargo tauri dev
   ```

2. **加载视频**
   - 点击"打开文件"按钮选择视频
   - 或直接拖拽视频文件到播放区域

3. **播放控制**
   - 播放/暂停：点击播放按钮或空格键
   - 跳转：拖拽进度条
   - 音量：调整音量滑块

## 🛠️ 故障排除

### 视频无法播放？

1. **检查视频格式**
   - 优先使用 MP4 格式
   - 确保视频编码为 H.264
   - 音频编码建议使用 AAC

2. **常见错误解决方案**
   - `MEDIA_ERR_SRC_NOT_SUPPORTED`: 视频格式不支持，尝试转换为 MP4
   - `MEDIA_ERR_DECODE`: 解码错误，检查视频文件是否损坏
   - `MEDIA_ERR_NETWORK`: 网络错误，检查文件路径或网络连接

3. **推荐视频转换工具**
   - FFmpeg (命令行)
   - HandBrake (图形界面)
   - VLC Media Player (内置转换)

### 转换视频为兼容格式

```bash
# 使用 FFmpeg 转换为 MP4
ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4
```

## 🏗️ 技术架构

- **前端**: React + TypeScript + Vite + Tailwind CSS
- **后端**: Rust + Tauri 2.0
- **打包**: Tauri Bundle

## 📝 开发说明

当前版本使用 HTML5 video 元素进行播放，后续版本将集成 FFmpeg 以支持更多格式。

## 🔧 环境要求

- Node.js 16+
- Rust 1.70+
- 支持的操作系统：Windows, macOS, Linux