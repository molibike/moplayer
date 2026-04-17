import React, { useState } from 'react';

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

  const handleDownload = () => {
    if (!downloadUrl) {
      console.error('下载链接为空');
      return;
    }

    try {
      // 创建隐藏的 a 标签触发下载
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = downloadUrl.split('/').pop() || 'moplayer-installer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // 标记下载已开始
      setDownloadStarted(true);
    } catch (error) {
      console.error('下载失败:', error);
      // 如果直接下载失败，回退到打开浏览器
      window.open(downloadUrl, '_blank');
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-700">
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
              <span className="font-medium">下载已开始</span>
            </div>
            <p className="text-gray-300 text-sm">
              安装程序正在下载中。请在浏览器下载管理器中查看下载进度，下载完成后手动运行安装程序。
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
