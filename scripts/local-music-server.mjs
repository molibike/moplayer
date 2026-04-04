import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

const HOST = '127.0.0.1';
const PORT = 31999;
const REQUEST_TIMEOUT_MS = 15000;
const STREAM_TIMEOUT_MS = 0;

const normalizeText = (value) => String(value ?? '').trim();
const METING_API_BASE = normalizeText(process.env.METING_API_BASE) || 'https://meting-api-omega.vercel.app/api';

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeText(item)).filter(Boolean);
  }
  const text = normalizeText(value);
  return text ? [text] : [];
};

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
    const lrcApi = `${METING_API_BASE}?server=${encodeURIComponent(source)}&type=lrc&id=${encodeURIComponent(id)}`;
    const response = await requestText(lrcApi, {
      headers: {
        'User-Agent': 'MoPlayer/1.0',
      },
    });
    const text = response.text;

    const lyric = formatLyrics(text);
    if (lyric && !lyric.includes('纯音乐')) {
      return lyric;
    }
  } catch (error) {
    console.warn('[music-server] meting歌词获取失败:', error);
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
  const normalizedSource = normalizeText(source).toLowerCase();
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
    ...normalizeArray(item?.artist ?? item?.author),
  ].filter((value, index, array) => array.indexOf(value) === index);
  const artist = artistList.join(' / ');
  const source = normalizeText(item?.source ?? item?.server ?? 'netease') || 'netease';
  const album = normalizeText(item?.album ?? item?.albumname ?? item?.al?.name ?? item?.collection ?? '');
  const cover = normalizeText(item?.pic ?? item?.cover ?? item?.image ?? item?.al?.picUrl ?? '');
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
  const upstreamUrl = `https://music.163.com/api/search/get/web?type=1&offset=0&total=true&limit=20&s=${encodeURIComponent(keyword)}`;
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

const searchTracks = async ({ keyword, source = 'netease' }) => {
  const upstreamUrl = `${METING_API_BASE}?server=${encodeURIComponent(source)}&type=search&format=json&id=${encodeURIComponent(keyword)}`;
  try {
    const response = await requestText(upstreamUrl, {
      headers: {
        'User-Agent': 'MoPlayer/1.0',
      },
    });
    const raw = parseJsonSafely(response.text);
    const items = extractFallbackSongs(raw);

    if (items.length > 0) {
      return items.map((item) => normalizeSearchItem(item)).filter(Boolean);
    }

    console.warn('[music-server] meting搜索未返回有效JSON结果，准备回退网易云搜索');
  } catch (error) {
    console.warn('[music-server] meting搜索失败，准备回退网易云搜索:', error);
  }

  if (source === 'netease') {
    const fallbackResults = await searchTracksFromNeteaseFallback(keyword);
    if (fallbackResults.length > 0) {
      return fallbackResults;
    }
  }

  return [];
};

const resolveTrackUrl = async (id, source = 'netease') => {
  return `${METING_API_BASE}?server=${encodeURIComponent(source)}&type=url&id=${encodeURIComponent(id)}`;
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
      writeJson(res, 200, { ok: true, port: PORT, endpoints: ['/api/music/health', '/api/music/search', '/api/music/song', '/api/music/lyric', '/api/music/stream', '/api/music/stream-info'] });
      return;
    }

    if (req.method === 'GET' && requestUrl.pathname === '/api/music/search') {
      const keyword = requestUrl.searchParams.get('keyword')?.trim() || '';
      const source = requestUrl.searchParams.get('source')?.trim() || 'netease';

      if (!keyword) {
        writeJson(res, 400, { message: '缺少搜索关键词' });
        return;
      }

      const results = await searchTracks({ keyword, source });
      writeJson(res, 200, { results, data: results, total: results.length, keyword, source });
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

      if (!id) {
        writeJson(res, 400, { message: '缺少歌曲ID' });
        return;
      }

      const targetUrl = await resolveTrackUrl(id, source);
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

      if (!id) {
        writeJson(res, 400, { ok: false, message: '缺少歌曲ID' });
        return;
      }

      const targetUrl = await resolveTrackUrl(id, source);
      const probe = await probeStream(targetUrl, {
        headers: {
          'User-Agent': 'MoPlayer/1.0',
        },
      });

      writeJson(res, probe.ok ? 200 : 422, {
        ok: probe.ok,
        statusCode: probe.statusCode,
        contentType: probe.contentType,
        contentLength: probe.contentLength,
        reason: probe.reason,
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
