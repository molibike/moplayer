import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  onPlayPause: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
  onMute: () => void;
  onSeekForward: () => void;
  onSeekBackward: () => void;
  onFullscreen: () => void;
  onOpenFile: () => void;
}

export const useKeyboardShortcuts = ({
  onPlayPause,
  onVolumeUp,
  onVolumeDown,
  onMute,
  onSeekForward,
  onSeekBackward,
  onFullscreen,
  onOpenFile,
}: KeyboardShortcutsProps) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // 防止在输入框中触发快捷键
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.code) {
        case 'Space':
          event.preventDefault();
          onPlayPause();
          break;
        case 'ArrowUp':
          event.preventDefault();
          onVolumeUp();
          break;
        case 'ArrowDown':
          event.preventDefault();
          onVolumeDown();
          break;
        case 'KeyM':
          event.preventDefault();
          onMute();
          break;
        case 'ArrowRight':
          if (event.ctrlKey) {
            event.preventDefault();
            onSeekForward();
          }
          break;
        case 'ArrowLeft':
          if (event.ctrlKey) {
            event.preventDefault();
            onSeekBackward();
          }
          break;
        case 'F11':
          event.preventDefault();
          onFullscreen();
          break;
        case 'KeyO':
          if (event.ctrlKey) {
            event.preventDefault();
            onOpenFile();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    onPlayPause,
    onVolumeUp,
    onVolumeDown,
    onMute,
    onSeekForward,
    onSeekBackward,
    onFullscreen,
    onOpenFile,
  ]);
};