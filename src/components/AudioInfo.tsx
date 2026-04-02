import React, { useEffect, useState } from 'react';

interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  currentTime?: number;
  lyrics?: string;
}

interface AudioInfoProps {
  fileName: string;
  metadata?: AudioMetadata;
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
  isPlaying: boolean;
}

const AudioInfo: React.FC<AudioInfoProps> = ({ 
  fileName, 
  metadata, 
  currentTime, 
  duration, 
  onSeek,
  isPlaying
}) => {
  const [displayTitle, setDisplayTitle] = useState('');
  const [displayArtist, setDisplayArtist] = useState('');
  const [displayAlbum, setDisplayAlbum] = useState('');
  const lyrics = metadata?.lyrics?.trim() || '';
  const lyricsLines = lyrics ? lyrics.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];

  // 格式化时间显示
  const formatTime = (time: number): string => {
    if (!isFinite(time) || isNaN(time)) return '0:00';
    
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // 从文件名提取信息
  const extractInfoFromFileName = (fileName: string) => {
    // 移除文件扩展名
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    
    // 尝试解析常见的命名格式：艺术家 - 歌曲名
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim()
      };
    }
    
    // 如果没有分隔符，整个文件名作为标题
    return {
      title: nameWithoutExt,
      artist: '未知艺术家'
    };
  };

  useEffect(() => {
    if (metadata?.title) {
      setDisplayTitle(metadata.title);
    } else {
      const extracted = extractInfoFromFileName(fileName);
      setDisplayTitle(extracted.title);
    }

    if (metadata?.artist) {
      setDisplayArtist(metadata.artist);
    } else {
      const extracted = extractInfoFromFileName(fileName);
      setDisplayArtist(extracted.artist);
    }

    if (metadata?.album) {
      setDisplayAlbum(metadata.album);
    } else {
      setDisplayAlbum('未知专辑');
    }
  }, [fileName, metadata]);

  return (
    <div className="flex flex-col h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* 音频信息区域 */}
      <div className="flex-1 flex flex-col justify-center space-y-4">
        {/* 歌曲标题 */}
        <div className="text-center">
          <h1 className="font-bold text-white mb-2 leading-tight" style={{ fontSize: 'clamp(1.5rem, 4vw, 3rem)' }}>
            {displayTitle}
          </h1>
          <div className="bg-gradient-to-r from-blue-500 to-purple-500 mx-auto rounded-full" style={{ width: 'clamp(60px, 8vw, 96px)', height: '4px' }} />
        </div>

        {/* 艺术家信息 */}
        <div className="text-center">
          <p className="text-gray-300 mb-1" style={{ fontSize: 'clamp(1rem, 2.5vw, 1.25rem)' }}>艺术家</p>
          <p className="font-semibold text-blue-400" style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)' }}>
            {displayArtist}
          </p>
        </div>

        {/* 专辑信息 */}
        <div className="text-center">
          <p className="text-gray-400 mb-1" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>专辑</p>
          <p className="text-gray-200" style={{ fontSize: 'clamp(1.125rem, 2.5vw, 1.25rem)' }}>
            {displayAlbum}
          </p>
        </div>

        {lyricsLines.length > 0 && (
          <div className="relative overflow-hidden rounded-xl border border-gray-700 bg-black/20" style={{ height: 'clamp(110px, 18vh, 180px)' }}>
            <div
              className="lyrics-scroll-track"
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            >
              <div className="lyrics-scroll-content">
                {lyricsLines.map((line, index) => (
                  <p
                    key={`lyrics-top-${index}`}
                    className="text-center text-gray-200"
                    style={{ fontSize: 'clamp(0.875rem, 1.8vw, 1rem)', lineHeight: 1.8, marginBottom: '0.35rem' }}
                  >
                    {line}
                  </p>
                ))}
              </div>
              <div className="lyrics-scroll-content" aria-hidden="true">
                {lyricsLines.map((line, index) => (
                  <p
                    key={`lyrics-bottom-${index}`}
                    className="text-center text-gray-200"
                    style={{ fontSize: 'clamp(0.875rem, 1.8vw, 1rem)', lineHeight: 1.8, marginBottom: '0.35rem' }}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 时间信息 */}
        <div className="space-y-3">
          {/* 进度条 */}
          <div 
            className="w-full bg-gray-700 rounded-full h-2 overflow-hidden cursor-pointer relative"
            onClick={(e) => {
              if (onSeek && duration > 0) {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const percentage = clickX / rect.width;
                const newTime = percentage * duration;
                onSeek(Math.max(0, Math.min(duration, newTime)));
              }
            }}
          >
            <div 
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ 
                width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%' 
              }}
            />
          </div>
          
          {/* 时间显示 */}
          <div className="flex justify-between text-gray-400" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 音频格式信息 */}
        <div className="text-center pt-4 border-t border-gray-700">
          <p className="text-gray-500" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>
            音频文件：{fileName.split('.').pop()?.toUpperCase() || 'UNKNOWN'}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AudioInfo;