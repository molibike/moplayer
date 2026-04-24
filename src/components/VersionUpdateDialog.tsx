import React, { useState } from 'react';
import { open } from '@tauri-apps/plugin-shell';

interface VersionUpdateDialogProps {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
  onClose: () => void;
}

/**
 * 版本升级提示对话框组件
 * 当检测到新版本时显示，提示用户下载升级
 */
const VersionUpdateDialog: React.FC<VersionUpdateDialogProps> = ({
  currentVersion,
  latestVersion,
  downloadUrl,
  onClose,
}) => {
  const [downloadStarted, setDownloadStarted] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleDownload = async () => {
    if (!downloadUrl) {
      console.error('下载链接为空');
      setDownloadError('下载链接为空');
      return;
    }

    try {
      setDownloadError(null);
      // 使用 Tauri shell API 在系统默认浏览器中打开下载链接
      await open(downloadUrl);
      setDownloadStarted(true);
    } catch (error) {
      console.error('打开浏览器下载失败:', error);
      setDownloadError(`打开浏览器失败: ${error}`);
      // 如果 shell.open 失败，回退到 window.open
      window.open(downloadUrl, '_blank');
      setDownloadStarted(true);
    }
  };

  const handleCopyUrl = async () => {
    if (!downloadUrl) return;
    try {
      await navigator.clipboard.writeText(downloadUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('复制链接失败:', err);
    }
  };

  const handleClose = () => {
    onClose();
  };

  // 提取文件名
  const fileName = downloadUrl ? downloadUrl.split('/').pop() || '安装包' : '安装包';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-2xl max-w-md w-full max-h-[90vh] border border-gray-700 flex flex-col">
        {/* 可滚动内容区域 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex items-center mb-3">
            <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white">发现新版本</h3>
              <p className="text-gray-400 text-xs">MoPlayer 有新版本可用</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-lg p-3 mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400 text-xs">当前版本</span>
              <span className="text-white text-sm font-medium">{currentVersion}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400 text-xs">最新版本</span>
              <span className="text-green-400 text-sm font-medium">{latestVersion}</span>
            </div>
          </div>

          {/* 下载地址显示区域 */}
          {downloadUrl && (
            <div className="bg-gray-700/50 rounded-lg p-2.5 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-gray-400 text-xs">下载地址</span>
                <button
                  onClick={handleCopyUrl}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 flex-shrink-0"
                >
                  {copied ? (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      复制链接
                    </>
                  )}
                </button>
              </div>
              <div className="text-[11px] text-gray-300 break-all font-mono bg-gray-800 p-1.5 rounded leading-relaxed">
                {downloadUrl}
              </div>
              <div className="mt-1.5 text-[11px] text-gray-400 truncate">
                文件名: <span className="text-gray-300">{fileName}</span>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {downloadError && (
            <div className="bg-red-900/30 border border-red-700 rounded-lg p-2.5 mb-3">
              <div className="flex items-center gap-1.5 text-red-400 text-xs">
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="break-all">{downloadError}</span>
              </div>
              <p className="text-gray-400 text-[11px] mt-1">
                请尝试点击"复制链接"按钮，手动在浏览器中粘贴下载。
              </p>
            </div>
          )}

          {/* 下载状态提示 */}
          {!downloadStarted ? (
            <p className="text-gray-300 text-xs leading-relaxed">
              建议您升级到最新版本以获得更好的体验和最新功能。
            </p>
          ) : (
            <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span className="text-sm font-medium">已打开浏览器下载</span>
              </div>
              <p className="text-gray-300 text-xs leading-relaxed">
                安装程序下载已在外部浏览器中开始。请在浏览器中查看下载进度，下载完成后运行安装程序进行升级。
              </p>
            </div>
          )}
        </div>

        {/* 底部按钮区域 - 始终固定在底部 */}
        <div className="border-t border-gray-700 p-4 flex gap-3 flex-shrink-0">
          {!downloadStarted ? (
            <>
              <button
                onClick={handleDownload}
                disabled={!downloadUrl}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                立即升级
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
              >
                稍后提醒
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-3 rounded-lg transition-colors"
            >
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default VersionUpdateDialog;
