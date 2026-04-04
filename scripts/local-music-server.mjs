import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import vm from 'node:vm';
import Meting from '@meting/core';

const HOST = '127.0.0.1';
const PORT = 31999;
const REQUEST_TIMEOUT_MS = 15000;
const STREAM_TIMEOUT_MS = 0;
const STREAM_PROBE_TIMEOUT_MS = 8000;
const FALLBACK_CANDIDATES_PER_SOURCE = 3;

const normalizeText = (value) => String(value ?? '').trim();
const METING_API_BASE = normalizeText(process.env.METING_API_BASE) || 'https://meting-api-omega.vercel.app/api';
const SEARCH_SOURCE_ORDER = ['netease', 'tencent', 'kugou', 'kuwo'];
const PLAYBACK_FALLBACK_ORDER = ['netease', 'kugou', 'kuwo', 'tencent'];
const SEARCH_SOURCE_SET = new Set(SEARCH_SOURCE_ORDER);
const metingClientCache = new Map();

const normalizeSource = (value) => {
  const source = normalizeText(value).toLowerCase();
  if (source === 'qq' || source === 'qqmusic') {
    return 'tencent';
  }
  return source || 'netease';
};

const getMetingClient = (source) => {
  const normalizedSource = normalizeSource(source);
  const cached = metingClientCache.get(normalizedSource);
  if (cached) {
    return cached;
  }

  const client = new Meting(normalizedSource);
  client.format(true);
  metingClientCache.set(normalizedSource, client);
  return client;
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
};

const normalizeComparableText = (value) => normalizeText(value)
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, '');

const parseJsonSafely = (text) => {
  const payload = normalizeText(text);
  if (!payload) {
    return null;
  }

  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
};

const parseMetingPayload = (payload) => {
  if (typeof payload === 'string') {
    return parseJsonSafely(payload);
  }
  return payload ?? null;
};

const requestJsonByFetch = async (inputUrl, { method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) => {
  const response = await fetch(inputUrl, {
    method,
    headers,
    body,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = parseJsonSafely(text);
  if (!payload) {
    throw new Error('响应不是有效JSON');
  }
  return payload;
};

const parseLooseObjectPayload = (text) => {
  const payload = normalizeText(text)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/gi, '\'')
    .replace(/&#34;/gi, '"');
  if (!payload) {
    return null;
  }
  return vm.runInNewContext(`(${payload})`, Object.create(null), { timeout: 500 });
};

const requestBuffer = (inputUrl, { method = 'GET', headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(inputUrl);
    const lib = url.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('请求超时'));
    });
    req.end();
  });
};

const requestText = async (inputUrl, options = {}, redirectCount = 0) => {
  const response = await requestBuffer(inputUrl, options);
  const statusCode = response.statusCode;
  const location = response.headers?.location;
  const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);

  if (isRedirect && location && redirectCount < 5) {
    const nextUrl = new URL(Array.isArray(location) ? location[0] : location, inputUrl).toString();
    const nextOptions = { ...options };
    if (statusCode === 303) {
      nextOptions.method = 'GET';
    }
    return await requestText(nextUrl, nextOptions, redirectCount + 1);
  }

  return {
    statusCode,
    headers: response.headers,
    text: response.body.toString('utf8'),
  };
};

const getReadableErrorMessage = (error, fallbackMessage) => {
  const message = error instanceof Error ? normalizeText(error.message) : '';
  return message || fallbackMessage;
};

const proxyStream = (targetUrl, req, res, { headers = {} } = {}, redirectCount = 0) => {
  return new Promise((resolve, reject) => {
    const url = new URL(targetUrl);
    const lib = url.protocol === 'https:' ? https : http;
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      callback(value);
    };

    const upstreamReq = lib.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: 'GET',
        headers,
      },
      (upstreamRes) => {
        const statusCode = upstreamRes.statusCode || 0;
        const location = upstreamRes.headers?.location;
        const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);
        if (isRedirect && location && redirectCount < 5) {
          upstreamRes.resume();
          const nextUrl = new URL(Array.isArray(location) ? location[0] : location, targetUrl).toString();
          finish(resolve, proxyStream(nextUrl, req, res, { headers }, redirectCount + 1));
          return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');

        const passthroughHeaders = {};
        const contentType = upstreamRes.headers['content-type'];
        const contentLength = upstreamRes.headers['content-length'];
        const acceptRanges = upstreamRes.headers['accept-ranges'];
        const contentRange = upstreamRes.headers['content-range'];
        if (contentType) passthroughHeaders['Content-Type'] = Array.isArray(contentType) ? contentType[0] : contentType;
        if (contentLength) passthroughHeaders['Content-Length'] = Array.isArray(contentLength) ? contentLength[0] : contentLength;
        if (acceptRanges) passthroughHeaders['Accept-Ranges'] = Array.isArray(acceptRanges) ? acceptRanges[0] : acceptRanges;
        if (contentRange) passthroughHeaders['Content-Range'] = Array.isArray(contentRange) ? contentRange[0] : contentRange;
        passthroughHeaders['Cache-Control'] = 'no-cache';

        res.writeHead(statusCode, passthroughHeaders);
        upstreamRes.pipe(res);
        upstreamRes.on('end', () => finish(resolve));
        upstreamRes.on('error', (error) => {
          if (!res.destroyed) {
            res.destroy(error);
          }
          finish(resolve);
        });
        res.on('close', () => {
          if (!upstreamRes.destroyed) {
            upstreamRes.destroy();
          }
          finish(resolve);
        });
      }
    );

    req.on('close', () => {
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy();
      }
      finish(resolve);
    });

    res.on('error', () => {
      if (!upstreamReq.destroyed) {
        upstreamReq.destroy();
      }
      finish(resolve);
    });

    upstreamReq.on('error', (error) => {
      if (res.headersSent) {
        if (!res.destroyed) {
          res.destroy(error);
        }
        finish(resolve);
        return;
      }
      finish(reject, error);
    });
    if (STREAM_TIMEOUT_MS > 0) {
      upstreamReq.setTimeout(STREAM_TIMEOUT_MS, () => {
        upstreamReq.destroy(new Error('音频流请求超时'));
      });
    }
    upstreamReq.end();
  });
};

const hasKnownAudioSignature = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return false;
  }

  const ascii = buffer.subarray(0, 12).toString('ascii');
  if (ascii.startsWith('ID3') || ascii.startsWith('OggS') || ascii.startsWith('fLaC')) {
    return true;
  }

  if (ascii.startsWith('RIFF') && buffer.subarray(8, 12).toString('ascii') === 'WAVE') {
    return true;
  }

  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return true;
  }

  return false;
};

const probeStream = async (targetUrl, { headers = {} } = {}, redirectCount = 0) => {
  const response = await requestBuffer(targetUrl, {
    headers: {
      ...headers,
      Range: headers.Range || 'bytes=0-4095',
    },
    timeoutMs: STREAM_PROBE_TIMEOUT_MS,
  });

  const statusCode = response.statusCode;
  const location = response.headers?.location;
  const isRedirect = [301, 302, 303, 307, 308].includes(statusCode);
  if (isRedirect && location && redirectCount < 5) {
    const nextUrl = new URL(Array.isArray(location) ? location[0] : location, targetUrl).toString();
    return await probeStream(nextUrl, { headers }, redirectCount + 1);
  }

  const contentTypeValue = response.headers?.['content-type'];
  const contentType = normalizeText(Array.isArray(contentTypeValue) ? contentTypeValue[0] : contentTypeValue).toLowerCase();
  const playableByType = contentType.startsWith('audio/');
  const playableBySignature = !playableByType && hasKnownAudioSignature(response.body);
  const playable = (statusCode === 200 || statusCode === 206) && (playableByType || playableBySignature);

  let reason = '';
  if (statusCode === 403 || statusCode === 401) {
    reason = '该音源被上游限制访问，当前无法播放';
  } else if (statusCode === 404) {
    reason = '该音源地址已失效，当前无法播放';
  } else if (!(statusCode === 200 || statusCode === 206)) {
    reason = `音源请求失败（HTTP ${statusCode}）`;
  } else if (contentType.startsWith('video/')) {
    reason = '该结果返回的是视频音源，当前音频播放器不支持';
  } else if (!playable) {
    reason = `该音源返回的格式不可播放${contentType ? `（${contentType}）` : ''}`;
  }

  return {
    ok: playable,
    statusCode,
    contentType,
    contentLength: normalizeText(Array.isArray(response.headers?.['content-length']) ? response.headers['content-length'][0] : response.headers?.['content-length']),
    reason,
  };
};

const formatLyrics = (rawLyrics) => {
  return normalizeText(rawLyrics)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[(ti|ar|al|by|offset):/i.test(line))
    .join('\n')
    .trim();
};

const searchLyricsFromLrclib = async (title, artist) => {
  const keyword = `${normalizeText(title)} ${normalizeText(artist)}`.trim();
  if (!keyword) {
    return '';
  }

  try {
    const response = await requestText(`https://lrclib.net/api/search?q=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': 'MoPlayer/1.0',
      },
    });
    if (response.statusCode < 200 || response.statusCode >= 300) {
      return '';
    }
    const data = parseJsonSafely(response.text);
    if (!Array.isArray(data)) {
      return '';
    }

    for (const item of data) {
      const synced = formatLyrics(item?.syncedLyrics || '');
      if (synced) {
        return synced;
      }
    }

    for (const item of data) {
      const plain = formatLyrics(item?.plainLyrics || '');
      if (plain) {
        return plain;
      }
    }
  } catch (error) {
    console.warn('[music-server] lrclib歌词搜索失败:', error);
  }

  return '';
};

const resolveSongLyrics = async ({ id, source = 'netease', title = '', artist = '' }) => {
  try {
    const client = getMetingClient(source);
    const response = await client.lyric(id);
    const payload = parseMetingPayload(response);
    const lyric = formatLyrics(
      payload?.lyric
      ?? payload?.lrc?.lyric
      ?? payload?.data?.lyric
      ?? ''
    );
    if (lyric && !lyric.includes('纯音乐')) {
      return lyric;
    }
  } catch (error) {
    console.warn(`[music-server] ${normalizeSource(source)} 歌词获取失败:`, error);
  }

  return await searchLyricsFromLrclib(title, artist);
};

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
};

const writeJson = (res, statusCode, payload) => {
  setCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};

const extractIdFromMetingUrl = (value) => {
  const urlText = normalizeText(value);
  if (!urlText) return '';
  try {
    const url = new URL(urlText);
    return normalizeText(url.searchParams.get('id') || url.searchParams.get('songid') || '');
  } catch {
    return '';
  }
};

const normalizeDurationMs = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) {
      return undefined;
    }
    return value > 1000 ? Math.round(value) : Math.round(value * 1000);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      return undefined;
    }

    if (/^\d+(\.\d+)?$/.test(text)) {
      const numericValue = Number(text);
      if (!Number.isFinite(numericValue) || numericValue <= 0) {
        return undefined;
      }
      return numericValue > 1000 ? Math.round(numericValue) : Math.round(numericValue * 1000);
    }

    if (/^\d{1,2}:\d{1,2}(:\d{1,2})?$/.test(text)) {
      const parts = text.split(':').map((part) => Number(part));
      if (parts.some((part) => !Number.isFinite(part))) {
        return undefined;
      }
      let totalSeconds = 0;
      for (const part of parts) {
        totalSeconds = totalSeconds * 60 + part;
      }
      return totalSeconds > 0 ? totalSeconds * 1000 : undefined;
    }
  }

  return undefined;
};

const getSourceLabel = (source) => {
  const normalizedSource = normalizeSource(source);
  switch (normalizedSource) {
    case 'netease':
      return '网易云';
    case 'tencent':
    case 'qq':
    case 'qqmusic':
      return 'QQ音乐';
    case 'kugou':
      return '酷狗';
    case 'kuwo':
      return '酷我';
    case 'migu':
      return '咪咕';
    case 'bilibili':
      return '哔哩哔哩';
    case 'youtube':
      return 'YouTube';
    default:
      return normalizedSource || '未知来源';
  }
};

const createTrackPayload = (item) => {
  const idValue = item?.id ?? item?.songid ?? item?.mid;
  let id = typeof idValue === 'number' ? String(idValue) : typeof idValue === 'string' ? idValue : '';
  const title = normalizeText(item?.title ?? item?.name ?? '');
  const artistList = [
    ...normalizeArray(item?.artists?.map?.((entry) => entry?.name)),
    ...normalizeArray(item?.ar?.map?.((entry) => entry?.name)),
    ...normalizeArray(item?.singer?.map?.((entry) => entry?.name)),
    ...normalizeArray(item?.artist ?? item?.author),
  ].filter((value, index, array) => array.indexOf(value) === index);
  const artist = artistList.join(' / ');
  const source = normalizeSource(item?.source ?? item?.server ?? 'netease');
  const album = normalizeText(item?.album ?? item?.albumname ?? item?.album?.name ?? item?.al?.name ?? item?.collection ?? '');
  const cover = normalizeText(item?.pic ?? item?.cover ?? item?.image ?? item?.album?.picUrl ?? item?.al?.picUrl ?? '');
  const url = normalizeText(item?.url ?? item?.streamUrl ?? '');
  const durationMs = normalizeDurationMs(
    item?.durationMs ?? item?.duration_ms ?? item?.dt ?? item?.duration ?? item?.interval
  );

  if (!id) {
    id = extractIdFromMetingUrl(url);
  }

  if (!id || !title) {
    return null;
  }

  return {
    id,
    title,
    name: title,
    artist,
    artistList,
    artists: artistList,
    album,
    albumName: album,
    cover,
    pic: cover,
    image: cover,
    source,
    sourceLabel: getSourceLabel(source),
    durationMs,
    url,
    streamUrl: `/api/music/stream?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`,
    lyricUrl: `/api/music/lyric?id=${encodeURIComponent(id)}&source=${encodeURIComponent(source)}`,
    songId: id,
  };
};

const normalizeSearchItem = (item) => {
  return createTrackPayload(item);
};

const extractFallbackSongs = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  if (Array.isArray(payload?.result?.songs)) {
    return payload.result.songs;
  }

  return [];
};

const searchTracksFromNeteaseFallback = async (keyword) => {
  const upstreamUrl = `https://music.163.com/api/cloudsearch/pc?type=1&offset=0&limit=20&s=${encodeURIComponent(keyword)}`;
  const response = await requestText(upstreamUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://music.163.com',
    },
  });

  const raw = parseJsonSafely(response.text);
  const items = extractFallbackSongs(raw);
  return items.map((item) => normalizeSearchItem({
    ...item,
    source: 'netease',
  })).filter(Boolean);
};

const buildTencentAlbumCover = (albumMid) => {
  const normalizedAlbumMid = normalizeText(albumMid);
  if (!normalizedAlbumMid) {
    return '';
  }
  return `https://y.gtimg.cn/music/photo_new/T002R300x300M000${normalizedAlbumMid}.jpg?max_age=2592000`;
};

const searchTracksFromTencent = async (keyword) => {
  const payload = await requestJsonByFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'zh-CN,zh;q=0.8,en-US;q=0.5',
      'Content-Type': 'application/json;charset=utf-8',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
    },
    body: JSON.stringify({
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        method: 'DoSearchForQQMusicDesktop',
        module: 'music.search.SearchCgiService',
        param: {
          grp: 1,
          num_per_page: 15,
          page_num: 1,
          query: keyword,
          search_type: 0,
        },
      },
    }),
  });

  const items = Array.isArray(payload?.req?.data?.body?.song?.list)
    ? payload.req.data.body.song.list
    : [];

  return items.map((item) => normalizeSearchItem({
    id: item?.mid,
    title: item?.title,
    artist: Array.isArray(item?.singer) ? item.singer.map((entry) => entry?.name).filter(Boolean) : [],
    album: item?.album?.title ?? item?.album?.name ?? '',
    cover: buildTencentAlbumCover(item?.album?.mid ?? item?.album?.pmid),
    duration: item?.interval,
    source: 'tencent',
  })).filter(Boolean);
};

const searchTracksFromKuwoLegacy = async (keyword) => {
  const response = await requestText(
    `http://search.kuwo.cn/r.s?all=${encodeURIComponent(keyword)}&ft=music&itemset=web_2013&client=kt&pn=0&rn=15&rformat=json&encoding=utf8`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    }
  );

  const payload = parseLooseObjectPayload(response.text);
  const items = Array.isArray(payload?.abslist) ? payload.abslist : [];

  return items.map((item) => normalizeSearchItem({
    id: normalizeText(item?.DC_TARGETID ?? item?.MUSICRID).replace(/^MUSIC_/i, ''),
    title: item?.NAME ?? item?.SONGNAME ?? '',
    artist: item?.ARTIST ?? '',
    album: item?.ALBUM ?? '',
    duration: item?.DURATION ?? '',
    source: 'kuwo',
  })).filter(Boolean);
};

const searchTracks = async ({ keyword, source = 'netease' }) => {
  const normalizedSource = normalizeSource(source);

  if (normalizedSource === 'netease') {
    try {
      const fallbackResults = await searchTracksFromNeteaseFallback(keyword);
      if (fallbackResults.length > 0) {
        return fallbackResults;
      }
      console.warn('[music-server] 网易云官方搜索未返回有效结果，准备回退 meting 搜索');
    } catch (error) {
      console.warn('[music-server] 网易云官方搜索失败，准备回退 meting 搜索:', error);
    }
  }

  if (normalizedSource === 'tencent') {
    try {
      const results = await searchTracksFromTencent(keyword);
      if (results.length > 0) {
        return results;
      }
      console.warn('[music-server] QQ音乐官方搜索未返回有效结果，准备回退 meting 搜索');
    } catch (error) {
      console.warn('[music-server] QQ音乐官方搜索失败，准备回退 meting 搜索:', error);
    }
  }

  if (normalizedSource === 'kuwo') {
    try {
      const results = await searchTracksFromKuwoLegacy(keyword);
      if (results.length > 0) {
        return results;
      }
      console.warn('[music-server] 酷我旧版搜索未返回有效结果，准备回退 meting 搜索');
    } catch (error) {
      console.warn('[music-server] 酷我旧版搜索失败，准备回退 meting 搜索:', error);
    }
  }

  try {
    const client = getMetingClient(normalizedSource);
    const response = await client.search(keyword, { page: 1, limit: 15 });
    const raw = parseMetingPayload(response);
    const items = extractFallbackSongs(raw);

    if (items.length > 0) {
      return items
        .map((item) => normalizeSearchItem({
          ...item,
          source: item?.source ?? normalizedSource,
        }))
        .filter(Boolean);
    }

    console.warn(`[music-server] ${normalizedSource} 搜索未返回有效结果`);
  } catch (error) {
    console.warn(`[music-server] ${normalizedSource} 搜索失败:`, error);
  }

  return [];
};

const searchTracksAcrossSources = async ({ keyword, sources }) => {
  const sourceResults = new Map();
  const errors = {};
  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return {
          source,
          results: await searchTracks({ keyword, source }),
          error: '',
        };
      } catch (error) {
        return {
          source,
          results: [],
          error: getReadableErrorMessage(error, '搜索失败'),
        };
      }
    })
  );

  for (const entry of results) {
    sourceResults.set(entry.source, entry.results);
    if (entry.error) {
      errors[entry.source] = entry.error;
    }
  }

  const uniqueResults = new Map();
  const maxLength = Math.max(0, ...sources.map((source) => sourceResults.get(source)?.length || 0));
  for (let index = 0; index < maxLength; index += 1) {
    for (const source of sources) {
      const item = sourceResults.get(source)?.[index];
      if (!item) {
        continue;
      }
      const resultKey = `${normalizeSource(item.source)}:${item.id}`;
      if (!uniqueResults.has(resultKey)) {
        uniqueResults.set(resultKey, item);
      }
    }
  }

  return {
    results: [...uniqueResults.values()],
    errors,
  };
};

const getRequestedSources = (searchParams) => {
  const sourceParams = [
    ...searchParams.getAll('sources').flatMap((value) => value.split(',')),
    ...searchParams.getAll('source').flatMap((value) => value.split(',')),
  ]
    .map((value) => normalizeSource(value))
    .filter((value) => value === 'all' || SEARCH_SOURCE_SET.has(value));

  if (sourceParams.includes('all')) {
    return [...SEARCH_SOURCE_ORDER];
  }

  const uniqueSources = sourceParams.filter((value, index, array) => array.indexOf(value) === index);
  return uniqueSources.length > 0 ? uniqueSources : [...SEARCH_SOURCE_ORDER];
};

const scoreTrackMatch = (item, { title = '', artist = '', durationMs } = {}) => {
  const normalizedTitle = normalizeComparableText(title);
  const normalizedArtist = normalizeComparableText(artist);
  const itemTitle = normalizeComparableText(item?.title ?? item?.name ?? '');
  const itemArtist = normalizeComparableText(item?.artist ?? item?.artistList?.join(' ') ?? '');
  const targetDurationMs = normalizeDurationMs(durationMs);
  const itemDurationMs = normalizeDurationMs(item?.durationMs);
  const durationGapMs = targetDurationMs && itemDurationMs
    ? Math.abs(targetDurationMs - itemDurationMs)
    : Number.POSITIVE_INFINITY;
  const titleExact = Boolean(normalizedTitle && itemTitle === normalizedTitle);
  const titlePartial = !titleExact && Boolean(
    normalizedTitle
    && itemTitle
    && (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle))
  );
  const artistExact = Boolean(normalizedArtist && itemArtist === normalizedArtist);
  const artistPartial = !artistExact && Boolean(
    normalizedArtist
    && itemArtist
    && (itemArtist.includes(normalizedArtist) || normalizedArtist.includes(itemArtist))
  );

  let score = 0;
  if (titleExact) {
    score += 12;
  } else if (titlePartial) {
    score += 6;
  }

  if (artistExact) {
    score += 8;
  } else if (artistPartial) {
    score += 4;
  }

  if (Number.isFinite(durationGapMs)) {
    if (durationGapMs <= 2000) {
      score += 4;
    } else if (durationGapMs <= 5000) {
      score += 2;
    } else if (durationGapMs >= 20000) {
      score -= 2;
    }
  }

  return {
    score,
    durationGapMs,
    titleMatched: titleExact || titlePartial,
    titleExact,
    artistMatched: artistExact || artistPartial,
    artistExact,
  };
};

const compareTrackMatch = (left, right) => {
  if (left.titleExact !== right.titleExact) {
    return left.titleExact ? -1 : 1;
  }
  if (left.artistExact !== right.artistExact) {
    return left.artistExact ? -1 : 1;
  }
  if (left.titleMatched !== right.titleMatched) {
    return left.titleMatched ? -1 : 1;
  }
  if (left.artistMatched !== right.artistMatched) {
    return left.artistMatched ? -1 : 1;
  }
  if (left.score !== right.score) {
    return right.score - left.score;
  }
  if (left.durationGapMs !== right.durationGapMs) {
    return left.durationGapMs - right.durationGapMs;
  }
  return 0;
};

const findBestFallbackTracks = (results, { title = '', artist = '', durationMs, excludeKeys = new Set() } = {}) => {
  return [...results]
    .filter((item) => !excludeKeys.has(`${normalizeSource(item?.source)}:${normalizeText(item?.id)}`))
    .map((item) => ({
      candidate: item,
      match: scoreTrackMatch(item, { title, artist, durationMs }),
    }))
    .filter((entry) => {
      if (!title) {
        return true;
      }
      return entry.match.titleMatched;
    })
    .sort((left, right) => compareTrackMatch(left.match, right.match))
    .slice(0, FALLBACK_CANDIDATES_PER_SOURCE);
};

const resolveTencentTrackUrl = async (id) => {
  const songMid = normalizeText(id);
  const variants = [
    { prefix: 'M500', suffix: 'mp3' },
    { prefix: 'C400', suffix: 'm4a' },
    { prefix: 'M800', suffix: 'mp3' },
  ];

  for (const variant of variants) {
    const payload = await requestJsonByFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/plain, */*',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'content-type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify({
        req_1: {
          module: 'vkey.GetVkeyServer',
          method: 'CgiGetVkey',
          param: {
            filename: [`${variant.prefix}${songMid}${songMid}.${variant.suffix}`],
            guid: '10000',
            songmid: [songMid],
            songtype: [0],
            uin: '0',
            loginflag: 1,
            platform: '20',
          },
        },
        loginUin: '0',
        comm: {
          uin: '0',
          format: 'json',
          ct: 24,
          cv: 0,
        },
      }),
    });

    const baseUrl = normalizeText(payload?.req_1?.data?.sip?.[0]);
    const purl = normalizeText(payload?.req_1?.data?.midurlinfo?.[0]?.purl);
    if (baseUrl && purl) {
      return `${baseUrl}${purl}`;
    }
  }

  throw new Error('QQ音乐当前歌曲暂不可播放');
};

const resolveTrackWithFallback = async ({ id, source = 'netease', title = '', artist = '', durationMs } = {}) => {
  const normalizedSource = normalizeSource(source);
  const attemptedTrackKeys = new Set([`${normalizedSource}:${normalizeText(id)}`]);
  let originalError = null;

  try {
    return {
      url: await resolveTrackUrl(id, normalizedSource),
      resolvedTrack: null,
      resolvedSource: normalizedSource,
      usedFallback: false,
    };
  } catch (error) {
    originalError = error;
  }

  const fallbackKeyword = `${normalizeText(title)} ${normalizeText(artist)}`.trim();
  if (!fallbackKeyword) {
    throw originalError;
  }

  const fallbackSources = PLAYBACK_FALLBACK_ORDER.filter((fallbackSource) => fallbackSource !== normalizedSource);
  const fallbackSearchResults = await Promise.allSettled(
    fallbackSources.map(async (fallbackSource) => ({
      source: fallbackSource,
      results: await searchTracks({ keyword: fallbackKeyword, source: fallbackSource }),
    }))
  );

  const fallbackCandidates = [];
  for (const entry of fallbackSearchResults) {
    if (entry.status !== 'fulfilled') {
      continue;
    }

    const fallbackSource = entry.value.source;
    const rankedTracks = findBestFallbackTracks(entry.value.results, {
      title,
      artist,
      durationMs,
      excludeKeys: attemptedTrackKeys,
    });

    fallbackCandidates.push(
      ...rankedTracks.map(({ candidate, match }, index) => ({
        candidate,
        match,
        sourcePriority: PLAYBACK_FALLBACK_ORDER.indexOf(fallbackSource),
        index,
      }))
    );
  }

  fallbackCandidates.sort((left, right) => {
    const matchOrder = compareTrackMatch(left.match, right.match);
    if (matchOrder !== 0) {
      return matchOrder;
    }
    if (left.sourcePriority !== right.sourcePriority) {
      return left.sourcePriority - right.sourcePriority;
    }
    return left.index - right.index;
  });

  for (const entry of fallbackCandidates) {
    const candidate = entry.candidate;
    attemptedTrackKeys.add(`${normalizeSource(candidate.source)}:${normalizeText(candidate.id)}`);
    try {
      return {
        url: await resolveTrackUrl(candidate.id, candidate.source),
        resolvedTrack: candidate,
        resolvedSource: normalizeSource(candidate.source),
        usedFallback: true,
      };
    } catch (error) {
      originalError = error;
    }
  }

  throw originalError ?? new Error('当前来源暂未获取到可用播放地址');
};

const resolveTrackUrl = async (id, source = 'netease') => {
  const normalizedSource = normalizeSource(source);

  if (normalizedSource === 'tencent') {
    return await resolveTencentTrackUrl(id);
  }

  try {
    const client = getMetingClient(normalizedSource);
    const response = await client.url(id, 320);
    const payload = parseMetingPayload(response);
    const directUrl = normalizeText(
      payload?.url
      ?? payload?.data?.url
      ?? (Array.isArray(payload) ? payload[0]?.url : '')
    );
    if (directUrl) {
      return directUrl;
    }
  } catch (error) {
    console.warn(`[music-server] ${normalizedSource} 获取播放地址失败:`, error);
  }

  if (normalizedSource === 'netease') {
    return `${METING_API_BASE}?server=${encodeURIComponent(normalizedSource)}&type=url&id=${encodeURIComponent(id)}`;
  }

  throw new Error('当前来源暂未获取到可用播放地址');
};

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (!req.url) {
    writeJson(res, 400, { message: '请求地址无效' });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (req.method === 'GET' && requestUrl.pathname === '/api/music/health') {
      writeJson(res, 200, {
        ok: true,
        port: PORT,
        supportedSources: SEARCH_SOURCE_ORDER,
        endpoints: ['/api/music/health', '/api/music/search', '/api/music/song', '/api/music/lyric', '/api/music/stream', '/api/music/stream-info'],
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/search') {
      const keyword = requestUrl.searchParams.get('keyword')?.trim() || '';
      const sources = getRequestedSources(requestUrl.searchParams);

      if (!keyword) {
        writeJson(res, 400, { message: '缺少搜索关键词' });
        return;
      }

      if (sources.length === 0) {
        writeJson(res, 400, { message: '缺少有效搜索源' });
        return;
      }

      const { results, errors } = await searchTracksAcrossSources({ keyword, sources });
      writeJson(res, 200, {
        results,
        data: results,
        total: results.length,
        keyword,
        source: sources[0] || 'netease',
        sources,
        errors,
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/song') {
      const id = requestUrl.searchParams.get('id')?.trim() || '';
      const source = requestUrl.searchParams.get('source')?.trim() || 'netease';
      const title = requestUrl.searchParams.get('title')?.trim() || '';
      const artist = requestUrl.searchParams.get('artist')?.trim() || '';

      if (!id && !title) {
        writeJson(res, 400, { message: '缺少歌曲查询参数' });
        return;
      }

      let song = null;
      if (id && title) {
        song = createTrackPayload({ id, title, artist, source });
      }

      if (!song && title) {
        const results = await searchTracks({ keyword: `${title} ${artist}`.trim(), source });
        song = results.find((item) => item.id === id) || results[0] || null;
      }

      if (!song && id) {
        song = createTrackPayload({ id, title: title || id, artist, source });
      }

      if (!song) {
        writeJson(res, 404, { message: '未找到歌曲信息' });
        return;
      }

      writeJson(res, 200, { song, data: song });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/lyric') {
      const id = requestUrl.searchParams.get('id')?.trim() || '';
      const source = requestUrl.searchParams.get('source')?.trim() || 'netease';
      const title = requestUrl.searchParams.get('title')?.trim() || '';
      const artist = requestUrl.searchParams.get('artist')?.trim() || '';

      if (!id && !title) {
        writeJson(res, 400, { message: '缺少歌词查询参数' });
        return;
      }

      const lyrics = await resolveSongLyrics({ id, source, title, artist });
      writeJson(res, 200, {
        lyrics,
        source: lyrics ? (lyrics.includes('[') ? '在线歌词' : '在线歌词') : '',
      });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/stream') {
      const id = requestUrl.searchParams.get('id')?.trim() || '';
      const source = requestUrl.searchParams.get('source')?.trim() || 'netease';
      const title = requestUrl.searchParams.get('title')?.trim() || '';
      const artist = requestUrl.searchParams.get('artist')?.trim() || '';
      const durationMs = normalizeDurationMs(requestUrl.searchParams.get('durationMs'));

      if (!id) {
        writeJson(res, 400, { message: '缺少歌曲ID' });
        return;
      }

      let targetUrl = '';
      try {
        const resolved = await resolveTrackWithFallback({ id, source, title, artist, durationMs });
        targetUrl = resolved.url;
      } catch (error) {
        writeJson(res, 422, {
          ok: false,
          message: getReadableErrorMessage(error, '当前音源暂不可播放'),
        });
        return;
      }
      const headers = {
        'User-Agent': 'MoPlayer/1.0',
      };
      const range = req.headers.range;
      if (typeof range === 'string' && range.trim()) {
        headers.Range = range;
      }

      await proxyStream(targetUrl, req, res, { headers });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/stream-info') {
      const id = requestUrl.searchParams.get('id')?.trim() || '';
      const source = requestUrl.searchParams.get('source')?.trim() || 'netease';
      const title = requestUrl.searchParams.get('title')?.trim() || '';
      const artist = requestUrl.searchParams.get('artist')?.trim() || '';
      const durationMs = normalizeDurationMs(requestUrl.searchParams.get('durationMs'));

      if (!id) {
        writeJson(res, 400, { ok: false, message: '缺少歌曲ID' });
        return;
      }

      let targetUrl = '';
      let resolved = null;
      try {
        resolved = await resolveTrackWithFallback({ id, source, title, artist, durationMs });
        targetUrl = resolved.url;
      } catch (error) {
        writeJson(res, 422, {
          ok: false,
          statusCode: 422,
          contentType: '',
          contentLength: '',
          reason: getReadableErrorMessage(error, '当前音源暂不可播放'),
        });
        return;
      }
      let probe = null;
      try {
        probe = await probeStream(targetUrl, {
          headers: {
            'User-Agent': 'MoPlayer/1.0',
          },
        });
      } catch (error) {
        writeJson(res, 422, {
          ok: false,
          statusCode: 422,
          contentType: '',
          contentLength: '',
          reason: getReadableErrorMessage(error, '音源探测失败，请稍后重试'),
          resolvedSource: resolved?.resolvedSource,
          usedFallback: !!resolved?.usedFallback,
          resolvedTrack: resolved?.resolvedTrack ?? null,
        });
        return;
      }

      writeJson(res, probe.ok ? 200 : 422, {
        ok: probe.ok,
        statusCode: probe.statusCode,
        contentType: probe.contentType,
        contentLength: probe.contentLength,
        reason: probe.reason,
        resolvedSource: resolved?.resolvedSource,
        usedFallback: !!resolved?.usedFallback,
        resolvedTrack: resolved?.resolvedTrack ?? null,
      });
      return;
    }

    writeJson(res, 404, { message: '接口不存在' });
  } catch (error) {
    console.error('[music-server] 请求处理失败:', error);
    if (!res.headersSent && !res.writableEnded) {
      writeJson(res, 500, { message: '本地音乐服务处理失败' });
    } else if (!res.destroyed) {
      res.destroy();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[music-server] 服务已启动: http://${HOST}:${PORT}`);
});

const shutdown = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (error) => {
  console.error('[music-server] 未处理的 Promise 拒绝:', error);
});
process.on('uncaughtException', (error) => {
  console.error('[music-server] 未捕获异常:', error);
});
