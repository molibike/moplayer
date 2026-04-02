/**
 * 歌词处理工具模块
 * 支持：
 * 1. 读取本地 .lrc 歌词文件
 * 2. 联网搜索歌词
 * 3. 解析 LRC 格式时间标签
 */

export interface LyricLine {
  time: number; // 毫秒
  text: string;
}

/**
 * 解析 LRC 格式歌词内容
 * 支持格式: [mm:ss.xx]歌词文本 或 [mm:ss:xx]歌词文本
 */
export function parseLyrics(content: string): LyricLine[] {
  const lines: LyricLine[] = [];
  const lineRegex = /^\[(\d{1,2}):(\d{2})[.:](\d{2,3})\](.*)$/;
  
  content.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line) return;
    
    // 匹配时间标签 [mm:ss.xx]
    const match = line.match(lineRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      // 处理 xx 或 xxx 毫秒格式
      const msPart = match[3];
      const milliseconds = msPart.length === 2 
        ? parseInt(msPart, 10) * 10  // xx -> 毫秒
        : parseInt(msPart, 10);       // xxx -> 毫秒
      
      const time = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
      const text = match[4].trim();
      
      if (text) {
        lines.push({ time, text });
      }
    }
  });
  
  // 按时间排序
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * 将解析后的歌词转换回文本格式（无时标）
 */
export function lyricsToText(lines: LyricLine[]): string {
  return lines.map(l => l.text).join('\n');
}

/**
 * 尝试读取本地歌词文件
 * @param audioPath 音频文件路径
 * @returns 歌词内容或 null
 */
export async function loadLocalLyrics(audioPath: string): Promise<string | null> {
  try {
    // 尝试同源目录下的 .lrc 文件
    const lrcPath = audioPath.replace(/\.[^/.]+$/, '.lrc');
    
    // 如果是 http/https URL，尝试直接获取
    if (lrcPath.startsWith('http://') || lrcPath.startsWith('https://')) {
      try {
        const response = await fetch(lrcPath, { method: 'GET' });
        if (response.ok) {
          const text = await response.text();
          if (text.trim()) return text;
        }
      } catch {
        // 网络请求失败，继续尝试其他方式
      }
    }
    
    // 尝试从 fileBlob 的目录中读取（通过 Tauri 后端实现）
    // 这里预留接口，前端无法直接访问文件系统
    return null;
  } catch {
    return null;
  }
}

/**
 * 联网搜索歌词 - 使用 Meting-API 多源搜索
 * 流程：1. 搜索歌曲获取ID  2. 用ID获取歌词
 */
export async function searchLyricsOnline(
  title: string,
  artist: string
): Promise<string | null> {
  // 构建搜索关键词
  const keywords = artist && artist !== '未知艺术家'
    ? `${title} ${artist}`
    : title;

  // 尝试网易云音乐源
  const neteaseLyrics = await searchFromNetEase(keywords, title, artist);
  if (neteaseLyrics) return neteaseLyrics;

  // 尝试QQ音乐源
  const tencentLyrics = await searchFromTencent(keywords, title, artist);
  if (tencentLyrics) return tencentLyrics;

  // 备用：尝试 lrclib
  return searchFromLrcLib(title, artist);
}

/**
 * 从网易云音乐搜索歌词
 */
async function searchFromNetEase(
  keywords: string,
  title: string,
  artist: string
): Promise<string | null> {
  try {
    // Meting-API 公共实例列表（按可靠性排序）
    const apiHosts = [
      'https://meting-api.example.com',
      'https://api.meting.com',
      'https://meting-api.vercel.app',
      'https://meting.ysnsn.cn',
    ];

    for (const apiHost of apiHosts) {
      try {
        // 1. 搜索歌曲
        const searchUrl = `${apiHost}/search?keywords=${encodeURIComponent(keywords)}&server=netease`;
        const searchRes = await fetch(searchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!searchRes.ok) continue;

        const searchData = await searchRes.json();

        // 找到最匹配的歌曲
        const matchedSong = findBestMatch(searchData, title, artist);
        if (!matchedSong || !matchedSong.id) continue;

        // 2. 获取歌词
        const lrcUrl = `${apiHost}/lrc?id=${matchedSong.id}&server=netease`;
        const lrcRes = await fetch(lrcUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!lrcRes.ok) continue;

        const lrcData = await lrcRes.json();

        if (lrcData.lyric || lrcData.lrc?.lyric) {
          const rawLyrics = lrcData.lyric || lrcData.lrc?.lyric || '';
          if (rawLyrics.trim()) {
            return formatNeteaseLyrics(rawLyrics);
          }
        }

        // 找到歌词就返回
        return null;
      } catch {
        continue; // 当前API实例失败，尝试下一个
      }
    }
  } catch (error) {
    console.error('网易云音乐搜索失败:', error);
  }
  return null;
}

/**
 * 从QQ音乐搜索歌词
 */
async function searchFromTencent(
  keywords: string,
  title: string,
  artist: string
): Promise<string | null> {
  try {
    const apiHosts = [
      'https://meting-api.example.com',
      'https://api.meting.com',
      'https://meting-api.vercel.app',
    ];

    for (const apiHost of apiHosts) {
      try {
        // 1. 搜索歌曲
        const searchUrl = `${apiHost}/search?keywords=${encodeURIComponent(keywords)}&server=tencent`;
        const searchRes = await fetch(searchUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!searchRes.ok) continue;

        const searchData = await searchRes.json();

        const matchedSong = findBestMatch(searchData, title, artist);
        if (!matchedSong || !matchedSong.id) continue;

        // 2. 获取歌词
        const lrcUrl = `${apiHost}/lrc?id=${matchedSong.id}&server=tencent`;
        const lrcRes = await fetch(lrcUrl, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });

        if (!lrcRes.ok) continue;

        const lrcData = await lrcRes.json();

        if (lrcData.lyric || lrcData.lrc?.lyric) {
          const rawLyrics = lrcData.lyric || lrcData.lrc?.lyric || '';
          if (rawLyrics.trim()) {
            return formatNeteaseLyrics(rawLyrics);
          }
        }

        return null;
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error('QQ音乐搜索失败:', error);
  }
  return null;
}

/**
 * 从 lrclib 搜索歌词（备用）
 */
async function searchFromLrcLib(title: string, artist: string): Promise<string | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const encodedArtist = encodeURIComponent(artist);

    let url = `https://lrclib.net/api/search?q=${encodedTitle}`;
    if (artist && artist !== '未知艺术家') {
      url = `https://lrclib.net/api/search?track_name=${encodedTitle}&artist_name=${encodedArtist}`;
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) return null;

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      for (const item of data) {
        if (item.syncedLyrics) {
          return item.syncedLyrics;
        }
        if (item.plainLyrics) {
          return item.plainLyrics;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('lrclib 搜索失败:', error);
    return null;
  }
}

/**
 * 在搜索结果中找到最匹配的歌曲
 */
function findBestMatch(
  searchData: any,
  title: string,
  artist: string
): { id: string | number; name?: string; title?: string; artist?: string; } | null {
  if (!searchData || !Array.isArray(searchData.data || searchData.result?.songs || searchData)) {
    return null;
  }

  const songs = searchData.data || searchData.result?.songs || searchData;

  // 优先找完全匹配的
  for (const song of songs) {
    const songName = song.name || song.title || '';
    const songArtist = song.artist || song.artists?.[0]?.name || song.ar?.[0]?.name || '';

    // 完全匹配（标题和艺术家都匹配）
    if (songName.toLowerCase() === title.toLowerCase() ||
        songName.toLowerCase().includes(title.toLowerCase())) {
      if (!artist || artist === '未知艺术家' ||
          songArtist.toLowerCase().includes(artist.toLowerCase())) {
        return {
          id: song.id,
          name: songName,
          artist: songArtist,
        };
      }
    }
  }

  // 没有完全匹配，返回第一个
  if (songs.length > 0) {
    const first = songs[0];
    return {
      id: first.id,
      name: first.name || first.title,
      artist: first.artist || first.artists?.[0]?.name,
    };
  }

  return null;
}

/**
 * 格式化网易云音乐歌词（移除元数据标签）
 */
function formatNeteaseLyrics(rawLyrics: string): string {
  // 移除 [ti:xxx], [ar:xxx], [al:xxx] 等元数据标签
  return rawLyrics
    .split('\n')
    .filter(line => !line.match(/^\[(ti|ar|al|by|offset):/i))
    .join('\n')
    .trim();
}

/**
 * 获取当前时间对应的歌词行
 */
export function getCurrentLyricLine(
  lyrics: LyricLine[], 
  currentTimeMs: number
): LyricLine | null {
  if (!lyrics.length) return null;
  
  // 找到当前时间之前的最后一行
  for (let i = lyrics.length - 1; i >= 0; i--) {
    if (lyrics[i].time <= currentTimeMs) {
      return lyrics[i];
    }
  }
  
  return lyrics[0];
}

/**
 * 获取当前时间附近的几行歌词（用于显示上下文）
 */
export function getLyricContext(
  lyrics: LyricLine[], 
  currentTimeMs: number,
  contextLines: number = 2
): { prev: LyricLine[]; current: LyricLine | null; next: LyricLine[] } {
  const current = getCurrentLyricLine(lyrics, currentTimeMs);
  if (!current) {
    return { prev: [], current: null, next: lyrics.slice(0, contextLines) };
  }
  
  const currentIndex = lyrics.findIndex(l => l === current);
  const prev = lyrics.slice(Math.max(0, currentIndex - contextLines), currentIndex);
  const next = lyrics.slice(currentIndex + 1, currentIndex + 1 + contextLines);
  
  return { prev, current, next };
}
