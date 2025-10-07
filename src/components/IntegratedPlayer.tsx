import React, { useRef, useEffect, useState, useCallback } from 'react';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
}

interface IntegratedPlayerProps {
  src: string;
  onStateChange: (state: Partial<PlayerState>) => void;
  onError?: (error: string) => void;
  onPlayPause?: React.MutableRefObject<(() => void) | null>;
  onVolumeUp?: React.MutableRefObject<(() => void) | null>;
  onVolumeDown?: React.MutableRefObject<(() => void) | null>;
  onMute?: React.MutableRefObject<(() => void) | null>;
  onSeekForward?: React.MutableRefObject<(() => void) | null>;
  onSeekBackward?: React.MutableRefObject<(() => void) | null>;
}

const IntegratedPlayer: React.FC<IntegratedPlayerProps> = ({ 
  src, 
  onStateChange, 
  onError,
  onPlayPause: externalPlayPause,
  onVolumeUp: externalVolumeUp,
  onVolumeDown: externalVolumeDown,
  onMute: externalMute,
  onSeekForward: externalSeekForward,
  onSeekBackward: externalSeekBackward,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  });
  const [isDragging] = useState(false);

  // 处理src变化时的状态重置
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // 重置视频状态
    video.currentTime = 0;
    
    const handleLoadStart = () => {
      // 视频开始加载时重置状态
      setPlayerState(prev => ({ 
        ...prev, 
        currentTime: 0, 
        isPlaying: false 
      }));
    };

    const handleCanPlay = async () => {
      // 视频可以播放时，自动开始播放
      try {
        await video.play();
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

    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('loadstart', handleLoadStart);
    
    return () => {
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('loadstart', handleLoadStart);
    };
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateState = (newState: Partial<PlayerState>) => {
      setPlayerState(prev => ({ ...prev, ...newState }));
      onStateChange(newState);
    };

    const handleLoadedMetadata = () => {
      updateState({
        duration: video.duration,
        currentTime: video.currentTime,
        volume: video.volume,
        muted: video.muted,
      });
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        updateState({ currentTime: video.currentTime });
      }
    };

    const handlePlay = () => updateState({ isPlaying: true });
    const handlePause = () => updateState({ isPlaying: false });
    const handleVolumeChange = () => updateState({ volume: video.volume, muted: video.muted });

    const handleError = () => {
      const error = video.error;
      let errorMessage = '未知错误';
      
      if (error) {
        switch (error.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorMessage = '视频加载被中止';
            break;
          case MediaError.MEDIA_ERR_NETWORK:
            errorMessage = '网络错误导致视频加载失败';
            break;
          case MediaError.MEDIA_ERR_DECODE:
            errorMessage = '视频解码错误';
            break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorMessage = '不支持的视频格式或编解码器';
            break;
        }
      }
      
      onError?.(errorMessage);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);
    video.addEventListener('error', handleError);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
      video.removeEventListener('error', handleError);
    };
  }, [onStateChange, onError, isDragging]);

  // 格式化时间函数（暂时未使用）
  // const formatTime = (time: number) => {
  //   const minutes = Math.floor(time / 60);
  //   const seconds = Math.floor(time % 60);
  //   return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  // };

  const handlePlayPause = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      console.log('视频元素不存在');
      return;
    }
    
    console.log('点击播放/暂停，当前状态:', playerState.isPlaying);
    console.log('视频元素状态:', {
      paused: video.paused,
      readyState: video.readyState,
      src: video.src
    });
    
    if (playerState.isPlaying) {
      console.log('暂停视频');
      video.pause();
    } else {
      console.log('播放视频');
      video.play().catch(err => {
        console.error('播放失败:', err);
        onError?.('播放失败: ' + err.message);
      });
    }
  }, [playerState.isPlaying, onError]);

  const handleVolumeUp = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = Math.min(1, video.volume + 0.1);
    video.volume = newVolume;
    if (video.muted && newVolume > 0) {
      video.muted = false;
    }
  }, []);

  const handleVolumeDown = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const newVolume = Math.max(0, video.volume - 0.1);
    video.volume = newVolume;
  }, []);

  const handleSeekForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.min(video.duration, video.currentTime + 10);
  }, []);

  const handleSeekBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.currentTime = Math.max(0, video.currentTime - 10);
  }, []);

  const handleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    video.muted = !video.muted;
  }, []);

  // 暴露方法给父组件
  useEffect(() => {
    if (externalPlayPause) externalPlayPause.current = handlePlayPause;
    if (externalVolumeUp) externalVolumeUp.current = handleVolumeUp;
    if (externalVolumeDown) externalVolumeDown.current = handleVolumeDown;
    if (externalMute) externalMute.current = handleMute;
    if (externalSeekForward) externalSeekForward.current = handleSeekForward;
    if (externalSeekBackward) externalSeekBackward.current = handleSeekBackward;
  }, [handlePlayPause, handleVolumeUp, handleVolumeDown, handleMute, handleSeekForward, handleSeekBackward]);

  // 进度条拖拽处理函数（暂时未使用）
  // const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const video = videoRef.current;
  //   if (!video) return;
    
  //   const time = parseFloat(e.target.value);
  //   video.currentTime = time;
  //   setPlayerState(prev => ({ ...prev, currentTime: time }));
  // };

  // 音量控制函数（暂时未使用）
  // const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const video = videoRef.current;
  //   if (!video) return;
    
  //   const volume = parseFloat(e.target.value);
  //   video.volume = volume;
  //   video.muted = volume === 0;
  // };

  return (
    <div className="relative bg-black flex-1 flex items-center justify-center w-full h-full p-0">
      <video
        ref={videoRef}
        src={src}
        className="w-auto h-auto max-w-full max-h-full"
        onClick={handlePlayPause}
        preload="metadata"
        style={{ 
          objectFit: 'contain',
          display: 'block',
          margin: '0 auto'
        }}
      />
    </div>
  );
};

export default IntegratedPlayer;