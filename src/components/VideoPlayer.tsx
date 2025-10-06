import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  src: string;
  onStateChange: (state: {
    isPlaying?: boolean;
    currentTime?: number;
    duration?: number;
    volume?: number;
  }) => void;
  onError?: (error: string) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, onStateChange, onError }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      onStateChange({
        duration: video.duration,
        currentTime: video.currentTime,
        volume: video.volume,
      });
    };

    const handleTimeUpdate = () => {
      onStateChange({
        currentTime: video.currentTime,
      });
    };

    const handlePlay = () => {
      onStateChange({ isPlaying: true });
    };

    const handlePause = () => {
      onStateChange({ isPlaying: false });
    };

    const handleVolumeChange = () => {
      onStateChange({ volume: video.volume });
    };

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
  }, [onStateChange, onError]);

  return (
    <div className="relative bg-black rounded-lg overflow-hidden">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-auto max-h-96"
        controls
        preload="metadata"
      />
    </div>
  );
};

export default VideoPlayer;