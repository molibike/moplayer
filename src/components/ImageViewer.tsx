import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ImageViewerProps {
  src: string;
  fileName?: string;
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
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isWindowLocked, setIsWindowLocked] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [imageList, setImageList] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(-1);
  const [isImageDragging, setIsImageDragging] = useState(false);
  const [windowDragStart, setWindowDragStart] = useState({ x: 0, y: 0 });

  // 图片缩放限制
  const MIN_SCALE = 0.05;  // 最小缩放5%
  const MAX_SCALE = 10;    // 最大缩放10倍

  // 获取同目录下的图片列表
  const loadImageList = useCallback(async (filePath: string) => {
    try {
      console.log('调用Tauri API获取目录图片列表，路径:', filePath);
      
      // 使用全局Tauri API调用
      const list: string[] = await (window as any).__TAURI_INVOKE__('list_images_in_dir', { filePath });
      console.log('Tauri API返回图片列表:', list);
      setImageList(list);
      
      // 找到当前图片在列表中的索引
      const index = list.indexOf(filePath);
      console.log('当前图片索引:', index, '文件路径:', filePath);
      setCurrentImageIndex(index >= 0 ? index : 0);
      
      console.log('加载图片列表成功:', list.length, '张图片');
    } catch (error) {
      console.error('加载图片列表失败:', error);
      setImageList([]);
      setCurrentImageIndex(-1);
    }
  }, []);

  // 图片加载完成处理
  const handleImageLoad = () => {
    const img = imageRef.current;
    if (!img) return;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const displayWidth = img.width;
    const displayHeight = img.height;

    setImageInfo({
      width: displayWidth,
      height: displayHeight,
      naturalWidth,
      naturalHeight
    });

    // 重置缩放和位置
    setScale(1);
    setPosition({ x: 0, y: 0 });

    // 加载同目录图片列表
    if (src.startsWith('file://')) {
      const filePath = src.substring(7); // 移除 file:// 前缀
      console.log('开始加载同目录图片列表，文件路径:', filePath);
      loadImageList(filePath);
    } else {
      // 非文件协议，设置空列表
      console.log('非文件协议，不加载图片列表');
      setImageList([]);
      setCurrentImageIndex(-1);
    }
    
    console.log('图片加载完成:', fileName, '尺寸:', naturalWidth, '×', naturalHeight);
  };

  // 切换图片
  const switchImage = (direction: 'prev' | 'next') => {
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
      setPosition({ x: 0, y: 0 });
      setCurrentImageIndex(newIndex);
      
      // 直接更新图片源
      const img = imageRef.current;
      if (img) {
        img.src = `file://${newImagePath}`;
      }
      
      // 通知父组件图片已切换
      if (onStateChange) {
        onStateChange({ 
          isPlaying: false,
          currentTime: 0,
          duration: 0
        });
      }
    }
  };

  // 缩放图片
  const zoomImage = (zoomFactor: number, clientX?: number, clientY?: number) => {
    if (!imageInfo) return;

    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));
    
    if (newScale === scale) return; // 缩放达到极限

    // 计算缩放中心点
    if (clientX && clientY && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = clientX - rect.left;
      const centerY = clientY - rect.top;

      // 计算缩放前后的位置偏移
      const scaleRatio = newScale / scale;
      const newX = centerX - (centerX - position.x) * scaleRatio;
      const newY = centerY - (centerY - position.y) * scaleRatio;

      setScale(newScale);
      setPosition({ x: newX, y: newY });
    } else {
      setScale(newScale);
    }
  };

  // 鼠标滚轮缩放
  const handleWheel = async (e: React.WheelEvent) => {
    if (e.cancelable) {
      e.preventDefault();
    }
    
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * zoomFactor));
    
    if (newScale === scale) return;
    
    setScale(newScale);
    
    // 窗口未锁定状态下，调整窗口大小以适应图片
    if (!isWindowLocked && imageInfo) {
      // 计算新的窗口尺寸（包含窗口边框和标题栏的额外空间）
      const windowExtra = 40; // 窗口边框和标题栏的额外高度
      const newWidth = Math.round(imageInfo.naturalWidth * newScale);
      const newHeight = Math.round(imageInfo.naturalHeight * newScale) + windowExtra;
      
      // 窗口缩放限制
      const MIN_WINDOW_SIZE = 200;
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      
      const finalWidth = Math.max(MIN_WINDOW_SIZE, Math.min(screenWidth, newWidth));
      const finalHeight = Math.max(MIN_WINDOW_SIZE, Math.min(screenHeight, newHeight));
      
      try {
        // 使用全局Tauri API调用
        await (window as any).__TAURI_INVOKE__('set_window_size', { 
          width: finalWidth, 
          height: finalHeight 
        });
        console.log('调整窗口大小:', finalWidth, '×', finalHeight, '缩放比例:', newScale);
      } catch (error) {
        console.error('调整窗口大小失败:', error);
      }
    }
  };

  // 鼠标按下事件
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isWindowLocked) {
      // 窗口锁定状态下，直接拖拽图片
      setIsImageDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
      e.preventDefault();
    } else {
      // 窗口未锁定状态下，拖拽整个窗口（由Tauri处理）
      // 这里不需要特殊处理，Tauri会自动处理窗口拖拽
    }
  };

  // 鼠标移动事件
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isImageDragging && isWindowLocked) {
      // 拖拽图片
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  // 鼠标释放事件
  const handleMouseUp = () => {
    setIsDragging(false);
    setIsImageDragging(false);
  };

  // 双击锁定/解锁窗口
  const handleDoubleClick = () => {
    setIsWindowLocked(!isWindowLocked);
    // 重置图片位置
    setPosition({ x: 0, y: 0 });
  };

  // 容器点击事件（边缘切换图片）
  const handleContainerClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const width = rect.width;
    const height = rect.height;

    // 检查是否点击在左右边缘10%区域
    const edgeThreshold = 0.1;
    const isLeftEdge = clickX < width * edgeThreshold;
    const isRightEdge = clickX > width * (1 - edgeThreshold);

    if (isLeftEdge) {
      switchImage('prev');
    } else if (isRightEdge) {
      switchImage('next');
    }
  };

  // 键盘事件处理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft') {
        switchImage('prev');
        e.preventDefault();
      } else if (e.code === 'ArrowRight') {
        switchImage('next');
        e.preventDefault();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [currentImageIndex, imageList]);

  // 暴露空方法给父组件（图片模式不需要这些控制）
  useEffect(() => {
    if (externalPlayPause) externalPlayPause.current = () => {};
    if (externalVolumeUp) externalVolumeUp.current = () => {};
    if (externalVolumeDown) externalVolumeDown.current = () => {};
    if (externalMute) externalMute.current = () => {};
    if (externalSeekForward) externalSeekForward.current = () => {};
    if (externalSeekBackward) externalSeekBackward.current = () => {};
    if (externalSeekTo) externalSeekTo.current = () => {};
  }, []);

  // 计算图片样式
  const getImageStyle = (): React.CSSProperties => {
    const transform = `scale(${scale}) translate(${position.x}px, ${position.y}px)`;
    
    return {
      transform,
      transformOrigin: 'center center',
      transition: isImageDragging ? 'none' : 'transform 0.1s ease',
      maxWidth: '100%',
      maxHeight: '100%',
      objectFit: 'contain',
      cursor: isWindowLocked && isSpacePressed ? 'grab' : isImageDragging ? 'grabbing' : 'default'
    };
  };

  // 计算容器样式
  const getContainerStyle = (): React.CSSProperties => {
    return {
      cursor: isDragging ? 'grabbing' : 'default',
      overflow: 'hidden',
      userSelect: 'none'
    };
  };

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full bg-black flex items-center justify-center"
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
      <div className="absolute inset-y-0 left-0 w-1/10 opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5" />
      <div className="absolute inset-y-0 right-0 w-1/10 opacity-0 hover:opacity-20 bg-blue-500/30 transition-opacity z-5" />

      {/* 操作提示 */}
      <div className="absolute bottom-2 left-2 text-white/60 text-xs z-10">
        {isWindowLocked ? '双击解锁窗口 | 拖拽移动图片' : '双击锁定窗口'}
      </div>
    </div>
  );
};

export default ImageViewer;