import { useState } from 'react';
import VideoPlayer from './components/VideoPlayer';
import PlayerControls from './components/PlayerControls';
import FileDropZone from './components/FileDropZone';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

function App() {
  const [videoSrc, setVideoSrc] = useState<string>('');
  const [playerState, setPlayerState] = useState<PlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
  });
  const [error, setError] = useState<string>('');

  const handleFileSelect = async (file: File) => {
    try {
      setError('');
      const url = URL.createObjectURL(file);
      setVideoSrc(url);
    } catch (err) {
      setError('文件加载失败: ' + (err as Error).message);
    }
  };

  const handleFileSelectClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*,audio/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    };
    input.click();
  };

  const handlePlayerStateChange = (newState: Partial<PlayerState>) => {
    setPlayerState(prev => ({ ...prev, ...newState }));
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400 mb-2">
            MoPlayer
          </h1>
          <p className="text-gray-300">高性能音视频播放器</p>
        </header>

        <div className="max-w-4xl mx-auto">
          {!videoSrc ? (
            <FileDropZone 
              onFileSelect={handleFileSelect}
              onFileSelectClick={handleFileSelectClick}
            />
          ) : (
            <div className="space-y-6">
              <VideoPlayer
                src={videoSrc}
                onStateChange={handlePlayerStateChange}
                onError={handleError}
              />
              <PlayerControls
                playerState={playerState}
                onStateChange={handlePlayerStateChange}
              />
            </div>
          )}

          {error && (
            <div className="mt-6 p-4 bg-red-600 rounded-lg">
              <h3 className="font-semibold mb-2">播放出错</h3>
              <p className="text-sm">{error}</p>
              <div className="mt-3 text-sm text-red-200">
                <p>支持的格式：MP4, WebM, OGV, MP3, WAV, OGG</p>
                <p>请确保文件格式正确且未损坏</p>
              </div>
            </div>
          )}

          {videoSrc && (
            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setVideoSrc('');
                  setError('');
                  setPlayerState({
                    isPlaying: false,
                    currentTime: 0,
                    duration: 0,
                    volume: 1,
                  });
                }}
                className="px-6 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition-colors"
              >
                选择其他文件
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;