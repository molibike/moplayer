import React, { useEffect, useState, useMemo, useRef } from 'react';
import type { LyricLine } from '../utils/lyrics';
import OnlineMusicPanel, { type OnlineMusicSearchResult } from './OnlineMusicPanel';

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
  onSearchLyrics?: (keyword?: string) => void;
  onSearchKeywordChange?: () => void;
  onSwitchLyrics?: () => void;
  onSaveLyrics?: () => void;
  isSearchingLyrics?: boolean;
  lyricsSearchStatus?: 'idle' | 'searching' | 'success' | 'failed' | 'not_found';
  isSavingLyrics?: boolean;
  hasLyricsCandidates?: boolean;
  currentLyricsIndex?: number;
  lyricsCandidateCount?: number;
  onlineMusicEnabled?: boolean;
  activeTab?: 'lyrics' | 'online_music';
  onTabChange?: (tab: 'lyrics' | 'online_music') => void;
  onlineMusicKeyword?: string;
  onlineMusicSearching?: boolean;
  onlineMusicError?: string;
  onlineMusicResults?: OnlineMusicSearchResult[];
  currentOnlineTrackId?: string;
  onlinePlaylistTrackIds?: string[];
  onOnlineMusicKeywordChange?: (value: string) => void;
  onOnlineMusicSearch?: () => void;
  onOnlineMusicPlay?: (item: OnlineMusicSearchResult) => void;
  onOnlineMusicAddToPlaylist?: (item: OnlineMusicSearchResult) => void;
  onOnlineMusicInteraction?: () => void;
}

const AudioInfo: React.FC<AudioInfoProps> = ({
  fileName,
  metadata,
  currentTime,
  onSearchLyrics,
  onSearchKeywordChange,
  onSwitchLyrics,
  onSaveLyrics,
  isSearchingLyrics,
  lyricsSearchStatus,
  isSavingLyrics,
  hasLyricsCandidates,
  currentLyricsIndex,
  lyricsCandidateCount,
  onlineMusicEnabled = false,
  activeTab = 'lyrics',
  onTabChange,
  onlineMusicKeyword = '',
  onlineMusicSearching = false,
  onlineMusicError,
  onlineMusicResults = [],
  currentOnlineTrackId,
  onlinePlaylistTrackIds = [],
  onOnlineMusicKeywordChange,
  onOnlineMusicSearch,
  onOnlineMusicPlay,
  onOnlineMusicAddToPlaylist,
  onOnlineMusicInteraction,
}) => {
  const [displayTitle, setDisplayTitle] = useState('');
  const [displayArtist, setDisplayArtist] = useState('');
  const [displayAlbum, setDisplayAlbum] = useState('');
  const [manualSearchKeyword, setManualSearchKeyword] = useState('');
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
      .map((line) => line.trim())
      .filter(Boolean);
  }, [lyricsWithTime.length, metadata?.lyrics]);

  const hasAnyLyrics = !!metadata?.lyrics?.trim();
  const canSwitchLyrics = !!hasLyricsCandidates;
  const currentTab = onlineMusicEnabled ? activeTab : 'lyrics';

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
        behavior: 'smooth',
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
        title: parts.slice(1).join(' - ').trim(),
      };
    }

    // 尝试 "歌名 - 艺术家" 格式
    const reverseParts = nameWithoutExt.split('-');
    if (reverseParts.length === 2) {
      return {
        artist: reverseParts[1].trim(),
        title: reverseParts[0].trim(),
      };
    }

    // 默认：整个文件名作为歌名
    return {
      title: nameWithoutExt,
      artist: '未知艺术家',
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

  useEffect(() => {
    setManualSearchKeyword(metadata?.title?.trim() || '');
  }, [metadata?.title, fileName]);

  const handleLyricClick = (timeMs: number) => {
    // 预留跳转接口
    console.log('Seek to:', timeMs / 1000);
  };

  const handleSearchSubmit = () => {
    onSearchLyrics?.(manualSearchKeyword.trim() || undefined);
  };

  const handleKeywordInputChange = (value: string) => {
    setManualSearchKeyword(value);
    onSearchKeywordChange?.();
  };

  const getSearchButtonText = (hasLyrics: boolean) => {
    if (lyricsSearchStatus === 'searching' || isSearchingLyrics) {
      return '搜索中...';
    }

    if (lyricsSearchStatus === 'success') {
      return '已找到歌词';
    }

    if (lyricsSearchStatus === 'failed') {
      return '搜索失败';
    }

    if (lyricsSearchStatus === 'not_found') {
      return '未找到歌词';
    }

    return hasLyrics ? '按歌名重新搜索' : '搜索歌词';
  };

  const getSearchStatusMessage = () => {
    if (lyricsSearchStatus === 'failed') {
      return '歌词搜索失败，请稍后重试或换一个歌名。';
    }

    if (lyricsSearchStatus === 'not_found') {
      return '没有找到匹配歌词，请尝试更短或更准确的歌曲名。';
    }

    return '';
  };

  const headerCollapsed = currentLyricIndex > 0;

  return (
    <div
      className="flex h-full bg-gradient-to-br from-gray-900 to-gray-800 text-white"
      onClick={(event) => event.stopPropagation()}
    >
      <div ref={contentScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden auto-hide-scrollbar px-3 pb-3">
        <div className="flex flex-col items-center text-center" style={{ paddingTop: '0.25rem', paddingBottom: '1.25rem' }}>
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
            <p className="text-gray-300 mb-1" style={{ fontSize: headerCollapsed ? 'clamp(0.82rem, 1.8vw, 0.95rem)' : 'clamp(1rem, 2.5vw, 1.25rem)' }}>
              艺术家
            </p>
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
            <p className="text-gray-400 mb-1" style={{ fontSize: headerCollapsed ? 'clamp(0.78rem, 1.7vw, 0.88rem)' : 'clamp(0.875rem, 2vw, 1.125rem)' }}>
              专辑
            </p>
            <p className="text-gray-200" style={{ fontSize: headerCollapsed ? 'clamp(0.92rem, 2vw, 1rem)' : 'clamp(1.125rem, 2.5vw, 1.25rem)' }}>
              {displayAlbum}
            </p>
          </div>

          {currentTab === 'online_music' ? (
            <div className="w-full mt-3">
              <OnlineMusicPanel
                enabled={onlineMusicEnabled}
                keyword={onlineMusicKeyword}
                isSearching={onlineMusicSearching}
                error={onlineMusicError}
                results={onlineMusicResults}
                currentTrackId={currentOnlineTrackId}
                playlistTrackIds={onlinePlaylistTrackIds}
                onKeywordChange={(value) => onOnlineMusicKeywordChange?.(value)}
                onSearch={() => onOnlineMusicSearch?.()}
                onPlay={(item) => onOnlineMusicPlay?.(item)}
                onAddToPlaylist={(item) => onOnlineMusicAddToPlaylist?.(item)}
                onInteraction={() => onOnlineMusicInteraction?.()}
              />
            </div>
          ) : null}

          {/* 歌词操作区 */}
          {currentTab === 'lyrics' && hasAnyLyrics ? (
            <div className="w-full flex flex-col items-center gap-3" style={{ marginTop: headerCollapsed ? '0.75rem' : '1.25rem' }}>
              <div className="w-full flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={onSwitchLyrics}
                  disabled={!canSwitchLyrics}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                  style={{
                    padding: '0.35rem 0.7rem',
                    minHeight: '2rem',
                    fontSize: 'clamp(0.58rem, 1.26vw, 0.67rem)',
                  }}
                  title={canSwitchLyrics ? '切换到下一份候选歌词' : '当前没有更多候选歌词'}
                >
                  换一份歌词{' '}
                  {typeof currentLyricsIndex === 'number' && typeof lyricsCandidateCount === 'number' && lyricsCandidateCount > 0
                    ? `(${currentLyricsIndex + 1}/${lyricsCandidateCount})`
                    : ''}
                </button>
                <button
                  onClick={onSaveLyrics}
                  disabled={isSavingLyrics}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200"
                  style={{
                    padding: '0.35rem 0.7rem',
                    minHeight: '2rem',
                    fontSize: 'clamp(0.58rem, 1.26vw, 0.67rem)',
                  }}
                >
                  {isSavingLyrics ? '保存中...' : '下载到本地'}
                </button>
                {metadata?.lyricsSource ? (
                  <span className="text-gray-400" style={{ fontSize: 'clamp(0.8rem, 1.6vw, 0.9rem)' }}>
                    来源：{metadata.lyricsSource}
                  </span>
                ) : null}
              </div>
              <div className="relative z-10 w-full flex flex-col items-center gap-2">
                <input
                  type="text"
                  value={manualSearchKeyword}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => handleKeywordInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isSearchingLyrics) {
                      event.preventDefault();
                      event.stopPropagation();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder="输入别的歌曲名称，重新搜索歌词"
                  className="w-full bg-gray-800/85 border border-gray-600 text-white rounded-lg outline-none focus:border-blue-400"
                  style={{
                    padding: '0.55rem 0.8rem',
                    fontSize: 'clamp(0.8rem, 1.7vw, 0.92rem)',
                  }}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSearchSubmit();
                  }}
                  disabled={isSearchingLyrics || !manualSearchKeyword.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
                  style={{ fontSize: 'clamp(0.78rem, 1.6vw, 0.9rem)' }}
                >
                  {getSearchButtonText(true)}
                </button>
                {getSearchStatusMessage() ? (
                  <p className="text-amber-300 text-center" style={{ fontSize: 'clamp(0.72rem, 1.45vw, 0.82rem)' }}>
                    {getSearchStatusMessage()}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {currentTab === 'lyrics' && (lyricsWithTime.length > 0 || plainLyricsLines.length > 0) ? (
            <div className="w-full" style={{ marginTop: headerCollapsed ? '0.35rem' : '0.75rem', paddingBottom: '1.25rem' }}>
              {lyricsWithTime.length > 0 ? (
                lyricsWithTime.map((line, index) => {
                  const isCurrent = index === currentLyricIndex;
                  const isPast = index < currentLyricIndex;
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
                        filter: 'none',
                      }}
                    >
                      {line.text}
                    </p>
                  );
                })
              ) : (
                plainLyricsLines.map((line, index) => (
                  <p
                    key={`plain-lyric-${index}`}
                    className="text-gray-300"
                    style={{
                      fontSize: 'clamp(0.98rem, 2.1vw, 1.15rem)',
                      lineHeight: 1.8,
                      marginTop: index === 0 ? '0' : '0.28rem',
                      opacity: 0.92,
                      filter: 'none',
                    }}
                  >
                    {line}
                  </p>
                ))
              )}
            </div>
          ) : currentTab === 'lyrics' ? (
            /* 无歌词时显示搜索按钮 */
            <div className="w-full flex flex-col items-center" style={{ marginTop: '2rem' }}>
              <p className="text-gray-500 mb-3" style={{ fontSize: 'clamp(0.9rem, 2vw, 1.1rem)' }}>
                暂无歌词
              </p>
              <div className="relative z-10 w-full flex flex-col items-center gap-3">
                <input
                  type="text"
                  value={manualSearchKeyword}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => handleKeywordInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !isSearchingLyrics) {
                      event.preventDefault();
                      event.stopPropagation();
                      handleSearchSubmit();
                    }
                  }}
                  placeholder="请输入歌曲名称后搜索歌词"
                  className="w-full bg-gray-800/90 border border-gray-600 text-white rounded-lg outline-none focus:border-blue-400"
                  style={{
                    padding: '0.7rem 0.9rem',
                    fontSize: 'clamp(0.88rem, 1.9vw, 1rem)',
                  }}
                />
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleSearchSubmit();
                  }}
                  disabled={isSearchingLyrics || !manualSearchKeyword.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg transition-colors duration-200 flex items-center gap-2"
                  style={{ fontSize: 'clamp(0.85rem, 1.8vw, 1rem)' }}
                >
                  {isSearchingLyrics ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {getSearchButtonText(false)}
                    </>
                  ) : (
                    <>{getSearchButtonText(false)}</>
                  )}
                </button>
                {getSearchStatusMessage() ? (
                  <p className="text-amber-300 text-center" style={{ fontSize: 'clamp(0.78rem, 1.55vw, 0.9rem)' }}>
                    {getSearchStatusMessage()}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {onlineMusicEnabled ? (
        <div className="w-7 flex-shrink-0 border-l border-gray-700/30 bg-gray-900/40 flex flex-col">
          <button
            type="button"
            onClick={() => onTabChange?.('lyrics')}
            className={`flex-1 flex items-center justify-center text-xs transition-colors ${currentTab === 'lyrics' ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:bg-white/5'}`}
            style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}
          >
            歌词
          </button>
          <button
            type="button"
            onClick={() => onTabChange?.('online_music')}
            className={`flex-1 flex items-center justify-center text-xs transition-colors ${currentTab === 'online_music' ? 'bg-emerald-600 text-white' : 'text-gray-300 hover:bg-white/5'}`}
            style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}
          >
            在线音乐
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default AudioInfo;
