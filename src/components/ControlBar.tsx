import React, { useEffect, useRef, useState } from 'react';

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
  playlistViewMode: 'audio' | 'video';
  onlineMusicEnabled: boolean;
  setPlaylistViewMode: (mode: 'audio' | 'video') => void;
  directoryMode: boolean;
  onToggleDirectoryMode: () => void;
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
  onlineMusicEnabled,
  setPlaylistViewMode,
  directoryMode,
  onToggleDirectoryMode,
}) => {
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [playlistTab, setPlaylistTab] = useState<'local_audio' | 'online_audio' | 'video'>('local_audio');
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [volumeBeforeMute, setVolumeBeforeMute] = useState(100);
  const [isDraggingProgress, setIsDraggingProgress] = useState(false);
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showPlaybackRateMenu, setShowPlaybackRateMenu] = useState(false);

  const playlistRef = useRef<HTMLDivElement>(null);
  const playbackRateRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout>();

  // 倍速选项列表
  const playbackRates = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

  const playModeLabels = {
    sequential: '顺序',
    single: '单曲',
    list: '列表',
    random: '随机',
  };

  const playModeIcons = {
    sequential: '→',
    single: '1',
    list: '∞',
    random: '⚡',
  };

  const isAudioFile = (file: File) => {
    return file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|aac|m4a|wma)$/i.test(file.name);
  };

  const isVideoFile = (file: File) => {
    return file.type.startsWith('video/') || /\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v)$/i.test(file.name);
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|bmp|webp|svg|ico|tif|tiff|heic|heif|wmf|exif|raw|cr2|nef|arw|dng|rw2|orf|raf|sr2)$/i.test(file.name);
  };

  const isPdfFile = (file: File) => {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  };

  const isCurrentImage = () => {
    if (currentIndex < 0 || currentIndex >= playlist.length) return false;
    const file = playlist[currentIndex].file;
    return isImageFile(file) || isPdfFile(file);
  };

  const isOnlineTrack = (item: PlaylistItem) => item.id.startsWith('online-');

  const localAudioPlaylist = playlist.filter(item => isAudioFile(item.file) && !isOnlineTrack(item));
  const onlineAudioPlaylist = playlist.filter(item => isAudioFile(item.file) && isOnlineTrack(item));
  const videoPlaylist = playlist.filter(item => isVideoFile(item.file));

  const filteredPlaylist = playlist.filter(item => {
    if (playlistTab === 'local_audio') return isAudioFile(item.file) && !isOnlineTrack(item);
    if (playlistTab === 'online_audio') return isAudioFile(item.file) && isOnlineTrack(item);
    return isVideoFile(item.file);
  });

  const playlistTabLabels = {
    local_audio: '本地',
    online_audio: '在线',
    video: '视频',
  };

  const originalIndexMap = new Map<number, number>();
  let filteredIndex = 0;
  playlist.forEach((item, originalIndex) => {
    if (playlistTab === 'local_audio' && isAudioFile(item.file) && !isOnlineTrack(item)) {
      originalIndexMap.set(filteredIndex++, originalIndex);
    } else if (playlistTab === 'online_audio' && isAudioFile(item.file) && isOnlineTrack(item)) {
      originalIndexMap.set(filteredIndex++, originalIndex);
    } else if (playlistTab === 'video' && isVideoFile(item.file)) {
      originalIndexMap.set(filteredIndex++, originalIndex);
    }
  });

  useEffect(() => {
    if (playlistViewMode === 'video') {
      setPlaylistTab('video');
      return;
    }

    if (playlistTab === 'video') {
      setPlaylistTab('local_audio');
    }
  }, [playlistViewMode]);

  useEffect(() => {
    if (!onlineMusicEnabled && playlistTab === 'online_audio') {
      setPlaylistTab('local_audio');
    }
  }, [onlineMusicEnabled, playlistTab]);

  useEffect(() => {
    if (!isPlaying) {
      setIsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
      return;
    }

    const handleMouseMove = () => {
      setIsVisible(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
      }, 5000);
    };

    const handleMouseLeave = () => {
      if (!isPlaying) return;
      setIsVisible(false);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setShowPlaylist(false);
      }, 5000);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
    };
  }, [isPlaying]);

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (playlistRef.current && !playlistRef.current.contains(event.target as Node)) {
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

  // 点击倍速菜单外部时关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (playbackRateRef.current && !playbackRateRef.current.contains(event.target as Node)) {
        setShowPlaybackRateMenu(false);
      }
    };

    if (showPlaybackRateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlaybackRateMenu]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleVolumeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(event.target.value);
    setVolume(newVolume);
    if (newVolume > 0 && isMuted) {
      setIsMuted(false);
    }
    const videoElement = document.querySelector('video');
    const audioElement = document.querySelector('audio');
    if (videoElement) videoElement.volume = newVolume / 100;
    if (audioElement) audioElement.volume = newVolume / 100;
  };

  // 选择指定倍速
  const handlePlaybackRateSelect = (rate: number) => {
    setPlaybackRate(rate);
    setShowPlaybackRateMenu(false);
    const videoElement = document.querySelector('video');
    const audioElement = document.querySelector('audio');
    if (videoElement) videoElement.playbackRate = rate;
    if (audioElement) audioElement.playbackRate = rate;
  };

  const handleMuteToggle = () => {
    const videoElement = document.querySelector('video');
    const audioElement = document.querySelector('audio');
    if (isMuted) {
      setIsMuted(false);
      setVolume(volumeBeforeMute);
      if (videoElement) videoElement.volume = volumeBeforeMute / 100;
      if (audioElement) audioElement.volume = volumeBeforeMute / 100;
      return;
    }

    setVolumeBeforeMute(volume);
    setIsMuted(true);
    setVolume(0);
    if (videoElement) videoElement.volume = 0;
    if (audioElement) audioElement.volume = 0;
  };

  const getCurrentFileName = () => {
    if (currentIndex >= 0 && currentIndex < playlist.length) {
      return playlist[currentIndex].name;
    }
    return '未选择文件';
  };

  const handlePlaylistButtonClick = () => {
    if (!showPlaylist && currentIndex >= 0 && currentIndex < playlist.length) {
      const item = playlist[currentIndex];
      if (isAudioFile(item.file)) {
        setPlaylistViewMode('audio');
        setPlaylistTab(isOnlineTrack(item) && onlineMusicEnabled ? 'online_audio' : 'local_audio');
      } else if (isVideoFile(item.file)) {
        setPlaylistViewMode('video');
        setPlaylistTab('video');
      }
    }
    setShowPlaylist(prev => !prev);
  };

  const openFilePicker = (multiple: boolean, onFiles: (files: File[]) => void) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*,image/*,application/pdf,.pdf';
    input.multiple = multiple;
    input.onchange = (event) => {
      const files = Array.from((event.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        onFiles(files);
      }
    };
    input.click();
  };

  if (isCurrentImage()) {
    return null;
  }

  if (!isVisible && !showPlaylist && !showPlaybackRateMenu) {
    return null;
  }

  return (
    <div
      className="control-bar fixed bottom-0 left-0 right-0 bg-transparent z-40 transition-all duration-300"
      style={{ height: '60px' }}
      onMouseEnter={() => {
        setIsVisible(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (mouseMoveTimeoutRef.current) clearTimeout(mouseMoveTimeoutRef.current);
      }}
      onMouseLeave={() => {
        if (!isPlaying) return;
        // 倍速菜单打开时不隐藏控制栏，避免组件卸载导致菜单状态丢失
        if (showPlaybackRateMenu) return;
        setIsVisible(false);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          setShowPlaylist(false);
        }, 5000);
      }}
    >
      <div className="flex items-center justify-between px-3 py-1" style={{ height: '30px', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}>
        <div className="flex items-center space-x-2 flex-1" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-xs text-gray-300 min-w-[35px] text-right">{formatTime(currentTime)}</div>
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
              onChange={(event) => {
                const newTime = parseFloat(event.target.value);
                if (onSeekTo) onSeekTo(newTime);
              }}
              onInput={(event) => {
                const newTime = parseFloat((event.target as HTMLInputElement).value);
                if (onSeekTo) onSeekTo(newTime);
              }}
              style={{
                background: 'transparent',
                outline: 'none',
                '--progress': `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
              } as React.CSSProperties}
            />
          </div>
          <div className="text-xs text-gray-300 min-w-[35px]">{formatTime(duration)}</div>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1 border-t border-gray-700/30" style={{ alignItems: 'center', justifyContent: 'center', height: '30px', background: 'rgba(0, 0, 0, 0.7)' }}>
        <div className="flex items-center" style={{ gap: 'clamp(2px, 0.5vw, 4px)' }}>
          <button onClick={onPrevious} className="hover:bg-white/20 rounded transition-colors" style={{ padding: 'clamp(4px, 1vw, 8px)' }} title="上一曲">
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
            </svg>
          </button>
          <button onClick={onPlayPause} className="hover:bg-white/20 rounded transition-colors" style={{ padding: 'clamp(4px, 1vw, 8px)' }} title={isPlaying ? '暂停' : '播放'}>
            {isPlaying ? (
              <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M5.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5zM12.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h1.5a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-1.5z" />
              </svg>
            ) : (
              <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button onClick={onStop} className="hover:bg-white/20 rounded transition-colors" style={{ padding: 'clamp(4px, 1vw, 8px)' }} title="停止">
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M5.25 3A2.25 2.25 0 003 5.25v9.5A2.25 2.25 0 005.25 17h9.5A2.25 2.25 0 0017 14.75v-9.5A2.25 2.25 0 0014.75 3h-9.5z" />
            </svg>
          </button>
          <button onClick={onNext} className="hover:bg-white/20 rounded transition-colors" style={{ padding: 'clamp(4px, 1vw, 8px)' }} title="下一曲">
            <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M12.5 5.634a1 1 0 011.55-.832l6 4a1 1 0 010 1.664l-6 4A1 1 0 0112 14v-2.798l-5.445 3.63A1 1 0 015 14V6a1 1 0 011.555-.832L12 8.798V6a1 1 0 01.5-.866z" />
            </svg>
          </button>
        </div>

        <div className="flex-1" style={{ margin: 'clamp(8px, 2vw, 16px)' }}>
          <div
            className="text-gray-300 truncate text-center cursor-pointer hover:text-white transition-colors mx-auto"
            style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)', maxWidth: 'clamp(150px, 30vw, 300px)' }}
            onClick={() => openFilePicker(false, onFileSelectAndPlay)}
            title="点击选择文件"
          >
            {getCurrentFileName()}
          </div>
        </div>

        <div className="flex items-center" style={{ gap: 'clamp(4px, 1vw, 8px)' }}>
          {/* 倍速按钮 - 仅视频模式显示 */}
          {playlistViewMode === 'video' && (
            <div className="relative flex items-center" ref={playbackRateRef}>
              <button
                onClick={() => setShowPlaybackRateMenu(prev => !prev)}
                className="text-gray-300 hover:text-white transition-colors font-mono leading-none"
                style={{ fontSize: 'clamp(0.625rem, 1.2vw, 0.75rem)', minWidth: 'clamp(28px, 4vw, 36px)', textAlign: 'center' }}
                title={`播放倍速: ${playbackRate}x（点击选择）`}
              >
                {playbackRate === 1 ? '1.0x' : `${playbackRate}x`}
              </button>
              {showPlaybackRateMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 border border-gray-700/50 rounded-md shadow-xl py-1 z-50" style={{ minWidth: '60px' }}>
                  {playbackRates.map(rate => (
                    <div
                      key={rate}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        handlePlaybackRateSelect(rate);
                      }}
                      className={`px-3 py-1 text-center cursor-pointer transition-colors font-mono ${
                        rate === playbackRate ? 'text-blue-400 bg-blue-600/20' : 'text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                      style={{ fontSize: 'clamp(0.625rem, 1.2vw, 0.75rem)' }}
                    >
                      {rate === 1 ? '1.0x' : `${rate}x`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center" style={{ gap: 'clamp(2px, 0.5vw, 4px)' }}>
            <div className="text-gray-300 cursor-pointer hover:text-white transition-colors" style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} onClick={handleMuteToggle} title={isMuted ? '取消静音' : '静音'}>
              <svg style={{ width: '100%', height: '100%' }} fill="currentColor" viewBox="0 0 20 20">
                {isMuted ? (
                  <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 011.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                ) : (
                  <path fillRule="evenodd" d="M14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                )}
              </svg>
            </div>
            <div className="relative flex items-center" style={{ height: 'clamp(12px, 2vw, 16px)' }}>
              <div className="bg-gray-500/30 absolute top-1/2 transform -translate-y-1/2" style={{ width: 'clamp(40px, 8vw, 64px)', height: '1px' }}></div>
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

          <div className="relative" ref={playlistRef}>
            <button onClick={handlePlaylistButtonClick} className="hover:bg-white/20 rounded transition-colors" style={{ padding: 'clamp(4px, 1vw, 8px)' }} title="播放列表">
              <svg style={{ width: 'clamp(12px, 2vw, 16px)', height: 'clamp(12px, 2vw, 16px)' }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zM2 14.75a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
              </svg>
            </button>

            {showPlaylist && (
              <div
                className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700/50 shadow-xl rounded-md overflow-y-auto z-50"
                style={{
                  minWidth: '256px',
                  maxWidth: '38vw',
                  maxHeight: `${windowHeight * 0.8}px`,
                  width: 'clamp(256px, 38vw, 600px)',
                }}
              >
                <div className="p-2 border-b border-gray-700/50 flex items-center justify-between">
                  <div className="text-sm font-semibold">播放列表 ({filteredPlaylist.length})</div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={onTogglePlayMode}
                      className="w-6 h-6 bg-gray-700/50 hover:bg-gray-600/50 text-white text-xs rounded flex items-center justify-center transition-colors"
                      title={`当前模式: ${playModeLabels[playMode]}`}
                    >
                      <span className="text-sm" aria-label={playModeLabels[playMode]}>{playModeIcons[playMode]}</span>
                    </button>
                    <button
                      onClick={onToggleDirectoryMode}
                      className={`w-6 h-6 ${directoryMode ? 'bg-blue-600/50 hover:bg-blue-500/50' : 'bg-gray-700/50 hover:bg-gray-600/50'} text-white text-xs rounded flex items-center justify-center transition-colors`}
                      title={directoryMode ? '目录模式：开' : '目录模式：关'}
                    >
                      <span className="text-sm" aria-label="目录模式">📁</span>
                    </button>
                    <button
                      onClick={() => openFilePicker(true, onFilesAdd)}
                      className="w-6 h-6 bg-blue-600/50 hover:bg-blue-500/50 text-white text-sm rounded flex items-center justify-center transition-colors"
                      title="添加文件到播放列表"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="px-2 py-2 border-b border-gray-700/50 flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPlaylistTab('local_audio');
                      setPlaylistViewMode('audio');
                    }}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${playlistTab === 'local_audio' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    title={`本地音频 (${localAudioPlaylist.length})`}
                  >
                    本地 {localAudioPlaylist.length}
                  </button>
                  {onlineMusicEnabled && (
                    <button
                      onClick={() => {
                        setPlaylistTab('online_audio');
                        setPlaylistViewMode('audio');
                      }}
                      className={`px-3 py-1 text-xs rounded-full transition-colors ${playlistTab === 'online_audio' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                      title={`在线音乐 (${onlineAudioPlaylist.length})`}
                    >
                      在线 {onlineAudioPlaylist.length}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPlaylistTab('video');
                      setPlaylistViewMode('video');
                    }}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${playlistTab === 'video' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
                    title={`视频 (${videoPlaylist.length})`}
                  >
                    视频 {videoPlaylist.length}
                  </button>
                </div>

                {filteredPlaylist.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    {playlist.length === 0 ? '播放列表为空' : `当前${playlistTabLabels[playlistTab]}列表为空`}
                    <div className="mt-2 text-xs">拖拽文件到此处添加</div>
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredPlaylist.map((item, filteredListIndex) => {
                      const originalIndex = originalIndexMap.get(filteredListIndex) ?? filteredListIndex;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-2 rounded hover:bg-gray-700/50 cursor-pointer group ${originalIndex === currentIndex ? 'bg-blue-600/50' : ''}`}
                          onClick={() => {
                            onPlaylistItemClick(originalIndex);
                            setShowPlaylist(false);
                          }}
                        >
                          <span className="text-sm truncate flex-1" title={item.name}>{item.name}</span>
                          <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {originalIndex > 0 && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onPlaylistItemMove(originalIndex, originalIndex - 1);
                                }}
                                className="p-1 hover:bg-white/20 rounded text-xs"
                                title="上移"
                              >
                                ↑
                              </button>
                            )}
                            {originalIndex < playlist.length - 1 && (
                              <button
                                onClick={(event) => {
                                  event.stopPropagation();
                                  onPlaylistItemMove(originalIndex, originalIndex + 1);
                                }}
                                className="p-1 hover:bg-white/20 rounded text-xs"
                                title="下移"
                              >
                                ↓
                              </button>
                            )}
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                onPlaylistItemRemove(originalIndex);
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
