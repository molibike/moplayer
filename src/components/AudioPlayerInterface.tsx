import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as mm from 'music-metadata-browser';
import VinylPlayer from './VinylPlayer';
import AudioInfo from './AudioInfo';
import AudioVisualizer from './AudioVisualizer';
import VinylPlayerButtons from './VinylPlayerButtons';

// 导入 Buffer polyfill
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  coverImage?: string;
}

interface AudioPlayerInterfaceProps {
  src: string;
  fileName: string;
  fileBlob?: File;
  onStateChange: (state: Partial<PlayerState>) => void;
  onError?: (error: string) => void;
  onPlayPause?: React.MutableRefObject<(() => void) | null>;
  onVolumeUp?: React.MutableRefObject<(() => void) | null>;
  onVolumeDown?: React.MutableRefObject<(() => void) | null>;
  onMute?: React.MutableRefObject<(() => void) | null>;
  onSeekForward?: React.MutableRefObject<(() => void) | null>;
  onSeekBackward?: React.MutableRefObject<(() => void) | null>;
  onSeekTo?: React.MutableRefObject<((time: number) => void) | null>;
  onEnded?: () => void;
}

const AudioPlayerInterface: React.FC<AudioPlayerInterfaceProps> = ({ 
  src, 
  fileName,
  fileBlob,
  onStateChange, 
  onError,
  onPlayPause: externalPlayPause,
  onVolumeUp: externalVolumeUp,
  onVolumeDown: externalVolumeDown,
  onMute: externalMute,
  onSeekForward: externalSeekForward,
  onSeekBackward: externalSeekBackward,
  onSeekTo: externalSeekTo,
  onEnded,
}) => {
  // 用于精确计算中间按钮的几何中心
  const middleButtonRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  });
  const [metadata, setMetadata] = useState<AudioMetadata>({});
  const [isDragging] = useState(false);
  // 跟踪blob URL以便回收内存
  const coverBlobUrlRef = useRef<string | null>(null);
  const metadataExtractedSrcRef = useRef<string>('');
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);
  const fileNameRef = useRef(fileName);
  const fileBlobRef = useRef(fileBlob);
  const lastTimeUpdateRef = useRef(0);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    fileNameRef.current = fileName;
    fileBlobRef.current = fileBlob;
  }, [fileName, fileBlob]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  // 处理src变化时的状态重置
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    metadataExtractedSrcRef.current = '';
    lastTimeUpdateRef.current = 0;
    if (coverBlobUrlRef.current) {
      URL.revokeObjectURL(coverBlobUrlRef.current);
      coverBlobUrlRef.current = null;
    }
    setMetadata({});

    // 重置音频状态
    audio.currentTime = 0;
    // 确保切换音源后重新加载
    try {
      audio.load();
    } catch {}

    const handleLoadStart = () => {
      // 音频开始加载时重置状态
      setPlayerState(prev => ({ 
        ...prev, 
        currentTime: 0, 
        isPlaying: false 
      }));
    };

    const handleCanPlay = async () => {
      // 音频可以播放时，自动开始播放
      try {
        await audio.play();
        setPlayerState(prev => ({ 
          ...prev, 
          isPlaying: true 
        }));
      } catch (error) {
        console.error('自动播放失败:', error);
        setPlayerState(prev => ({ 
          ...prev, 
          isPlaying: false 
        }));
        if (onErrorRef.current) {
          onErrorRef.current('自动播放失败，请手动点击播放');
        }
      }
    };

    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadstart', handleLoadStart);
    
    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadstart', handleLoadStart);
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateState = (newState: Partial<PlayerState>) => {
      setPlayerState(prev => ({ ...prev, ...newState }));
      onStateChangeRef.current(newState);
    };

    const handleLoadedMetadata = () => {
      if (metadataExtractedSrcRef.current !== audio.currentSrc) {
        metadataExtractedSrcRef.current = audio.currentSrc;
        void extractMetadata(audio);
      }
      updateState({
        duration: audio.duration,
        currentTime: audio.currentTime,
        volume: audio.volume,
        muted: audio.muted,
      });
    };

    const handleLoadStart = () => {};
    const handleCanPlay = () => {};

    const handlePlay = () => {
      updateState({ isPlaying: true });
    };

    const handlePause = () => {
      updateState({ isPlaying: false });
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        const now = Date.now();
        if (now - lastTimeUpdateRef.current >= 1000) {
          lastTimeUpdateRef.current = now;
          updateState({ currentTime: audio.currentTime });
        }
      }
    };

    const handleVolumeChange = () => updateState({ volume: audio.volume, muted: audio.muted });

    const handleError = () => {
      const error = audio.error;
      let errorMessage = '未知错误';
      
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = '音频加载被中止';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = '网络错误导致音频加载失败';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = '音频解码错误';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = '不支持的音频格式或编解码器';
            break;
        }
      }
      
      onErrorRef.current?.(errorMessage);
    };

    const handleEnded = () => {
      onEndedRef.current?.();
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    // 如果音频元数据已经加载完成，立即提取元数据
    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [isDragging]);

  // 提取音频元数据
  const extractMetadata = async (audio: HTMLAudioElement) => {
    try {
      const currentFileName = fileNameRef.current;
      const currentFileBlob = fileBlobRef.current;
      // 优先解析音频内嵌封面与常用标签
      let coverImage: string | undefined;
      let title = currentFileName.replace(/\.[^/.]+$/, '');
      let artist = '未知艺术家';
      let album = '未知专辑';

      // 如果提供了原始文件Blob，优先使用其进行解析
      if (currentFileBlob) {
        try {
          const metadataFromBlob = await mm.parseBlob(currentFileBlob);
          const commonFromBlob = metadataFromBlob.common || ({} as any);

          if (commonFromBlob.title) title = commonFromBlob.title;
          if (commonFromBlob.artist) artist = commonFromBlob.artist;
          if (commonFromBlob.album) album = commonFromBlob.album;

          if (commonFromBlob.picture && commonFromBlob.picture.length > 0) {
            const pic = commonFromBlob.picture[0];

            try {
              const imgBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' });
              // 使用blob URL替代data URL，减少base64编解码和内存开销
              if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
              coverImage = URL.createObjectURL(imgBlob);
              coverBlobUrlRef.current = coverImage;
            } catch (error) {
              coverImage = undefined;
            }
          }

          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
          return; // 已解析完成，提前返回
        } catch (e) {
          // 解析失败，回退到audio.src
        }
      }

      if (audio.src) {
        try {
          const response = await fetch(audio.src);
          const blob = await response.blob();
          const metadata = await mm.parseBlob(blob);
          const common = metadata.common || {} as any;

          // 标题/艺术家/专辑优先用标签
          if (common.title) title = common.title;
          if (common.artist) artist = common.artist;
          if (common.album) album = common.album;

          // 提取封面图片
          if (common.picture && common.picture.length > 0) {
            const pic = common.picture[0];

            try {
              const imgBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' });
              // 使用blob URL替代data URL
              if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
              coverImage = URL.createObjectURL(imgBlob);
              coverBlobUrlRef.current = coverImage;
            } catch (error) {
              coverImage = undefined;
            }
          }

          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
        } catch (e) {
          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
        }
      } else {
        setMetadata({ 
          title: title || '', 
          artist: artist || '', 
          album: album || '', 
          coverImage 
        });
      }
    } catch (error) {
      setMetadata({
        title: fileNameRef.current.replace(/\.[^/.]+$/, ''),
        artist: '未知艺术家',
        album: '未知专辑',
        coverImage: undefined,
      });
    }
  };

  useEffect(() => {
    return () => {
      if (coverBlobUrlRef.current) {
        URL.revokeObjectURL(coverBlobUrlRef.current);
        coverBlobUrlRef.current = null;
      }
    };
  }, []);

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
    } else {
      audio.play().catch(err => {
        onErrorRef.current?.('播放失败: ' + err.message);
      });
    }
  }, [onError]);

  const handleVolumeUp = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    
    const newVolume = Math.min(1, audio.volume + 0.1);
    audio.volume = newVolume;
    if (audio.muted && newVolume > 0) {
      audio.muted = false;
    }
  }, []);

  const handleVolumeDown = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const newVolume = Math.max(0, audio.volume - 0.1);
    audio.volume = newVolume;
  }, []);

  const handleSeekForward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 10);
  }, []);

  const handleSeekBackward = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.currentTime = Math.max(0, audio.currentTime - 10);
  }, []);

  const handleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    audio.muted = !audio.muted;
  }, []);

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const clamped = Math.max(0, Math.min(audio.duration || 0, time));
    audio.currentTime = clamped;
    // 立即同步状态，提升进度条响应
    onStateChange({ currentTime: clamped });
  }, []);

  // 暴露方法给父组件
  useEffect(() => {
    if (externalPlayPause) externalPlayPause.current = handlePlayPause;
    if (externalVolumeUp) externalVolumeUp.current = handleVolumeUp;
    if (externalVolumeDown) externalVolumeDown.current = handleVolumeDown;
    if (externalMute) externalMute.current = handleMute;
    if (externalSeekForward) externalSeekForward.current = handleSeekForward;
    if (externalSeekBackward) externalSeekBackward.current = handleSeekBackward;
    if (externalSeekTo) externalSeekTo.current = (time: number) => handleSeek(time);
  }, [handlePlayPause, handleVolumeUp, handleVolumeDown, handleMute, handleSeekForward, handleSeekBackward, handleSeek]);

  return (
    <div className="relative flex-1 flex w-full h-full border-5 border-gray-700"
         style={{ border: '5px solid #374151' }}
         onClick={handlePlayPause}>
      {/* 隐藏的音频元素 */}
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        style={{ display: 'none' }}
      />
      
      {/* 左侧：唱片播放机区域 - 38% 宽度 */}
      <div className="h-full flex flex-col" style={{ width: '38%' }}>
        {/* 唱片机按钮区域 - 动态尺寸 */}
        <VinylPlayerButtons 
          middleButtonRef={middleButtonRef}
        />
        
        {/* 唱片区域：底对齐 */}
        <div className="flex-1 flex items-end justify-center" style={{ paddingBottom: '10px' }}>
          <VinylPlayer 
            isPlaying={playerState.isPlaying}
            coverImage={metadata.coverImage}
            buttonElement={middleButtonRef.current}
          />
          {/* 调试信息：显示封面图像状态 */}
          {process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs p-1 rounded">
              Cover: {metadata.coverImage ? 'Yes' : 'No'}
              {metadata.coverImage && ` (${metadata.coverImage.length} chars)`}
            </div>
          )}
        </div>
      </div>
      
      {/* 右侧：音频信息和音波条区域 - 61% 宽度 */}
      <div className="h-full flex flex-col" style={{ width: '61%' }}>
        {/* 上部：音频信息区域 - 61% 高度（底部安全区10px） */}
        <div style={{ height: '61%', paddingBottom: '10px' }}>
          <AudioInfo
            fileName={fileName}
            metadata={metadata}
            currentTime={playerState.currentTime}
            duration={playerState.duration}
            onSeek={handleSeek}
          />
        </div>
        
        {/* 下部：音波条区域 - 38% 高度（底部内边距0） */}
        <div style={{ height: '38%', paddingBottom: '0px' }}>
            <AudioVisualizer
             audioElement={audioRef.current}
             isPlaying={playerState.isPlaying}
             height={0 /* 让组件自适应容器高度 */}
           />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayerInterface;