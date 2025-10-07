import React, { useState, useRef, useEffect } from 'react';

interface MenuBarProps {
  onOpenFile: () => void;
  onExit: () => void;
  isPlaying?: boolean;
}

interface MenuItem {
  label: string;
  action: () => void;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

const MenuBar: React.FC<MenuBarProps> = ({ onOpenFile, onExit: _onExit, isPlaying = false }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true); // 默认显示
  const menuRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout>();

  // 简化的菜单结构，打开菜单直接触发，帮助菜单保持下拉
  const menuItems = [
    {
      label: '打开',
      key: 'open',
      isDirectAction: true,
      action: onOpenFile
    },
    {
      label: '帮助',
      key: 'help',
      items: [
        { label: '支持格式', action: () => {
          alert('支持的视频格式：\n\n• MP4 (.mp4)\n• AVI (.avi)\n• MOV (.mov)\n• WMV (.wmv)\n• FLV (.flv)\n• MKV (.mkv)\n• WEBM (.webm)\n• OGV (.ogv)\n• 3GP (.3gp)\n• M4V (.m4v)\n\n支持的音频格式：\n\n• MP3 (.mp3)\n• WAV (.wav)\n• AAC (.aac)\n• OGG (.ogg)\n• FLAC (.flac)\n• M4A (.m4a)\n• WMA (.wma)');
        }},
        { separator: true },
        { label: '关于 MoPlayer', action: () => {
          alert('MoPlayer是一个多功能音视频播放器，当前版本：0.1.0');
        } },
      ] as MenuItem[]
    }
  ];

  // 菜单栏显示逻辑 - 初始窗口始终显示，仅视频播放时才能隐藏
  useEffect(() => {
    // 如果没有播放文件，菜单栏始终显示，不应用任何隐藏逻辑
    if (!isPlaying) {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      return;
    }

    // 只有在播放时才应用隐藏逻辑
    const handleMouseMove = () => {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      
      // 鼠标静止5秒后隐藏
      mouseMoveTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setActiveMenu(null);
      }, 5000);
    };

    const handleMouseLeave = () => {
      if (isPlaying) {
        setIsVisible(false);
        setActiveMenu(null);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  // 确保初始窗口下菜单栏始终显示，不受鼠标事件影响
  useEffect(() => {
    if (!isPlaying) {
      setIsVisible(true);
      // 清除所有隐藏定时器
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    }
  }, [isPlaying]);

  const handleMenuClick = (key: string) => {
    const menu = menuItems.find(m => m.key === key);
    if (menu && (menu as any).isDirectAction) {
      // 直接执行操作
      (menu as any).action();
    } else {
      // 切换下拉菜单
      setActiveMenu(activeMenu === key ? null : key);
    }
  };

  const handleMenuItemClick = (action: () => void) => {
    action();
    setActiveMenu(null);
  };

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('最小化失败:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      const isMaximized = await appWindow.isMaximized();
      if (isMaximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
    } catch (error) {
      console.error('最大化/还原失败:', error);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('关闭失败:', error);
    }
  };

  // 点击外部关闭菜单
  const handleClickOutside = (e: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
      setActiveMenu(null);
    }
  };

  useEffect(() => {
    // 只有在有活动菜单时才添加事件监听器
    if (activeMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [activeMenu]);

  if (!isVisible) return null;

  return (
    <div 
      ref={menuRef} 
      className="menu-bar bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 text-white fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => {
        // 只有在播放时才允许隐藏
        if (isPlaying) {
          setIsVisible(false);
        }
      }}
    >
      <div className="flex justify-between items-center h-10">
        {/* 左侧程序名称和菜单项 */}
        <div className="flex items-center">
          <div className="px-4">
            <span className="text-sm font-semibold text-gray-200">MoPlayer</span>
          </div>
          <div className="flex items-center space-x-1">
            {menuItems.map((menu) => (
            <div key={menu.key} className="relative">
              <button
                className="px-4 py-2 text-sm hover:bg-white/20 transition-colors"
                onClick={() => handleMenuClick(menu.key)}
                onMouseEnter={() => setIsVisible(true)}
              >
                {menu.label}
              </button>
              
              {activeMenu === menu.key && (menu as any).items && (
                <div 
                  className="menu-dropdown absolute top-full left-0 bg-gray-900/95 backdrop-blur-md border border-gray-700/50 shadow-xl min-w-48 z-50 rounded-b-md mt-1"
                  onMouseEnter={() => setIsVisible(true)}
                >
                  {(menu as any).items.map((item: MenuItem, index: number) => (
                    item.separator ? (
                      <div key={index} className="border-t border-gray-700/50 my-1" />
                    ) : (
                      <button
                        key={index}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors flex justify-between items-center ${
                          item.disabled ? 'text-gray-500 cursor-not-allowed' : ''
                        }`}
                        onClick={() => !item.disabled && handleMenuItemClick(item.action)}
                        disabled={item.disabled}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span className="text-gray-400 text-xs ml-4">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  ))}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>

        {/* 右侧窗口控制按钮 */}
        <div className="flex">
          <button
            className="px-4 py-2 hover:bg-gray-700/50 transition-colors text-sm"
            onClick={handleMinimize}
            title="最小化"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
            </svg>
          </button>
          <button
            className="px-4 py-2 hover:bg-gray-700/50 transition-colors text-sm"
            onClick={handleMaximize}
            title="最大化/还原"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 3a1 1 0 000 2h1V15a1 1 0 001 1h12a1 1 0 100-2H5V5h12a1 1 0 100-2H3z"/>
            </svg>
          </button>
          <button
            className="px-4 py-2 hover:bg-red-500/80 transition-colors text-sm"
            onClick={handleClose}
            title="关闭"
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenuBar;