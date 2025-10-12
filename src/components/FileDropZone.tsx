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
    console.log('拖拽的文件列表:', files.map(f => ({ name: f.name, type: f.type })));
    
    // 支持视频、音频和图片文件
    const mediaFile = files.find(file => {
      const isVideo = file.type.startsWith('video/');
      const isAudio = file.type.startsWith('audio/');
      const isImage = file.type.startsWith('image/');
      const hasMediaExtension = /\.(mp4|webm|ogv|mp3|wav|ogg|aac|flac|m4a|wma|jpg|jpeg|png|gif|bmp|webp|svg|ico)$/i.test(file.name);
      
      return isVideo || isAudio || isImage || hasMediaExtension;
    });
    
    if (mediaFile) {
      console.log('选择的媒体文件:', mediaFile.name, mediaFile.type);
      onFileSelect(mediaFile);
    } else {
      console.log('未找到支持的媒体文件');
    }
  }, [onFileSelect]);

  return (
    <div
      className={`
        drop-zone border-2 border-dashed rounded-lg p-8 text-center max-w-md
        ${isDragOver 
          ? 'drag-over border-blue-400 bg-blue-400/10' 
          : 'border-gray-600'
        }
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="space-y-4">
        <div className="text-6xl text-gray-500">
          🎬
        </div>
        <div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">
            拖拽文件到此处播放
          </h3>
          <p className="text-gray-500 text-sm">
            支持 MP4, WebM, OGV, MP3, WAV, OGG, JPG, PNG, GIF 等格式
          </p>
        </div>
        <button 
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors text-sm font-medium cursor-pointer"
          onClick={onFileSelectClick}
        >
          选择文件
        </button>
      </div>
    </div>
  );
};

export default FileDropZone;