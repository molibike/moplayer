import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface VinylPlayerProps {
  isPlaying: boolean;
  coverImage?: string;
  buttonElement?: HTMLDivElement | null;
}

const VinylPlayer: React.FC<VinylPlayerProps> = ({ 
  isPlaying, 
  coverImage,
  buttonElement,
}) => {
  const [rotation, setRotation] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const diskRef = useRef<HTMLDivElement>(null);
  const [geom, setGeom] = useState<{
    angleDeg: number;
    seg1: { x: number; y: number; len: number };
    seg2: { x: number; y: number; len: number };
    joint: { x: number; y: number };
    stylus: { x: number; y: number };
  }>({ angleDeg: 0, seg1: { x: 0, y: 0, len: 0 }, seg2: { x: 0, y: 0, len: 0 }, joint: { x: 0, y: 0 }, stylus: { x: 0, y: 0 } });

  // 旋转动画效果
  useEffect(() => {
    let animationFrame: number;
    
    const animate = () => {
      if (isPlaying) {
        setRotation(prev => (prev + 0.5) % 360);
      }
      animationFrame = requestAnimationFrame(animate);
    };
    
    animationFrame = requestAnimationFrame(animate);
    
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying]);

  // 默认封面图片（如果没有提供封面）
  const defaultCover = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cdefs%3E%3CradialGradient id='vinyl' cx='50%25' cy='50%25' r='50%25'%3E%3Cstop offset='0%25' style='stop-color:%23333;stop-opacity:1' /%3E%3Cstop offset='30%25' style='stop-color:%23222;stop-opacity:1' /%3E%3Cstop offset='70%25' style='stop-color:%23111;stop-opacity:1' /%3E%3Cstop offset='100%25' style='stop-color:%23000;stop-opacity:1' /%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='100' cy='100' r='100' fill='url(%23vinyl)'/%3E%3Ccircle cx='100' cy='100' r='15' fill='%23333'/%3E%3Ctext x='100' y='105' text-anchor='middle' fill='%23666' font-size='12' font-family='Arial'%3E♪%3C/text%3E%3C/svg%3E";

  // 计算几何坐标：按钮中心 -> 关节 -> 唱针
  useLayoutEffect(() => {
    const compute = () => {
      if (!diskRef.current || !buttonElement) return;
      const dr = diskRef.current.getBoundingClientRect();
      const br = buttonElement.getBoundingClientRect();

      // 使用视口坐标，避免跨容器导致负偏移错位
      const bx = br.left + br.width / 2;
      const by = br.top + br.height / 2;

      const cx = dr.left + dr.width / 2;
      const cy = dr.top + dr.height / 2;
      const R = dr.width / 2;
      const targetR = R * 0.7; // 半径的70%（从中心向右偏移）

      // 唱针位置：中心向右偏移 targetR（视口坐标）
      const sx = cx + targetR;
      const sy = cy;

      // 关节位置：位于唱片外部（唱片上边界之上），保持与唱针同一竖直线
      const jointMargin = 10; // 外边距
      const jx = sx;
      const jy = dr.top - jointMargin;

      // 第一段（按钮→关节）角度与长度
      const dx1 = jx - bx;
      const dy1 = jy - by;
      const angle1 = Math.atan2(dy1, dx1);
      const jointRadius = 8; // 关节半径（直径16）
      const stylusRadius = 6; // 唱针点半径（直径12）
      const seg1Len = Math.max(Math.hypot(dx1, dy1) - jointRadius, 0);
      // 第二段（关节→唱针）保持竖直方向：长度为垂直距离减去唱针半径
      const seg2Len = Math.max(sy - jy - stylusRadius, 0);
      setGeom({
        angleDeg: (angle1 * 180) / Math.PI,
        seg1: { x: bx, y: by, len: seg1Len },
        seg2: { x: jx, y: jy, len: seg2Len },
        joint: { x: jx, y: jy },
        stylus: { x: sx, y: sy },
      });
    };

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [buttonElement]);

  return (
    <div className="flex items-end justify-center w-full h-full p-4">
      {/* 唱片机底座 */}
      <div ref={containerRef} className="relative" style={{ width: '80%', aspectRatio: '1' }}>
        {/* 唱片机外框 */}
        <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 rounded-full shadow-2xl border-4 border-gray-700 flex items-center justify-center">
          {/* 唱片（整面平铺封面） */}
          <div 
            ref={diskRef}
            className="rounded-full relative overflow-hidden shadow-inner"
            style={{
              width: '90%',
              height: '90%',
              transform: `rotate(${rotation}deg)`,
              transition: isPlaying ? 'none' : 'transform 0.5s ease-out',
              backgroundImage: `url(${coverImage || defaultCover})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            {/* 中心孔 */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-gray-800 rounded-full border-2 border-gray-600 shadow-inner" />
          </div>
        </div>
        
        {/* 播放手柄：两节连接杆设计，从按钮连接点连接到唱片边缘 */}
        {/* 第一段连接杆：从按钮几何中心到关节 */}
        <div 
          className="bg-gradient-to-b from-gray-500 to-gray-700 shadow-lg"
          style={{
            position: 'fixed',
            top: `${geom.seg1.y}px`,
            left: `${geom.seg1.x}px`,
            width: '8px',
            height: `${geom.seg1.len}px`,
            transformOrigin: '50% 0%',
            transform: `translateX(-50%) rotate(${geom.angleDeg - 90}deg)`,
            transition: 'transform 0.2s ease-out',
            borderRadius: '4px 4px 2px 2px'
          }}
        />
        
        {/* 连接关节：两段连接杆的连接点，实时连接 */}
        <div 
          className="bg-gray-600 border-2 border-gray-500 rounded-full shadow-md"
          style={{
            position: 'fixed',
            top: `${geom.joint.y}px`,
            left: `${geom.joint.x}px`,
            width: '16px',
            height: '16px',
            transform: 'translate(-50%, -50%)',
            zIndex: 10
          }}
        />
        
        {/* 第二段连接杆：从关节到唱针位置（唱片半径的40%处） */}
        <div 
          className="bg-gradient-to-b from-gray-600 to-gray-800 shadow-lg"
          style={{
            position: 'fixed',
            top: `${geom.seg2.y}px`,
            left: `${geom.seg2.x}px`,
            width: '6px',
            height: `${geom.seg2.len}px`,
            transformOrigin: '50% 0%',
            transform: `translateX(-50%) rotate(0deg)`,
            transition: 'transform 0.2s ease-out',
            borderRadius: '3px 3px 1px 1px'
          }}
        />

        {/* 唱针：位于唱片半径的40%处 */}
        <div
          className="bg-gray-300 rounded-full shadow-sm"
          style={{
            position: 'fixed',
            top: `${geom.stylus.y}px`,
            left: `${geom.stylus.x}px`,
            width: '12px',
            height: '12px',
            transform: 'translate(-50%, -50%)'
          }}
        />
        
        {/* 播放状态指示灯 */}
        <div className="absolute" style={{ top: '5%', left: '5%' }}>
          <div 
            className={`rounded-full ${
              isPlaying 
                ? 'bg-green-400 shadow-green-400/50 animate-pulse' 
                : 'bg-red-400 shadow-red-400/50'
            } shadow-lg`}
            style={{ width: '12px', height: '12px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default VinylPlayer;