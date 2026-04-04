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

interface OnlineMusicPanelProps {
  enabled: boolean;
  keyword: string;
  isSearching: boolean;
  error?: string;
  results: OnlineMusicSearchResult[];
  currentTrackId?: string;
  playlistTrackIds?: string[];
  onKeywordChange: (value: string) => void;
  onSearch: () => void;
  onPlay: (item: OnlineMusicSearchResult) => void;
  onAddToPlaylist: (item: OnlineMusicSearchResult) => void;
  onInteraction?: () => void;
}

const OnlineMusicPanel: React.FC<OnlineMusicPanelProps> = ({
  enabled,
  keyword,
  isSearching,
  error,
  results,
  currentTrackId,
  playlistTrackIds = [],
  onKeywordChange,
  onSearch,
  onPlay,
  onAddToPlaylist,
  onInteraction,
}) => {
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
        {error ? (
          <p className="mt-3 text-sm text-amber-300">{error}</p>
        ) : null}
      </div>

      <div className="w-full rounded-lg border border-gray-700/60 bg-gray-900/30 overflow-hidden">
        {results.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-gray-400">
            {isSearching ? '正在搜索在线音乐...' : '搜索后这里会显示歌曲列表'}
          </div>
        ) : (
          <div className="divide-y divide-gray-700/50">
            {results.map((item) => {
              const isCurrent = currentTrackId === item.id;
              const isInPlaylist = playlistTrackIds.includes(item.id);
              const durationText = formatDuration(item.durationMs);
              return (
                <div
                  key={item.id}
                  className={`flex flex-col gap-2 px-3 py-3 transition-colors sm:flex-row sm:items-center sm:justify-between ${isCurrent ? 'bg-blue-600/15' : 'hover:bg-white/5'}`}
                >
                  <div className="min-w-0 flex-1">
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
