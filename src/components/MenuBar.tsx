import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';

interface MenuBarProps {
  onOpenFile: () => void;
  onExit: () => void;
  isPlaying?: boolean; // 兼容旧逻辑
  autoHide?: boolean;  // 新增：图片/视频模式下均可自动隐藏
}

interface MenuItem {
  label: string;
  key: string;
  isDirectAction?: boolean;
  action?: () => void;
  shortcut?: string;
  disabled?: boolean;
  items?: (MenuItem | SeparatorItem)[];
}

interface SeparatorItem {
  separator: true;
}

const MenuBar: React.FC<MenuBarProps> = ({ onOpenFile, onExit: _onExit, isPlaying = false, autoHide = false }) => {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const mouseMoveTimeoutRef = useRef<NodeJS.Timeout>();
  const menuButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [dropdownPos, setDropdownPos] = useState<{ left: number; top: number; width?: number } | null>(null);

  // 简化的菜单结构
  const menuItems: MenuItem[] = [
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
        { 
          label: '支持格式',
          key: 'supported-formats',
          action: async () => {
            console.log('支持格式菜单项被点击');
            try {
              const dialogMessage = '支持的视频格式：\n\n• MP4 (.mp4)\n• AVI (.avi)\n• MOV (.mov)\n• WMV (.wmv)\n• FLV (.flv)\n• MKV (.mkv)\n• WEBM (.webm)\n• OGV (.ogv)\n• 3GP (.3gp)\n• M4V (.m4v)\n\n支持的音频格式：\n\n• MP3 (.mp3)\n• WAV (.wav)\n• AAC (.aac)\n• OGG (.ogg)\n• FLAC (.flac)\n• M4A (.m4a)\n• WMA (.wma)\n\n支持的图片格式：\n\n• JPG (.jpg, .jpeg)\n• PNG (.png)\n• GIF (.gif)\n• BMP (.bmp)\n• WebP (.webp)\n• SVG (.svg)\n• ICO (.ico)\n• TIFF (.tif, .tiff)\n• HEIF/HEIC (.heif, .heic)\n• RAW（仅缩略图预览）: CR2, NEF, ARW, DNG, RW2, ORF, RAF, SR2\n\n文档：\n\n• PDF (.pdf)';
              console.log('尝试显示支持格式对话框');
              await message(dialogMessage, { kind: 'info' });
              console.log('支持格式对话框显示成功');
            } catch (error) {
              console.error('显示支持格式对话框失败:', error);
              const alertMessage = '支持的视频格式：\n\n• MP4 (.mp4)\n• AVI (.avi)\n• MOV (.mov)\n• WMV (.wmv)\n• FLV (.flv)\n• MKV (.mkv)\n• WEBM (.webm)\n• OGV (.ogv)\n• 3GP (.3gp)\n• M4V (.m4v)\n\n支持的音频格式：\n\n• MP3 (.mp3)\n• WAV (.wav)\n• AAC (.aac)\n• OGG (.ogg)\n• FLAC (.flac)\n• M4A (.m4a)\n• WMA (.wma)\n\n支持的图片格式：\n\n• JPG (.jpg, .jpeg)\n• PNG (.png)\n• GIF (.gif)\n• BMP (.bmp)\n• WebP (.webp)\n• SVG (.svg)\n• ICO (.ico)\n• TIFF (.tif, .tiff)\n• HEIF/HEIC (.heif, .heic)\n• RAW（仅缩略图预览）: CR2, NEF, ARW, DNG, RW2, ORF, RAF, SR2\n\n文档：\n\n• PDF (.pdf)';
              console.log('使用浏览器alert显示支持格式');
              alert(alertMessage);
            }
          }
        },
        { separator: true },
        { 
          label: '关于 MoPlayer',
          key: 'about',
          action: async () => {
            console.log('关于菜单项被点击');
            try {
              const aboutMessage = 'MoPlayer是一个多功能音视频播放器\n\n版本：0.1.0\n\n特性：\n• 支持多种音视频格式\n• 播放列表管理\n• 多种播放模式\n• 可视化音频界面\n• 键盘快捷键支持';
              console.log('尝试显示关于对话框');
              await message(aboutMessage, { kind: 'info' });
              console.log('关于对话框显示成功');
            } catch (error) {
              console.error('显示关于对话框失败:', error);
              const alertMessage = 'MoPlayer是一个多功能音视频播放器\n\n版本：0.1.0\n\n特性：\n• 支持多种音视频格式\n• 播放列表管理\n• 多种播放模式\n• 可视化音频界面\n• 键盘快捷键支持';
              console.log('使用浏览器alert显示关于信息');
              alert(alertMessage);
            }
          } 
        },
      ]
    }
  ];

  // 菜单栏显示逻辑：当 autoHide 为真时，鼠标静止5秒或离开窗口即隐藏
  useEffect(() => {
    const shouldAutoHide = autoHide || isPlaying;
    if (!shouldAutoHide) {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      return;
    }

    const handleMouseMove = () => {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
      
      mouseMoveTimeoutRef.current = setTimeout(() => {
        setIsVisible(false);
        setActiveMenu(null);
      }, 5000);
    };

    const handleMouseLeave = () => {
      if (shouldAutoHide) {
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
  }, [autoHide, isPlaying]);

  useEffect(() => {
    const shouldAutoHide = autoHide || isPlaying;
    if (!shouldAutoHide) {
      setIsVisible(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (mouseMoveTimeoutRef.current) {
        clearTimeout(mouseMoveTimeoutRef.current);
      }
    }
  }, [autoHide, isPlaying]);

  const handleMenuClick = (key: string) => {
    console.log(`菜单项 ${key} 被点击`);
    const menu = menuItems.find(m => m.key === key);
    if (menu && menu.isDirectAction) {
      if (menu.action) {
        menu.action();
      }
      setActiveMenu(null);
    } else {
      const nextKey = activeMenu === key ? null : key;
      setActiveMenu(nextKey);
      // 计算触发按钮在视口中的位置，用于顶层 Portal 下拉定位
      if (nextKey) {
        const btn = menuButtonRefs.current[nextKey];
        if (btn) {
          const rect = btn.getBoundingClientRect();
          setDropdownPos({ left: rect.left, top: rect.bottom, width: rect.width });
        } else {
          setDropdownPos(null);
        }
      } else {
        setDropdownPos(null);
      }
    }
  };

  const handleMenuItemClick = (action: () => void) => {
    console.log('菜单子项被点击，准备执行操作');
    action();
    setActiveMenu(null);
  };

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('最小化失败:', error);
    }
  };

  const handleMaximize = async () => {
    try {
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
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('关闭失败:', error);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Node | null;
    const inMenu = !!(menuRef.current && target && menuRef.current.contains(target));
    const inDropdown = !!(dropdownRef.current && target && dropdownRef.current.contains(target));
    if (!inMenu && !inDropdown) {
      setActiveMenu(null);
    }
  };

  useEffect(() => {
    if (activeMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => {
        document.removeEventListener('click', handleClickOutside);
      };
    }
  }, [activeMenu]);

  // 顶层下拉位置在窗口变化时同步更新
  useEffect(() => {
    const updatePos = () => {
      if (!activeMenu) return;
      const btn = menuButtonRefs.current[activeMenu];
      if (btn) {
        const rect = btn.getBoundingClientRect();
        setDropdownPos({ left: rect.left, top: rect.bottom, width: rect.width });
      }
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [activeMenu]);

  if (!isVisible && !activeMenu) return null;

  return (
    <div 
      ref={menuRef} 
      className="menu-bar bg-gray-900/95 backdrop-blur-md border-b border-gray-700/50 text-white fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => {
        if ((autoHide || isPlaying) && !activeMenu) {
          setIsVisible(false);
        }
      }}
    >
      <div className="flex justify-between items-center h-10">
        {/* 左侧：品牌与菜单（可挤压，优先保证右侧按钮显示） */}
        <div className="flex items-center flex-1 min-w-0 overflow-x-hidden">
          <div className="px-2 md:px-4 truncate">
            <span className="text-sm font-semibold text-gray-200 truncate">MoPlayer</span>
          </div>
          <div className="flex items-center space-x-1 flex-shrink min-w-0">
            {menuItems.map((menu) => (
            <div key={menu.key} className="relative">
              <button
                className="px-3 md:px-4 py-2 text-sm hover:bg-white/20 transition-colors truncate"
                onClick={() => handleMenuClick(menu.key)}
                onMouseEnter={() => setIsVisible(true)}
                ref={(el) => { menuButtonRefs.current[menu.key] = el; }}
              >
                {menu.label}
              </button>
              
              {activeMenu === menu.key && menu.items && dropdownPos && createPortal(
                (
                  <div
                    className="menu-dropdown fixed bg-gray-900/95 backdrop-blur-md border border-gray-700/50 shadow-xl z-[1000] rounded-b-md mt-1"
                    style={{ left: dropdownPos.left, top: dropdownPos.top, minWidth: dropdownPos.width }}
                    onMouseEnter={() => setIsVisible(true)}
                    ref={(el) => { dropdownRef.current = el; }}
                  >
                    {menu.items.map((item, index: number) => (
                      'separator' in item ? (
                        <div key={index} className="border-t border-gray-700/50 my-1" />
                      ) : (
                        <button
                          key={index}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-700/50 transition-colors flex justify-between items-center ${
                            item.disabled ? 'text-gray-500 cursor-not-allowed' : ''
                          } no-drag`}
                          onClick={() => !item.disabled && item.action && handleMenuItemClick(item.action)}
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
                ),
                document.body
              )}
            </div>
          ))}
          </div>
        </div>

        {/* 右侧：窗口控制按钮（不挤压、始终可见） */}
        <div className="flex flex-shrink-0 items-center">
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