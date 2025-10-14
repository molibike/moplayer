import React, { useState, useRef, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

interface ImageViewerProps {
  src: string;
  fileName?: string;
  filePath?: string;
  onStateChange: (state: {
    isPlaying?: boolean;
    currentTime?: number;
    duration?: number;
    volume?: number;
  }) => void;
  onError?: (error: string) => void;
  onEnded?: () => void;
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
  onStateChange,
  onError,
  onEnded,
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
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [screenSize, setScreenSize] = useState({ width: 1920, height: 1080 });
  const windowRef = useRef<ReturnType<typeof getCurrentWindow> | null>(null);
  const imageInfoRef = useRef<ImageInfo | null>(null);
  const isWindowLockedRef = useRef(false);
  const scaleRef = useRef(1);
  const windowSizeRef = useRef<{ width: number; height: number } | null>(null);
  const lockedWindowSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    imageInfoRef.current = imageInfo;
  }, [imageInfo]);

  useEffect(() => {
    isWindowLockedRef.current = isWindowLocked;
  }, [isWindowLocked]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    if (filePath) {
      setCurrentFilePath(filePath);
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
      if ((window as any).__TAURI__) {
        const [width, height] = await invoke<[number, number]>('get_screen_size');
        setScreenSize({ width, height });
        return;
      }
    } catch (error) {
      console.error('获取屏幕尺寸失败:', error);
    }

    setScreenSize({ 
      width: window.screen.availWidth || 1920, 
      height: window.screen.availHeight || 1080 
    });
  }, []);

  // 获取同目录下的图片列表
  const loadImageList = useCallback(async (filePath: string) => {
    try {
      console.log('调用Tauri API获取目录图片列表，路径:', filePath);
      
      if (typeof window !== 'undefined' && (window as any).__TAURI__) {
        const list = await invoke<string[]>('list_images_in_dir', { filePath });
        console.log('Tauri API返回图片列表:', list);
        setImageList(list);
        
        // 找到当前图片在列表中的索引
        const index = list.indexOf(filePath);
        console.log('当前图片索引:', index, '文件路径:', filePath);
        setCurrentImageIndex(index >= 0 ? index : 0);
        
        console.log('加载图片列表成功:', list.length, '张图片');
      } else {
        setImageList([]);
        setCurrentImageIndex(-1);
      }
    } catch (error) {
      console.error('加载图片列表失败:', error);
      setImageList([]);
      setCurrentImageIndex(-1);
    }
  }, []);

  const getActiveWindowSize = useCallback(() => {
    return lockedWindowSizeRef.current ?? windowSizeRef.current;
  }, []);

  const calculateFitScale = useCallback((naturalWidth: number, naturalHeight: number) => {
    const activeSize = getActiveWindowSize();
    if (!activeSize || !naturalWidth || !naturalHeight) {
      return 1;
    }

    const widthRatio = activeSize.width / naturalWidth;
    const heightRatio = activeSize.height / naturalHeight;
    const scaleToFit = Math.min(widthRatio, heightRatio, 1);
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleToFit));
  }, [getActiveWindowSize]);

  const resetImageToFitWindow = useCallback((naturalWidth: number, naturalHeight: number) => {
    const fitScale = calculateFitScale(naturalWidth, naturalHeight);
    setScale(fitScale);
    scaleRef.current = fitScale;
    setPosition({ x: 0, y: 0 });
  }, [calculateFitScale]);

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

  const getBaseOffset = useCallback((scaleValue: number) => {
    if (!imageInfoRef.current) {
      return { x: 0, y: 0 };
    }
    const { width: containerWidth, height: containerHeight } = getContainerDimensions();
    const scaledWidth = imageInfoRef.current.naturalWidth * scaleValue;
    const scaledHeight = imageInfoRef.current.naturalHeight * scaleValue;
    const baseX = (containerWidth - scaledWidth) / 2;
    const baseY = (containerHeight - scaledHeight) / 2;
    return { x: baseX, y: baseY };
  }, [getContainerDimensions]);

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
    } catch (error) {
      console.error('调整窗口大小失败:', error);
    }
  }, [screenSize]);

  // ... rest of the code remains the same ...
  // 图片加载完成处理
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

    resetImageToFitWindow(naturalWidth, naturalHeight);

    const inferredPath = (() => {
      if (filePath && filePath.length > 0) return filePath;
      if (currentFilePath) return currentFilePath;
      if (src.startsWith('file://')) {
        return src.substring(7);
      }
      return null;
    })();

    if (inferredPath) {
      setCurrentFilePath(inferredPath);
      console.log('开始加载同目录图片列表，文件路径:', inferredPath);
      loadImageList(inferredPath);
    } else {
      console.log('未能确定图片文件路径，无法加载同目录图片列表');
      setImageList([]);
      setCurrentImageIndex(-1);
    }
    
    console.log('图片加载完成:', fileName, '尺寸:', naturalWidth, '×', naturalHeight);
  };

  // 切换图片
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
      
      // 重置状态
      setScale(1);
      scaleRef.current = 1;
      setPosition({ x: 0, y: 0 });
      setCurrentImageIndex(newIndex);
      setCurrentFilePath(newImagePath);
      
      // 创建新的图片URL并更新
      try {
        // 读取新图片文件
        const response = await fetch(`file://${newImagePath}`);
        const blob = await response.blob();
        const newUrl = URL.createObjectURL(blob);
        
        // 更新图片源
        const img = imageRef.current;
        if (img) {
          // 清理旧的blob URL
          if (src.startsWith('blob:')) {
            URL.revokeObjectURL(src);
          }
          
          img.src = newUrl;
        }
        
        // 通知父组件图片已切换
        if (onStateChange) {
          onStateChange({ 
            isPlaying: false,
            currentTime: 0,
            duration: 0
          });
        }
      } catch (error) {
        console.error('切换图片失败:', error);
        onError?.('切换图片失败');
      }
    }
  }, [currentImageIndex, imageList, src, onStateChange, onError]);

  // 缩放图片
  const zoomImage = useCallback((zoomFactor: number, clientX?: number, clientY?: number) => {
    if (!imageInfo) return;

    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));

    if (newScale === scale) return;

    setScale(newScale);

    if (!isWindowLockedRef.current) {
      setPosition({ x: 0, y: 0 });
      adjustWindowSize(newScale);
      return;
    }

    if (!containerRef.current || !clientX || !clientY) {
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;

    const baseBefore = getBaseOffset(scale);
    const baseAfter = getBaseOffset(newScale);

    const translateBeforeX = baseBefore.x + position.x;
    const translateBeforeY = baseBefore.y + position.y;

    const imageCoordX = (pointerX - translateBeforeX) / scale;
    const imageCoordY = (pointerY - translateBeforeY) / scale;

    const translateAfterX = pointerX - imageCoordX * newScale;
    const translateAfterY = pointerY - imageCoordY * newScale;

    const newPosX = translateAfterX - baseAfter.x;
    const newPosY = translateAfterY - baseAfter.y;

    setPosition({ x: newPosX, y: newPosY });
  }, [imageInfo, scale, adjustWindowSize, position, getBaseOffset]);

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    console.log('检测到滚轮缩放', { deltaY: e.deltaY, zoomFactor });
    zoomImage(zoomFactor, e.clientX, e.clientY);
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
    }
  }, [isWindowLocked, isSpacePressed, position]);

  // 鼠标移动事件
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && isWindowLocked && isSpacePressed) {
      // 拖拽图片
      setPosition({
        x: dragStart.posX + (e.clientX - dragStart.pointerX),
        y: dragStart.posY + (e.clientY - dragStart.pointerY)
      });
    }
  }, [isDragging, isWindowLocked, isSpacePressed, dragStart]);

  // 鼠标释放事件
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

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

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(true);
        e.preventDefault();
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
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [switchImage]);

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

  // 计算图片样式
  const getImageStyle = (): React.CSSProperties => {
    if (!imageInfo) {
      return {
        display: 'block',
        objectFit: 'contain'
      };
    }

    const scaledWidth = imageInfo.naturalWidth * scale;
    const scaledHeight = imageInfo.naturalHeight * scale;
    const baseOffset = getBaseOffset(scale);
    const translateX = (isWindowLocked ? position.x : 0) + baseOffset.x;
    const translateY = (isWindowLocked ? position.y : 0) + baseOffset.y;

    return {
      width: `${scaledWidth}px`,
      height: `${scaledHeight}px`,
      transform: `translate(${translateX}px, ${translateY}px)`,
      transformOrigin: 'top left',
      position: 'absolute',
      left: 0,
      top: 0,
      transition: isDragging ? 'none' : 'transform 0.1s ease',
      objectFit: 'contain',
      display: 'block',
      cursor: isWindowLocked && isSpacePressed ? (isDragging ? 'grabbing' : 'grab') : 'default'
    };
  };

  // 计算容器样式
  const getContainerStyle = (): React.CSSProperties => {
    if (!imageInfo) {
      return {
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      };
    }

    return {
      position: 'relative',
      width: '100%',
      height: '100%',
      overflow: isWindowLockedRef.current ? 'hidden' : 'visible',
      userSelect: 'none'
    };
  };

  return (
    <div 
      ref={containerRef}
      className="relative bg-black select-none"

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
        src={src}
        alt={fileName || '图片'}
        style={getImageStyle()}
        onLoad={handleImageLoad}
        onError={() => onError?.('图片加载失败')}
        className="select-none"
        draggable={false}
      />

      {/* 状态指示器 */}
      <div className="absolute top-4 left-4 bg-black/70 text-white px-3 py-1 rounded text-sm z-10">
        {isWindowLocked ? '🔒 窗口锁定' : '🔓 窗口自由'}
        {isSpacePressed && ' + 拖拽模式'}
      </div>

      {/* 图片信息 */}
      {imageInfo && (
        <div className="absolute top-4 right-4 bg-black/70 text-white px-3 py-1 rounded text-sm z-10">
          {Math.round(scale * 100)}% | {imageInfo.naturalWidth}×{imageInfo.naturalHeight}
        </div>
      )}

      {/* 导航指示器 */}
      {imageList.length > 0 && currentImageIndex >= 0 && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/70 text-white px-3 py-1 rounded text-sm z-10">
          {currentImageIndex + 1} / {imageList.length}
        </div>
      )}

      {/* 边缘点击区域指示 */}
      <div className="absolute inset-y-0 left-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto" />
      <div className="absolute inset-y-0 right-0 w-[10%] opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5 pointer-events-auto" />

      {/* 操作提示 */}
      <div className="absolute bottom-2 left-2 text-white/60 text-xs z-10">
        {isWindowLocked 
          ? '双击解锁窗口 | 空格+拖拽移动图片 | 滚轮缩放' 
          : '双击锁定窗口 | 滚轮缩放窗口 | 点击边缘切换图片'
        }
      </div>
    </div>
  );
};

export default ImageViewer;