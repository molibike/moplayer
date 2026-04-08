# MoPlayer - 一体化多媒体播放器

## 项目简介

MoPlayer 是一个基于 **Tauri 2.0 + React 18 + TypeScript** 构建的现代化桌面多媒体播放器，支持音视频播放、图片浏览、在线音乐搜索等多种功能。

## 主要功能

### 🎵 多媒体播放
- **音频格式**：MP3, WAV, OGG, FLAC, AAC, M4A, WMA
- **视频格式**：MP4, WebM, MKV, MOV, WMV, FLV, M4V, OGV
- **图片格式**：JPG, PNG, GIF, BMP, WebP, SVG, TIFF, HEIC, RAW等

### 🎮 播放控制
- **基础控制**：播放/暂停、停止、上一曲/下一曲
- **进度控制**：拖拽式进度条，精确跳转
- **播放模式**：顺序播放、单曲循环、列表循环、随机播放
- **目录模式**：自动加载同目录同类型文件

### ⌨️ 键盘快捷键
| 快捷键 | 功能 |
|--------|------|
| `Space` | 播放/暂停 |
| `↑/↓` | 音量调节 |
| `M` | 静音切换 |
| `Ctrl + ←/→` | 快退/快进 (10秒) |
| `F11` | 全屏切换 |
| `Ctrl + O` | 打开文件 |

### 🎨 界面特性
- **智能菜单栏**：鼠标静止5秒后自动隐藏
- **毛玻璃效果**：现代化半透明UI设计
- **视频自适应**：自动缩放适配窗口尺寸
- **深色主题**：专业播放器风格

### 🌐 在线音乐
- **多源搜索**：网易云、QQ音乐、酷狗、酷我
- **歌词显示**：自动匹配并显示歌词
- **播放列表**：支持在线歌曲添加到播放列表

### 📁 文件管理
- **拖拽加载**：支持文件直接拖拽到播放器
- **播放列表**：支持增删改、排序、拖拽调整顺序
- **历史记录**：自动保存播放列表状态

## 技术架构

| 技术 | 用途 |
|------|------|
| React 18 | 前端UI框架 |
| TypeScript | 类型安全 |
| Tauri 2.0 | 桌面应用框架 |
| Rust | 后端逻辑 |
| Tailwind CSS | 样式方案 |
| Vite | 构建工具 |

## 环境要求

- **Node.js**：16+
- **Rust**：最新稳定版
- **Tauri CLI**：2.0+

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 开发模式运行
npm run tauri dev

# 3. 构建生产版本
npm run tauri build
```

## 项目结构

```
moplayer/
├── src/                     # 前端源代码
│   ├── components/          # React组件
│   │   ├── MenuBar.tsx      # 菜单栏
│   │   ├── ControlBar.tsx   # 播放控制栏
│   │   ├── IntegratedPlayer.tsx  # 播放器主体
│   │   ├── AudioPlayerInterface.tsx # 音频播放界面
│   │   ├── VinylPlayer.tsx  # 黑胶唱片效果
│   │   ├── AudioVisualizer.tsx # 音频可视化
│   │   ├── ImageViewer.tsx  # 图片查看器
│   │   ├── OnlineMusicPanel.tsx # 在线音乐面板
│   │   ├── FileDropZone.tsx # 文件拖放区域
│   │   └── AudioInfo.tsx    # 音频信息/歌词显示
│   ├── hooks/               # 自定义Hooks
│   ├── utils/               # 工具函数
│   └── App.tsx              # 主应用组件
├── src-tauri/               # Tauri后端
│   ├── src/                 # Rust源代码
│   ├── Cargo.toml           # Rust依赖配置
│   └── tauri.conf.json      # Tauri配置
├── scripts/                   # 开发脚本
├── icons/                     # 应用图标
└── public/                    # 静态资源
```

## 许可证

MIT License