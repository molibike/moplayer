import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as mm from 'music-metadata-browser';
import VinylPlayer from './VinylPlayer';
import AudioInfo from './AudioInfo';
import AudioVisualizer from './AudioVisualizer';

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

  // 处理src变化时的状态重置
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

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
        if (onError) {
          onError('自动播放失败，请手动点击播放');
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
    if (!audio) {
      console.log('音频元素不存在，跳过事件监听器设置');
      return;
    }

    console.log('设置音频事件监听器...');
    const updateState = (newState: Partial<PlayerState>) => {
      setPlayerState(prev => ({ ...prev, ...newState }));
      onStateChange(newState);
    };

    const handleLoadedMetadata = () => {
      console.log('🎵 音频元数据已加载，开始提取封面图像...');
      console.log('音频信息:', { 
        duration: audio.duration, 
        src: audio.src,
        fileBlob: !!fileBlob,
        fileName: fileName
      });
      updateState({
        duration: audio.duration,
        currentTime: audio.currentTime,
        volume: audio.volume,
        muted: audio.muted,
      });

      // 尝试提取音频元数据
      console.log('📥 调用 extractMetadata 函数...');
      extractMetadata(audio);
    };

    // 添加更多事件监听器来调试
    const handleLoadStart = () => {
      console.log('🔊 音频开始加载...');
    };

    const handleCanPlay = () => {
      console.log('✅ 音频可以播放');
    };

    const handlePlay = () => {
      console.log('▶️ 音频开始播放');
      updateState({ isPlaying: true });
    };

    const handlePause = () => {
      console.log('⏸️ 音频暂停');
      updateState({ isPlaying: false });
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        updateState({ currentTime: audio.currentTime });
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
      
      onError?.(errorMessage);
    };

    const handleEnded = () => {
      onEnded?.();
    };

    console.log('📞 注册音频事件监听器...');
    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    // 检查音频当前状态
    console.log('📊 音频当前状态:', {
      readyState: audio.readyState,
      networkState: audio.networkState,
      paused: audio.paused,
      currentTime: audio.currentTime,
      duration: audio.duration
    });

    // 如果音频元数据已经加载完成，立即提取元数据
    if (audio.readyState >= 1) { // HAVE_METADATA or higher
      console.log('🚀 音频元数据已就绪，立即提取封面图像...');
      handleLoadedMetadata();
    }

    return () => {
      console.log('🧹 清理音频事件监听器...');
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
  }, [onStateChange, onError, isDragging]);

  // 提取音频元数据
  const extractMetadata = async (audio: HTMLAudioElement) => {
    console.log('extractMetadata 函数开始执行');
    try {
      // 优先解析音频内嵌封面与常用标签
      let coverImage: string | undefined;
      let title = fileName.replace(/\.[^/.]+$/, '');
      let artist = '未知艺术家';
      let album = '未知专辑';

      console.log('开始解析音频元数据，文件名:', fileName);
      console.log('可用数据源:', { fileBlob: !!fileBlob, audioSrc: !!audio.src });

      // 如果提供了原始文件Blob，优先使用其进行解析
      if (fileBlob) {
        try {
          console.log('使用文件Blob解析元数据...');
          const metadataFromBlob = await mm.parseBlob(fileBlob);
          const commonFromBlob = metadataFromBlob.common || ({} as any);
          
          console.log('Blob解析结果:', {
            title: commonFromBlob.title,
            artist: commonFromBlob.artist,
            album: commonFromBlob.album,
            hasPicture: commonFromBlob.picture && commonFromBlob.picture.length > 0
          });

          if (commonFromBlob.title) title = commonFromBlob.title;
          if (commonFromBlob.artist) artist = commonFromBlob.artist;
          if (commonFromBlob.album) album = commonFromBlob.album;
          
          if (commonFromBlob.picture && commonFromBlob.picture.length > 0) {
            console.log('找到封面图片，开始转换...');
            const pic = commonFromBlob.picture[0];
            console.log('封面信息:', { format: pic.format, dataLength: pic.data.length });
            
            try {
              const imgBlob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
              coverImage = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  console.log('封面转换成功，Data URL长度:', result.length);
                  console.log('Data URL前缀:', result.substring(0, 100));
                  resolve(result);
                };
                reader.onerror = () => {
                  console.error('封面转换失败');
                  resolve(undefined as any);
                };
                reader.readAsDataURL(imgBlob);
              });
            } catch (error) {
              console.error('封面图像转换错误:', error);
              coverImage = undefined;
            }
          } else {
            console.log('文件中未找到封面图片');
          }
          
          console.log('设置元数据:', { title, artist, album, hasCover: !!coverImage, coverImageLength: coverImage?.length });
          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
          return; // 已解析完成，提前返回
        } catch (e) {
          console.warn('使用文件Blob解析音频标签失败，回退到audio.src:', e);
        }
      }

      if (audio.src) {
        try {
          console.log('使用audio.src解析元数据...');
          const response = await fetch(audio.src);
          const blob = await response.blob();
          const metadata = await mm.parseBlob(blob);
          const common = metadata.common || {} as any;

          console.log('audio.src解析结果:', {
            title: common.title,
            artist: common.artist,
            album: common.album,
            hasPicture: common.picture && common.picture.length > 0
          });

          // 标题/艺术家/专辑优先用标签
          if (common.title) title = common.title;
          if (common.artist) artist = common.artist;
          if (common.album) album = common.album;

          // 提取封面图片
          if (common.picture && common.picture.length > 0) {
            console.log('找到封面图片，开始转换...');
            const pic = common.picture[0];
            console.log('封面信息:', { format: pic.format, dataLength: pic.data.length });
            
            try {
              const imgBlob = new Blob([pic.data], { type: pic.format || 'image/jpeg' });
              coverImage = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => {
                  const result = reader.result as string;
                  console.log('封面转换成功，Data URL长度:', result.length);
                  console.log('Data URL前缀:', result.substring(0, 100));
                  resolve(result);
                };
                reader.onerror = () => {
                  console.error('封面转换失败');
                  resolve(undefined as any);
                };
                reader.readAsDataURL(imgBlob);
              });
            } catch (error) {
              console.error('封面图像转换错误:', error);
              coverImage = undefined;
            }
          } else {
            console.log('文件中未找到封面图片');
          }
          
          // 在使用audio.src解析成功后立即设置元数据
          console.log('audio.src解析设置元数据:', { title, artist, album, hasCover: !!coverImage, coverImageLength: coverImage?.length });
          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
        } catch (e) {
          // 解析失败时回退为文件名解析
          console.warn('音频标签解析失败，使用文件名信息作为替代:', e);
          
          // 即使解析失败也要设置默认元数据
          console.log('回退设置元数据:', { title, artist, album, hasCover: !!coverImage });
          setMetadata({ 
            title: title || '', 
            artist: artist || '', 
            album: album || '', 
            coverImage 
          });
        }
      } else {
        // 如果没有audio.src，直接设置默认元数据
        console.log('直接设置默认元数据:', { title, artist, album, hasCover: !!coverImage });
        setMetadata({ 
          title: title || '', 
          artist: artist || '', 
          album: album || '', 
          coverImage 
        });
      }
    } catch (error) {
      console.error('元数据提取失败:', error);
      // 即使解析失败也要设置默认元数据
      console.error('元数据提取失败，设置默认元数据:', error);
      setMetadata({
        title: fileName.replace(/\.[^/.]+$/, ''),
        artist: '未知艺术家',
        album: '未知专辑',
        coverImage: undefined,
      });
    }
  };

  const handlePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      console.log('音频元素不存在');
      return;
    }
    
    // 直接检查音频元素的播放状态，而不是依赖本地状态
    const isCurrentlyPlaying = !audio.paused;
    console.log('点击播放/暂停，音频元素当前状态:', { paused: audio.paused, isCurrentlyPlaying });
    
    if (isCurrentlyPlaying) {
      console.log('暂停音频');
      audio.pause();
    } else {
      console.log('播放音频');
      audio.play().catch(err => {
        console.error('播放失败:', err);
        onError?.('播放失败: ' + err.message);
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
    <div className="relative bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex-1 flex w-full h-full border-5 border-gray-700 cursor-pointer"
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
        {/* 顶部：唱片机按钮区域 */}
        <div className="flex justify-center items-center space-x-4 relative" style={{ height: '60px', marginTop: '30px' }}>
          <div className="w-12 h-12 bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors">
            <div className="w-6 h-6 bg-gray-400 rounded-sm"></div>
          </div>
          <div ref={middleButtonRef} className="w-12 h-12 bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors relative">
            <div className="w-6 h-6 bg-green-400 rounded-sm"></div>
            {/* 连接点 */}
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 w-2 h-2 bg-gray-300 rounded-full border border-gray-500"></div>
          </div>
          <div className="w-12 h-12 bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors">
            <div className="w-6 h-6 bg-gray-400 rounded-sm"></div>
          </div>
        </div>
        
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
        {/* 上部：音频信息区域 - 61% 高度 */}
        <div style={{ height: '61%' }}>
          <AudioInfo
            fileName={fileName}
            metadata={metadata}
            currentTime={playerState.currentTime}
            duration={playerState.duration}
            onSeek={handleSeek}
          />
        </div>
        
        {/* 下部：音波条区域 - 38% 高度（底部内边距+10px） */}
        <div style={{ height: '38%', paddingBottom: '10px' }}>
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