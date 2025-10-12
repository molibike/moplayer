import React, { useState, useRef, useEffect } from 'react';

interface PlaylistItem {
  id: string;
  name: string;
  url: string;
  file: File;
}

interface ControlBarProps {
  onPlayPause: () => void;
  onStop: () => void;
  onPrevious: () => void;
  onNext: () => void;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playlist: PlaylistItem[];
  currentIndex: number;
  onPlaylistItemClick: (index: number) => void;
  onPlaylistItemRemove: (index: number) => void;
  onPlaylistItemMove: (fromIndex: number, toIndex: number) => void;
  onFilesAdd: (files: File[]) => void;
  onFileSelectAndPlay: (files: File[]) => void;
  onSeekTo?: (time: number) => void;
  playMode: 'sequential' | 'single' | 'list' | 'random';
  onTogglePlayMode: () => void;
  playlistViewMode: 'all' | 'audio' | 'video';
  setPlaylistViewMode: (mode: 'all' | 'audio' | 'video') => void;
}

const ControlBar: React.FC<ControlBarProps> = ({
  onPlayPause,
  onStop,
  onPrevious,
  onNext,
  isPlaying,
  currentTime,
  duration,
  playlist,
  currentIndex,
  onPlaylistItemClick,
  onPlaylistItemRemove,
  onPlaylistItemMove,
  onFilesAdd,
  onFileSelectAndPlay,
  onSeekTo,
  playMode,
  onTogglePlayMode,
  playlistViewMode,
  setPlaylistViewMode,
}) => {
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(100);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  const playlistRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout>();

  // 播放模式标签
  const playModeLabels = {
    sequential: '顺序',
    single: '单曲',
    list: '列表',
    random: '随机'
  };

  const playModeIcons = {
    sequential: '→',
    single: '1',
    list: '∞',
    random: '⚡'
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



  // 检测当前播放项是否为图片
  const isCurrentImage = () => {
    if (currentIndex < 0 || currentIndex >= playlist.length) return false;
    return isImageFile(playlist[currentIndex].file);
  };

  // 根据播放列表显示模式过滤列表
  // const currentMediaType = getCurrentMediaType(); // 保留用于其他用途
  const filteredPlaylist = playlist.filter(item => {
    if (playlistViewMode === 'audio') return isAudioFile(item.file);
    if (playlistViewMode === 'video') return isVideoFile(item.file);
    return true; // 'all' 模式显示所有项目
  });

  // 如果是图片模式，隐藏控制栏（根据功能要求第1条）
  if (isCurrentImage()) {
    return null;
  }

  // 切换播放列表显示模式
  const togglePlaylistViewMode = () => {
    const modes: ('all' | 'audio' | 'video')[] = ['all', 'audio', 'video'];
    const currentIndex = modes.indexOf(playlistViewMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setPlaylistViewMode(modes[nextIndex]);
  };

  const playlistViewModeLabels = {
    all: '全部',
    audio: '音频',
    video: '视频'
  };

  // 创建原始索引映射
  const originalIndexMap = new Map<number, number>();
  let filteredIndex = 0;
  playlist.forEach((item, originalIndex) => {
    if (playlistViewMode === 'audio' && isAudioFile(item.file)) {
      originalIndexMap.set(filteredIndex, originalIndex);
      filteredIndex++;
    } else if (playlistViewMode === 'video' && isVideoFile(item.file)) {
      originalIndexMap.set(filteredIndex, originalIndex);
      filteredIndex++;
    } else if (playlistViewMode === 'all') {
      originalIndexMap.set(filteredIndex, originalIndex);
      filteredIndex++;
    }
  });



  // 控制栏显示逻辑 - 初始窗口始终显示
  useEffect(() => {
    // 如果没有播放，控制栏始终显示
    if (!isPlaying) {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      return;
    }

    // 播放时的隐藏逻辑
    const handleMouseMove = () => {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      
      // 鼠标静止5秒后隐藏
      mouseMoveTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setShowPlaylist(false);
      }, 5000);
    };

    const handleMouseLeave = () => {
      if (isPlaying) {
        setIsVisible(false);
        setShowPlaylist(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // 监听窗口大小变化，动态调整播放列表高度
  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // 格式化时间显示
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 点击外部关闭播放列表
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (playlistRef.current && !playlistRef.current.contains(e.target as Node)) {
        setShowPlaylist(false);
      }
    };

    if (showPlaylist) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlaylist]);



  // 音量控制
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    setVolume(newVolume);
    // 如果音量大于0，取消静音状态
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
    // 同时控制video和audio元素的音量
    const videoElement = document.querySelector('video');
    const audioElement = document.querySelector('audio');
    if (videoElement) {
      videoElement.volume = newVolume / 100;
    }
    if (audioElement) {
      audioElement.volume = newVolume / 100;
    }
  };

  // 静音切换功能
  const handleMuteToggle = () => {
    const videoElement = document.querySelector('video');
    const audioElement = document.querySelector('audio');
    if (isMuted) {
      // 取消静音，恢复之前的音量
      setIsMuted(false);
      setVolume(volumeBeforeMute);
      if (videoElement) {
        videoElement.volume = volumeBeforeMute / 100;
      }
      if (audioElement) {
        audioElement.volume = volumeBeforeMute / 100;
      }
    } else {
      // 静音，保存当前音量
      setVolumeBeforeMute(volume);
      setIsMuted(true);
      setVolume(0);
      if (videoElement) {
        videoElement.volume = 0;
      }
      if (audioElement) {
        audioElement.volume = 0;
      }
    }
  };

  // 获取当前文件名
  const getCurrentFileName = () => {
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      return playlist[currentIndex].name;
    }
    return '未选择文件';
  };

  // 根据当前播放文件类型过滤显示的列表与模式标签


  if (!isVisible) return null;

  return (
    <div 
      className="control-bar fixed bottom-0 left-0 right-0 bg-transparent z-40 transition-all duration-300"
      style={{ height: '60px' /* 固定高度，减小50% */ }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => {
        if (isPlaying) {
          setIsVisible(false);
          setShowPlaylist(false);
        }
      }}
    >
      {/* 第一行：进度条和音量调节 */}
      <div className="flex items-center justify-between px-3 py-1" style={{ height: '30px', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>


        {/* 左侧：进度条和时间显示 */}
        <div className="flex items-center space-x-2 flex-1" style={{ alignItems: 'center', justifyContent: 'center' }}>
          {/* 已播放时间 */}
          <div className="text-xs text-gray-300 min-w-[35px] text-right">
            {formatTime(currentTime)}
          </div>
          
          {/* 进度条 */}
          <div className="flex-1 relative">
            <div className="w-full h-px bg-gray-500/30 absolute top-1/2 transform -translate-y-1/2"></div>
            <input
              type="range"
              className="w-full h-1 appearance-none cursor-pointer bg-transparent relative z-10 progress-slider"
              min="0"
              max={duration || 100}
              value={isDraggingProgress ? undefined : currentTime}
              onMouseDown={() => setIsDraggingProgress(true)}
              onMouseUp={() => setIsDraggingProgress(false)}
              onChange={(e) => {
                const newTime = parseFloat(e.target.value);
                if (onSeekTo) onSeekTo(newTime);
              }}
              onInput={(e) => {
                const newTime = parseFloat((e.target as HTMLInputElement).value);
                if (onSeekTo) onSeekTo(newTime);
              }}
              style={{
                background: 'transparent',
                outline: 'none',
                '--progress': `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              } as React.CSSProperties}
            />
          </div>
          
          {/* 总时间 */}
          <div className="text-xs text-gray-300 min-w-[35px]">
            {formatTime(duration)}
          </div>
        </div>
      </div>

      {/* 第二行：播放控制按钮和文件名 */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-700/30" style={{ alignItems: 'center', justifyContent: 'center', height: '30px', background: 'rgba(0, 0, 0, 0.7)' }}>
        {/* 左侧：播放控制按钮 */}
        <div className="flex items-center" style={{ gap: 'clamp(2px, 0.5vw, 4px)' }}>
          <button
            onClick={onPrevious}
            className="hover:bg-white/20 rounded transition-colors"
            style={{ padding: 'clamp(4px, 1vw, 8px)' }}
            title="上一曲"
          >
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z"/>
            </svg>
          </button>
          
          <button
            onClick={onPlayPause}
            className="hover:bg-white/20 rounded transition-colors"
            style={{ padding: 'clamp(4px, 1vw, 8px)' }}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z"/>
              </svg>
            ) : (
              <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd"/>
              </svg>
            )}
          </button>
          
          <button
            onClick={onStop}
            className="hover:bg-white/20 rounded transition-colors"
            style={{ padding: 'clamp(4px, 1vw, 8px)' }}
            title="停止"
          >
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z"/>
            </svg>
          </button>
          
          <button
            onClick={onNext}
            className="hover:bg-white/20 rounded transition-colors"
            style={{ padding: 'clamp(4px, 1vw, 8px)' }}
            title="下一曲"
          >
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M12.5 5.634a1 1 0 011.55-.832l6 4a1 1 0 010 1.664l-6 4A1 1 0 0112 14v-2.798l-5.445 3.63A1 1 0 015 14V6a1 1 0 011.555-.832L12 8.798V6a1 1 0 01.5-.866z"/>
            </svg>
          </button>
        </div>

        {/* 中间：文件名显示 */}
        <div className="flex-1" style={{ margin: 'clamp(8px, 2vw, 16px)' }}>
          <div 
            className="text-gray-300 truncate text-center cursor-pointer hover:text-white transition-colors mx-auto"
            style={{ 
              fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)',
              maxWidth: 'clamp(150px, 30vw, 300px)'
            }}
            onClick={() => {
              // 打开文件选择对话框
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'video/*,audio/*';
              input.multiple = false; // 单文件选择，立即播放
              input.onchange = (e) => {
                const files = Array.from((e.target as HTMLInputElement).files || []);
                if (files.length > 0) {
                  // 选择文件后立即播放第一个文件
                  onFileSelectAndPlay(files);
                }
              };
              input.click();
            }}
            title="点击选择文件"
          >
            {getCurrentFileName()}
          </div>
        </div>

        {/* 右侧：音量控制和播放列表按钮 */}
        <div className="flex items-center" style={{ gap: 'clamp(4px, 1vw, 8px)' }}>
          {/* 音量控制 */}
          <div className="flex items-center" style={{ gap: 'clamp(2px, 0.5vw, 4px)' }}>
            <div 
              className="text-gray-300 cursor-pointer hover:text-white transition-colors"
              style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }}
              onClick={handleMuteToggle}
              title={isMuted ? "取消静音" : "静音"}
            >
              <svg 
                style={{ width: '100%', height: '100%' }}
                fill="currentColor" 
                viewBox="0 0 20 20"
              >
              {isMuted ? (
                // 静音图标
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd"/>
              ) : (
                // 正常音量图标
                <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd"/>
              )}
              </svg>
            </div>
            <div className="relative flex items-center" style={{ height: 'clamp(12px, 2vw, 16px)' }}>
              <div 
                className="bg-gray-500/30 absolute top-1/2 transform -translate-y-1/2"
                style={{ 
                  width: 'clamp(40px, 8vw, 64px)', 
                  height: '1px' 
                }}
              ></div>
              <input
                type="range"
                className="appearance-none cursor-pointer bg-transparent relative z-10 volume-slider"
                style={{
                  width: 'clamp(40px, 8vw, 64px)',
                  height: '4px',
                  background: 'transparent',
                  outline: 'none',
                  '--volume-progress': `${volume}%`,
                } as React.CSSProperties}
                min="0"
                max="100"
                value={volume}
                onChange={handleVolumeChange}
              />
            </div>
          </div>

          {/* 播放列表按钮 */}
          <div className="relative" ref={playlistRef}>
          <button
            onClick={() => setShowPlaylist(!showPlaylist)}
            className="hover:bg-white/20 rounded transition-colors"
            style={{ padding: 'clamp(4px, 1vw, 8px)' }}
            title="播放列表"
          >
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zM2 14.75a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd"/>
            </svg>
          </button>

          {/* 播放列表下拉菜单 */}
          {showPlaylist && (
            <div 
              className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur-md border border-gray-700/50 shadow-xl rounded-md overflow-y-auto z-50"
              style={{
                minWidth: '256px',
                maxWidth: '38vw',
                maxHeight: `${windowHeight * 0.8}px`,
                width: 'clamp(256px, 38vw, 600px)'
              }}
            >
              <div className="p-2 border-b border-gray-700/50 flex items-center justify-between">
                <div className="text-sm font-semibold">
                  播放列表 ({filteredPlaylist.length}
                  {playlistViewMode !== 'all' && ` ${playlistViewModeLabels[playlistViewMode]}`})
                </div>
                <div className="flex items-center space-x-2">
                  {/* 列表类型切换按钮 */}
                  <button
                    onClick={togglePlaylistViewMode}
                    className="px-2 py-1 bg-purple-600/50 hover:bg-purple-500/50 text-white text-xs rounded flex items-center space-x-1 transition-colors"
                    title={`当前显示: ${playlistViewModeLabels[playlistViewMode]}`}
                  >
                    <span className="text-sm">
                      {playlistViewMode === 'all' ? '📋' : playlistViewMode === 'audio' ? '🎵' : '🎬'}
                    </span>
                    <span>{playlistViewModeLabels[playlistViewMode]}</span>
                  </button>
                  {/* 播放模式切换按钮 */}
                  <button
                    onClick={onTogglePlayMode}
                    className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-white text-xs rounded flex items-center space-x-1 transition-colors"
                    title={`当前模式: ${playModeLabels[playMode]}`}
                  >
                    <span className="text-sm">{playModeIcons[playMode]}</span>
                    <span>{playModeLabels[playMode]}</span>
                  </button>
                  {/* 加号按钮 - 添加文件 */}
                  <button
                    onClick={() => {
                      const input = document.createElement('input');
                      input.type = 'file';
                      input.accept = 'video/*,audio/*';
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from((e.target as HTMLInputElement).files || []);
                        if (files.length > 0) {
                          onFilesAdd(files);
                        }
                      };
                      input.click();
                    }}
                    className="w-6 h-6 bg-blue-600/50 hover:bg-blue-500/50 text-white text-sm rounded flex items-center justify-center transition-colors"
                    title="添加文件到播放列表"
                  >
                    +
                  </button>
                </div>
              </div>
              
              {filteredPlaylist.length === 0 ? (
                <div className="p-4 text-center text-gray-400 text-sm">
                  {playlist.length === 0 ? '播放列表为空' : `当前${playlistViewModeLabels[playlistViewMode]}列表为空`}
                  <div className="mt-2 text-xs">拖拽文件到此处添加</div>
                </div>
              ) : (
                <div className="p-2">
                  
                  {filteredPlaylist.map((item, filteredIndex) => {
                    const originalIndex = originalIndexMap.get(filteredIndex) ?? filteredIndex;
                    return (
                      <div
                      key={item.id}
                      className={`flex items-center justify-between p-2 rounded hover:bg-gray-700/50 cursor-pointer group ${
                        originalIndex === currentIndex ? 'bg-blue-600/50' : ''
                      }`}
                      onClick={() => {
                        if (onPlaylistItemClick) {
                          onPlaylistItemClick(originalIndex);
                          setShowPlaylist(false);
                        }
                      }}
                    >
                      <span className="text-sm truncate flex-1" title={item.name}>
                        {item.name}
                      </span>
                      <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {originalIndex > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onPlaylistItemMove) {
                                onPlaylistItemMove(originalIndex, originalIndex - 1);
                              }
                            }}
                            className="p-1 hover:bg-white/20 rounded text-xs"
                            title="上移"
                          >
                            ↑
                          </button>
                        )}
                        {originalIndex < playlist.length - 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onPlaylistItemMove) {
                                onPlaylistItemMove(originalIndex, originalIndex + 1);
                              }
                            }}
                            className="p-1 hover:bg-white/20 rounded text-xs"
                            title="下移"
                          >
                            ↓
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onPlaylistItemRemove) {
                              onPlaylistItemRemove(originalIndex);
                            }
                          }}
                          className="p-1 hover:bg-red-500/50 rounded text-xs"
                          title="删除"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default ControlBar;