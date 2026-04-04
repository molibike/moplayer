import React from 'react';

export interface OnlineMusicSearchResult {
  id: string;
  title: string;
  name?: string;
  artist: string;
  artists?: string[];
  artistList?: string[];
  album?: string;
  albumName?: string;
  cover?: string;
  pic?: string;
  image?: string;
  durationMs?: number;
  source: string;
  sourceLabel?: string;
  streamUrl?: string;
  lyricUrl?: string;
  songId?: string;
}

export interface OnlineMusicPlaybackStatus {
  state: 'checking' | 'playable' | 'fallback' | 'unplayable';
  resolvedSource?: string;
  reason?: string;
}

interface OnlineMusicPanelProps {
  enabled: boolean;
  keyword: string;
  sources?: { value: string; label: string }[];
  selectedSources?: string[];
  isSearching: boolean;
  error?: string;
  results: OnlineMusicSearchResult[];
  emptyStateText?: string;
  playbackStatuses?: Record<string, OnlineMusicPlaybackStatus>;
  currentTrackId?: string;
  playlistTrackIds?: string[];
  onKeywordChange: (value: string) => void;
  onSelectedSourcesChange?: (sources: string[]) => void;
  onSearch: () => void;
  onPlay: (item: OnlineMusicSearchResult) => void;
  onAddToPlaylist: (item: OnlineMusicSearchResult) => void;
  onInteraction?: () => void;
}

const OnlineMusicPanel: React.FC<OnlineMusicPanelProps> = ({
  enabled,
  keyword,
  sources = [],
  selectedSources = [],
  isSearching,
  error,
  results,
  emptyStateText,
  playbackStatuses = {},
  currentTrackId,
  playlistTrackIds = [],
  onKeywordChange,
  onSelectedSourcesChange,
  onSearch,
  onPlay,
  onAddToPlaylist,
  onInteraction,
}) => {
  const getTrackKey = (item: OnlineMusicSearchResult) => {
    const source = item.source?.trim().toLowerCase();
    return `${source === 'qq' || source === 'qqmusic' ? 'tencent' : (source || 'netease')}:${item.id}`;
  };

  const formatDuration = (durationMs?: number) => {
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      return '';
    }

    const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const getSourceLabel = (item: OnlineMusicSearchResult) => {
    if (item.sourceLabel?.trim()) {
      const sourceLabel = item.sourceLabel.trim();
      if (sourceLabel === 'netease') return '网易云';
      if (sourceLabel === 'tencent' || sourceLabel === 'qq' || sourceLabel === 'qqmusic') return 'QQ音乐';
      if (sourceLabel === 'kugou') return '酷狗';
      if (sourceLabel === 'kuwo') return '酷我';
      if (sourceLabel === 'migu') return '咪咕';
      if (sourceLabel === 'bilibili') return '哔哩哔哩';
      return sourceLabel;
    }

    const source = item.source?.trim().toLowerCase();
    if (source === 'netease') return '网易云';
    if (source === 'tencent' || source === 'qq' || source === 'qqmusic') return 'QQ音乐';
    if (source === 'kugou') return '酷狗';
    if (source === 'kuwo') return '酷我';
    if (source === 'migu') return '咪咕';
    if (source === 'bilibili') return '哔哩哔哩';
    return item.source || '未知来源';
  };

  const getPlaybackBadge = (status?: OnlineMusicPlaybackStatus) => {
    if (!status) {
      return null;
    }

    if (status.state === 'checking') {
      return {
        label: '检测',
        title: '正在预检测该版本是否可播放',
        className: 'border-r border-b border-gray-600 bg-gray-800/92 text-gray-300',
      };
    }

    if (status.state === 'playable') {
      return {
        label: '可播',
        title: '当前版本可直接播放',
        className: 'border-r border-b border-emerald-400/80 bg-emerald-500/22 text-emerald-100',
      };
    }

    if (status.state === 'fallback') {
      const sourceLabel = status.resolvedSource === 'netease'
        ? '网易云'
        : status.resolvedSource === 'tencent'
          ? 'QQ音乐'
          : status.resolvedSource === 'kugou'
            ? '酷狗'
            : status.resolvedSource === 'kuwo'
              ? '酷我'
              : (status.resolvedSource || '其他来源');
      return {
        label: '切源可播',
        title: `当前版本将自动切换到${sourceLabel}的可播版本`,
        className: 'border-r border-b border-fuchsia-400/75 bg-fuchsia-500/18 text-fuchsia-100',
      };
    }

    return {
      label: '不可播',
      title: status.reason || '当前版本暂时无法播放',
      className: 'border-r border-b border-rose-500/70 bg-rose-500/18 text-rose-100',
    };
  };

  if (!enabled) {
    return (
      <div className="w-full rounded-lg border border-gray-700/60 bg-gray-900/40 px-3 py-3 text-center text-sm text-gray-400">
        请先在菜单栏打开“在线音乐”开关
      </div>
    );
  }

  return (
    <div
      className="w-full flex flex-col gap-2"
      onMouseDown={onInteraction}
      onWheel={onInteraction}
      onTouchStart={onInteraction}
      onFocusCapture={onInteraction}
      onKeyDownCapture={onInteraction}
    >
      <div className="w-full rounded-lg border border-gray-700/60 bg-gray-900/40 p-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(event) => {
              onInteraction?.();
              onKeywordChange(event.target.value);
            }}
            onKeyDown={(event) => {
              onInteraction?.();
              if (event.key === 'Enter' && !isSearching && keyword.trim()) {
                event.preventDefault();
                onSearch();
              }
            }}
            placeholder="输入歌名或歌手进行搜索"
            className="flex-1 rounded-md border border-gray-600 bg-gray-800/90 px-3 py-2 text-white outline-none transition-colors focus:border-blue-400"
          />
          <button
            type="button"
            onClick={() => {
              onInteraction?.();
              onSearch();
            }}
            disabled={isSearching || !keyword.trim()}
            className="rounded-md bg-blue-600 px-3 py-2 text-white transition-colors hover:bg-blue-500 disabled:bg-gray-600"
          >
            {isSearching ? '搜索中...' : '搜索'}
          </button>
        </div>
        {sources.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((source) => {
              const checked = selectedSources.includes(source.value);
              return (
                <label
                  key={source.value}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1 text-xs transition-colors ${checked ? 'border-blue-400 bg-blue-500/15 text-blue-100' : 'border-gray-600 bg-gray-800/70 text-gray-300 hover:border-gray-500'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      onInteraction?.();
                      const nextSources = event.target.checked
                        ? [...selectedSources, source.value]
                        : selectedSources.filter((item) => item !== source.value);
                      onSelectedSourcesChange?.(nextSources);
                    }}
                    className="h-3.5 w-3.5 accent-blue-500"
                  />
                  <span>{source.label}</span>
                </label>
              );
            })}
          </div>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-amber-300">{error}</p>
        ) : null}
      </div>

      <div className="w-full rounded-lg border border-gray-700/60 bg-gray-900/30 overflow-hidden">
        {results.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            {emptyStateText || (isSearching ? '正在搜索在线音乐...' : '搜索后这里会显示歌曲列表')}
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {results.map((item) => {
              const trackKey = getTrackKey(item);
              const isCurrent = currentTrackId === trackKey;
              const isInPlaylist = playlistTrackIds.includes(trackKey);
              const durationText = formatDuration(item.durationMs);
              const playbackBadge = getPlaybackBadge(playbackStatuses[trackKey]);
              return (
                <div
                  key={trackKey}
                  className={`relative flex flex-col gap-2 px-3 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${isCurrent ? 'bg-blue-600/15' : 'hover:bg-white/5'}`}
                >
                  {playbackBadge ? (
                    <div
                      title={playbackBadge.title}
                      className={`absolute left-0 top-0 z-10 px-1 py-0 text-[11px] font-normal leading-[15px] ${playbackBadge.className}`}
                    >
                      {playbackBadge.label}
                    </div>
                  ) : null}
                  <div className={`min-w-0 flex-1 ${playbackBadge ? 'pt-4' : ''}`}>
                    <div className="truncate text-sm font-semibold text-white">{item.title}</div>
                    <div className="mt-1 flex items-center gap-3 text-xs">
                      <div className="min-w-0 flex-1 truncate text-gray-300">
                        {item.artist || '未知歌手'}
                        <span className="ml-2 text-gray-500">{getSourceLabel(item)}</span>
                      </div>
                      {durationText ? (
                        <div className="shrink-0 tabular-nums text-gray-400">{durationText}</div>
                      ) : null}
                    </div>
                    {item.album ? (
                      <div className="mt-1 truncate text-xs text-gray-500">专辑：{item.album}</div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2 sm:flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        onInteraction?.();
                        onPlay(item);
                      }}
                      className="rounded-md bg-emerald-600 px-3 py-2 text-xs text-white transition-colors hover:bg-emerald-500"
                    >
                      {isCurrent ? '正在播放' : '播放'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onInteraction?.();
                        onAddToPlaylist(item);
                      }}
                      className="rounded-md bg-purple-600 px-3 py-2 text-xs text-white transition-colors hover:bg-purple-500 disabled:bg-gray-600"
                      disabled={isInPlaylist}
                    >
                      {isInPlaylist ? '已在播放列表' : '加入播放列表'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OnlineMusicPanel;
