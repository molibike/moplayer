import React, { useEffect, useRef, useState } from 'react';

interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement | null;
  isPlaying: boolean;
  height?: number;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  audioElement, 
  isPlaying, 
  height = 120 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 200 });

  // 监听窗口大小变化，动态调整canvas尺寸
  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const container = canvas.parentElement;
      if (!container) return;
      
      const rect = container.getBoundingClientRect();
      // 音波区宽度 = 程序窗口总宽度 * 61%
      const newWidth = Math.max(Math.floor(rect.width * 0.61), 800); // 最小宽度800px
      const newHeight = Math.max(Math.floor(rect.height), height || 200);
      
      setCanvasSize({ width: newWidth, height: newHeight });
    };

    // 初始设置
    setTimeout(updateCanvasSize, 100); // 延迟一点确保DOM完全渲染
    
    // 监听窗口大小变化
    window.addEventListener('resize', updateCanvasSize);
    
    return () => {
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, [height]);

  // 初始化音频分析器
  useEffect(() => {
    if (!audioElement) return;

    const initAudioContext = async () => {
      try {
        // 创建音频上下文
        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        setAudioContext(context);

        // 创建分析器节点
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        // 连接音频源
        const source = context.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(context.destination);
        
        // 创建数据数组
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        analyserRef.current = analyser;
        dataArrayRef.current = dataArray;
      } catch (error) {
        console.error('音频上下文初始化失败:', error);
      }
    };

    initAudioContext();

    return () => {
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [audioElement]);

  // 绘制音频可视化
  const draw = () => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;
    
    if (!canvas || !analyser || !dataArray) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 获取音频数据
    if (dataArray) {
      const tempArray = new Uint8Array(dataArray.length);
      analyser.getByteFrequencyData(tempArray);
      dataArray.set(tempArray);
    }

    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 根据canvas宽度动态计算条形数量，确保铺满整个区域
    const minBarWidth = 10; // 最小条形宽度设置为10像素
    const barSpacing = 1; // 条形间距
    const maxBarCount = Math.floor(canvas.width / (minBarWidth + barSpacing));
    
    // 确保条形完全填满整个区域，计算实际条宽度
    const barCount = Math.max(1, maxBarCount);
    const totalSpacing = (barCount - 1) * barSpacing;
    const actualBarWidth = Math.max(minBarWidth, (canvas.width - totalSpacing) / barCount);

    // 绘制音频条
    for (let i = 0; i < barCount; i++) {
      // 从频率数据中采样
      const dataIndex = Math.floor((i / barCount) * dataArray.length);
      // 确保音波条最低绘制高度为5像素
      const barHeight = Math.max((dataArray[dataIndex] / 255) * canvas.height, 5);
      
      // 计算颜色（基于频率强度）
      const intensity = dataArray[dataIndex] / 255;
      const hue = 200 + intensity * 160; // 从蓝色到紫色
      const saturation = 70 + intensity * 30;
      const lightness = 40 + intensity * 40;
      
      // 绘制条形
      const x = i * (actualBarWidth + barSpacing);
      const y = canvas.height - barHeight;
      
      // 创建渐变
      const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
      gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`);
      gradient.addColorStop(1, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, actualBarWidth, barHeight);
      
      // 添加发光效果
      if (intensity > 0.3) {
        ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.shadowBlur = 10;
        ctx.fillRect(x, y, actualBarWidth, barHeight);
        ctx.shadowBlur = 0;
      }
    }

    // 继续动画
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(draw);
    }
  };

  // 模拟音频数据（当没有真实音频数据时）
  const drawSimulated = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 根据canvas宽度动态计算条形数量
    const minBarWidth = 4;
    const barSpacing = 1;
    const barCount = Math.floor(canvas.width / (minBarWidth + barSpacing));
    const barWidth = canvas.width / barCount;
    const actualBarWidth = barWidth - barSpacing;

    for (let i = 0; i < barCount; i++) {
      // 生成模拟的音频数据
      const time = Date.now() * 0.005;
      const frequency = (i / barCount) * 10;
      const amplitude = Math.sin(time + frequency) * 0.5 + 0.5;
      const noise = Math.random() * 0.3;
      // 确保音波条最低绘制高度为5像素
      const barHeight = Math.max((amplitude + noise) * canvas.height * 0.8, 5);
      
      const x = i * barWidth;
      const y = canvas.height - barHeight;
      
      // 颜色计算
      const intensity = (amplitude + noise);
      const hue = 200 + intensity * 160;
      const saturation = 70 + intensity * 30;
      const lightness = 40 + intensity * 40;
      
      // 创建渐变
      const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
      gradient.addColorStop(0, `hsl(${hue}, ${saturation}%, ${lightness + 20}%)`);
      gradient.addColorStop(1, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, actualBarWidth, barHeight);
      
      // 添加发光效果
      if (intensity > 0.3) {
        ctx.shadowColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        ctx.shadowBlur = 8;
        ctx.fillRect(x, y, actualBarWidth, barHeight);
        ctx.shadowBlur = 0;
      }
    }

    // 继续动画
    if (isPlaying) {
      animationRef.current = requestAnimationFrame(drawSimulated);
    }
  };

  // 开始/停止动画
  useEffect(() => {
    if (isPlaying) {
      if (analyserRef.current && dataArrayRef.current) {
        draw();
      } else {
        drawSimulated();
      }
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying]);

  // 恢复音频上下文
  const resumeAudioContext = async () => {
    if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
      } catch (error) {
        console.error('恢复音频上下文失败:', error);
      }
    }
  };

  // 当播放状态改变时恢复音频上下文
  useEffect(() => {
    if (isPlaying) {
      resumeAudioContext();
    }
  }, [isPlaying, audioContext]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full h-full block"
          style={{ margin: 0, padding: 0, border: 'none' }}
        />
        
        {/* 播放状态指示器（仅圆点） */}
        <div className="absolute top-2 right-2 flex items-center bg-black/50 backdrop-blur-sm rounded-full px-3 py-1">
          <div className={`w-2 h-2 rounded-full ${
            isPlaying ? 'bg-green-400 animate-pulse' : 'bg-red-400'
          }`} />
        </div>
      </div>
    </div>
  );
};

export default AudioVisualizer;