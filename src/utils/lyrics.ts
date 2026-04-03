/**
 * 歌词处理工具模块
 * 支持：
 * 1. 读取本地 .lrc 歌词文件
 * 2. 联网搜索歌词 (使用Rust后端绕过CORS)
 * 3. 解析 LRC 格式时间标签
 */

import { invoke } from '@tauri-apps/api/core';

// 自定义HTTP GET函数，通过Rust后端绕过CORS
export async function httpGet(url: string): Promise<string> {
  return await invoke('http_get', { url });
}

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
        const text = await httpGet(lrcPath);
        if (text.trim()) return text;
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
 * 联网搜索歌词 - 使用多源搜索策略
 * 依次尝试多个API源，直到找到歌词
 */
export async function searchLyricsOnline(
  title: string,
  artist: string
): Promise<string | null> {
  // 使用window.console确保不会被tree-shaking
  window.console.log('[歌词搜索] ========== 开始搜索 ==========');
  window.console.log('[歌词搜索] 参数:', { title, artist });
  
  if (!title || title.trim() === '') {
    console.log('[歌词搜索] 标题为空，跳过搜索');
    return null;
  }

  // 清理输入
  const cleanTitle = title.trim();
  const cleanArtist = artist && artist !== '未知艺术家' ? artist.trim() : '';
  
  // 构建搜索关键词
  const keywords = cleanArtist 
    ? `${cleanTitle} ${cleanArtist}`
    : cleanTitle;
  
  console.log('[歌词搜索] 搜索关键词:', keywords);

  // 1. 首先尝试 lrclib.net（无需两步搜索，直接返回歌词）
  console.log('[歌词搜索] 尝试 lrclib.net...');
  const lyrics = await searchFromLrcLib(title, artist);
  if (lyrics) {
    console.log('[歌词搜索] 使用lrclib结果');
    return lyrics;
  }

  // lrclib未找到，尝试其他API
  console.log('[歌词搜索] lrclib未找到，尝试其他API...');
  // 2. 尝试网易云音乐（Meting-API）
  console.log('[歌词搜索] 尝试网易云音乐...');
  const neteaseLyrics = await searchFromNetEase(keywords);
  if (neteaseLyrics) {
    console.log('[歌词搜索] 网易云音乐搜索成功');
    return neteaseLyrics;
  }

  // 3. 尝试QQ音乐（Meting-API）
  console.log('[歌词搜索] 尝试QQ音乐...');
  const tencentLyrics = await searchFromTencent(keywords, cleanTitle, cleanArtist);
  if (tencentLyrics) {
    console.log('[歌词搜索] QQ音乐搜索成功');
    return tencentLyrics;
  }

  // 4. 最后尝试其他API
  console.log('[歌词搜索] 尝试备用API...');
  const fallbackLyrics = await searchFromFallbackAPIs(cleanTitle, cleanArtist);
  if (fallbackLyrics) {
    console.log('[歌词搜索] 备用API搜索成功');
    return fallbackLyrics;
  }

  console.log('[歌词搜索] 所有源都未能找到歌词');
  return null;
}

/**
 * 从网易云音乐搜索歌词
 */
async function searchFromNetEase(
  keywords: string
): Promise<string | null> {
  try {
    window.console.log('[歌词搜索-网易云] ====== 开始搜索流程 ======');
    
    // 使用网易云官方API搜索
    const searchUrl = `https://music.163.com/api/search/get/web?type=1&offset=0&total=true&limit=5&s=${encodeURIComponent(keywords)}`;
    window.console.log('[歌词搜索-网易云] 1. 准备搜索URL:', searchUrl);
    
    window.console.log('[歌词搜索-网易云] 2. 开始HTTP请求...');
    const searchBody = await httpGet(searchUrl);
    window.console.log('[歌词搜索-网易云] 3. HTTP请求完成，响应长度:', searchBody.length);
    window.console.log('[歌词搜索-网易云] 4. 响应内容预览:', searchBody.substring(0, 300));
    
    window.console.log('[歌词搜索-网易云] 5. 开始解析JSON...');
    const searchData = JSON.parse(searchBody);
    window.console.log('[歌词搜索-网易云] 6. JSON解析完成');
    window.console.log('[歌词搜索-网易云] 7. 解析后的数据结构:', Object.keys(searchData));
    
    if (!searchData.result) {
      window.console.log('[歌词搜索-网易云] 8a. 无result字段');
      return null;
    }
    if (!searchData.result.songs) {
      window.console.log('[歌词搜索-网易云] 8b. 无songs字段');
      return null;
    }
    if (searchData.result.songs.length === 0) {
      window.console.log('[歌词搜索-网易云] 8c. songs数组为空');
      return null;
    }
    
    window.console.log('[歌词搜索-网易云] 8. 找到歌曲数量:', searchData.result.songs.length);
    
    // 获取第一首歌的ID
    const songId = searchData.result.songs[0].id;
    window.console.log('[歌词搜索-网易云] 9. 第一首歌ID:', songId, '类型:', typeof songId);
    
    if (!songId) {
      window.console.log('[歌词搜索-网易云] 10a. 歌曲ID为空，中断');
      return null;
    }
    
    // 使用Meting-API获取歌词
    const lrcUrl = `https://api.injahow.cn/meting/?type=lrc&id=${songId}&server=netease`;
    window.console.log('[歌词搜索-网易云] 10. 准备歌词URL:', lrcUrl);
    
    window.console.log('[歌词搜索-网易云] 11. 开始获取歌词...');
    const lrcBody = await httpGet(lrcUrl);
    window.console.log('[歌词搜索-网易云] 12. 歌词获取完成，长度:', lrcBody.length);
    window.console.log('[歌词搜索-网易云] 13. 歌词内容预览:', lrcBody.substring(0, 200));
    
    if (lrcBody && lrcBody.trim() && !lrcBody.includes('纯音乐')) {
      window.console.log('[歌词搜索-网易云] 14. 成功返回歌词');
      return lrcBody;
    }
    
    window.console.log('[歌词搜索-网易云] 14b. 歌词内容无效');
    return null;
  } catch (error) {
    window.console.error('[歌词搜索-网易云] 错误:', error);
    return null;
  }
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
      'https://meting-api.vercel.app',
    ];

    for (const apiHost of apiHosts) {
      try {
        console.log(`[歌词搜索] 尝试QQ音乐API: ${apiHost}`);
        
        // 1. 搜索歌曲
        const searchUrl = `${apiHost}/api/search?keywords=${encodeURIComponent(keywords)}&server=tencent&limit=10`;
        const searchBody = await httpGet(searchUrl);
        const searchData = JSON.parse(searchBody);
        const matchedSong = findBestMatch(searchData, title, artist);
        if (!matchedSong || !matchedSong.id) continue;

        // 2. 获取歌词
        const lrcUrl = `${apiHost}/api/lrc?id=${matchedSong.id}&server=tencent`;
        const lrcBody = await httpGet(lrcUrl);
        const lrcData = JSON.parse(lrcBody);

        if (lrcData.lyric || lrcData.lrc?.lyric) {
          const rawLyrics = lrcData.lyric || lrcData.lrc?.lyric || '';
          if (rawLyrics.trim()) {
            return formatNeteaseLyrics(rawLyrics);
          }
        }
      } catch {
        continue;
      }
    }
  } catch (error) {
    console.error('[歌词搜索] QQ音乐搜索失败:', error);
  }
  return null;
}

/**
 * 从 lrclib 搜索歌词（备用）
 * lrclib.net 是一个开源歌词库，直接返回歌词内容
 */
async function searchFromLrcLib(title: string, artist: string): Promise<string | null> {
  try {
    const encodedTitle = encodeURIComponent(title);
    const encodedArtist = encodeURIComponent(artist);

    // lrclib 支持两种搜索方式：
    // 1. 简单搜索: /api/search?q={title}
    // 2. 精确搜索: /api/search?track_name={title}&artist_name={artist}
    // 注意：lrclib的API可能已更新，先尝试最简单的形式
    let url: string;
    if (artist && artist !== '未知艺术家') {
      // 尝试带artist的搜索
      url = `https://lrclib.net/api/search?q=${encodedTitle} ${encodedArtist}`;
    } else {
      url = `https://lrclib.net/api/search?q=${encodedTitle}`;
    }
    
    console.log(`[歌词搜索] lrclib URL: ${url}`);

    const response = await httpGet(url);
    console.log(`[歌词搜索] lrclib结果:`, response);
    
    const data = JSON.parse(response);

    if (Array.isArray(data) && data.length > 0) {
      // 优先返回带时间戳的歌词
      for (const item of data) {
        if (item.syncedLyrics && item.syncedLyrics.trim()) {
          console.log(`[歌词搜索] 找到同步歌词`);
          return item.syncedLyrics;
        }
      }
      // 其次返回纯文本歌词
      for (const item of data) {
        if (item.plainLyrics && item.plainLyrics.trim()) {
          console.log(`[歌词搜索] 找到纯文本歌词`);
          return item.plainLyrics;
        }
      }
    }

    console.log(`[歌词搜索] lrclib未找到歌词`);
    return null;
  } catch (error) {
    console.error('[歌词搜索] lrclib搜索失败:', error);
    return null;
  }
}

/**
 * 备用歌词API源
 */
async function searchFromFallbackAPIs(title: string, _artist: string): Promise<string | null> {
  // 尝试其他可用的歌词API
  
  // 1. 尝试 api.lrc.cx (LRClib的镜像)
  try {
    console.log('[歌词搜索] 尝试 api.lrc.cx...');
    const lrcCxUrl = `https://api.lrc.cx/api/search?q=${encodeURIComponent(title)}`;
    const response = await httpGet(lrcCxUrl);
    const data = JSON.parse(response);
    if (Array.isArray(data) && data.length > 0) {
      for (const item of data) {
        if (item.syncedLyrics || item.plainLyrics) {
          return item.syncedLyrics || item.plainLyrics;
        }
      }
    }
  } catch (e) {
    console.log('[歌词搜索] api.lrc.cx 失败:', e);
  }

  // 2. 尝试其他Meting-API实例
  const backupHosts: string[] = [];
  
  for (const host of backupHosts) {
    try {
      console.log(`[歌词搜索] 尝试备用API: ${host}`);
      const url = `${host}/api/search?keywords=${encodeURIComponent(title)}&server=netease&limit=5`;
      const body = await httpGet(url);
      const data = JSON.parse(body);
      if (data.data?.[0]?.id) {
        const lrcRes = await httpGet(`${host}/api/lrc?id=${data.data[0].id}&server=netease`);
        const lrcData = JSON.parse(lrcRes);
        if (lrcData.lyric || lrcData.lrc?.lyric) {
          return lrcData.lyric || lrcData.lrc?.lyric;
        }
      }
    } catch {
      continue;
    }
  }
  
  return null;
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
