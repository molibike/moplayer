import { useState, useRef, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { readFile, readDir } from '@tauri-apps/plugin-fs';

import MenuBar from './components/MenuBar';
import ControlBar from './components/ControlBar';
import IntegratedPlayer from './components/IntegratedPlayer';
import FileDropZone from './components/FileDropZone';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

interface PlaylistItem {
  id: string;
  name: string;
  url: string;
  file: File;
  originalPath?: string;
}

type PlayMode = 'sequential' | 'single' | 'list' | 'random';

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  });
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState<number>(-1);
  const [error, setError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const [playlistViewMode, setPlaylistViewMode] = useState<'audio' | 'video'>('audio');
  const [directoryMode, setDirectoryMode] = useState<boolean>(true);
  const [dirPlaylist, setDirPlaylist] = useState<string[]>([]);
  const [dirCurrentIndex, setDirCurrentIndex] = useState<number>(-1);

  // 播放器方法引用
  const playPauseRef = useRef<(() => void) | null>(null);
  const volumeUpRef = useRef<(() => void) | null>(null);
  const volumeDownRef = useRef<(() => void) | null>(null);
  const muteRef = useRef<(() => void) | null>(null);
  const seekForwardRef = useRef<(() => void) | null>(null);
  const seekBackwardRef = useRef<(() => void) | null>(null);
  const seekToRef = useRef<((time: number) => void) | null>(null);
  // 记录最近选择的文件，用于解决首次渲染时播放列表索引尚未更新导致的类型误判
  const lastSelectedFileRef = useRef<File | null>(null);

  // 切歌结束回调，根据播放模式决定下一首
  const handleTrackEnded = () => {
    if (playlist.length === 0 || currentPlaylistIndex < 0) return;
    // 目录模式优先：在音/视频下按目录列表切换
    const mediaType = getCurrentMediaType();
    const currentItem = playlist[currentPlaylistIndex];
    const currentPath = currentItem?.originalPath || (currentItem ? getFilePath(currentItem.file) : undefined);
    if (directoryMode && (mediaType === 'audio' || mediaType === 'video') && dirPlaylist.length > 0 && typeof currentPath === 'string') {
      switch (playMode) {
        case 'single': {
          // 单曲循环：重新播放当前路径
          void playPathInDirectoryMode(currentPath);
          return;
        }
        case 'list': {
          // 列表循环：下一首，末尾回到0
          const nextIndex = (dirCurrentIndex + 1) % dirPlaylist.length;
          setDirCurrentIndex(nextIndex);
          void playPathInDirectoryMode(dirPlaylist[nextIndex]);
          return;
        }
        case 'random': {
          // 随机：选择一个非当前的随机索引
          if (dirPlaylist.length > 1) {
            let r = dirCurrentIndex;
            while (r === dirCurrentIndex) {
              r = Math.floor(Math.random() * dirPlaylist.length);
            }
            setDirCurrentIndex(r);
            void playPathInDirectoryMode(dirPlaylist[r]);
          } else {
            void playPathInDirectoryMode(currentPath);
          }
          return;
        }
        case 'sequential':
        default: {
          // 顺序：到尾部停止
          const nextIndex = dirCurrentIndex + 1;
          if (nextIndex < dirPlaylist.length) {
            setDirCurrentIndex(nextIndex);
            void playPathInDirectoryMode(dirPlaylist[nextIndex]);
          } else {
            setPlayerState(prev => ({ ...prev, isPlaying: false }));
          }
          return;
        }
      }
    }
    const { filteredPlaylist, originalIndexMap, currentFilteredIndex } = getFilteredPlaylistInfo();
    
    switch (playMode) {
      case 'single': {
        // 单曲循环：重新播放当前
        const item = playlist[currentPlaylistIndex];
        setVideoSrc(item.url);
        setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
        // 延迟播放以确保状态重置完成
        setTimeout(() => {
          playPauseRef.current?.();
        }, 100);
        break;
      }
      case 'list': {
        // 列表循环：下一首，末尾回到0（在过滤列表中）
        if (filteredPlaylist.length === 0 || currentFilteredIndex < 0) return;
        
        let nextFilteredIndex = currentFilteredIndex + 1;
        if (nextFilteredIndex >= filteredPlaylist.length) nextFilteredIndex = 0;
        
        const nextOriginalIndex = originalIndexMap.get(nextFilteredIndex);
        if (nextOriginalIndex !== undefined) {
          handlePlaylistItemClick(nextOriginalIndex);
        }
        break;
      }
      case 'random': {
        // 随机：在过滤列表中选择一个非当前的随机索引
        if (filteredPlaylist.length === 0 || currentFilteredIndex < 0) return;
        
        if (filteredPlaylist.length > 1) {
          let nextFilteredIndex = currentFilteredIndex;
          while (nextFilteredIndex === currentFilteredIndex) {
            nextFilteredIndex = Math.floor(Math.random() * filteredPlaylist.length);
          }
          const nextOriginalIndex = originalIndexMap.get(nextFilteredIndex);
          if (nextOriginalIndex !== undefined) {
            handlePlaylistItemClick(nextOriginalIndex);
          }
        } else {
          // 过滤列表中只有一首歌，重新播放当前
          handlePlaylistItemClick(currentPlaylistIndex);
        }
        break;
      }
      case 'sequential':
      default: {
        // 顺序播放：在过滤列表中到尾部停止
        if (filteredPlaylist.length === 0 || currentFilteredIndex < 0) return;
        
        const nextFilteredIndex = currentFilteredIndex + 1;
        if (nextFilteredIndex < filteredPlaylist.length) {
          const nextOriginalIndex = originalIndexMap.get(nextFilteredIndex);
          if (nextOriginalIndex !== undefined) {
            handlePlaylistItemClick(nextOriginalIndex);
          }
        } else {
          // 停止播放
          setPlayerState(prev => ({ ...prev, isPlaying: false }));
        }
        break;
      }
    }
  };

  const getFilePath = (file: File): string | undefined => {
    const anyFile = file as any;
    if (typeof anyFile.path === 'string' && anyFile.path.length > 0) {
      return anyFile.path as string;
    }
    const absolutePath = file.webkitRelativePath || '';
    return absolutePath.length > 0 ? absolutePath : undefined;
  };
  const isAudioPath = (p: string) => /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(p);
  const isVideoPath = (p: string) => /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)$/i.test(p);
  // 移除未使用的辅助函数以消除 TS6133 警告
  const normalizePath = (p: string) => p.replace(/\\/g, '/');
  const createFileFromPath = async (path: string) => {
    const bytes = await readFile(path);
    const name = normalizePath(path).split('/').pop() || '未命名文件';
    const file = new File([bytes], name, { type: '' });
    (file as any).path = path;
    return file;
  };
  const loadDirectoryPlaylist = async (basePath: string) => {
    try {
      const normalized = normalizePath(basePath);
      const dir = normalized.substring(0, normalized.lastIndexOf('/'));
      if (!dir) return;
      const entries: any[] = await readDir(dir);
      const isAudio = isAudioPath(basePath);
      const isVideo = isVideoPath(basePath);
      if (!isAudio && !isVideo) {
        setDirPlaylist([]);
        setDirCurrentIndex(-1);
        return;
      }
      const filterFn = (p: string) => (isAudio ? isAudioPath(p) : isVideo ? isVideoPath(p) : false);
      const files: string[] = entries
        .map((e: any) => {
          const p = typeof e.path === 'string' && e.path.length > 0 ? e.path : `${dir}/${e.name}`;
          return normalizePath(p);
        })
        .filter((p: string) => typeof p === 'string' && filterFn(p));
      files.sort((a, b) => a.split('/').pop()!
        .localeCompare(b.split('/').pop()!, undefined, { numeric: true, sensitivity: 'base' }));
      setDirPlaylist(files);
      const idx = files.indexOf(normalized);
      setDirCurrentIndex(idx >= 0 ? idx : 0);
    } catch (e) {
      console.warn('加载目录播放列表失败:', e);
      setDirPlaylist([]);
      setDirCurrentIndex(-1);
    }
  };
  const playPathInDirectoryMode = async (path: string) => {
    try {
      const file = await createFileFromPath(path);
      const url = URL.createObjectURL(file);
      lastSelectedFileRef.current = file;
      setVideoSrc(url);
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      setPlaylist(prev => {
        if (currentPlaylistIndex >= 0 && currentPlaylistIndex < prev.length) {
          const next = [...prev];
          next[currentPlaylistIndex] = { ...next[currentPlaylistIndex], name: file.name, url, file, originalPath: path };
          return next;
        } else {
          const newItem: PlaylistItem = { id: Date.now().toString(), name: file.name, url, file, originalPath: path };
          setCurrentPlaylistIndex(prev.length);
          return [...prev, newItem];
        }
      });
    } catch (e) {
      console.error('目录模式播放路径失败:', e);
    }
  };

  const handleFileSelect = async (file: File) => {
    try {
      setError('');
      // 先记录最近选择的文件，避免初次渲染时索引未更新导致类型判定失败
      lastSelectedFileRef.current = file;
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
      const originalPath = getFilePath(file);
      
      // 添加到播放列表
      const newItem: PlaylistItem = {
        id: Date.now().toString(),
        name: file.name,
        url: url,
        file: file,
        originalPath
      };
      
      setPlaylist(prev => {
        const newPlaylist = [...prev, newItem];
        setCurrentPlaylistIndex(newPlaylist.length - 1); // 设置为新添加的文件索引
        return newPlaylist;
      });
      setPlayerState(prev => ({ ...prev, isPlaying: false })); // 让IntegratedPlayer自动处理播放
      // 目录模式：加载同目录的音/视频列表
      if (directoryMode && originalPath && (isAudioFile(file) || isVideoFile(file))) {
        void loadDirectoryPlaylist(originalPath);
      } else {
        setDirPlaylist([]);
        setDirCurrentIndex(-1);
      }
    } catch (err) {
      setError('文件加载失败: ' + (err as Error).message);
    }
  };

  // 添加多个文件到播放列表
  const handleFilesAdd = (files: File[]) => {
    if (files.length > 0) {
      // 过滤重复文件（基于文件名和大小）
      const existingFiles = new Set(
        playlist.map(item => `${item.name}_${item.file.size}`)
      );
      
      const uniqueFiles = files.filter(file => 
        !existingFiles.has(`${file.name}_${file.size}`)
      );
      
      if (uniqueFiles.length === 0) {
        // 所有文件都是重复的，不添加
        return;
      }
      
      // 创建新的播放列表项
      const newPlaylist = uniqueFiles.map(file => {
        const url = URL.createObjectURL(file);
        const originalPath = getFilePath(file);
        return {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          url: url,
          file: file,
          originalPath
        };
      });
      
      // 仅添加到播放列表，不立即播放
      setPlaylist(prev => [...prev, ...newPlaylist]);
    }
  };

  // 选择文件并立即播放（用于控制栏的文件选择）
  const handleFileSelectAndPlay = (files: File[]) => {
    if (files.length > 0) {
      const file = files[0]; // 只处理第一个文件
      // 记录最近选择的文件，确保类型判定稳定
      lastSelectedFileRef.current = file;
      
      // 检查文件是否已在播放列表中
      const existingIndex = playlist.findIndex(item => 
        item.name === file.name && item.file.size === file.size
      );
      
      if (existingIndex >= 0) {
        // 文件已存在，直接播放
        handlePlaylistItemClick(existingIndex);
      } else {
        // 文件不存在，添加到播放列表并播放
        const url = URL.createObjectURL(file);
        const originalPath = getFilePath(file);
        const newItem: PlaylistItem = {
          id: Date.now().toString() + Math.random(),
          name: file.name,
          url: url,
          file: file,
          originalPath
        };
        
        const newPlaylist = [...playlist, newItem];
        setPlaylist(newPlaylist);
        
        // 立即播放新添加的文件
        setVideoSrc(url);
        setCurrentPlaylistIndex(newPlaylist.length - 1);
        setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
      }
    }
  };

  // 播放列表项点击
  const handlePlaylistItemClick = (index: number) => {
    if (index >= 0 && index < playlist.length) {
      const item = playlist[index];
      // 同步最近选择的文件，避免类型判定抖动
      lastSelectedFileRef.current = item.file;
      setVideoSrc(item.url);
      setCurrentPlaylistIndex(index);
      // 重置播放状态，让IntegratedPlayer自动处理播放
      setPlayerState(prev => ({ ...prev, isPlaying: false, currentTime: 0 }));
    }
  };

  // 删除播放列表项
  const handlePlaylistItemRemove = (index: number) => {
    if (index === currentPlaylistIndex) {
      // 如果删除的是当前播放项，停止播放
      setVideoSrc('');
      setCurrentPlaylistIndex(-1);
    }
    
    setPlaylist(prev => prev.filter((_, i) => i !== index));
    
    // 调整当前索引
    if (index < currentPlaylistIndex) {
      setCurrentPlaylistIndex(prev => prev - 1);
    } else if (index === currentPlaylistIndex) {
      setCurrentPlaylistIndex(-1);
    }
  };

  // 移动播放列表项
  const handlePlaylistItemMove = (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= playlist.length || toIndex < 0 || toIndex >= playlist.length) {
      return;
    }
    
    const newPlaylist = [...playlist];
    const [movedItem] = newPlaylist.splice(fromIndex, 1);
    newPlaylist.splice(toIndex, 0, movedItem);
    setPlaylist(newPlaylist);
    
    // 调整当前索引
    if (fromIndex === currentPlaylistIndex) {
      setCurrentPlaylistIndex(toIndex);
    } else if (fromIndex < currentPlaylistIndex && toIndex >= currentPlaylistIndex) {
      setCurrentPlaylistIndex(prev => prev - 1);
    } else if (fromIndex > currentPlaylistIndex && toIndex <= currentPlaylistIndex) {
      setCurrentPlaylistIndex(prev => prev + 1);
    }
  };

  // 媒体类型检测函数
  const isAudioFile = (file: File) => {
    return file.type.startsWith('audio/') || 
           /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(file.name);
  };

  const isVideoFile = (file: File) => {
    return file.type.startsWith('video/') || 
           /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)$/i.test(file.name);
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/') || 
           /(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|heic|heif|wmf|exif|raw|cr2|nef|arw|dng|rw2|orf|raf|sr2)$/i.test(file.name);
  };

  // 新增：PDF 文件检测（用于菜单栏隐藏策略）
  const isPdfFile = (file: File) => {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  };

  const getCurrentMediaType = () => {
    if (currentPlaylistIndex < 0 || currentPlaylistIndex >= playlist.length) {
      return 'unknown';
    }
    const currentFile = playlist[currentPlaylistIndex].file;
    if (isAudioFile(currentFile)) {
      return 'audio';
    } else if (isVideoFile(currentFile)) {
      return 'video';
    } else if (isImageFile(currentFile)) {
      return 'image';
    }
    return 'unknown';
  };

  // 获取按当前媒体类型过滤的播放列表和索引映射
  const getFilteredPlaylistInfo = () => {
    const currentMediaType = getCurrentMediaType();
    if (currentMediaType === 'unknown') {
      return { filteredPlaylist: playlist, originalIndexMap: new Map(), currentFilteredIndex: currentPlaylistIndex };
    }

    // 过滤播放列表
    const filteredPlaylist = playlist.filter(item => {
      if (currentMediaType === 'audio') {
        return isAudioFile(item.file);
      } else if (currentMediaType === 'video') {
        return isVideoFile(item.file);
      } else if (currentMediaType === 'image') {
        return isImageFile(item.file);
      }
      return false;
    });

    // 创建原始索引映射
    const originalIndexMap = new Map<number, number>();
    let filteredIndex = 0;
    playlist.forEach((item, originalIndex) => {
      let isMatch = false;
      if (currentMediaType === 'audio') {
        isMatch = isAudioFile(item.file);
      } else if (currentMediaType === 'video') {
        isMatch = isVideoFile(item.file);
      } else if (currentMediaType === 'image') {
        isMatch = isImageFile(item.file);
      }
      
      if (isMatch) {
        originalIndexMap.set(filteredIndex, originalIndex);
        filteredIndex++;
      }
    });

    // 找到当前项在过滤列表中的索引
    const currentFilteredIndex = Array.from(originalIndexMap.entries())
      .find(([, originalIndex]) => originalIndex === currentPlaylistIndex)?.[0] ?? -1;

    return { filteredPlaylist, originalIndexMap, currentFilteredIndex };
  };

  // 上一曲
  const handlePrevious = () => {
    if (playlist.length === 0) return;
    // 目录模式优先：在音/视频下按目录列表切换
    const mediaType = getCurrentMediaType();
    const currentItem = playlist[currentPlaylistIndex];
    const currentPath = currentItem?.originalPath || (currentItem ? getFilePath(currentItem.file) : undefined);
    if (directoryMode && (mediaType === 'audio' || mediaType === 'video') && dirPlaylist.length > 0 && typeof currentPath === 'string') {
      let prevIndex = dirCurrentIndex - 1;
      if (prevIndex < 0) prevIndex = dirPlaylist.length - 1;
      setDirCurrentIndex(prevIndex);
      void playPathInDirectoryMode(dirPlaylist[prevIndex]);
      return;
    }
    const { filteredPlaylist, originalIndexMap, currentFilteredIndex } = getFilteredPlaylistInfo();
    
    if (filteredPlaylist.length === 0 || currentFilteredIndex < 0) return;
    
    let newFilteredIndex = currentFilteredIndex - 1;
    if (newFilteredIndex < 0) newFilteredIndex = filteredPlaylist.length - 1; // 循环播放
    
    const newOriginalIndex = originalIndexMap.get(newFilteredIndex);
    if (newOriginalIndex !== undefined) {
      handlePlaylistItemClick(newOriginalIndex);
    }
  };

  // 下一曲
  const handleNext = () => {
    if (playlist.length === 0) return;
    // 目录模式优先：在音/视频下按目录列表切换
    const mediaType = getCurrentMediaType();
    const currentItem = playlist[currentPlaylistIndex];
    const currentPath = currentItem?.originalPath || (currentItem ? getFilePath(currentItem.file) : undefined);
    if (directoryMode && (mediaType === 'audio' || mediaType === 'video') && dirPlaylist.length > 0 && typeof currentPath === 'string') {
      let nextIndex = dirCurrentIndex + 1;
      if (nextIndex >= dirPlaylist.length) nextIndex = 0;
      setDirCurrentIndex(nextIndex);
      void playPathInDirectoryMode(dirPlaylist[nextIndex]);
      return;
    }
    const { filteredPlaylist, originalIndexMap, currentFilteredIndex } = getFilteredPlaylistInfo();
    
    if (filteredPlaylist.length === 0 || currentFilteredIndex < 0) return;
    
    let newFilteredIndex = currentFilteredIndex + 1;
    if (newFilteredIndex >= filteredPlaylist.length) newFilteredIndex = 0; // 循环播放
    
    const newOriginalIndex = originalIndexMap.get(newFilteredIndex);
    if (newOriginalIndex !== undefined) {
      handlePlaylistItemClick(newOriginalIndex);
    }
  };

  // 停止播放
  const handleStop = () => {
    setVideoSrc('');
    setPlayerState(prev => ({ ...prev, isPlaying: false }));
    setCurrentPlaylistIndex(-1);
  };

  // 根据扩展名推断MIME类型（用于从FS读取后创建Blob）
  const guessMimeType = (path: string): string => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      // 图片
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'bmp': 'image/bmp', 'webp': 'image/webp', 'svg': 'image/svg+xml', 'ico': 'image/x-icon',
      'tif': 'image/tiff', 'tiff': 'image/tiff', 'heic': 'image/heic', 'heif': 'image/heif',
      // 相机RAW（尽量给出具体类型，便于识别）
      'cr2': 'image/x-canon-cr2', 'nef': 'image/x-nikon-nef', 'arw': 'image/x-sony-arw', 'dng': 'image/x-adobe-dng', 'rw2': 'image/x-panasonic-rw2', 'orf': 'image/x-olympus-orf', 'raf': 'image/x-fuji-raf', 'sr2': 'image/x-sony-sr2',
      // 其他
      'exif': 'image/jpeg', 'raw': 'application/octet-stream', 'wmf': 'application/x-msmetafile', 'pdf': 'application/pdf',
      // 音频
      'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'ogg': 'audio/ogg', 'aac': 'audio/aac', 'flac': 'audio/flac', 'm4a': 'audio/mp4', 'wma': 'audio/x-ms-wma',
      // 视频
      'mp4': 'video/mp4', 'webm': 'video/webm', 'ogv': 'video/ogg', 'mkv': 'video/x-matroska', 'mov': 'video/quicktime', 'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', 'm4v': 'video/x-m4v'
    };
    return map[ext] || 'application/octet-stream';
  };

  const handleOpenFile = async () => {
    try {
      // 优先使用 Tauri 原生文件对话框，确保可获得真实路径
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: '媒体文件',
            extensions: ['mp4','webm','ogv','mkv','mov','wmv','flv','m4v','mp3','wav','ogg','aac','flac','m4a','wma','jpg','jpeg','png','gif','bmp','webp','svg','ico','tif','tiff','heic','heif','pdf','wmf','exif','raw','cr2','nef','arw','dng','rw2','orf','raf','sr2']
          }
        ]
      });

      if (typeof selected === 'string') {
        const path = selected;
        const bytes = await readFile(path);
        const mime = guessMimeType(path);
        const name = path.replace(/\\/g, '/').split('/').pop() || '未命名文件';
        const file = new File([bytes], name, { type: mime });
        // 保留原始路径，确保后续同目录读取可用
        (file as any).path = path;

        // 使用统一的文件选择处理逻辑，确保 originalPath 传递
        await handleFileSelect(file);
      } else {
        // 回退到浏览器 input（极端情况下）
        const input = document.createElement('input');
        input.type = 'file';
        // 包含 PDF 和常见图片类型
        input.accept = 'video/*,audio/*,image/*,application/pdf,.pdf';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            handleFileSelect(file);
          }
        };
        input.click();
      }
    } catch (error) {
      console.error('打开文件失败，使用回退输入框:', error);
      const input = document.createElement('input');
      input.type = 'file';
      // 包含 PDF 和常见图片类型
      input.accept = 'video/*,audio/*,image/*,application/pdf,.pdf';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          handleFileSelect(file);
        }
      };
      input.click();
    }
  };

  const handlePlayerStateChange = (newState: Partial<PlayerState>) => {
    setPlayerState(prev => ({ ...prev, ...newState }));
  };

  // 窗口拖拽功能 - 全窗口拖拽
  useEffect(() => {
    let appWindow: ReturnType<typeof getCurrentWindow> | null = null;
    try {
      appWindow = getCurrentWindow();
    } catch (error) {
      console.warn('无法获取Tauri窗口实例，窗口拖拽不可用:', error);
      return;
    }

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (e.detail > 1) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const interactiveSelector = 'button, input, select, textarea, a, [data-prevent-drag], .no-drag';
        if (target.closest(interactiveSelector)) {
          return;
        }
      }

      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;

      const startWindowDragging = () => {
        if (started) return;
        started = true;
        console.log('尝试开始窗口拖拽', {
          x: startX,
          y: startY,
          target: (e.target as HTMLElement)?.className || (e.target as HTMLElement)?.tagName
        });
        appWindow?.startDragging().then(() => {
          console.log('窗口拖拽调用已发送');
        }).catch((error: unknown) => {
          console.error('拖拽失败:', error);
        });
      };

      const moveThreshold = 2;
      const delay = 120;
      const dragTimer = window.setTimeout(() => {
        startWindowDragging();
      }, delay);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = Math.abs(moveEvent.clientX - startX);
        const deltaY = Math.abs(moveEvent.clientY - startY);
        if (!started && (deltaX + deltaY) >= moveThreshold) {
          window.clearTimeout(dragTimer);
          startWindowDragging();
        }
      };

      const handleMouseUp = () => {
        window.clearTimeout(dragTimer);
        document.removeEventListener('mousemove', handleMouseMove, true);
        document.removeEventListener('mouseup', handleMouseUp, true);
      };

      document.addEventListener('mousemove', handleMouseMove, true);
      document.addEventListener('mouseup', handleMouseUp, true);
    };

    document.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, []);

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const handleExit = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('关闭失败:', error);
      // 如果Tauri API失败，强制退出应用
      if (typeof window !== 'undefined') {
        window.close();
      }
    }
  };

  // 键盘快捷键
  useKeyboardShortcuts({
    onPlayPause: () => playPauseRef.current?.(),
    onVolumeUp: () => volumeUpRef.current?.(),
    onVolumeDown: () => volumeDownRef.current?.(),
    onMute: () => muteRef.current?.(),
    onSeekForward: () => seekForwardRef.current?.(),
    onSeekBackward: () => seekBackwardRef.current?.(),
    onFullscreen: handleToggleFullscreen,
    onOpenFile: handleOpenFile,
  });

  // 监听来自后端的打开文件事件（用于右键“使用 MoPlayer 打开”或文件关联双击）
  // ... existing code ...

  // 监听系统级文件拖拽到窗口
  useEffect(() => {
    let unsubs: Array<() => void> = [];
    (async () => {
      const handler = async (event: any) => {
        try {
          const payload = event?.payload;
          const paths: string[] = Array.isArray(payload)
            ? payload
            : (payload && Array.isArray(payload.paths) ? payload.paths : []);
          if (!paths || paths.length === 0) return;
          const path = paths[0];
          const bytes = await readFile(path);
          const mime = guessMimeType(path);
          const name = path.replace(/\\/g, '/').split('/').pop() || '未命名文件';
          const file = new File([bytes], name, { type: mime });
          (file as any).path = path;
          await handleFileSelect(file);
        } catch (e) {
          console.warn('处理文件拖拽事件失败:', e);
        }
      };
      try {
        const u1 = await listen('tauri://file-drop', handler);
        unsubs.push(u1);
      } catch {}
      try {
        const u2 = await listen('tauri://drag-drop', handler);
        unsubs.push(u2);
      } catch {}
      try {
        const u3 = await listen('core://file-drop', handler);
        unsubs.push(u3);
      } catch {}
      try {
        const u4 = await listen('core://drag-drop', handler);
        unsubs.push(u4);
      } catch {}
    })();
    return () => {
      for (const u of unsubs) {
        try { u(); } catch {}
      }
    };
  }, []);

  // 应用启动后主动拉取启动文件路径，确保“打开方式/右键菜单”即开即播
  useEffect(() => {
    (async () => {
      try {
        const path = await invoke<string | null>('get_startup_file');
        if (path && typeof path === 'string' && path.length > 0) {
          try {
            const bytes = await readFile(path);
            const name = path.replace(/\\/g, '/').split('/').pop() || '未命名文件';
            const mime = guessMimeType(path);
            const file = new File([bytes], name, { type: mime });
            (file as any).path = path;
            await handleFileSelect(file);
          } catch (e) {
            console.error('拉取启动文件并打开失败:', e);
          }
        }
      } catch (e) {
        console.warn('获取启动文件路径失败:', e);
      }
    })();
  }, []);

  return (
    <div 
      className="h-screen player-container app-background text-white relative overflow-hidden"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        // 只有当拖拽离开整个窗口时才重置状态
        if (e.currentTarget === e.target) {
          setIsDragging(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        
        const files = Array.from(e.dataTransfer.files);
        const mediaFiles = files.filter(file => 
          file.type.startsWith('video/') ||
          file.type.startsWith('audio/') ||
          file.type.startsWith('image/') ||
          file.type === 'application/pdf' ||
          /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mp3|wav|ogg|flac|aac|m4a|wma|jpg|jpeg|png|gif|bmp|webp|svg|ico|pdf)$/i.test(file.name)
        );
        
        if (mediaFiles.length > 0) {
          console.log('拖拽文件:', mediaFiles.map(f => f.name));
          // 拖拽文件时立即播放第一个文件，相当于"打开"菜单功能
          handleFileSelect(mediaFiles[0]);
        } else {
          console.log('没有找到支持的媒体文件');
          setError('请拖拽音频、视频或图片文件');
        }
      }}
      style={{ cursor: 'default', userSelect: 'none' }}
    >
      {/* 悬浮菜单栏 - 始终显示 */}
      <MenuBar 
        onOpenFile={handleOpenFile}
        onExit={handleExit}
        isPlaying={videoSrc ? playerState.isPlaying : false}
        autoHide={(getCurrentMediaType() === 'image') || (getCurrentMediaType() === 'video' && playerState.isPlaying) || (() => {
          const item = playlist[currentPlaylistIndex];
          if (!item) return false;
          const f = item.file;
          const p = item?.originalPath || getFilePath(f) || '';
          return (typeof p === 'string' && /\.pdf$/i.test(p)) || isPdfFile(f);
        })()}
      />

      {/* 拖拽覆盖层 */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/20 border-2 border-dashed border-blue-400 z-40 flex items-center justify-center">
          <div className="text-2xl font-semibold">拖放文件到此处播放</div>
        </div>
      )}

      {/* 播放器区域，占据整个屏幕 */}
      <div className="absolute inset-0">
        {!videoSrc ? (
          <div className="w-full h-full flex items-center justify-center p-8">

            <FileDropZone 
              onFileSelect={handleFileSelect}
              onFileSelectClick={handleOpenFile}
            />
          </div>
        ) : (
          <IntegratedPlayer
            src={videoSrc}
            fileName={playlist[currentPlaylistIndex]?.name || lastSelectedFileRef.current?.name}
            fileBlob={playlist[currentPlaylistIndex]?.file || lastSelectedFileRef.current || undefined}
            filePath={playlist[currentPlaylistIndex]?.originalPath}
            onStateChange={handlePlayerStateChange}
            onError={handleError}
            onEnded={handleTrackEnded}
            onPlayPause={playPauseRef}
            onVolumeUp={volumeUpRef}
            onVolumeDown={volumeDownRef}
            onMute={muteRef}
            onSeekForward={seekForwardRef}
            onSeekBackward={seekBackwardRef}
            onSeekTo={seekToRef}
          />
        )}

        {/* 控制栏 - 仅在音频和视频模式下显示 */}
        {videoSrc && getCurrentMediaType() !== 'image' && (
          <ControlBar
            onPlayPause={() => playPauseRef.current?.()}
            onStop={handleStop}
            onPrevious={handlePrevious}
            onNext={handleNext}
            isPlaying={playerState.isPlaying}
            currentTime={playerState.currentTime}
            duration={playerState.duration}
            playlist={playlist}
            currentIndex={currentPlaylistIndex}
            onPlaylistItemClick={handlePlaylistItemClick}
            onPlaylistItemRemove={handlePlaylistItemRemove}
            onPlaylistItemMove={handlePlaylistItemMove}
            onFilesAdd={handleFilesAdd}
            onFileSelectAndPlay={handleFileSelectAndPlay}
            onSeekTo={(t: number) => seekToRef.current?.(t)}
            playMode={playMode}
            onTogglePlayMode={() => {
              setPlayMode(prev => {
                switch (prev) {
                  case 'sequential': return 'single';
                  case 'single': return 'list';
                  case 'list': return 'random';
                  case 'random': return 'sequential';
                  default: return 'sequential';
                }
              });
            }}
            playlistViewMode={playlistViewMode}
            setPlaylistViewMode={setPlaylistViewMode}
            directoryMode={directoryMode}
            onToggleDirectoryMode={() => {
              const next = !directoryMode;
              setDirectoryMode(next);
              const item = playlist[currentPlaylistIndex];
              const path = item?.originalPath || (item ? getFilePath(item.file) : undefined);
              if (next && path && (getCurrentMediaType() === 'audio' || getCurrentMediaType() === 'video')) {
                void loadDirectoryPlaylist(path);
              } else {
                setDirPlaylist([]);
                setDirCurrentIndex(-1);
              }
            }}
          />
        )}

        {error && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-red-600/90 p-6 rounded-lg max-w-md z-50">
            <h3 className="font-semibold mb-2">播放出错</h3>
            <p className="text-sm mb-3">{error}</p>
            <div className="text-sm text-red-200 mb-4">
              <p>支持的格式：MP4, WebM, OGV, MP3, WAV, OGG</p>
              <p>请确保文件格式正确且未损坏</p>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={() => setError('')}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 rounded transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setError('');
                  setVideoSrc('');
                }}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded transition-colors"
              >
                重新选择文件
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
