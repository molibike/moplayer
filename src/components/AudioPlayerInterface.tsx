import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as mm from 'music-metadata-browser';
import VinylPlayer from './VinylPlayer.tsx';
import AudioInfo from './AudioInfo';
import AudioVisualizer from './AudioVisualizer';
import VinylPlayerButtons from './VinylPlayerButtons';
import { parseLyrics } from '../utils/lyrics';

import { invoke } from '@tauri-apps/api/core';

// 导入 Buffer polyfill
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;

interface LyricsCandidate {
  source: string;
  title: string;
  artist: string;
  lyrics: string;
}

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
  lyrics?: string;
  lyricsLines?: import('../utils/lyrics').LyricLine[];
  lyricsSource?: string;
}

interface AudioPlayerInterfaceProps {
  src: string;
  fileName: string;
  fileBlob?: File;
  filePath?: string;
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

type LyricsSearchStatus = 'idle' | 'searching' | 'success' | 'failed' | 'not_found';

const AudioPlayerInterface: React.FC<AudioPlayerInterfaceProps> = ({ 
  src, 
  fileName,
  fileBlob,
  filePath,
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
  const middleButtonRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
  });
  const [metadata, setMetadata] = useState<AudioMetadata>({
    title: '',
    artist: '',
    album: '',
    coverImage: undefined,
    lyrics: '',
    lyricsLines: [],
  });
  const [isDragging] = useState(false);
  const [isSearchingLyrics, setIsSearchingLyrics] = useState(false);
  const [lyricsSearchStatus, setLyricsSearchStatus] = useState<LyricsSearchStatus>('idle');
  const [isSavingLyrics, setIsSavingLyrics] = useState(false);
  const [lyricsCandidates, setLyricsCandidates] = useState<LyricsCandidate[]>([]);
  const [currentLyricsIndex, setCurrentLyricsIndex] = useState(0);
  const coverBlobUrlRef = useRef<string | null>(null);
  const metadataExtractedSrcRef = useRef<string>('');
  const lyricsSearchStatusTimerRef = useRef<number | null>(null);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);
  const onEndedRef = useRef(onEnded);
  const fileNameRef = useRef(fileName);
  const fileBlobRef = useRef(fileBlob);
  const filePathRef = useRef(filePath);
  const lastTimeUpdateRef = useRef(0);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    fileNameRef.current = fileName;
    fileBlobRef.current = fileBlob;
    filePathRef.current = filePath;
  }, [fileName, fileBlob, filePath]);

  useEffect(() => {
    return () => {
      if (lyricsSearchStatusTimerRef.current) {
        window.clearTimeout(lyricsSearchStatusTimerRef.current);
        lyricsSearchStatusTimerRef.current = null;
      }
    };
  }, []);

  const isLikelySuspiciousArtist = useCallback((text: string): boolean => {
    const value = (text || '').trim();
    if (!value || value === '未知艺术家') return true;

    if (/https?:\/\//i.test(value)) return true;
    if (/^[a-z0-9_\-]{12,}$/i.test(value.replace(/\s+/g, ''))) return true;
    if (/\.(mp3|flac|wav|m4a|ape|aac|ogg)$/i.test(value)) return true;
    if (/^[a-z][a-z0-9_\-.\s]{8,}$/i.test(value) && !/[\u4e00-\u9fa5]/.test(value)) return true;

    return false;
  }, []);

  const isLikelySuspiciousTitle = useCallback((text: string): boolean => {
    const value = (text || '').trim();
    if (!value) return true;

    if (/https?:\/\//i.test(value)) return true;
    if (/\.(mp3|flac|wav|m4a|ape|aac|ogg)$/i.test(value)) return true;
    if (/^[a-z0-9_-]{16,}$/i.test(value.replace(/\s+/g, ''))) return true;
    if (value.length > 60) return true;
    if ((value.match(/[\-_]/g) || []).length >= 6) return true;
    if ((value.match(/[a-z0-9]/gi) || []).length > 20 && !/[\u4e00-\u9fa5]/.test(value) && !/\s/.test(value)) return true;

    return false;
  }, []);

  const normalizeTitleForSearch = useCallback((text: string): string => {
    const value = (text || '').trim();
    if (!value) return '';

    const quotedMatch = value.match(/[“"'《「『]([^”"'》」』]{1,30})[”"'》」』]/);
    if (quotedMatch?.[1]?.trim()) {
      return quotedMatch[1].trim();
    }

    return value
      .replace(/^\d{2,4}\s*版/g, '')
      .replace(/^\d{2,4}年?版/g, '')
      .replace(/(主题曲|片头曲|片尾曲|插曲|原声版|电视剧版|电影版|现场版|Live版|完整版|超清版|高清版)/gi, '')
      .replace(/[“”"'《》「」『』]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const extractInfoFromFileName = useCallback((name: string) => {
    const nameWithoutExt = name
      .replace(/\.[^/.]+$/, '')
      .replace(/^\d+[._\-\s]+/, '')
      .replace(/\s*\[(HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\]\s*/gi, '')
      .replace(/\s*\((HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\)\s*/gi, '')
      .replace(/\s*-(\s*copy)?\s*$/i, '')
      .replace(/\s*-\s*副本\s*$/i, '')
      .trim();
    const parts = nameWithoutExt.split(' - ');

    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),

        title: parts.slice(1).join(' - ').trim(),
      };
    }

    return {
      title: nameWithoutExt,
      artist: '未知艺术家',
    };
  }, []);

  const cleanForSearch = useCallback((text: string): string => {
    return text
      .replace(/\([^)]*\)/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/【[^】]*】/g, '')
      .replace(/\[(HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\]/gi, '')
      .replace(/\((HQ|FLAC|MP3|128K|320K|无损|高音质|超高音质|标准音质)\)/gi, '')
      .replace(/(\(Live\)|\[Live\]|（Live）|【Live】)/gi, '')
      .replace(/(\(Remix\)|\[Remix\]|（Remix）|【Remix】)/gi, '')
      .replace(/(\(Cover\)|\[Cover\]|（Cover）|【Cover】)/gi, '')
      .replace(/(\(伴奏\)|\[伴奏\]|（伴奏）|【伴奏】)/g, '')
      .replace(/(主题曲|片头曲|片尾曲|插曲|原声版|电视剧版|电影版|现场版|完整版|超清版|高清版)/gi, '')
      .replace(/[“”"'《》「」『』]/g, '')
      .replace(/^\d{2,4}\s*版/g, '')
      .replace(/^\d{2,4}年?版/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }, []);

  const searchLyricsCandidatesWithBackend = useCallback(async (rawTitle: string, rawArtist: string) => {
    const normalizedTitle = normalizeTitleForSearch(rawTitle || '');
    const title = cleanForSearch(normalizedTitle || rawTitle || '');
    const artist = isLikelySuspiciousArtist(rawArtist || '') ? '' : cleanForSearch(rawArtist || '');

    if (!title) return [] as LyricsCandidate[];

    window.console.log('[歌词搜索] 拉取歌词候选:', {
      rawTitle,
      rawArtist,
      normalizedTitle,
      finalTitle: title,
      finalArtist: artist,
    });

    const candidates = await invoke<LyricsCandidate[]>('search_lyrics_candidates', { title, artist });
    return Array.isArray(candidates) ? candidates.filter(item => item?.lyrics?.trim()) : [];
  }, [cleanForSearch, isLikelySuspiciousArtist, normalizeTitleForSearch]);

  const applyLyricsCandidate = useCallback((candidate: LyricsCandidate, index: number) => {
    setCurrentLyricsIndex(index);
    setMetadata(prev => ({
      ...prev,
      lyrics: candidate.lyrics,
      lyricsLines: parseLyrics(candidate.lyrics),
      lyricsSource: candidate.source,
      title: prev.title || candidate.title,
      artist: prev.artist || candidate.artist,
    }));
  }, []);

  const loadLocalLyrics = useCallback(async () => {
    const currentFilePath = filePathRef.current;
    if (!currentFilePath) return null;

    try {
      const localLyrics = await invoke<string | null>('load_local_lyrics', { audioPath: currentFilePath });
      if (localLyrics && localLyrics.trim()) {
        return localLyrics;
      }
    } catch (error) {
      window.console.error('[歌词搜索] 读取本地歌词失败:', error);
    }

    return null;
  }, []);

  const applyMetadata = useCallback((next: {
    title: string;
    artist: string;
    album: string;
    coverImage?: string;
    lyrics: string;
    lyricsSource?: string;
  }) => {
    setMetadata({
      title: next.title,
      artist: next.artist,
      album: next.album,
      coverImage: next.coverImage,
      lyrics: next.lyrics,
      lyricsLines: next.lyrics ? parseLyrics(next.lyrics) : [],
      lyricsSource: next.lyricsSource,
    });
  }, []);

  const updateLyricsFromBackend = useCallback((title: string, artist: string) => {
    setIsSearchingLyrics(true);
    void searchLyricsCandidatesWithBackend(title, artist)
      .then(candidates => {
        setLyricsCandidates(candidates);
        if (candidates.length > 0) {
          applyLyricsCandidate(candidates[0], 0);
        }
      })
      .catch(error => {
        window.console.error('[歌词搜索] 自动搜索失败:', error);
      })
      .finally(() => {
        setIsSearchingLyrics(false);
      });
  }, [applyLyricsCandidate, searchLyricsCandidatesWithBackend]);

  const extractMetadata = useCallback(async (audio: HTMLAudioElement) => {
    try {
      const currentFileName = fileNameRef.current;
      const currentFileBlob = fileBlobRef.current;
      const fileNameInfo = extractInfoFromFileName(currentFileName);
      let coverImage: string | undefined;
      let lyrics = '';
      let title = fileNameInfo.title;
      let artist = fileNameInfo.artist;
      let album = '未知专辑';

      const mergeCommon = (common: any) => {
        if (common.title && common.title.trim()) title = common.title;
        if (common.artist && common.artist.trim()) {
          artist = common.artist;
        } else if (Array.isArray(common.artists) && common.artists.length > 0) {
          artist = common.artists.join(' / ');
        }
        if (common.album && common.album.trim()) album = common.album;
        if (Array.isArray(common.lyrics) && common.lyrics.length > 0) {
          lyrics = common.lyrics.join('\n').trim();
        }
        if (common.picture && common.picture.length > 0) {
          const pic = common.picture[0];
          const imgBlob = new Blob([new Uint8Array(pic.data)], { type: pic.format || 'image/jpeg' });
          if (coverBlobUrlRef.current) URL.revokeObjectURL(coverBlobUrlRef.current);
          coverImage = URL.createObjectURL(imgBlob);
          coverBlobUrlRef.current = coverImage;
        }
      };

      if (currentFileBlob) {
        try {
          window.console.log('[元数据] 开始解析Blob:', currentFileBlob.name);
          const metadataFromBlob = await mm.parseBlob(currentFileBlob);
          window.console.log('[元数据] 解析结果:', metadataFromBlob);
          mergeCommon(metadataFromBlob.common || {});
        } catch (error) {
          window.console.error('[元数据] Blob解析失败，回退audio.src:', error);
        }
      }

      if ((!currentFileBlob || (!title && !artist)) && audio.src) {
        try {
          const response = await fetch(audio.src);
          const blob = await response.blob();
          const parsed = await mm.parseBlob(blob);
          mergeCommon(parsed.common || {});
        } catch (error) {
          window.console.error('[元数据] audio.src解析失败:', error);
        }
      }

      if (!title) title = fileNameInfo.title;
      if (!artist || artist === '未知艺术家') artist = fileNameInfo.artist;

      if (isLikelySuspiciousTitle(title)) {
        title = fileNameInfo.title;
      }

      const normalizedTitle = normalizeTitleForSearch(title || fileNameInfo.title);
      const finalArtist = isLikelySuspiciousArtist(artist) ? fileNameInfo.artist : artist;
      title = isLikelySuspiciousTitle(normalizedTitle) ? fileNameInfo.title : (normalizedTitle || fileNameInfo.title);
      artist = finalArtist || '未知艺术家';

      window.console.log('[元数据] 最终采用:', {
        title,
        artist,
        album,
        originalFileNameTitle: fileNameInfo.title,
        originalFileNameArtist: fileNameInfo.artist,
      });
      const localLyrics = !lyrics ? await loadLocalLyrics() : null;
      const finalLyrics = lyrics || localLyrics || '';

      applyMetadata({
        title,
        artist,
        album,
        coverImage,
        lyrics: finalLyrics,
        lyricsSource: lyrics ? '内嵌歌词' : localLyrics ? '本地歌词' : undefined,
      });

      if (localLyrics) {
        setLyricsCandidates([
          {
            source: 'local',
            title,
            artist,
            lyrics: localLyrics,
          },
        ]);
        setCurrentLyricsIndex(0);
      } else if (!lyrics && title) {
        setLyricsCandidates([]);
        setCurrentLyricsIndex(0);
        updateLyricsFromBackend(title, artist);
      }
    } catch (error) {
      window.console.error('[元数据] 提取失败:', error);
      const fileNameInfo = extractInfoFromFileName(fileNameRef.current);

      applyMetadata({
        title: normalizeTitleForSearch(fileNameInfo.title),
        artist: isLikelySuspiciousArtist(fileNameInfo.artist) ? '未知艺术家' : fileNameInfo.artist,
        album: '未知专辑',
        coverImage: undefined,
        lyrics: '',
        lyricsSource: undefined,
      });
    }
  }, [applyMetadata, extractInfoFromFileName, isLikelySuspiciousArtist, isLikelySuspiciousTitle, loadLocalLyrics, normalizeTitleForSearch, updateLyricsFromBackend]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src) return;

    metadataExtractedSrcRef.current = '';
    lastTimeUpdateRef.current = 0;
    if (coverBlobUrlRef.current) {
      URL.revokeObjectURL(coverBlobUrlRef.current);
      coverBlobUrlRef.current = null;
    }

    setMetadata({
      title: '',
      artist: '',
      album: '',
      coverImage: undefined,
      lyrics: '',
      lyricsLines: [],
      lyricsSource: undefined,
    });
    setLyricsCandidates([]);
    setCurrentLyricsIndex(0);

    audio.currentTime = 0;
    try {
      audio.load();
    } catch {}

    const handleLoadStart = () => {
      setPlayerState(prev => ({ ...prev, currentTime: 0, isPlaying: false }));
    };

    const handleCanPlay = async () => {
      try {
        await audio.play();
        setPlayerState(prev => ({ ...prev, isPlaying: true }));
      } catch (error) {
        console.error('自动播放失败:', error);
        setPlayerState(prev => ({ ...prev, isPlaying: false }));
        onErrorRef.current?.('自动播放失败，请手动点击播放');
      }
    };

    audio.addEventListener('loadstart', handleLoadStart);
    audio.addEventListener('canplay', handleCanPlay);

    return () => {
      audio.removeEventListener('loadstart', handleLoadStart);
      audio.removeEventListener('canplay', handleCanPlay);
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

    const handlePlay = () => updateState({ isPlaying: true });
    const handlePause = () => updateState({ isPlaying: false });
    const handleVolumeChange = () => updateState({ volume: audio.volume, muted: audio.muted });
    const handleEnded = () => onEndedRef.current?.();
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
    const handleTimeUpdate = () => {
      if (!isDragging) {
        const now = Date.now();
        if (now - lastTimeUpdateRef.current >= 1000) {
          lastTimeUpdateRef.current = now;
          updateState({ currentTime: audio.currentTime });
        }
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('volumechange', handleVolumeChange);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    if (audio.readyState >= 1) {
      handleLoadedMetadata();
    }

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('volumechange', handleVolumeChange);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [extractMetadata, isDragging]);

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
  }, []);

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
    audio.volume = Math.max(0, audio.volume - 0.1);
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

  const handleSeek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration || 0, time));
  }, []);

  const handleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
  }, []);

  const handleSearchLyrics = useCallback(async (keyword?: string) => {
    if (isSearchingLyrics) return;

    const searchTitle = (keyword || metadata.title || '').trim();
    const searchArtist = keyword?.trim() ? '' : (metadata.artist || '');

    if (!searchTitle) {
      setLyricsSearchStatus('failed');
      return;
    }

    setIsSearchingLyrics(true);
    setLyricsSearchStatus('searching');
    try {
      const candidates = await searchLyricsCandidatesWithBackend(searchTitle, searchArtist);
      setLyricsCandidates(candidates);
      if (candidates.length > 0) {
        if (lyricsSearchStatusTimerRef.current) {
          window.clearTimeout(lyricsSearchStatusTimerRef.current);
        }
        setLyricsSearchStatus('success');
        applyLyricsCandidate(candidates[0], 0);
        lyricsSearchStatusTimerRef.current = window.setTimeout(() => {
          setLyricsSearchStatus('idle');
          lyricsSearchStatusTimerRef.current = null;
        }, 1800);
      } else {
        setLyricsSearchStatus('not_found');
      }
    } catch (error) {
      console.error('[歌词搜索] 手动搜索失败:', error);
      setLyricsSearchStatus('failed');
    } finally {
      setIsSearchingLyrics(false);
    }
  }, [applyLyricsCandidate, isSearchingLyrics, metadata.artist, metadata.title, searchLyricsCandidatesWithBackend]);

  const handleLyricsSearchKeywordChange = useCallback(() => {
    if (isSearchingLyrics) return;
    if (lyricsSearchStatus === 'failed' || lyricsSearchStatus === 'not_found' || lyricsSearchStatus === 'success') {
      if (lyricsSearchStatusTimerRef.current) {
        window.clearTimeout(lyricsSearchStatusTimerRef.current);
        lyricsSearchStatusTimerRef.current = null;
      }
      setLyricsSearchStatus('idle');
    }
  }, [isSearchingLyrics, lyricsSearchStatus]);

  const handleSwitchLyrics = useCallback(() => {
    if (lyricsCandidates.length <= 1) return;
    const nextIndex = (currentLyricsIndex + 1) % lyricsCandidates.length;
    applyLyricsCandidate(lyricsCandidates[nextIndex], nextIndex);
  }, [lyricsCandidates, currentLyricsIndex]);

  const handleSaveLyrics = useCallback(async () => {
    if (isSavingLyrics || !metadata.lyrics?.trim() || !filePathRef.current) return;
    setIsSavingLyrics(true);
    try {
      const savedPath = await invoke<string>('save_local_lyrics', {
        audioPath: filePathRef.current,
        lyrics: metadata.lyrics,
      });

      console.log('[歌词搜索] 本地歌词保存成功:', savedPath);
      setMetadata(prev => ({
        ...prev,
        lyricsSource: '本地歌词',
      }));
    } catch (error) {
      console.error('[歌词搜索] 保存本地歌词失败:', error);
    } finally {
      setIsSavingLyrics(false);
    }
  }, [metadata.lyrics]);

  useEffect(() => {
    if (externalPlayPause) externalPlayPause.current = handlePlayPause;
    if (externalVolumeUp) externalVolumeUp.current = handleVolumeUp;
    if (externalVolumeDown) externalVolumeDown.current = handleVolumeDown;
    if (externalMute) externalMute.current = handleMute;
    if (externalSeekForward) externalSeekForward.current = handleSeekForward;
    if (externalSeekBackward) externalSeekBackward.current = handleSeekBackward;
    if (externalSeekTo) externalSeekTo.current = handleSeek;
  }, [externalMute, externalPlayPause, externalSeekBackward, externalSeekForward, externalSeekTo, externalVolumeDown, externalVolumeUp, handleMute, handlePlayPause, handleSeek, handleSeekBackward, handleSeekForward, handleVolumeDown, handleVolumeUp]);

  return (
    <div className="relative flex-1 flex w-full h-full border-5 border-gray-700"
         style={{ border: '5px solid #374151' }}
         onClick={handlePlayPause}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        style={{ display: 'none' }}
      />

      <div className="h-full flex flex-col" style={{ width: '38%' }}>
        <VinylPlayerButtons middleButtonRef={middleButtonRef} />
        <div className="flex-1 flex items-end justify-center" style={{ paddingBottom: '10px' }}>
          <VinylPlayer
            isPlaying={playerState.isPlaying}
            coverImage={metadata.coverImage}
            buttonElement={middleButtonRef.current}
          />
          {process.env.NODE_ENV === 'development' && (
            <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs p-1 rounded">
              Cover: {metadata.coverImage ? 'Yes' : 'No'}
              {metadata.coverImage && ` (${metadata.coverImage.length} chars)`}
            </div>
          )}
        </div>
      </div>

      <div className="h-full flex flex-col" style={{ width: '61%' }}>
        <div style={{ height: '61%', paddingBottom: '10px' }}>
          <AudioInfo
            fileName={fileName}
            metadata={metadata}
            currentTime={playerState.currentTime}
            onSearchLyrics={handleSearchLyrics}
            onSearchKeywordChange={handleLyricsSearchKeywordChange}
            onSwitchLyrics={handleSwitchLyrics}
            onSaveLyrics={handleSaveLyrics}
            isSearchingLyrics={isSearchingLyrics}
            lyricsSearchStatus={lyricsSearchStatus}
            isSavingLyrics={isSavingLyrics}
            hasLyricsCandidates={lyricsCandidates.length > 1}
            currentLyricsIndex={currentLyricsIndex}
            lyricsCandidateCount={lyricsCandidates.length}
          />
        </div>
        <div style={{ height: '38%', paddingBottom: '0px' }}>
          <AudioVisualizer
            audioElement={audioRef.current}
            isPlaying={playerState.isPlaying}
            height={0}
            title={metadata.title || fileName}
            artist={metadata.artist || '未知艺术家'}
          />
        </div>
      </div>
    </div>
  );
};

export default AudioPlayerInterface;