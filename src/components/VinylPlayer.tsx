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
  const containerRef = useRef<HTMLDivElement>(null);
  const diskRef = useRef<HTMLDivElement>(null);
  // JS旋转替代CSS动画：CSS animation会驱动合成器60fps，JS setInterval只在触发时合成
  const angleRef = useRef(0);
  const rotationTimerRef = useRef<number | null>(null);
  const [geom, setGeom] = useState<{
    angleDeg: number;
    seg1: { x: number; y: number; len: number };
    seg2: { x: number; y: number; len: number };
    joint: { x: number; y: number };
    stylus: { x: number; y: number };
  }>({ angleDeg: 0, seg1: { x: 0, y: 0, len: 0 }, seg2: { x: 0, y: 0, len: 0 }, joint: { x: 0, y: 0 }, stylus: { x: 0, y: 0 } });

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
      const targetR = R * 0.5; // 半径的50%（从中心向右偏移）

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

  // 使用setInterval替代CSS animation进行唱片旋转
  // CSS animation: spin 6s → 合成器60fps持续运行
  // setInterval 100ms → 仅10fps触发合成，减少83%合成器工作量
  useEffect(() => {
    if (isPlaying) {
      rotationTimerRef.current = window.setInterval(() => {
        // 6度/100ms = 60度/秒 = 6秒一圈（与原CSS动画一致）
        angleRef.current = (angleRef.current + 6) % 360;
        if (diskRef.current) {
          diskRef.current.style.transform = `rotate(${angleRef.current}deg)`;
        }
      }, 100);
    } else {
      if (rotationTimerRef.current !== null) {
        window.clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
    }

    return () => {
      if (rotationTimerRef.current !== null) {
        window.clearInterval(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
    };
  }, [isPlaying]);

  return (
    <div className="flex items-end justify-center w-full h-full p-4">
      {/* 唱片机底座 */}
      <div ref={containerRef} className="relative" style={{ width: '80%', aspectRatio: '1' }}>
        {/* 唱片机外框 */}
        <div className="w-full h-full bg-gray-850 rounded-full border-4 border-gray-700 flex items-center justify-center" style={{ backgroundColor: '#1a1a2e' }}>
          {/* 唱片 - 使用JS setInterval旋转替代CSS animation，降低合成器帧率 */}
          <div 
            ref={diskRef}
            className="rounded-full relative"
            style={{
              width: '90%',
              height: '90%',
              ...(coverImage ? {
                backgroundImage: `url(${coverImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              } : {
                background: 'radial-gradient(circle, #333 0%, #222 30%, #111 70%, #000 100%)'
              })
            }}
          >
            {/* 中心孔 */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-gray-800 rounded-full border-2 border-gray-600" />
            
            {/* 如果没有封面，显示音乐符号 */}
            {!coverImage && (
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-gray-600 text-4xl font-bold">
                ♪
              </div>
            )}
          </div>
        </div>
        
        {/* 播放手柄：两节连接杆设计，从按钮连接点连接到唱片边缘 */}
        {/* 第一段连接杆：从按钮几何中心到关节 */}
        <div 
          className="bg-gray-600"
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
          className="bg-gray-600 border-2 border-gray-500 rounded-full"
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
          className="bg-gray-700"
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
          className="bg-gray-300 rounded-full"
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
                ? 'bg-green-400' 
                : 'bg-red-400'
            }`}
            style={{ width: '12px', height: '12px' }}
          />
        </div>
      </div>
    </div>
  );
};

export default React.memo(VinylPlayer);
