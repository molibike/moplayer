import React, { useState, useEffect } from 'react';

interface VinylPlayerButtonsProps {
  middleButtonRef: React.RefObject<HTMLDivElement>;
}

const VinylPlayerButtons: React.FC<VinylPlayerButtonsProps> = ({ middleButtonRef }) => {
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 计算唱片直径和按钮尺寸
  // 唱机区宽度 = 程序窗口总宽度的38%
  // 唱片直径 = 唱机区宽度的80% = 程序窗口总宽度的30.4%
  // 按钮尺寸 = 唱片直径的20% = 程序窗口总宽度的6.08%
  const buttonSize = windowSize.width * 0.0608; // 程序窗口总宽度的6.08%
  const buttonSpacing = windowSize.width * 0.0608; // 间距等于按钮尺寸

  return (
    <div 
      className="flex justify-center items-center relative" 
      style={{ 
        height: `${buttonSize + 30}px`, 
        marginTop: '30px',
        gap: `${buttonSpacing}px`
      }}
    >
      <div 
        className="bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors"
        style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }}
      >
        <div 
          className="bg-gray-400 rounded-sm"
          style={{ width: `${buttonSize * 0.5}px`, height: `${buttonSize * 0.5}px` }}
        ></div>
      </div>
      
      <div 
        ref={middleButtonRef}
        className="bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors relative"
        style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }}
      >
        <div 
          className="bg-green-400 rounded-sm"
          style={{ width: `${buttonSize * 0.5}px`, height: `${buttonSize * 0.5}px` }}
        ></div>
        {/* 连接点 */}
        <div 
          className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-1/2 bg-gray-300 rounded-full border border-gray-500"
          style={{ width: `${buttonSize * 0.167}px`, height: `${buttonSize * 0.167}px` }}
        ></div>
      </div>
      
      <div 
        className="bg-gray-700 border-2 border-gray-500 rounded-lg flex items-center justify-center cursor-pointer hover:bg-gray-600 transition-colors"
        style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }}
      >
        <div 
          className="bg-gray-400 rounded-sm"
          style={{ width: `${buttonSize * 0.5}px`, height: `${buttonSize * 0.5}px` }}
        ></div>
      </div>
    </div>
  );
};

export default React.memo(VinylPlayerButtons);