import React, { useEffect, useState, useMemo, useRef } from 'react';
import type { LyricLine } from '../utils/lyrics';

interface AudioMetadata {
  title?: string;
  artist?: string;
  album?: string;
  duration?: number;
  currentTime?: number;
  lyrics?: string;
  lyricsLines?: LyricLine[];
  lyricsSource?: string;
}

interface AudioInfoProps {
  fileName: string;
  metadata?: AudioMetadata;
  currentTime: number;
  onSearchLyrics?: () => void;
  onSwitchLyrics?: () => void;
  onSaveLyrics?: () => void;
  isSearchingLyrics?: boolean;
  isSavingLyrics?: boolean;
  hasLyricsCandidates?: boolean;
  currentLyricsIndex?: number;
  lyricsCandidateCount?: number;
}

const AudioInfo: React.FC<AudioInfoProps> = ({ 
  fileName, 
  metadata, 
  currentTime,
  onSearchLyrics,
  onSwitchLyrics,
  onSaveLyrics,
  isSearchingLyrics,
  isSavingLyrics,
  hasLyricsCandidates,
  currentLyricsIndex,
  lyricsCandidateCount
}) => {

  const [displayTitle, setDisplayTitle] = useState('');
  const [displayArtist, setDisplayArtist] = useState('');
  const [displayAlbum, setDisplayAlbum] = useState('');
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const currentLineRef = useRef<HTMLParagraphElement>(null);

  // 获取歌词行（带时间戳）
  const lyricsWithTime = useMemo(() => {
    return metadata?.lyricsLines && metadata.lyricsLines.length > 0 
      ? metadata.lyricsLines 
      : [];
  }, [metadata?.lyricsLines]);

  const plainLyricsLines = useMemo(() => {
    if (!metadata?.lyrics?.trim()) return [];
    if (lyricsWithTime.length > 0) return [];

    return metadata.lyrics
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);
  }, [lyricsWithTime.length, metadata?.lyrics]);

  const hasAnyLyrics = !!metadata?.lyrics?.trim();
  const canSwitchLyrics = !!hasLyricsCandidates;

  // 计算当前应该高亮的歌词索引
  const currentLyricIndex = useMemo(() => {
    if (!lyricsWithTime.length) return -1;

    const currentMs = currentTime * 1000;

    // 找到当前时间对应的行
    for (let i = lyricsWithTime.length - 1; i >= 0; i--) {
      if (lyricsWithTime[i].time <= currentMs) {
        return i;
      }
    }
    return 0;
  }, [lyricsWithTime, currentTime]);

  // 当前句变化时，驱动整个信息区滚动
  useEffect(() => {
    if (currentLineRef.current && contentScrollRef.current) {
      const container = contentScrollRef.current;
      const line = currentLineRef.current;

      const containerHeight = container.clientHeight;
      const lineTop = line.offsetTop;
      const lineHeight = line.clientHeight;

      // 计算需要滚动的位置，使当前行落在更强聚焦的视觉中心
      const focusAnchor = containerHeight * 0.42;
      const scrollTarget = lineTop - focusAnchor + lineHeight / 2;

      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [currentLyricIndex]);

  // 从文件名提取信息（增强版）
  const extractInfoFromFileName = (fileName: string) => {
    // 移除扩展名
    let nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
    
    // 清理常见噪声
    nameWithoutExt = nameWithoutExt
      // 去除序号前缀："01. "、"01-"、"01_"、"01 "、"【01】"
      .replace(/^[\d\s]+[\.\-_\s【】\[\]]+/, '')
      // 去除音质标记
      .replace(/\s*\[(HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\]\s*/gi, '')
      .replace(/\s*\((HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\)\s*/gi, '')
      // 去除其他常见后缀
      .replace(/\s*-(\s*copy)?\s*$/i, '')
      .replace(/\s*-\s*副本\s*$/i, '')
      .trim();

    // 尝试 "艺术家 - 歌名" 格式
    const parts = nameWithoutExt.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim()
      };
    }

    // 尝试 "歌名 - 艺术家" 格式
    const reverseParts = nameWithoutExt.split('-');
    if (reverseParts.length === 2) {
      return {
        artist: reverseParts[1].trim(),
        title: reverseParts[0].trim()
      };
    }

    // 默认：整个文件名作为歌名
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

  const handleLyricClick = (timeMs: number) => {
    // 预留跳转接口
    console.log('Seek to:', timeMs / 1000);
  };

  const headerCollapsed = currentLyricIndex > 0;

  return (
    <div className="flex flex-col h-full p-6 bg-gradient-to-br from-gray-900 to-gray-800 text-white">
      {/* 音频信息与歌词统一滚动区域 */}
      <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden auto-hide-scrollbar">
        <div className="flex flex-col items-center text-center" style={{ paddingTop: '0.25rem', paddingBottom: '3rem' }}>
          {/* 歌曲标题 */}
          <div
            style={{
              width: '100%',
            }}
          >
            <h1 className="font-bold text-white mb-2 leading-tight" style={{ fontSize: headerCollapsed ? 'clamp(1.2rem, 3vw, 2.1rem)' : 'clamp(1.5rem, 4vw, 3rem)' }}>
              {displayTitle}
            </h1>
          </div>

          {/* 艺术家信息 */}
          <div
            className="mt-3"
            style={{
              width: '100%',
            }}
          >
            <p className="text-gray-300 mb-1" style={{ fontSize: headerCollapsed ? 'clamp(0.82rem, 1.8vw, 0.95rem)' : 'clamp(1rem, 2.5vw, 1.25rem)' }}>艺术家</p>
            <p className="font-semibold text-blue-400" style={{ fontSize: headerCollapsed ? 'clamp(1rem, 2.2vw, 1.15rem)' : 'clamp(1.25rem, 3vw, 1.5rem)' }}>
              {displayArtist}
            </p>
          </div>

          {/* 专辑信息 */}
          <div
            className="mt-3"
            style={{
              width: '100%',
            }}
          >
            <p className="text-gray-400 mb-1" style={{ fontSize: headerCollapsed ? 'clamp(0.78rem, 1.7vw, 0.88rem)' : 'clamp(0.875rem, 2vw, 1.125rem)' }}>专辑</p>
            <p className="text-gray-200" style={{ fontSize: headerCollapsed ? 'clamp(0.92rem, 2vw, 1rem)' : 'clamp(1.125rem, 2.5vw, 1.25rem)' }}>
              {displayAlbum}
            </p>
          </div>

          {/* 歌词操作区 */}
          {hasAnyLyrics ? (
            <div className="w-full flex flex-wrap items-center justify-center gap-3" style={{ marginTop: headerCollapsed ? '0.75rem' : '1.25rem' }}>
              <button
                onClick={onSwitchLyrics}
                disabled={!canSwitchLyrics}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                style={{ fontSize: 'clamp(0.82rem, 1.8vw, 0.95rem)' }}
                title={canSwitchLyrics ? '切换到下一份候选歌词' : '当前没有更多候选歌词'}
              >
                换一份歌词 {typeof currentLyricsIndex === 'number' && typeof lyricsCandidateCount === 'number' && lyricsCandidateCount > 0 ? `(${currentLyricsIndex + 1}/${lyricsCandidateCount})` : ''}
              </button>
              <button
                onClick={onSaveLyrics}
                disabled={isSavingLyrics}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                style={{ fontSize: 'clamp(0.82rem, 1.8vw, 0.95rem)' }}
              >
                {isSavingLyrics ? '保存中...' : '下载到本地'}
              </button>
              {metadata?.lyricsSource ? (
                <span className="text-gray-400" style={{ fontSize: 'clamp(0.8rem, 1.6vw, 0.9rem)' }}>
                  来源：{metadata.lyricsSource}
                </span>
              ) : null}
            </div>
          ) : null}

          {lyricsWithTime.length > 0 ? (
            <div className="w-full" style={{ maxWidth: '92%', marginTop: headerCollapsed ? '0.4rem' : '1.5rem', paddingBottom: '40vh' }}>
              {lyricsWithTime.map((line, index) => {
                const isCurrent = index === currentLyricIndex;
                const isPast = index < currentLyricIndex;

                // 简约：只保留基础透明度层次
                const lineOpacity = isCurrent ? 1 : isPast ? 0.55 : 0.75;

                return (
                  <p
                    key={`lyric-${index}`}
                    ref={isCurrent ? currentLineRef : null}
                    onClick={() => handleLyricClick(line.time)}
                    className={`cursor-pointer transition-opacity duration-200 ${
                      isCurrent
                        ? 'text-white font-bold'
                        : isPast
                          ? 'text-gray-500'
                          : 'text-gray-400'
                    }`}
                    style={{
                      fontSize: 'clamp(0.98rem, 2.1vw, 1.15rem)',
                      lineHeight: 1.8,
                      marginTop: index === 0 ? '0' : '0.28rem',
                      opacity: lineOpacity,
                      filter: 'none'
                    }}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          ) : plainLyricsLines.length > 0 ? (
            <div className="w-full" style={{ maxWidth: '92%', marginTop: headerCollapsed ? '0.4rem' : '1.5rem', paddingBottom: '40vh' }}>
              {plainLyricsLines.map((line, index) => (
                <p
                  key={`plain-lyric-${index}`}
                  className="text-gray-300"
                  style={{
                    fontSize: 'clamp(0.98rem, 2.1vw, 1.15rem)',
                    lineHeight: 1.8,
                    marginTop: index === 0 ? '0' : '0.28rem',
                    opacity: 0.92,
                    filter: 'none'
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          ) : (
            /* 无歌词时显示搜索按钮 */
            <div className="w-full flex flex-col items-center" style={{ marginTop: '2rem' }}>
              <p className="text-gray-500 mb-3" style={{ fontSize: 'clamp(0.9rem, 2vw, 1.1rem)' }}>
                暂无歌词
              </p>
              <button
                onClick={onSearchLyrics}
                disabled={isSearchingLyrics}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
                style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1rem)' }}
              >
                {isSearchingLyrics ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    搜索中...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    搜索歌词
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AudioInfo;