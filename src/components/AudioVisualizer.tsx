import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement | null;
  isPlaying: boolean;
  height?: number;
  title?: string;
  artist?: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ 
  audioElement, 
  isPlaying, 
  height = 120,
  title,
  artist
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const enableRealtimeAnalysis = true;
  // 使用setInterval定时器ID，避免requestAnimationFrame保持WebView2渲染循环
  const timerRef = useRef<number | null>(null);
  // Web Audio API 引用（用于获取真实音频频率数据）
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // 初始化AudioContext和AnalyserNode - 仅在audioElement变化时创建
  useEffect(() => {
    if (!audioElement || !enableRealtimeAnalysis) return;
    // 避免重复创建source（一个audio元素只能createMediaElementSource一次）
    if (sourceRef.current) return;

    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      // 使用较小但足够的FFT以支持最多128条音波柱（256 = 128个频率bins）
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.35;

      const source = ctx.createMediaElementSource(audioElement);
      source.connect(analyser);
      analyser.connect(ctx.destination);

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      sourceRef.current = source;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch (error) {
      // 初始化失败时静默处理，波形图将显示静态
    }

    return () => {
      // 组件卸载时关闭AudioContext
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      sourceRef.current = null;
      dataArrayRef.current = null;
    };
  }, [audioElement, enableRealtimeAnalysis]);

  // 恢复被暂停的AudioContext
  useEffect(() => {
    if (enableRealtimeAnalysis && isPlaying && audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume().catch(() => {});
    }
  }, [enableRealtimeAnalysis, isPlaying]);

  const drawStaticBars = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    barCount: number,
    barWidth: number,
    barSpacing: number
  ) => {
    const baseHeight = Math.max(canvas.height * 0.04, 2);
    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + barSpacing);
      const y = canvas.height - baseHeight;
      ctx.fillRect(x, y, barWidth, baseHeight);
    }
  };

  // 绘制真实音频频率数据
  const drawBars = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    // 条形参数
    const barSpacing = 4;
    const maxBarCountByWidth = Math.floor(canvas.width / 10);
    const availableBinCount = dataArray?.length ?? 128;
    const barCount = Math.max(32, Math.min(maxBarCountByWidth, availableBinCount, 128));
    const totalSpacing = (barCount - 1) * barSpacing;
    const barWidth = Math.max(2, (canvas.width - totalSpacing) / barCount);

    ctx.fillStyle = 'hsl(200, 70%, 50%)';

    if (analyser && dataArray) {
      // 使用真实音频频率数据
      analyser.getByteFrequencyData(dataArray as any);
      const binCount = dataArray.length; // 128 bins (fftSize/2)
      const binsPerBar = Math.max(1, Math.floor(binCount / barCount));

      for (let i = 0; i < barCount; i++) {
        // 对每个条形取对应频率bins的平均值
        let sum = 0;
        const startBin = i * binsPerBar;
        for (let j = 0; j < binsPerBar && (startBin + j) < binCount; j++) {
          sum += dataArray[startBin + j];
        }
        const avg = sum / binsPerBar; // 0-255
        const normalized = avg / 255; // 0-1
        const barHeight = Math.max(normalized * canvas.height * 0.85, 2);

        const x = i * (barWidth + barSpacing);
        const y = canvas.height - barHeight;
        ctx.fillRect(x, y, barWidth, barHeight);
      }
    } else {
      drawStaticBars(ctx, canvas, barCount, barWidth, barSpacing);
    }
  };

  // 使用setInterval控制动画（不使用requestAnimationFrame）
  // rAF会让WebView2保持60fps渲染循环，setInterval只在间隔时触发
  useEffect(() => {
    if (isPlaying) {
      drawBars();
      // 每100ms绘制一次，提高音波响应速度
      timerRef.current = window.setInterval(drawBars, 100);
    } else {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      // 暂停时清空画布
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isPlaying]);

  // 监听窗口大小变化，更新canvas尺寸
  useEffect(() => {
    const updateSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const container = canvas.parentElement;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.max(Math.floor(rect.width * 0.61), 600);
      const newHeight = Math.max(Math.floor(rect.height), Math.min(150, height || 150));
      if (Math.abs(canvas.width - newWidth) > 10 || Math.abs(canvas.height - newHeight) > 5) {
        canvas.width = newWidth;
        canvas.height = newHeight;
      }
    };

    const initTimer = window.setTimeout(updateSize, 100);
    window.addEventListener('resize', updateSize);

    return () => {
      window.clearTimeout(initTimer);
      window.removeEventListener('resize', updateSize);
    };
  }, [height]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="relative flex-1">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-8">
          <div className="text-center" style={{ opacity: isPlaying ? 0.2 : 0.28 }}>
            <div
              className="text-white font-bold tracking-wide"
              style={{
                fontSize: 'clamp(1.2rem, 3vw, 2.4rem)',
                lineHeight: 1.15,
                textShadow: '0 2px 18px rgba(0, 0, 0, 0.45)',
                wordBreak: 'break-word'
              }}
            >
              {title || '未识别标题'}
            </div>
            <div
              className="text-blue-200"
              style={{
                marginTop: '0.45rem',
                fontSize: 'clamp(0.8rem, 1.7vw, 1rem)',
                textShadow: '0 1px 12px rgba(0, 0, 0, 0.4)'
              }}
            >
              {artist || '未知艺术家'}
            </div>
          </div>
        </div>
        <canvas
          ref={canvasRef}
          width={800}
          height={150}
          className="w-full h-full block"
          style={{ margin: 0, padding: 0, border: 'none' }}
        />
        
        {/* 播放状态指示器（仅圆点） */}
        <div className="absolute top-2 right-2 flex items-center bg-black/50 rounded-full px-3 py-1">
          <div className={`w-2 h-2 rounded-full ${
            isPlaying ? 'bg-green-400' : 'bg-red-400'
          }`} />
        </div>
      </div>
    </div>
  );
};

export default React.memo(AudioVisualizer);
