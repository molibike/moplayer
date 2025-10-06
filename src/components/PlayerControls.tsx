import React from 'react';

interface PlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
}

interface PlayerControlsProps {
  playerState: PlayerState;
  onStateChange: (state: Partial<PlayerState>) => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({ playerState }) => {
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg space-y-4">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-gray-400">
          <span>{formatTime(playerState.currentTime)}</span>
          <span>{formatTime(playerState.duration)}</span>
        </div>
        <input
          type="range"
          min="0"
          max={playerState.duration || 0}
          value={playerState.currentTime}
          className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          readOnly
        />
      </div>

      <div className="flex items-center space-x-4">
        <span className="text-sm text-gray-400 w-12">音量</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={playerState.volume}
          className="flex-1 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer"
          readOnly
        />
        <span className="text-sm text-gray-400 w-12">
          {Math.round(playerState.volume * 100)}%
        </span>
      </div>
    </div>
  );
};

export default PlayerControls;