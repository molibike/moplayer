import { useState, useRef, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
  const [playlistViewMode, setPlaylistViewMode] = useState<'all' | 'audio' | 'video'>('all');

  // 播放器方法引用
  const playPauseRef = useRef<(() => void) | null>(null);
  const volumeUpRef = useRef<(() => void) | null>(null);
  const volumeDownRef = useRef<(() => void) | null>(null);
  const muteRef = useRef<(() => void) | null>(null);
  const seekForwardRef = useRef<(() => void) | null>(null);
  const seekBackwardRef = useRef<(() => void) | null>(null);
  const seekToRef = useRef<((time: number) => void) | null>(null);

  // 切歌结束回调，根据播放模式决定下一首
  const handleTrackEnded = () => {
    if (playlist.length === 0 || currentPlaylistIndex < 0) return;
    
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

  const handleFileSelect = async (file: File) => {
    try {
      setError('');
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
           /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name);
  };

  // 获取当前媒体类型
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

  const handleOpenFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    };
    input.click();
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
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
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
          file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/') ||
          /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mp3|wav|ogg|flac|aac|m4a|wma|jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name)
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
            fileName={playlist[currentPlaylistIndex]?.name}
            fileBlob={playlist[currentPlaylistIndex]?.file}
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