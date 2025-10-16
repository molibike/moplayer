import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize, LogicalPosition } from '@tauri-apps/api/window';
import { readFile } from '@tauri-apps/plugin-fs';

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
  const [activeSrc, setActiveSrc] = useState<string>(src);
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
  // 操作提示显示控制：鼠标在底部20%区域停留时显示
  const [hintVisible, setHintVisible] = useState(false);
  const hintTimerRef = useRef<number | null>(null);

  useEffect(() => {
    imageInfoRef.current = imageInfo;
  }, [imageInfo]);

  useEffect(() => {
    isWindowLockedRef.current = isWindowLocked;
  }, [isWindowLocked]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // 外部传入的 src 变化时，同步到内部显示源
  useEffect(() => {
    setActiveSrc(src || '');
  }, [src]);

  // 释放旧的 blob URL，避免内存泄漏
  useEffect(() => {
    const prev = prevActiveSrcRef.current;
    if (prev && prev.startsWith('blob:') && prev !== activeSrc) {
      try { URL.revokeObjectURL(prev); } catch {}
    }
    prevActiveSrcRef.current = activeSrc;
  }, [activeSrc]);

  useEffect(() => {
    if (filePath) {
      const normalizedPath = filePath.replace(/\\/g, '/');
      setCurrentFilePath(normalizedPath);
      // 外部文件路径变更：重新加载目录图片列表（一次性）
      try {
        loadImageList(normalizedPath);
        listInitializedRef.current = true;
      } catch (e) {
        console.warn('根据新的 filePath 加载目录图片列表失败:', e);
      }
    }
  }, [filePath]);

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

    // 候选1：convertFileSrc（asset.localhost / asset 协议）
    try {
      const u = convertFileSrc(normalized);
      console.log('使用 convertFileSrc(core) 生成URL:', u);
      out.asset = u;
    } catch (e) {
      console.warn('convertFileSrc 不可用，跳过:', e);
    }

    // 候选2：FS 读取生成 blob（按需，可选，避免频繁磁盘IO导致切换卡顿）
    if (options?.includeBlob) {
      try {
        const bytes = await readFile(normalized);
        const ext = normalized.split('.').pop()?.toLowerCase() || '';
        const mimeMap: Record<string, string> = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml', ico: 'image/x-icon'
        };
        const mime = mimeMap[ext] || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mime });
        const u = URL.createObjectURL(blob);
        console.log('生成 blob URL 作为回退:', u);
        out.blob = u;
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
      if (currentFilePath) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath;
      if (src && src.startsWith('file://')) return src.substring(7);
      return null;
    })();

    if (!inferredPath) return;

    let mounted = true;
    (async () => {
      try {
        const candidates = await buildCandidateUrls(inferredPath, { includeBlob: false });
        const next = candidates.asset || candidates.blob || candidates.file || '';
        if (mounted && next) {
          setActiveSrc(next);
        }
      } catch (e) {
        console.warn('初始化 activeSrc 失败，保持静默:', e);
      }
    })();

    return () => { mounted = false; };
  }, [activeSrc, currentFilePath, filePath, src, buildCandidateUrls]);

  // 额外回退：当 activeSrc 为空且存在 fileBlob 时，直接使用 fileBlob 生成的 blob URL
  useEffect(() => {
    const needInit = !activeSrc || activeSrc.length === 0;
    if (!needInit || !fileBlob) return;
    try {
      const u = URL.createObjectURL(fileBlob);
      setActiveSrc(u);
      console.log('根据 fileBlob 生成 blob URL 作为回退');
    } catch (e) {
      console.warn('根据 fileBlob 生成 blob URL 失败:', e);
    }
  }, [activeSrc, fileBlob]);

  // 获取同目录下的图片列表
  const loadImageList = useCallback(async (filePath: string) => {
    try {
      console.log('=== 开始加载图片列表 ===');
      console.log('文件路径:', filePath);
      console.log('环境判定（使用窗口实例）:', !!windowRef.current);

      // 直接调用 Tauri 后端，失败时按非 Tauri 环境处理
      const list = await invoke<string[]>('list_images_in_dir', { filePath });
      console.log('Tauri 后端返回:');
      console.log('- 图片数量:', list.length);
      console.log('- 图片列表:', list);

      setImageList(list);

      // 找到当前图片在列表中的索引
      const index = list.indexOf(filePath);
      console.log('- 当前图片索引:', index);
      console.log('- 查找的文件路径:', filePath);
      setCurrentImageIndex(index >= 0 ? index : 0);

      console.log('=== 图片列表加载完成 ===');
    } catch (error) {
      console.error('=== 加载图片列表失败（可能非 Tauri 环境）===');
      console.error('错误详情:', error);
      // 在非 Tauri 环境下至少保留当前文件作为唯一项，避免列表被错误清空
      setImageList(filePath ? [filePath] : []);
      setCurrentImageIndex(0);
    }
  }, []);



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

  // ... rest of the code remains the same ...
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
      if (currentFilePath) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath;
      if (src.startsWith('file://')) {
        return src.substring(7);
      }
      return null;
    })();

    // 仅在首次或外部文件变更后第一次加载时初始化目录列表
    if (!listInitializedRef.current && inferredPath) {
      const normalizedPath = inferredPath.replace(/\\/g, '/');
      setCurrentFilePath(normalizedPath);
      console.log('初次加载同目录图片列表，文件路径:', normalizedPath);
      loadImageList(normalizedPath);
      listInitializedRef.current = true;
    }
    
    console.log('图片加载完成:', fileName, '尺寸:', naturalWidth, '×', naturalHeight);

    // 加载成功后清理可能残留的错误提示
    if (onError) {
      onError('');
    }
  };

  // 切换图片 - 修复切换逻辑（提前声明以避免 TDZ）
  const switchImage = useCallback(async (direction: 'prev' | 'next') => {
    if (imageList.length === 0 || currentImageIndex < 0) {
      console.log('没有可切换的图片');
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
      
      // 更新索引和路径
      setCurrentImageIndex(newIndex);
      setCurrentFilePath(newImagePath);
      
      // 创建新的图片URL并更新（带失败回退），仅通过状态更新 src，避免直接改 DOM
      try {
        const candidates = await buildCandidateUrls(newImagePath, { includeBlob: false });
        // 清理旧的 blob URL（由 activeSrc 统一管理）
        if (activeSrc.startsWith('blob:')) {
          try { URL.revokeObjectURL(activeSrc); } catch {}
        }

        setImageInfo(null);
        const nextSrc = candidates.asset || candidates.blob || candidates.file || '';
        setActiveSrc(nextSrc);

        // 通知父组件图片已切换
        if (onStateChange) {
          onStateChange({ 
            isPlaying: false,
            currentTime: 0,
            duration: 0
          });
        }

        // 预加载相邻图片以优化下一次切换速度（仅做 asset 级预加载，避免IO）
        try {
          const preloadIndexNext = (newIndex + 1) % imageList.length;
          const preloadIndexPrev = (newIndex - 1 + imageList.length) % imageList.length;
          const preloadPaths = [imageList[preloadIndexNext], imageList[preloadIndexPrev]].filter(Boolean) as string[];
          for (const p of preloadPaths) {
            const c = await buildCandidateUrls(p, { includeBlob: false });
            const u = c.asset || c.file;
            if (u) {
              const img = new Image();
              img.src = u;
            }
          }
        } catch (preErr) {
          console.warn('预加载相邻图片失败，忽略:', preErr);
        }
      } catch (error) {
        console.error('切换图片失败:', error);
        // 静默处理：不弹窗，直接切换到下一张；若只有一张则停止
        if (imageList.length > 1) {
          setTimeout(() => switchImage('next'), 0);
        } else {
          console.warn('仅有一张图片且切换失败，保持静默不弹窗');
        }
      }
    }
  }, [currentImageIndex, imageList, activeSrc, onStateChange]);

  // 初始加载失败时的回退处理（asset -> blob -> file）
  const handleInitialImageError = useCallback(async () => {
    const img = imageRef.current;
    if (!img) return;

    const inferredPath = (() => {
      if (currentFilePath) return currentFilePath;
      if (filePath && filePath.length > 0) return filePath;
      if (src && src.startsWith('file://')) return src.substring(7);
      return null;
    })();

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
      const candidates = await buildCandidateUrls(inferredPath, { includeBlob: true });
      const current = activeSrc;

      const trySet = (next?: string) => {
        if (!next || next === current) return false;
        setActiveSrc(next);
        return true;
      };

      // 依次尝试 asset -> blob -> file（跳过与当前src相同的项）
      if (trySet(candidates.asset)) {
        console.log('初始加载失败，回退到 asset URL');
        return;
      }
      if (trySet(candidates.blob)) {
        console.log('初始加载失败，回退到 blob URL');
        return;
      }
      if (trySet(candidates.file)) {
        console.log('初始加载失败，回退到 file:// URL');
        return;
      }

      const errorMessage = '图片加载失败，所有回退方式均不可用';
      console.error(errorMessage);
      // 静默策略：已有列表场景下尝试跳过到下一张；仅单张时保持静默
      if (imageList.length > 1 && currentImageIndex >= 0) {
        setTimeout(() => switchImage('next'), 0);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error('初始加载回退处理失败:', msg);
      if (imageList.length > 1 && currentImageIndex >= 0) {
        setTimeout(() => switchImage('next'), 0);
      }
    }
  }, [buildCandidateUrls, currentFilePath, filePath, activeSrc, imageList, currentImageIndex, switchImage, fileBlob]);

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

    // 基于滚轮幅度的指数缩放，提升缩小时的平滑度
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
  }, [switchImage]);

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
    if (externalSeekForward) externalSeekForward.current = () => switchImage('next');
    if (externalSeekBackward) externalSeekBackward.current = () => switchImage('prev');
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

      {/* 状态/尺寸/索引文本已移除 */}

      {/* 边缘点击区域指示（可点击切换） */}
      <div
        className="absolute inset-y-0 left-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto"
        onClick={() => switchImage('prev')}
      />
      <div
        className="absolute inset-y-0 right-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto"
        onClick={() => switchImage('next')}
      />

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