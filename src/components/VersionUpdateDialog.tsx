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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 max-w-lg w-full mx-4 border border-gray-700">
        <div className="flex items-center mb-4">
          <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center mr-4">
            <svg
              className="w-6 h-6 text-white"
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
          <div>
            <h3 className="text-lg font-semibold text-white">发现新版本</h3>
            <p className="text-gray-400 text-sm">MoPlayer 有新版本可用</p>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-sm">当前版本</span>
            <span className="text-white font-medium">{currentVersion}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-sm">最新版本</span>
            <span className="text-green-400 font-medium">{latestVersion}</span>
          </div>
        </div>

        {/* 下载地址显示区域 */}
        {downloadUrl && (
          <div className="bg-gray-700/50 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs">下载地址</span>
              <button
                onClick={handleCopyUrl}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
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
            <div className="text-xs text-gray-300 break-all font-mono bg-gray-800 p-2 rounded">
              {downloadUrl}
            </div>
            <div className="mt-2 text-xs text-gray-400">
              文件名: <span className="text-gray-300">{fileName}</span>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {downloadError && (
          <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{downloadError}</span>
            </div>
            <p className="text-gray-400 text-xs mt-1">
              请尝试点击"复制链接"按钮，手动在浏览器中粘贴下载。
            </p>
          </div>
        )}

        {/* 下载状态提示 */}
        {!downloadStarted ? (
          <p className="text-gray-300 text-sm mb-6">
            建议您升级到最新版本以获得更好的体验和最新功能。
          </p>
        ) : (
          <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2 text-blue-400 mb-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span className="font-medium">已打开浏览器下载</span>
            </div>
            <p className="text-gray-300 text-sm">
              安装程序下载已在外部浏览器中开始。请在浏览器中查看下载进度，下载完成后运行安装程序进行升级。
            </p>
          </div>
        )}

        <div className="flex gap-3">
          {!downloadStarted ? (
            <>
              <button
                onClick={handleDownload}
                disabled={!downloadUrl}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                立即升级
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
              >
                稍后提醒
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-medium py-2 px-4 rounded-lg transition-colors"
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
