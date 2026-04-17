; NSIS 安装/卸载钩子文件 - 用于注册表右键菜单和文件关联
; 对应 MSI 中的 ContextMenuFragment.wxs 功能

!macro NSIS_HOOK_POSTINSTALL
  ; ============================================
  ; 安装后注册右键菜单和文件关联
  ; ============================================

  ; 获取安装目录
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "InstallLocation"
  IfErrors 0 +2
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCTNAME}" "InstallLocation"

  ; 视频格式 - 右键菜单 "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.mp4\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.avi\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.avi\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.mkv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.mkv\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.mov\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.webm\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.wmv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.wmv\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.flv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.flv\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.m4v\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.m4v\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.ogv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.ogv\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.3gp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.3gp\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  ; 音频格式
  WriteRegStr HKCR "SystemFileAssociations\.mp3\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.mp3\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.wav\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.wav\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.flac\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.flac\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.aac\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.aac\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.ogg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.ogg\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.m4a\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.m4a\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.wma\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.wma\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  ; 图片格式
  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.jpg\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.png\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.png\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.gif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.gif\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.bmp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.bmp\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.webp\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.ico\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.ico\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.svg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.svg\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.tif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.tif\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.tiff\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.tiff\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.heic\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.heic\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.heif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.heif\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.wmf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.wmf\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  ; 相机 RAW 格式
  WriteRegStr HKCR "SystemFileAssociations\.cr2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.cr2\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.nef\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.nef\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.arw\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.arw\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.dng\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.dng\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.rw2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.rw2\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.orf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.orf\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.raf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.raf\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  WriteRegStr HKCR "SystemFileAssociations\.sr2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.sr2\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  ; PDF 格式
  WriteRegStr HKCR "SystemFileAssociations\.pdf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr HKCR "SystemFileAssociations\.pdf\shell\OpenWithMoPlayer\command" "" '"$0moplayer.exe" "%1"'

  ; ============================================
  ; 修复 "打开方式" 显示名称
  ; ============================================
  ; 注册应用信息，使 "打开方式" 对话框正确显示应用名称

  WriteRegStr HKCR "Applications\moplayer.exe" "" "MoPlayer"
  WriteRegStr HKCR "Applications\moplayer.exe\shell\open\command" "" '"$0moplayer.exe" "%1"'
  WriteRegStr HKCR "Applications\moplayer.exe\FriendlyAppName" "" "MoPlayer"

  ; ============================================
  ; OpenWithList - 将 MoPlayer 添加到各种文件类型的打开方式列表
  ; ============================================

  ; 视频格式
  WriteRegStr HKCR ".mp4\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".avi\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".mkv\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".mov\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".webm\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".wmv\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".flv\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".m4v\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".ogv\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".3gp\OpenWithList\moplayer.exe" "" ""

  ; 音频格式
  WriteRegStr HKCR ".mp3\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".wav\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".flac\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".aac\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".ogg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".m4a\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".wma\OpenWithList\moplayer.exe" "" ""

  ; 图片格式
  WriteRegStr HKCR ".jpg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".jpeg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".png\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".gif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".bmp\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".webp\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".svg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".ico\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".tif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".tiff\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".heic\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".heif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".wmf\OpenWithList\moplayer.exe" "" ""

  ; 相机 RAW 格式
  WriteRegStr HKCR ".cr2\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".nef\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".arw\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".dng\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".rw2\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".orf\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".raf\OpenWithList\moplayer.exe" "" ""
  WriteRegStr HKCR ".sr2\OpenWithList\moplayer.exe" "" ""

  ; PDF
  WriteRegStr HKCR ".pdf\OpenWithList\moplayer.exe" "" ""
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; ============================================
  ; 卸载前删除右键菜单和文件关联
  ; ============================================

  ; 视频格式 - 删除右键菜单
  DeleteRegKey HKCR "SystemFileAssociations\.mp4\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.avi\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.mkv\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.mov\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.webm\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.wmv\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.flv\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.m4v\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.ogv\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.3gp\shell\OpenWithMoPlayer"

  ; 音频格式
  DeleteRegKey HKCR "SystemFileAssociations\.mp3\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.wav\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.flac\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.aac\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.ogg\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.m4a\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.wma\shell\OpenWithMoPlayer"

  ; 图片格式
  DeleteRegKey HKCR "SystemFileAssociations\.jpg\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.png\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.gif\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.bmp\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.webp\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.ico\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.svg\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.tif\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.tiff\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.heic\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.heif\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.wmf\shell\OpenWithMoPlayer"

  ; 相机 RAW 格式
  DeleteRegKey HKCR "SystemFileAssociations\.cr2\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.nef\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.arw\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.dng\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.rw2\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.orf\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.raf\shell\OpenWithMoPlayer"
  DeleteRegKey HKCR "SystemFileAssociations\.sr2\shell\OpenWithMoPlayer"

  ; PDF
  DeleteRegKey HKCR "SystemFileAssociations\.pdf\shell\OpenWithMoPlayer"

  ; ============================================
  ; 删除 OpenWithList 条目
  ; ============================================

  ; 视频格式
  DeleteRegKey HKCR ".mp4\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".avi\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".mkv\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".mov\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".webm\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".wmv\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".flv\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".m4v\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".ogv\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".3gp\OpenWithList\moplayer.exe"

  ; 音频格式
  DeleteRegKey HKCR ".mp3\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".wav\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".flac\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".aac\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".ogg\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".m4a\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".wma\OpenWithList\moplayer.exe"

  ; 图片格式
  DeleteRegKey HKCR ".jpg\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".jpeg\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".png\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".gif\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".bmp\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".webp\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".svg\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".ico\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".tif\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".tiff\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".heic\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".heif\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".wmf\OpenWithList\moplayer.exe"

  ; 相机 RAW 格式
  DeleteRegKey HKCR ".cr2\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".nef\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".arw\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".dng\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".rw2\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".orf\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".raf\OpenWithList\moplayer.exe"
  DeleteRegKey HKCR ".sr2\OpenWithList\moplayer.exe"

  ; PDF
  DeleteRegKey HKCR ".pdf\OpenWithList\moplayer.exe"

  ; ============================================
  ; 删除应用程序注册
  ; ============================================
  DeleteRegKey HKCR "Applications\moplayer.exe"
!macroend
