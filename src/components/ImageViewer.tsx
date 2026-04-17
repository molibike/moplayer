import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { readFile } from '@tauri-apps/plugin-fs';
import * as exifr from 'exifr';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/build/pdf';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.js?url';
import heic2any from 'heic2any';

// ============== HEIC 解码缓存与请求去重 ==============
// 缓存保存 Blob 而非 URL：URL 会被 revokeObjectURL 失效，Blob 不会
// 每次命中缓存重新 createObjectURL（极廉价操作）
// 使用 LRU 上限避免大图长时间使用后内存暴涨
const HEIC_CACHE_MAX = 12;
const heicDecodeCache = new Map<string, Promise<Blob>>();

const touchCache = (key: string, promise: Promise<Blob>) => {
  // 实现 LRU：先删后加，最新的排在最后
  if (heicDecodeCache.has(key)) heicDecodeCache.delete(key);
  heicDecodeCache.set(key, promise);
  // 超过上限则删除最久未使用的
  while (heicDecodeCache.size > HEIC_CACHE_MAX) {
    const oldestKey = heicDecodeCache.keys().next().value;
    if (oldestKey !== undefined) heicDecodeCache.delete(oldestKey);
    else break;
  }
};

const buildHeicCacheKey = (opts: { blob?: Blob; name?: string; path?: string }): string => {
  if (opts.path) return `path:${opts.path.replace(/\\/g, '/')}`;
  const anyBlob = opts.blob as any;
  const lm = (anyBlob && typeof anyBlob.lastModified === 'number') ? anyBlob.lastModified : 0;
  const size = opts.blob?.size ?? 0;
  const name = opts.name ?? anyBlob?.name ?? '';
  return `blob:${name}:${size}:${lm}`;
};

// 是否为 Tauri 环境（可调用 Rust 后端）
const isTauriEnv = (): boolean => {
  try {
    return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  } catch {
    return false;
  }
};

// 使用 Rust 后端解码 HEIC（libheif 原生库，5-10 倍速）
// 路径必须是绝对路径，否则回退 heic2any
const decodeHeicViaRust = async (path: string): Promise<Blob> => {
  const normalized = path.replace(/\\/g, '/');
  // 调用后端命令，返回 JPEG 字节流
  const bytes = await invoke<number[] | Uint8Array | ArrayBuffer>('decode_heic_to_jpeg', {
    path: normalized,
    quality: 82,
  });
  // 统一转成独立的 ArrayBuffer（避免 SharedArrayBuffer 类型不匹配 BlobPart）
  let ab: ArrayBuffer;
  if (bytes instanceof ArrayBuffer) {
    ab = bytes;
  } else if (bytes instanceof Uint8Array) {
    // slice 生成新的 ArrayBuffer，确保类型为 ArrayBuffer 而非 ArrayBufferLike
    ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } else {
    ab = new Uint8Array(bytes as number[]).buffer;
  }
  return new Blob([ab], { type: 'image/jpeg' });
};

// 使用 heic2any 解码 HEIC（前端 WASM，兼容性兜底）
const decodeHeicViaJs = async (blob: Blob): Promise<Blob> => {
  const converted = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality: 0.82,
  });
  return Array.isArray(converted) ? converted[0] : converted;
};

// 统一的 HEIC 解码入口：带缓存、请求去重，返回 Blob
// 优先 Rust 后端（libheif，~500ms-1s）；失败回退 heic2any（WASM，~3-5s）
const decodeHeicBlobWithCache = async (
  blob: Blob,
  cacheKey: string,
  path?: string
): Promise<Blob> => {
  const cached = heicDecodeCache.get(cacheKey);
  if (cached) {
    console.log('[HEIC] 命中缓存:', cacheKey);
    touchCache(cacheKey, cached);
    return cached;
  }

  const task = (async () => {
    const label = `[HEIC] 解码耗时 ${cacheKey}`;
    console.time(label);
    try {
      // 优先 Rust 后端（需要绝对路径且在 Tauri 环境）
      if (path && isTauriEnv()) {
        try {
          const jpeg = await decodeHeicViaRust(path);
          console.timeEnd(label);
          console.log('[HEIC] Rust 解码成功:', path);
          return jpeg;
        } catch (rustErr) {
          console.warn('[HEIC] Rust 解码失败，回退 heic2any:', rustErr);
        }
      }
      // 回退 heic2any
      const jpegBlob = await decodeHeicViaJs(blob);
      console.timeEnd(label);
      console.log('[HEIC] heic2any 解码成功');
      return jpegBlob;
    } catch (err) {
      console.timeEnd(label);
      heicDecodeCache.delete(cacheKey);
      throw err;
    }
  })();

  touchCache(cacheKey, task);
  return task;
};

// 判断路径是否为 HEIC/HEIF
const isHeicPath = (p: string): boolean => /\.(heic|heif)$/i.test(p);

// 判断路径是否为主流 RAW 相机格式（rawloader/imagepipe 支持的）
const isRawPath = (p: string): boolean =>
  /\.(cr2|nef|arw|dng|rw2|orf|raf|sr2|srw|pef|3fr|erf|mef|mos|mrw|nrw|x3f)$/i.test(p);

// 使用 Rust 后端解码 RAW（rawloader + imagepipe，纯 Rust 原生解码）
// 返回 JPEG Blob；失败时抛出异常，由上层决定是否回退到缩略图
const decodeRawViaRust = async (path: string): Promise<Blob> => {
  const normalized = path.replace(/\\/g, '/');
  const bytes = await invoke<number[] | Uint8Array | ArrayBuffer>('decode_raw_to_jpeg', {
    path: normalized,
    quality: 82,
  });
  let ab: ArrayBuffer;
  if (bytes instanceof ArrayBuffer) {
    ab = bytes;
  } else if (bytes instanceof Uint8Array) {
    ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } else {
    ab = new Uint8Array(bytes as number[]).buffer;
  }
  return new Blob([ab], { type: 'image/jpeg' });
};

interface ImageViewerProps {
  src: string;
  fileName?: string;
  filePath?: string;
  fileBlob?: File;
  onStateChange: (state: {
    isPlaying?: boolean;
    currentTime?: number;
    duration?: number;
    volume?: number;
  }) => void;
  onError?: (error: string) => void;
  onPlayPause?: React.MutableRefObject<(() => void) | null>;
  onVolumeUp?: React.MutableRefObject<(() => void) | null>;
  onVolumeDown?: React.MutableRefObject<(() => void) | null>;
  onMute?: React.MutableRefObject<(() => void) | null>;
  onSeekForward?: React.MutableRefObject<(() => void) | null>;
  onSeekBackward?: React.MutableRefObject<(() => void) | null>;
  onSeekTo?: React.MutableRefObject<((time: number) => void) | null>;
}

interface ImageInfo {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

const ImageViewer: React.FC<ImageViewerProps> = ({ 
  src, 
  fileName,
  filePath,
  fileBlob,
  onStateChange,
  onError,
  onPlayPause: externalPlayPause,
  onVolumeUp: externalVolumeUp,
  onVolumeDown: externalVolumeDown,
  onMute: externalMute,
  onSeekForward: externalSeekForward,
  onSeekBackward: externalSeekBackward,
  onSeekTo: externalSeekTo,
}) => {
  // 配置 PDF.js worker 为打包可解析的 URL，避免加载失败
  (GlobalWorkerOptions as any).workerSrc = workerSrc as unknown as string;
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ pointerX: number; pointerY: number; posX: number; posY: number }>({ pointerX: 0, pointerY: 0, posX: 0, posY: 0 });
  const [isWindowLocked, setIsWindowLocked] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  const [currentFilePath, setCurrentFilePath] = useState<string | null>(null);
  // 用内部状态驱动 <img src>，避免直接修改 DOM 导致 React 反复覆盖引起闪烁
  const [activeSrc, setActiveSrc] = useState<string>(() => {
    const s = src || '';
    const isBlob = typeof s === 'string' && s.startsWith('blob:');
    const blobType = (fileBlob as any)?.type;
    const isPdfInit =
      (isBlob && blobType === 'application/pdf') ||
      (!!fileName && fileName.toLowerCase().endsWith('.pdf')) ||
      (!!filePath && filePath.toLowerCase().endsWith('.pdf')) ||
      (!!s && s.toLowerCase().endsWith('.pdf'));
    return isPdfInit ? '' : s;
  });
  const prevActiveSrcRef = useRef<string>(src);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [screenSize, setScreenSize] = useState({ width: 1920, height: 1080 });
  const windowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  const imageInfoRef = useRef<ImageInfo | null>(null);
  const isWindowLockedRef = useRef(false);
  const scaleRef = useRef(1);
  const windowSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lockedWindowSizeRef = useRef<{ width: number; height: number } | null>(null);
  // 控制目录列表的初始化加载，仅在首次或外部文件变更时加载
  const listInitializedRef = useRef(false);
  // 记录最近一次成功加载目录列表的路径，避免重复加载
  const lastLoadedPathRef = useRef<string | null>(null);
  // 操作提示显示控制：鼠标在底部20%区域停留时显示
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimerRef = useRef<number | null>(null);
  // HEIC 解码中状态，用于显示 loading 提示
  const [isHeicDecoding, setIsHeicDecoding] = useState(false);
  // 跟踪最近一次触发解码的 key，避免旧结果覆盖新结果
  const currentHeicKeyRef = useRef<string>('');
  // PDF 渲染状态
  const [isPdfFileMode, setIsPdfFileMode] = useState(false);
  const pdfDocRef = useRef<any>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1);
  const pdfImageUrlRef = useRef<string | null>(null);
  const errorFallbackRef = useRef<{ path: string | null; tried: { asset?: boolean; blob?: boolean; file?: boolean } } | null>(null);
  const attemptingPathRef = useRef<string | null>(null);
  // 切换保护与节流，避免快速重复触发与重入
  const switchingRef = useRef(false);
  const lastSwitchTsRef = useRef(0);

  useEffect(() => {
    imageInfoRef.current = imageInfo;
  }, [imageInfo]);

  useEffect(() => {
    isWindowLockedRef.current = isWindowLocked;
  }, [isWindowLocked]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // 统一的 PDF 检测：支持 fileBlob、fileName、路径和 src
  const detectPdf = useCallback((inferredPath: string | null): boolean => {
    // 路径为最高优先级：若可用则直接以路径扩展名为准
    const pathCandidate = (() => {
      if (inferredPath && inferredPath.length > 0) return inferredPath;
      if (attemptingPathRef.current && attemptingPathRef.current.length > 0) return attemptingPathRef.current;
      if (currentFilePath && currentFilePath.length > 0) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath.replace(/\\/g, '/');
      return null;
    })();
    if (pathCandidate) {
      return pathCandidate.toLowerCase().endsWith('.pdf');
    }

    // 其次使用拖入的文件类型
    if (fileBlob && typeof fileBlob.type === 'string') {
      return fileBlob.type === 'application/pdf';
    }

    // 最后才根据外部 src / fileName 猜测
    if (src && src.toLowerCase().endsWith('.pdf')) return true;
    if (fileName && fileName.toLowerCase().endsWith('.pdf')) return true;
    return false;
  }, [currentFilePath, filePath, fileBlob, fileName, src]);

  // 外部传入的 src 变化时，同步到内部显示源（不因内部切换 currentFilePath 而回退）
  useEffect(() => {
    // 若是 blob URL，优先依据 fileBlob 类型直接决定
    if (src && src.startsWith('blob:')) {
      const isPdfByBlob = fileBlob && typeof fileBlob.type === 'string' ? fileBlob.type === 'application/pdf' : false;

      // 检查是否为 HEIC/HEIF 文件
      const fileName = fileBlob?.name || '';
      const blobType = (fileBlob as any)?.type;
      const isHeic = /\.(heic|heif)$/i.test(fileName) || blobType === 'image/heic' || blobType === 'image/heif';

      // 记录尝试路径：优先父级 filePath，其次从 fileBlob 提取
      try {
        const candidatePath = (() => {
          if (filePath && filePath.length > 0) return filePath;
          const anyFile = fileBlob as any;
          const blobPath: string | undefined = anyFile && typeof anyFile?.path === 'string' && anyFile.path.length > 0
            ? anyFile.path
            : (fileBlob?.webkitRelativePath || undefined);
          return blobPath || null;
        })();
        if (candidatePath) {
          attemptingPathRef.current = candidatePath.replace(/\\/g, '/');
        }
      } catch {}

      // PDF 文件不显示
      if (isPdfByBlob) {
        setActiveSrc('');
        return;
      }

      // HEIC/HEIF 文件需要解码转换（带缓存，避免重复解码）
      if (isHeic && fileBlob) {
        const key = buildHeicCacheKey({ blob: fileBlob, name: fileName, path: attemptingPathRef.current || undefined });
        currentHeicKeyRef.current = key;
        // 命中缓存则不显示 loading（近乎瞬时）
        if (!heicDecodeCache.has(key)) setIsHeicDecoding(true);
        (async () => {
          try {
            const pathForRust = attemptingPathRef.current || (fileBlob as any)?.path || filePath || undefined;
            const jpegBlob = await decodeHeicBlobWithCache(fileBlob, key, pathForRust);
            // 每次创建新 URL，避免与其他地方 revoke 冲突
            const url = URL.createObjectURL(jpegBlob);
            if (currentHeicKeyRef.current === key) {
              setActiveSrc(url);
            }
          } catch (heicErr) {
            console.error('HEIC/HEIF blob 解码失败:', heicErr);
            if (currentHeicKeyRef.current === key) {
              setActiveSrc(src || '');
            }
          } finally {
            if (currentHeicKeyRef.current === key) {
              setIsHeicDecoding(false);
            }
          }
        })();
        return;
      }

      // 其他文件直接使用原始 blob URL
      setActiveSrc(src || '');
      return;
    }

    // 仅基于 src 推断（避免依赖 detectPdf/currentFilePath 导致内部切换被覆盖）
    const inferred = src && src.startsWith('file://') ? src.substring(7) : null;
    const isPdfByExt = !!(inferred && inferred.toLowerCase().endsWith('.pdf')) || (!!src && src.toLowerCase().endsWith('.pdf'));
    setActiveSrc(isPdfByExt ? '' : (src || ''));
    // 记录尝试路径：优先 file:// 推断，其次父级 filePath
    try {
      const candidatePath = inferred || (filePath && filePath.length > 0 ? filePath : null);
      if (candidatePath) {
        attemptingPathRef.current = candidatePath.replace(/\\/g, '/');
      }
    } catch {}
  }, [src, fileBlob, filePath]);

  // 推断当前文件路径（用于 PDF 判断）
  const getInferredPath = useCallback(() => {
    // 优先使用正在尝试加载的路径
    if (attemptingPathRef.current && attemptingPathRef.current.length > 0) return attemptingPathRef.current.replace(/\\/g, '/');
    // 再次使用内部维护的 currentFilePath，避免被旧的 blob/fileBlob 路径覆盖
    if (currentFilePath) return currentFilePath;
    // 其次使用父组件传入的 filePath
    if (filePath && filePath.length > 0) return filePath.replace(/\\/g, '/');
    // 当 src 为 blob 且存在 fileBlob 时，作为兜底来源
    if (src && src.startsWith('blob:') && fileBlob) {
      const anyFile = fileBlob as any;
      const blobPath: string | undefined = typeof anyFile.path === 'string' && anyFile.path.length > 0
        ? anyFile.path
        : (fileBlob.webkitRelativePath || undefined);
      if (blobPath) return blobPath.replace(/\\/g, '/');
    }
    // 最后从 src 的 file:// 方案提取
    if (src && src.startsWith('file://')) return src.substring(7);
    return null;
  }, [currentFilePath, filePath, src, fileBlob]);

  // 释放旧的 blob URL，避免内存泄漏
  useEffect(() => {
    const prev = prevActiveSrcRef.current;
    if (prev && prev.startsWith('blob:') && prev !== activeSrc) {
      try { URL.revokeObjectURL(prev); } catch {}
    }
    prevActiveSrcRef.current = activeSrc;
  }, [activeSrc]);

  useEffect(() => {
    if (!filePath) return;
    const normalizedPath = filePath.replace(/\\/g, '/');
    setCurrentFilePath(normalizedPath);
    try {
      if (lastLoadedPathRef.current !== normalizedPath) {
        loadImageList(normalizedPath);
      }
    } catch (e) {
      console.warn('根据新的 filePath 加载目录文件列表失败:', e);
    }
  }, [filePath]);

  // 将指定 PDF 页面渲染成图片 URL，并设置为 activeSrc（提前声明以供下方依赖使用）
  const renderPdfPage = useCallback(async (pageNum: number) => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const p = Math.max(1, Math.min(pageNum, doc.numPages));
    try {
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('无法获取 Canvas 上下文');
      await page.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('canvas.toBlob 失败')), 'image/png');
      });
      const url = URL.createObjectURL(blob);
      if (pdfImageUrlRef.current) {
        try { URL.revokeObjectURL(pdfImageUrlRef.current); } catch {}
      }
      pdfImageUrlRef.current = url;
      setActiveSrc(url);
      setPdfCurrentPage(p);
      if (onError) onError('');
    } catch (e) {
      console.error('渲染 PDF 页面失败:', e);
      if (onError) onError('渲染 PDF 页面失败');
    }
  }, [onError]);

  // 当当前文件为 PDF 时，初始化 PDF 文档并渲染首页
  useEffect(() => {
    const path = getInferredPath();
    attemptingPathRef.current = path || attemptingPathRef.current;
    const isPdf = detectPdf(path);
    setIsPdfFileMode(isPdf);

    if (!isPdf) {
      // 清理 PDF 相关状态
      if (pdfDocRef.current && typeof pdfDocRef.current.destroy === 'function') {
        pdfDocRef.current.destroy().catch(() => {});
      }
      pdfDocRef.current = null;
      setPdfPageCount(0);
      setPdfCurrentPage(1);
      if (pdfImageUrlRef.current) {
        try { URL.revokeObjectURL(pdfImageUrlRef.current); } catch {}
        pdfImageUrlRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const initPdf = async () => {
      try {
        let bytes: ArrayBuffer | Uint8Array | null = null;
        // 1) 优先使用当前路径（Tauri 环境从磁盘读取）
        if (path && path.toLowerCase().endsWith('.pdf')) {
          try {
            const buf = await readFile(path);
            bytes = buf as Uint8Array;
          } catch (fsErr) {
            console.warn('读取 PDF 路径失败，尝试其他来源:', fsErr);
          }
        }
        // 2) 其次使用拖入的文件 Blob（仅当其确为 PDF）
        if (!bytes && fileBlob && typeof fileBlob.type === 'string' && fileBlob.type === 'application/pdf') {
          try {
            bytes = await fileBlob.arrayBuffer();
          } catch (blobErr) {
            console.warn('读取 fileBlob 失败:', blobErr);
          }
        }
        // 3) 最后尝试从 src（blob/http）拉取
        if (!bytes && src) {
          try {
            const resp = await fetch(src);
            if (resp.ok) {
              bytes = await resp.arrayBuffer();
            }
          } catch (fetchErr) {
            // 忽略，统一在下面报错
          }
        }

        if (!bytes) {
          throw new Error('无法获取 PDF 数据');
        }

        const loadingTask = (getDocument as any)({ data: bytes, disableWorker: true });
        const doc = await loadingTask.promise;
        if (cancelled) {
          try { await doc.destroy(); } catch {}
          return;
        }
        pdfDocRef.current = doc;
        setPdfPageCount(doc.numPages);
        setPdfCurrentPage(1);

        // 初始化同目录图片/文档列表（PDF场景不会触发 <img> 的 onLoad）
        if (path) {
          const normalizedPath = path.replace(/\\/g, '/');
          try {
            setCurrentFilePath(normalizedPath);
            await loadImageList(normalizedPath);
            console.log('PDF 初始化后完成目录列表加载');
          } catch (listErr) {
            console.warn('PDF 初始化后加载目录列表失败:', listErr);
          }
        }

        await renderPdfPage(1);
      } catch (e) {
        console.error('加载 PDF 失败:', e);
        if (onError) onError('加载 PDF 失败');
      }
    };

    // 清理旧状态并初始化
    if (pdfDocRef.current && typeof pdfDocRef.current.destroy === 'function') {
      pdfDocRef.current.destroy().catch(() => {});
    }
    pdfDocRef.current = null;
    if (pdfImageUrlRef.current) {
      try { URL.revokeObjectURL(pdfImageUrlRef.current); } catch {}
      pdfImageUrlRef.current = null;
    }
    initPdf();

    return () => { cancelled = true; };
  }, [getInferredPath, detectPdf, onError, renderPdfPage, fileBlob, src]);

  const updateContainerSize = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;
    setContainerSize(prev => {
      if (prev.width === rect.width && prev.height === rect.height) {
        return prev;
      }
      return { width: rect.width, height: rect.height };
    });
  }, []);

  const isTauriEnvironment = () => {
    if (windowRef.current) return true;
    if (typeof window === 'undefined') return false;
    const win = window as any;
    return typeof win.__TAURI__ !== 'undefined' || typeof win.__TAURI_IPC__ !== 'undefined';
  };

  const recordWindowSize = useCallback(async () => {
    if (!windowRef.current) {
      return null;
    }

    try {
      const size = await windowRef.current.innerSize();
      const normalized = {
        width: Math.round(size.width),
        height: Math.round(size.height)
      };
      windowSizeRef.current = normalized;
      console.log('记录窗口尺寸:', normalized);
      return normalized;
    } catch (error) {
      console.error('获取窗口尺寸失败:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    try {
      windowRef.current = getCurrentWindow();
      console.log('ImageViewer 已获取到 Tauri 窗口实例');
      recordWindowSize();
    } catch (error) {
      console.warn('ImageViewer 获取窗口实例失败:', error);
    }

    updateContainerSize();

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateContainerSize();
      });
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', updateContainerSize);
    }

    return () => {
      windowRef.current = null;
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', updateContainerSize);
      }
    };
  }, [recordWindowSize, updateContainerSize]);

  // 图片缩放限制
  const MIN_SCALE = 0.05;  // 最小缩放5%
  const MAX_SCALE = 10;    // 最大缩放10倍
  const MIN_WINDOW_SIZE = 200; // 窗口最小尺寸

  // 获取屏幕尺寸
  const getScreenSize = useCallback(async () => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      // 直接尝试通过 Tauri 后端获取屏幕尺寸；失败则回退到浏览器值
      const [width, height] = await invoke<[number, number]>('get_screen_size');
      setScreenSize({ width, height });
      return;
    } catch (error) {
      console.warn('Tauri 获取屏幕尺寸失败，使用浏览器值回退:', error);
    }

    setScreenSize({ 
      width: window.screen.availWidth || 1920, 
      height: window.screen.availHeight || 1080 
    });
  }, []);


  // 统一构造图片加载候选URL（asset -> blob -> file）
  const buildCandidateUrls = useCallback(async (
    path: string,
    options?: { includeBlob?: boolean }
  ): Promise<{ asset?: string; blob?: string; file: string }> => {
    const normalized = path.replace(/\\/g, '/');
    const out: { asset?: string; blob?: string; file: string } = { file: `file://${normalized}` };

    // 候选1：convertFileSrc（asset.localhost / asset 协议）仅在 Tauri 环境启用
    const isTauri = (() => {
      if (windowRef.current) return true;
      if (typeof window === 'undefined') return false;
      const win = window as any;
      return typeof win.__TAURI__ !== 'undefined' || typeof win.__TAURI_IPC__ !== 'undefined';
    })();

    if (isTauri) {
      try {
        const u = convertFileSrc(normalized);
        console.log('使用 convertFileSrc(core) 生成URL:', u);
        out.asset = u;
      } catch (e) {
        console.warn('convertFileSrc 不可用，跳过:', e);
      }
    }

    // 候选2：FS 读取生成 blob（按需，可选，避免频繁磁盘IO导致切换卡顿）
    if (options?.includeBlob) {
      try {
        const bytes = await readFile(normalized);
        const ext = normalized.split('.').pop()?.toLowerCase() || '';

        // HEIC/HEIF 文件需要解码转换（带缓存，避免重复解码）
        if (ext === 'heic' || ext === 'heif') {
          const heicBlob = new Blob([bytes], { type: 'image/heic' });
          const key = buildHeicCacheKey({ path: normalized });
          try {
            const jpegBlob = await decodeHeicBlobWithCache(heicBlob, key, normalized);
            // 每次创建新 URL，避免被 revoke 后失效
            out.blob = URL.createObjectURL(jpegBlob);
          } catch (heicErr) {
            console.error('HEIC/HEIF 解码失败:', heicErr);
            const fallbackBlob = new Blob([bytes], { type: 'image/heic' });
            out.blob = URL.createObjectURL(fallbackBlob);
          }
        } else if (isRawPath(normalized) && isTauriEnv()) {
          // RAW 相机格式：通过 Rust (rawloader + imagepipe) 原生解码
          // 解码成功 → 全分辨率高清图；解码失败 → 不给 blob，交由 onError 回退到嵌入缩略图
          try {
            console.time(`[RAW] 解码耗时 ${normalized}`);
            const jpegBlob = await decodeRawViaRust(normalized);
            console.timeEnd(`[RAW] 解码耗时 ${normalized}`);
            out.blob = URL.createObjectURL(jpegBlob);
            console.log('[RAW] Rust 解码成功:', normalized);
          } catch (rawErr) {
            console.warn('[RAW] Rust 解码失败，将由上层回退到嵌入缩略图:', rawErr);
            // 不写 out.blob；上层发现 blob 为空后，<img> 会走 file:// 候选 → 失败 → onError → 缩略图回退
          }
        } else {
          const mimeMap: Record<string, string> = {
            jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon',
            tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
            cr2: 'image/x-canon-cr2', nef: 'image/x-nikon-nef', arw: 'image/x-sony-arw', dng: 'image/x-adobe-dng', rw2: 'image/x-panasonic-rw2', orf: 'image/x-olympus-orf', raf: 'image/x-fuji-raf', sr2: 'image/x-sony-sr2',
            exif: 'image/jpeg', raw: 'application/octet-stream', wmf: 'application/x-msmetafile', pdf: 'application/pdf'
          };
          const mime = mimeMap[ext] || 'application/octet-stream';
          const blob = new Blob([bytes], { type: mime });
          const u = URL.createObjectURL(blob);
          console.log('生成 blob URL 作为回退:', u);
          out.blob = u;
        }
      } catch (e) {
        console.warn('FS 读取失败，无法生成 blob URL:', e);
      }
    }

    return out;
  }, []);

  // 若 activeSrc 为空（例如初次打开时），基于可推断路径构造候选并设定显示源
  useEffect(() => {
    const needInit = !activeSrc || activeSrc.length === 0;
    if (!needInit) return;

    const inferredPath = (() => {
      if (attemptingPathRef.current) return attemptingPathRef.current;
      if (currentFilePath) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath;
      if (src && src.startsWith('file://')) return src.substring(7);
      return null;
    })();

    if (!inferredPath) return;
    // PDF 文件由专用逻辑初始化，不在此处设置 activeSrc
    if (detectPdf(inferredPath)) return;

    let mounted = true;
    (async () => {
      try {
        // 记录尝试加载的路径，便于后续在 onload 中加载同目录列表
        attemptingPathRef.current = inferredPath;
        const candidates = await buildCandidateUrls(inferredPath, { includeBlob: true });
        // 选择顺序调整为 blob 优先，其次 file，移除 asset 回退
        const next = candidates.blob || candidates.file || '';
        if (mounted && next) {
          setActiveSrc(next);
        }
      } catch (e) {
        console.warn('初始化 activeSrc 失败，保持静默:', e);
      }
    })();

    return () => { mounted = false; };
  }, [activeSrc, currentFilePath, filePath, src, buildCandidateUrls, detectPdf]);

  // 额外回退：当 activeSrc 为空且存在 fileBlob 时，直接使用 fileBlob 生成的 blob URL
  useEffect(() => {
    const needInit = !activeSrc || activeSrc.length === 0;
    if (!needInit || !fileBlob) return;
    // 若当前内容为 PDF，禁止使用 <img> 的 blob 回退，避免闪烁/错误图标
    const inferred = getInferredPath();
    const isPdf = detectPdf(inferred);
    const blobType = (fileBlob as any)?.type;
    if (isPdf || blobType === 'application/pdf') return;

    // 检查是否为 HEIC/HEIF 文件
    const fileName = fileBlob.name || '';
    const isHeic = /\.(heic|heif)$/i.test(fileName) || blobType === 'image/heic' || blobType === 'image/heif';

    if (isHeic) {
      // HEIC 文件需要解码转换（带缓存，避免重复解码）
      const key = buildHeicCacheKey({ blob: fileBlob, name: fileName, path: inferred || undefined });
      currentHeicKeyRef.current = key;
      if (!heicDecodeCache.has(key)) setIsHeicDecoding(true);
      (async () => {
        try {
          const pathForRust = inferred || (fileBlob as any)?.path || undefined;
          const jpegBlob = await decodeHeicBlobWithCache(fileBlob, key, pathForRust);
          const url = URL.createObjectURL(jpegBlob);
          if (currentHeicKeyRef.current === key) {
            setActiveSrc(url);
          }
        } catch (heicErr) {
          console.error('拖拽的 HEIC/HEIF 解码失败:', heicErr);
          if (currentHeicKeyRef.current === key) {
            try {
              const u = URL.createObjectURL(fileBlob);
              setActiveSrc(u);
            } catch (e) {
              console.warn('根据 fileBlob 生成 blob URL 失败:', e);
            }
          }
        } finally {
          if (currentHeicKeyRef.current === key) {
            setIsHeicDecoding(false);
          }
        }
      })();
      return;
    }

    try {
      const u = URL.createObjectURL(fileBlob);
      setActiveSrc(u);
      console.log('根据 fileBlob 生成 blob URL 作为回退');
    } catch (e) {
      console.warn('根据 fileBlob 生成 blob URL 失败:', e);
    }
  }, [activeSrc, fileBlob, getInferredPath, detectPdf]);

  // 获取同目录下的文件列表（按类型分离）
  async function loadImageList(filePath: string) {
    const normalizedFilePath = filePath.replace(/\\/g, '/');
    try {
      // 非 Tauri 环境不调用后端，避免控制台出现 invoke 相关报错
      const isTauri = (() => {
        if (windowRef.current) return true;
        if (typeof window === 'undefined') return false;
        const win = window as any;
        return typeof win.__TAURI__ !== 'undefined' || typeof win.__TAURI_IPC__ !== 'undefined';
      })();

      if (!isTauri) {
        setImageList(filePath ? [normalizedFilePath] : []);
        setCurrentImageIndex(0);
        // 非 Tauri 环境下不标记初始化完成，允许稍后在 Tauri 就绪后重新尝试加载目录列表
        return;
      }
      console.log('=== 开始加载文件列表（按类型） ===');
      console.log('文件路径:', filePath);
      console.log('环境判定（使用窗口实例）:', !!windowRef.current);

      // 直接调用 Tauri 后端，按当前文件类型选择命令
      const isCurrentPdf = detectPdf(normalizedFilePath);
      let cmd = isCurrentPdf ? 'list_pdfs_in_dir' : 'list_images_in_dir';
      // 兼容不同后端参数命名（filePath vs file_path），并在缺少 PDF 命令时回退到图片命令
      let list: string[] = [];
      const payloads = [
        { filePath: normalizedFilePath },
        { file_path: normalizedFilePath },
      ];
      let lastErr: any = null;
      const tryInvoke = async (commandName: string) => {
        for (const payload of payloads) {
          try {
            const res = await invoke<string[]>(commandName, payload);
            return res;
          } catch (err) {
            lastErr = err;
            console.warn('调用后端命令失败，尝试备用参数键:', Object.keys(payload)[0], err);
          }
        }
        throw lastErr;
      };

      try {
        list = await tryInvoke(cmd);
      } catch (err: any) {
        const msg = String(err || '');
        // 当 PDF 枚举命令不存在时，回退到图片命令再在前端过滤
        if (isCurrentPdf && /unknown command|not found/i.test(msg)) {
          console.warn('后端缺少 list_pdfs_in_dir，回退到 list_images_in_dir 再过滤');
          cmd = 'list_images_in_dir';
          list = await tryInvoke(cmd);
        } else {
          throw err;
        }
      }

      console.log('Tauri 后端返回:');
      console.log('- 文件数量:', list.length);
      console.log('- 文件列表:', list);

      // 规范化分隔符并按类型过滤，避免将图片与PDF混列
      let normalizedList = list.map(p => p.replace(/\\/g, '/'));
      if (isCurrentPdf) {
        normalizedList = normalizedList.filter(p => p.toLowerCase().endsWith('.pdf'));
      } else {
        normalizedList = normalizedList.filter(p => !p.toLowerCase().endsWith('.pdf'));
      }
      const dedupedList = Array.from(new Set(normalizedList));
      setImageList(dedupedList);

      // 找到当前文件在列表中的索引
      const index = dedupedList.findIndex(p => p === normalizedFilePath);
      console.log('- 当前文件索引:', index);
      console.log('- 查找的文件路径:', filePath);
      if (index >= 0) {
        setCurrentImageIndex(index);
      } else {
        // 若索引未找到且尚未初始化，设为首项以允许后续切换
        if (currentImageIndex < 0 && dedupedList.length > 0) {
          console.warn('当前文件未在列表中找到，初始化索引为 0');
          setCurrentImageIndex(0);
        } else {
          console.warn('当前文件未在列表中找到，保持现有索引');
        }
      }

      console.log('=== 文件列表加载完成（按类型分离） ===');
      lastLoadedPathRef.current = normalizedFilePath;
      listInitializedRef.current = true;
    } catch (error) {
      console.error('=== 加载文件列表失败（等待 Tauri 就绪后重试）===');
      console.error('错误详情:', error);
      // 保留现有列表与索引，避免列表/索引被错误重置；不标记初始化完成以便后续重试
      console.warn('保留现有列表与索引，稍后重试');
      // 不更新 lastLoadedPathRef / listInitializedRef，允许 handleImageLoad 再次触发加载
    }
  }

  



  const getContainerDimensions = useCallback(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      return containerSize;
    }
    if (isWindowLockedRef.current) {
      const lockedSize = lockedWindowSizeRef.current || windowSizeRef.current;
      if (lockedSize) {
        return lockedSize;
      }
    }
    if (typeof window !== 'undefined') {
      return { width: window.innerWidth, height: window.innerHeight };
    }
    return { width: 0, height: 0 };
  }, [containerSize]);

  const calculateFitScale = useCallback((naturalWidth: number, naturalHeight: number) => {
    // 图片加载时保持窗口原本尺寸不变，让图片适应窗口
    // 优先使用当前窗口尺寸，如果窗口锁定则使用锁定尺寸，最后回退到容器尺寸
    let targetSize = null;
    
    if (isWindowLockedRef.current && lockedWindowSizeRef.current) {
      // 窗口锁定状态，使用锁定的窗口尺寸
      targetSize = lockedWindowSizeRef.current;
    } else if (windowSizeRef.current) {
      // 使用当前窗口尺寸
      targetSize = windowSizeRef.current;
    } else {
      // 回退到容器尺寸
      targetSize = getContainerDimensions();
    }
    
    if (!targetSize || !naturalWidth || !naturalHeight || targetSize.width <= 0 || targetSize.height <= 0) {
      return 1;
    }

    // 计算适应窗口的缩放比例，确保图片完全显示在窗口中
    const widthRatio = targetSize.width / naturalWidth;
    const heightRatio = targetSize.height / naturalHeight;
    const scaleToFit = Math.min(widthRatio, heightRatio);
    
    // 应用缩放限制 - 窗口锁定状态下不受MAX_SCALE限制
    const maxScale = isWindowLockedRef.current ? 50 : MAX_SCALE;
    return Math.max(MIN_SCALE, Math.min(maxScale, scaleToFit));
  }, [getContainerDimensions]);

  const resetImageToFitWindow = useCallback((naturalWidth: number, naturalHeight: number) => {
    const fitScale = calculateFitScale(naturalWidth, naturalHeight);
    setScale(fitScale);
    scaleRef.current = fitScale;
    setPosition({ x: 0, y: 0 });
  }, [calculateFitScale]);

  // NOTE: 移除基准偏移，始终以容器中心为参考点。
  // 图片使用 left/top 50% + 负半宽/半高实现居中，
  // 仅通过 position 偏移进行平移，避免出现向左偏移的问题。

  // 调整窗口大小
  const adjustWindowSize = useCallback(async (newScale: number) => {
    if (isWindowLockedRef.current) {
      console.log('调整窗口大小跳过: 窗口处于锁定状态');
      return;
    }

    if (!imageInfoRef.current) {
      console.log('调整窗口大小跳过: imageInfo 不存在');
      return;
    }

    if (!isTauriEnvironment()) {
      console.log('调整窗口大小跳过: 非Tauri环境');
      return;
    }

    const currentWindow = windowRef.current;
    if (!currentWindow) {
      console.log('调整窗口大小跳过: 未获取到窗口实例');
      return;
    }

    try {
      // 计算新的窗口尺寸
      const info = imageInfoRef.current;
      if (!info) return;

      const { width: screenWidth, height: screenHeight } = screenSize;
      const aspectRatio = info.naturalWidth / info.naturalHeight;

      let finalWidth = Math.round(info.naturalWidth * newScale);
      let finalHeight = Math.round(info.naturalHeight * newScale);

      if (aspectRatio >= 1) {
        if (finalWidth < MIN_WINDOW_SIZE) {
          finalWidth = MIN_WINDOW_SIZE;
          finalHeight = Math.round(finalWidth / aspectRatio);
        }
      } else {
        if (finalHeight < MIN_WINDOW_SIZE) {
          finalHeight = MIN_WINDOW_SIZE;
          finalWidth = Math.round(finalHeight * aspectRatio);
        }
      }

      const widthRatio = info.naturalWidth / screenWidth;
      const heightRatio = info.naturalHeight / screenHeight;
      const isWidthLast = widthRatio < heightRatio;

      if (isWidthLast) {
        if (finalWidth > screenWidth) {
          finalWidth = screenWidth;
          finalHeight = Math.round(finalWidth / aspectRatio);
        }
      } else {
        if (finalHeight > screenHeight) {
          finalHeight = screenHeight;
          finalWidth = Math.round(finalHeight * aspectRatio);
        }
      }

      // 计算并保持窗口中心绝对坐标不变（避免看起来以左上角为基准缩放）
      let centerX: number | null = null;
      let centerY: number | null = null;
      try {
        const oldPos = await currentWindow.outerPosition();
        const oldSize = await currentWindow.innerSize();
        centerX = Math.round(oldPos.x + oldSize.width / 2);
        centerY = Math.round(oldPos.y + oldSize.height / 2);
      } catch (posErr) {
        console.warn('获取窗口位置/尺寸失败，中心保持可能不生效:', posErr);
      }

      console.log('调整窗口大小:', {
        finalWidth,
        finalHeight,
        scale: newScale
      });

      const normalizedSize = { width: finalWidth, height: finalHeight };

      try {
        await currentWindow.setSize(new LogicalSize(finalWidth, finalHeight));
        windowSizeRef.current = normalizedSize;
        console.log('窗口尺寸调整成功（LogicalSize）');
      } catch (apiError) {
        console.warn('窗口API调整失败，尝试invoke回退:', apiError);
        await invoke('set_window_size', {
          width: finalWidth,
          height: finalHeight
        });
        windowSizeRef.current = normalizedSize;
        console.log('窗口尺寸调整成功（invoke 回退）');
      }

      // 根据新尺寸回设窗口位置以保持中心不变
      if (centerX !== null && centerY !== null) {
        const newLeft = Math.round(centerX - finalWidth / 2);
        const newTop = Math.round(centerY - finalHeight / 2);
        try {
          await currentWindow.setPosition(new LogicalPosition(newLeft, newTop));
          console.log('窗口位置已调整以保持中心不变');
        } catch (posSetErr) {
          console.warn('设置窗口位置失败:', posSetErr);
        }
      }
    } catch (error) {
      console.error('调整窗口大小失败:', error);
    }
  }, [screenSize]);

  // 图片加载完成处理 - 修复居中显示问题
  const handleImageLoad = () => {
    const img = imageRef.current;
    if (!img) return;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;

    setImageInfo({
      width: naturalWidth,
      height: naturalHeight,
      naturalWidth,
      naturalHeight
    });

    // 每次加载图片都重置到适应窗口的缩放，确保图片完全显示在窗口中央
    resetImageToFitWindow(naturalWidth, naturalHeight);

    const inferredPath = (() => {
      // 优先使用正在尝试加载的路径，避免旧 blob 覆盖
      if (attemptingPathRef.current) return attemptingPathRef.current;
      // 其次使用内部 currentFilePath，确保切换后的路径不被旧的 blob 覆盖
      if (currentFilePath) return currentFilePath;
      // 再次使用父组件的 filePath
      if (filePath && filePath.length > 0) return filePath;
      // 当 src 是 blob 且存在 fileBlob 路径信息时作为兜底
      if (src.startsWith('blob:') && fileBlob) {
        const anyFile = fileBlob as any;
        const p = typeof anyFile.path === 'string' && anyFile.path.length > 0 ? anyFile.path : (fileBlob.webkitRelativePath || '');
        if (p && p.length > 0) return p;
      }
      if (src.startsWith('file://')) {
        return src.substring(7);
      }
      return null;
    })();

    // 初始化或路径变化时加载同目录文件列表
    if (inferredPath) {
      const normalizedPath = inferredPath.replace(/\\/g, '/');
      setCurrentFilePath(normalizedPath);
      if (!listInitializedRef.current || lastLoadedPathRef.current !== normalizedPath) {
        console.log('加载同目录文件列表，文件路径:', normalizedPath);
        loadImageList(normalizedPath);
      }
    }
    
    console.log('图片加载完成:', fileName, '尺寸:', naturalWidth, '×', naturalHeight);

    // 释放切换保护标记，允许后续切换
    switchingRef.current = false;

    // 加载成功后清理可能残留的错误提示
    if (onError) {
      onError('');
    }
  };

  // 切换图片 - 修复切换逻辑（提前声明以避免 TDZ）
  const switchImage = useCallback(async (direction: 'prev' | 'next') => {
    // 节流与重入保护：避免快速重复触发导致闪烁
    const now = Date.now();
    if (switchingRef.current || now - lastSwitchTsRef.current < 150) {
      console.log('切换进行中或过快，忽略触发');
      return;
    }
    switchingRef.current = true;
    lastSwitchTsRef.current = now;

    if (imageList.length === 0 || currentImageIndex < 0) {
      console.log('没有可切换的图片');
      switchingRef.current = false;
      return;
    }

    let newIndex;
    if (direction === 'next') {
      newIndex = (currentImageIndex + 1) % imageList.length;
      console.log('切换到下一张图片，索引:', newIndex);
    } else {
      newIndex = currentImageIndex - 1;
      if (newIndex < 0) newIndex = imageList.length - 1;
      console.log('切换到上一张图片，索引:', newIndex);
    }

    const newImagePath = imageList[newIndex];
    if (newImagePath) {
      console.log('切换图片路径:', newImagePath);
      attemptingPathRef.current = newImagePath;
      
      // 更新索引和路径
      setCurrentImageIndex(newIndex);
      setCurrentFilePath(newImagePath);
      const isPdfTarget = newImagePath.toLowerCase().endsWith('.pdf');
      
      // 针对目标类型分别处理，避免 PDF 被当成 <img> 加载导致闪烁
      try {
        // 切换到 PDF：交由 PDF 初始化流程处理（activeSrc 置空，触发专用渲染）
        if (isPdfTarget) {
          // 清理旧的 blob URL
          if (activeSrc.startsWith('blob:')) {
            try { URL.revokeObjectURL(activeSrc); } catch {}
          }
          // 切换到 PDF 模式并重置图片信息
          setIsPdfFileMode(true);
          setImageInfo(null);
          setActiveSrc('');
        } else {
          // 切换到图片：确保退出 PDF 模式并销毁旧 PDF 状态
          if (pdfDocRef.current && typeof pdfDocRef.current.destroy === 'function') {
            try { await pdfDocRef.current.destroy(); } catch {}
          }
          pdfDocRef.current = null;
          setIsPdfFileMode(false);
          if (pdfImageUrlRef.current) {
            try { URL.revokeObjectURL(pdfImageUrlRef.current); } catch {}
            pdfImageUrlRef.current = null;
          }

          // 如为 HEIC 文件，立即显示解码中提示，避免看起来卡死
          const isHeicTarget = isHeicPath(newImagePath);
          const targetKey = buildHeicCacheKey({ path: newImagePath });
          if (isHeicTarget) {
            currentHeicKeyRef.current = targetKey;
            // 仅在未命中缓存时显示 loading（命中则瞬间完成）
            if (!heicDecodeCache.has(targetKey)) {
              setIsHeicDecoding(true);
            }
          }

          const candidates = await buildCandidateUrls(newImagePath, { includeBlob: true });
          // 清理旧的 blob URL（由 activeSrc 统一管理；缓存存的是 Blob，不受影响）
          if (activeSrc.startsWith('blob:')) {
            try { URL.revokeObjectURL(activeSrc); } catch {}
          }

          setImageInfo(null);
          // 选择顺序调整为 blob 优先，其次 file，移除 asset 回退
          const nextSrc = candidates.blob || candidates.file || '';
          // 若期间用户又切到别的图，丢弃过期结果
          if (!isHeicTarget || currentHeicKeyRef.current === targetKey) {
            setActiveSrc(nextSrc);
          }
          if (isHeicTarget) setIsHeicDecoding(false);
        }

        // 通知父组件图片已切换
        if (onStateChange) {
          onStateChange({ 
            isPlaying: false,
            currentTime: 0,
            duration: 0
          });
        }

        // 后台预解码相邻 HEIC 到缓存：下次切换瞬间命中
        // 仅对 HEIC 做，普通图片浏览器原生加载足够快
        try {
          const preloadIndexNext = (newIndex + 1) % imageList.length;
          const preloadIndexPrev = (newIndex - 1 + imageList.length) % imageList.length;
          const preloadPaths = [imageList[preloadIndexNext], imageList[preloadIndexPrev]].filter(Boolean) as string[];
          for (const p of preloadPaths) {
            if (!isHeicPath(p)) continue;
            const key = buildHeicCacheKey({ path: p });
            if (heicDecodeCache.has(key)) continue; // 已缓存
            // 不 await，后台异步执行，失败静默
            (async () => {
              try {
                const bytes = await readFile(p);
                const heicBlob = new Blob([bytes], { type: 'image/heic' });
                await decodeHeicBlobWithCache(heicBlob, key, p);
                console.log('[HEIC] 预解码完成:', p);
              } catch (e) {
                console.warn('[HEIC] 预解码失败，忽略:', p, e);
              }
            })();
          }
        } catch (preErr) {
          console.warn('预加载相邻图片失败，忽略:', preErr);
        }
      } catch (error) {
        console.error('切换图片失败:', error);
        setIsHeicDecoding(false);
        if (onError) onError('切换图片失败');
      }
      // 释放切换保护标记
      switchingRef.current = false;
    }
  }, [currentImageIndex, imageList, activeSrc, onStateChange, onError]);

  // PDF 翻页：优先在 PDF 内翻页，边界时切换目录文件
  const switchPdfPage = useCallback(async (direction: 'prev' | 'next') => {
    const doc = pdfDocRef.current;
    if (!doc) return;
    const cur = pdfCurrentPage;
    const count = pdfPageCount > 0 ? pdfPageCount : doc.numPages;
    if (direction === 'next') {
      if (cur < count) {
        await renderPdfPage(cur + 1);
      } else {
        await switchImage('next');
      }
    } else {
      if (cur > 1) {
        await renderPdfPage(cur - 1);
      } else {
        await switchImage('prev');
      }
    }
  }, [pdfCurrentPage, renderPdfPage, switchImage]);

  // 初始加载失败时的回退处理（asset -> blob -> file）
  const handleInitialImageError = useCallback(async () => {
    const img = imageRef.current;
    if (!img) return;
    // HEIC 正在 Rust 解码中：此时 activeSrc 可能临时为空或仍指向前一张图的旧 URL，
    // 浏览器的 <img> onError 会误触发本回退链。提前 return，等待 Rust 解码结果，
    // 避免在高清图解码完成前就抢先显示低清嵌入缩略图（就是之前"优先打开缩略图"的根因）。
    if (isHeicDecoding) {
      console.log('HEIC 解码进行中，忽略本次 <img> onError，等待 Rust 解码完成');
      return;
    }
    // PDF 模式：禁止图片回退逻辑，等待专用渲染流程
    // 触发错误后，释放切换保护标记，避免后续按键被锁定
    switchingRef.current = false;
    const inferredPathForErr = (() => {
      if (attemptingPathRef.current) return attemptingPathRef.current;
      if (currentFilePath) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath;
      if (src && src.startsWith('file://')) return src.substring(7);
      return null;
    })();

    const isCurrentPdf = detectPdf(inferredPathForErr);
    if (isPdfFileMode || isCurrentPdf) {
      // 如果 PDF 文档已就绪，尝试渲染当前页；否则静默返回，等待初始化完成
      if (pdfDocRef.current) {
        await renderPdfPage(pdfCurrentPage || 1);
      }
      return;
    }

    // 非 Tauri 环境：不尝试 asset.localhost/file://，仅使用拖拽的 blob 或静默停止
    {
      const isTauri = (() => {
        if (windowRef.current) return true;
        if (typeof window === 'undefined') return false;
        const win = window as any;
        return typeof win.__TAURI__ !== 'undefined' || typeof win.__TAURI_IPC__ !== 'undefined';
      })();
      if (!isTauri) {
        if (fileBlob && (fileBlob as any)?.type !== 'application/pdf') {
          try {
            const u = URL.createObjectURL(fileBlob);
            if (u && u !== activeSrc) {
              setActiveSrc(u);
              console.log('非 Tauri 环境，回退到 fileBlob 的 blob URL');
              return;
            }
          } catch (e) {
            console.warn('非 Tauri 环境生成 blob URL 失败:', e);
          }
        }
        console.warn('非 Tauri 环境无法访问本地文件路径，停止图片回退循环');
        setActiveSrc('');
        onError?.('图片加载失败');
        return;
      }
    }

    const inferredPath = inferredPathForErr;

    if (!inferredPath) {
      // 优先尝试使用 fileBlob 作为回退
      if (fileBlob) {
        try {
          const u = URL.createObjectURL(fileBlob);
          if (u && u !== activeSrc) {
            setActiveSrc(u);
            console.log('图片加载失败，回退到 fileBlob 的 blob URL');
            return;
          }
        } catch (e) {
          console.warn('从 fileBlob 构建 blob URL 失败:', e);
        }
      }
      console.warn('图片加载失败且无法推断路径，回退不可用');
      onError?.('图片加载失败');
      return;
    }

    try {
      // 记录当前路径的回退尝试，避免 asset/bloc/file 循环切换
      const state = errorFallbackRef.current;
      if (!state || state.path !== inferredPath) {
        errorFallbackRef.current = { path: inferredPath, tried: {} };
      }
      const tried = errorFallbackRef.current!.tried;

      const candidates = await buildCandidateUrls(inferredPath, { includeBlob: true });

      // 优先使用 blob，其次 file；asset 在部分开发环境不可用（asset.localhost 连接被拒绝），不参与回退
      if (!tried.blob && candidates.blob && candidates.blob !== activeSrc) {
        tried.blob = true;
        setActiveSrc(candidates.blob);
        console.log('初始加载失败（回退一次）：blob URL');
        return;
      }
      if (!tried.file && candidates.file && candidates.file !== activeSrc) {
        tried.file = true;
        setActiveSrc(candidates.file);
        console.log('初始加载失败（回退一次）：file:// URL');
        return;
      }

      // 回退顺序说明：
      //   1) blob（包含 Rust libheif 解码结果或普通图片 Blob）→ 已在上方尝试
      //   2) file://（浏览器原生协议）→ 已在上方尝试
      //   3) 嵌入 JPEG 缩略图（exifr 或手动扫描）→ 下方尝试
      // 对 HEIC：Rust 解码成功时根本不会走到这里；只有 Rust 失败（如畸形文件、非 HEVC 编码的 HEIC 变种）
      //         才会走到缩略图回退，此时低清缩略图总比报错更能让用户看到图片内容。
      // 对 RAW（CR2/NEF/ARW 等）：浏览器和当前后端都无法解码，嵌入缩略图是唯一可展示途径。
      // 优先使用 exifr 提取嵌入的缩略图；失败时再手动扫描 JPEG
      try {
        const bytes = await readFile(inferredPath);
        let thumbData: Uint8Array | Buffer | undefined;
        try {
          thumbData = await (exifr as any).thumbnail(bytes);
        } catch (exErr) {
          console.warn('exifr 提取缩略图失败，尝试手动扫描 JPEG:', exErr);
        }

        if (thumbData) {
          const v: Uint8Array = thumbData instanceof Uint8Array ? thumbData : new Uint8Array(thumbData as any);
          const ab = new ArrayBuffer(v.byteLength);
          new Uint8Array(ab).set(v);
          const blob = new Blob([ab], { type: 'image/jpeg' });
          const url = URL.createObjectURL(blob);
          if (url && url !== activeSrc) {
            setActiveSrc(url);
            console.log('使用 exifr 提取的嵌入缩略图作为回退');
            return;
          }
        } else {
          const u8 = new Uint8Array(bytes);
          const findJpegThumbnail = (data: Uint8Array): Blob | null => {
            const starts: number[] = [];
            const ends: number[] = [];
            for (let i = 0; i < data.length - 1; i++) {
              const b0 = data[i];
              const b1 = data[i + 1];
              if (b0 === 0xff && b1 === 0xd8) starts.push(i);
              if (b0 === 0xff && b1 === 0xd9) ends.push(i + 2);
            }
            let best: { s: number; e: number } | null = null;
            for (const s of starts) {
              const e = ends.find((x) => x > s);
              if (typeof e === 'number') {
                if (!best || e - s > best.e - best.s) best = { s, e };
              }
            }
            if (best) {
              const slice = data.slice(best.s, best.e);
              return new Blob([slice], { type: 'image/jpeg' });
            }
            return null;
          };

          const thumb = findJpegThumbnail(u8);
          if (thumb) {
            const url = URL.createObjectURL(thumb);
            if (url && url !== activeSrc) {
              setActiveSrc(url);
              console.log('从文件中提取嵌入 JPEG 缩略图并回退显示');
              return;
            }
          }
        }
      } catch (thumbErr) {
         console.warn('无法提取嵌入缩略图，忽略:', thumbErr);
       }
       console.warn('所有候选与缩略图回退均已尝试，停止错误回退');
       onError?.('图片加载失败');
       setActiveSrc('');

      const errorMessage = '图片加载失败，所有回退方式均不可用';
      console.error(errorMessage);
      // 避免在非 Tauri 环境或连续失败场景下形成无限切换循环，不再自动跳到下一张
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('初始加载回退处理失败:', msg);
      // 同上：不自动跳下一张，避免循环
    }
  }, [buildCandidateUrls, currentFilePath, filePath, activeSrc, imageList, currentImageIndex, switchImage, fileBlob, detectPdf, src, pdfCurrentPage, renderPdfPage, isPdfFileMode, isHeicDecoding, onError]);

  // 缩放图片 - 以图片中心为基准点，确保图片中心相对于屏幕的绝对坐标不变
  const zoomImage = useCallback((zoomFactor: number) => {
    if (!imageInfo) return;

    // 在窗口锁定状态下，不受MAX_SCALE限制，允许图片超过窗口尺寸
    const maxScale = isWindowLockedRef.current ? 100 : MAX_SCALE;
    const newScale = Math.max(MIN_SCALE, Math.min(maxScale, scale * zoomFactor));

    if (newScale === scale) return;

    // 获取容器信息
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // 计算当前图片中心在屏幕上的绝对坐标
    // 图片的实际渲染位置：容器中心 + position偏移
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;
    
    // 当前图片中心的屏幕绝对坐标（这个坐标在缩放时必须保持不变）
    const currentImageCenterX = containerCenterX + position.x;
    const currentImageCenterY = containerCenterY + position.y;

    // 缩放比例变化
    // 保持图片中心在屏幕上的绝对坐标不变
    
    // 由于图片尺寸变化，需要调整position来保持图片中心的屏幕绝对坐标不变
    // 新的position = 当前图片中心屏幕坐标 - 容器中心坐标（中心保持不变即可）
    const newPosX = currentImageCenterX - containerCenterX;
    const newPosY = currentImageCenterY - containerCenterY;

    // 更新缩放和位置
    setScale(newScale);
    setPosition({ x: newPosX, y: newPosY });

    // 如果窗口未锁定，调整窗口大小
    if (!isWindowLockedRef.current) {
      adjustWindowSize(newScale);
    }
  }, [imageInfo, scale, adjustWindowSize, position]);

  // 鼠标滚轮缩放 - 平滑缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }

    // 基于滚轮幅度的指数缩放，提升缩小时段的平滑度
    const base = 1.0015;
    const clamped = Math.max(-60, Math.min(60, -e.deltaY));
    const zoomFactor = Math.pow(base, clamped);
    console.log('检测到滚轮缩放', { deltaY: e.deltaY, zoomFactor });
    zoomImage(zoomFactor);
  }, [zoomImage]);

  // 鼠标按下事件
  const toggleWindowLock = useCallback(async () => {
    const willLock = !isWindowLockedRef.current;
    const currentWindow = windowRef.current;

    if (willLock) {
      if (currentWindow) {
        const size = await currentWindow.innerSize().catch(error => {
          console.error('锁定窗口时获取尺寸失败:', error);
          return null;
        });
        if (size) {
          const normalized = {
            width: Math.round(size.width),
            height: Math.round(size.height)
          };
          lockedWindowSizeRef.current = normalized;
          windowSizeRef.current = normalized;
          console.log('锁定窗口尺寸记录:', normalized);
        }
      }

      isWindowLockedRef.current = true;
      setPosition({ x: 0, y: 0 });
      setIsWindowLocked(true);
    } else {
      isWindowLockedRef.current = false;
      lockedWindowSizeRef.current = null;
      setIsWindowLocked(false);
      setPosition({ x: 0, y: 0 });

      const info = imageInfoRef.current;
      if (info) {
        resetImageToFitWindow(info.naturalWidth, info.naturalHeight);
        await adjustWindowSize(scaleRef.current);
      }
    }
  }, [adjustWindowSize, resetImageToFitWindow]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // 只处理左键

    if (isWindowLocked && isSpacePressed) {
      // 窗口锁定状态下，按住空格键时拖拽图片
      setIsDragging(true);
      setDragStart({
        pointerX: e.clientX,
        pointerY: e.clientY,
        posX: position.x,
        posY: position.y
      });
      e.preventDefault();
      e.stopPropagation();
    }
  }, [isWindowLocked, isSpacePressed, position]);

  // 鼠标移动事件 - 简化逻辑，主要拖拽由全局事件处理
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // 主要拖拽逻辑由全局事件监听处理，这里只做基本处理
    e.preventDefault();

    // 操作提示显示逻辑：鼠标在容器底部20%区域停留一段时间
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pointerY = e.clientY - rect.top;
    const inBottomZone = pointerY >= rect.height * 0.75; // 底部25%

    // 鼠标移动时重置提示显示计时
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }

    if (inBottomZone) {
      hintTimerRef.current = window.setTimeout(() => {
        setHintVisible(true);
      }, 250); // 停留250ms显示
    } else {
      if (hintVisible) setHintVisible(false);
    }
  }, [hintVisible]);

  // 鼠标释放事件 - 简化逻辑
  const handleMouseUp = useCallback(() => {
    // 主要由全局事件处理，这里只做基本清理
    if (isDragging) {
      setIsDragging(false);
    }
    // 鼠标离开或释放时隐藏提示并清理计时器
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
    if (hintVisible) setHintVisible(false);
  }, [isDragging, hintVisible]);

  // 双击锁定/解锁窗口
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    void toggleWindowLock();
  }, [toggleWindowLock]);

  // 容器点击事件（边缘切换图片）
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current || isDragging) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;

    // 检查是否点击在左右边缘10%区域
    const edgeThreshold = 0.1;
    const isLeftEdge = clickX < width * edgeThreshold;
    const isRightEdge = clickX > width * (1 - edgeThreshold);

    if (isLeftEdge) {
      switchImage('prev');
    } else if (isRightEdge) {
      switchImage('next');
    }
  }, [switchImage, isDragging]);

  // 键盘事件处理 - 修复空格键拖拽
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(true);
        e.preventDefault();
        e.stopPropagation();
      } else if (e.code === 'ArrowLeft') {
        switchImage('prev');
        e.preventDefault();
      } else if (e.code === 'ArrowRight') {
        switchImage('next');
        e.preventDefault();
      } else if (e.code === 'ArrowUp') {
        if (isPdfFileMode && pdfDocRef.current) {
          void switchPdfPage('prev');
          e.preventDefault();
        }
      } else if (e.code === 'ArrowDown') {
        if (isPdfFileMode && pdfDocRef.current) {
          void switchPdfPage('next');
          e.preventDefault();
        }
      } else if (e.code === 'PageUp') {
        if (isPdfFileMode && pdfDocRef.current) {
          void switchPdfPage('prev');
          e.preventDefault();
        }
      } else if (e.code === 'PageDown') {
        if (isPdfFileMode && pdfDocRef.current) {
          void switchPdfPage('next');
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsDragging(false); // 释放空格键时停止拖拽
        e.preventDefault();
        e.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keyup', handleKeyUp, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [switchImage, isPdfFileMode, switchPdfPage]);

  // 全局拖拽事件绑定（确保拖拽不受容器边界影响）
  useEffect(() => {
    if (!(isDragging && isWindowLocked && isSpacePressed)) return;

    const handleDocMouseMove = (e: MouseEvent) => {
      const newX = dragStart.posX + (e.clientX - dragStart.pointerX);
      const newY = dragStart.posY + (e.clientY - dragStart.pointerY);
      setPosition({ x: newX, y: newY });
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDocMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleDocMouseMove, true);
    document.addEventListener('mouseup', handleDocMouseUp, true);

    return () => {
      document.removeEventListener('mousemove', handleDocMouseMove, true);
      document.removeEventListener('mouseup', handleDocMouseUp, true);
    };
  }, [isDragging, isWindowLocked, isSpacePressed, dragStart]);

  // 初始化屏幕尺寸
  useEffect(() => {
    getScreenSize();
  }, [getScreenSize]);

  // 暴露空方法给父组件（图片模式不需要这些控制）
  useEffect(() => {
    if (externalPlayPause) externalPlayPause.current = () => {};
    if (externalVolumeUp) externalVolumeUp.current = () => {};
    if (externalVolumeDown) externalVolumeDown.current = () => {};
    if (externalMute) externalMute.current = () => {};
    if (externalSeekForward) externalSeekForward.current = () => {
      switchImage('next');
    };
    if (externalSeekBackward) externalSeekBackward.current = () => {
      switchImage('prev');
    };
    if (externalSeekTo) externalSeekTo.current = () => {};
  }, [switchImage]);

  useEffect(() => {
    if (!isWindowLocked) {
      setPosition({ x: 0, y: 0 });
    } else {
      const info = imageInfoRef.current;
      if (info) {
        resetImageToFitWindow(info.naturalWidth, info.naturalHeight);
      }
    }
  }, [isWindowLocked, resetImageToFitWindow]);

  // 计算图片样式 - 以图片中心为基准点缩放
  const getImageStyle = (): React.CSSProperties => {
    if (!imageInfo) {
      // 未加载完成时，使用静态居中样式，避免绝对定位在未知尺寸下把图片挪出视口
      return {
        display: 'block',
        objectFit: 'contain',
        maxWidth: '100%',
        maxHeight: '100%',
        margin: '0 auto'
      };
    }

    const scaledWidth = imageInfo.naturalWidth * scale;
    const scaledHeight = imageInfo.naturalHeight * scale;
    // 直接使用位置偏移，transformOrigin确保缩放以中心为基准点
    const translateX = position.x;
    const translateY = position.y;

    return {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      // 关键：覆盖 Tailwind/浏览器默认的 img 最大尺寸限制，允许图片超过容器
      maxWidth: 'none',
      maxHeight: 'none',
      transform: `translate(${translateX}px, ${translateY}px)`,
      transformOrigin: 'center center',
      position: 'absolute',
      left: '50%',
      top: '50%',
      marginLeft: `-${scaledWidth / 2}px`,
      marginTop: `-${scaledHeight / 2}px`,
      transition: isDragging ? 'none' : 'transform 0.15s ease',
      objectFit: 'contain',
      display: 'block',
      cursor: isWindowLocked && isSpacePressed ? (isDragging ? 'grabbing' : 'grab') : 'default'
    };
  };

  // 计算容器样式 - 优化居中布局
  const getContainerStyle = (): React.CSSProperties => {
    return {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: isWindowLockedRef.current ? 'hidden' : 'visible',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    };
  };

  return (
    <div 
      ref={containerRef}
      className="relative bg-white select-none"
      data-prevent-drag={isWindowLocked && isSpacePressed ? '' : undefined}

      style={getContainerStyle()}
      onClick={handleContainerClick}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >

      {activeSrc ? (
        <img
          ref={imageRef}
          src={activeSrc}
          alt={fileName || '图片'}
          style={getImageStyle()}
          onLoad={handleImageLoad}
          onError={handleInitialImageError}
          className="select-none"
          draggable={false}
        />
      ) : null}

      {/* 状态/尺寸/索引文本已移除 */}

      {/* 边缘点击区域指示（可点击切换） */}
      <div
        className="absolute inset-y-0 left-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto"
        data-prevent-drag=""
        onClick={(e) => {
          e.stopPropagation();
          switchImage('prev');
        }}
      />
      <div
        className="absolute inset-y-0 right-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto"
        data-prevent-drag=""
        onClick={(e) => {
          e.stopPropagation();
          switchImage('next');
        }}
      />

      {/* HEIC 解码中提示：解码耗时较长，给用户反馈 */}
      {isHeicDecoding && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <div className="bg-black/70 text-white px-4 py-2 rounded-lg flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-sm">正在解码 HEIC 图片...</span>
          </div>
        </div>
      )}

      {/* 操作提示：仅在鼠标停留底部20%区域时显示 */}
      {hintVisible && (
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-white/80 text-xs z-10 bg-black/70 px-3 py-1 rounded">
          {isWindowLocked 
            ? '双击解锁窗口 | 空格+拖拽移动图片 | 滚轮缩放' 
            : '双击锁定窗口 | 滚轮缩放窗口 | 点击边缘切换图片'}
        </div>
      )}
    </div>
  );
};

export default ImageViewer;
