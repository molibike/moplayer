import React, { useState, useCallback } from 'react';

interface FileDropZoneProps {
  onFileSelect: (file: File) => void;
  onFileSelectClick: () => void;
}

const FileDropZone: React.FC<FileDropZoneProps> = ({ onFileSelect, onFileSelectClick }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find(file => 
      file.type.startsWith('video/') || file.type.startsWith('audio/')
    );
    
    if (videoFile) {
      onFileSelect(videoFile);
    }
  }, [onFileSelect]);

  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-12 text-center transition-colors cursor-pointer
        ${isDragOver 
          ? 'border-blue-400 bg-blue-400/10' 
          : 'border-gray-600 hover:border-gray-500'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onFileSelectClick}
    >
      <div className="space-y-4">
        <div className="text-6xl text-gray-500">
          🎬
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">
            选择或拖拽视频文件
          </h3>
          <p className="text-gray-500">
            支持 MP4, WebM, OGV, MP3, WAV, OGG 等格式
          </p>
        </div>
        <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
          选择文件
        </button>
      </div>
    </div>
  );
};

export default FileDropZone;