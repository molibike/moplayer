; NSIS 安装/卸载钩子文件 - 用于注册表右键菜单和"打开方式"
;
; 关键说明：
; 1. Tauri 使用 SHCTX (=HKCU 或 HKLM，取决于 installMode) 写入文件关联
; 2. 必须使用 SHCTX 而非 HKCR，否则 currentUser 模式下会尝试写 HKLM 而无权限静默失败
; 3. FriendlyAppName 是值名而非子键
; 4. Tauri 已经为 fileAssociations 中的格式（mp4/mp3/pdf 等）自动注册了 FileClass
;    我们只需额外补充：Applications\moplayer.exe 注册 + 图片等未列格式的右键菜单

!macro NSIS_HOOK_POSTINSTALL
  ; ============================================
  ; 1. 注册 Applications\moplayer.exe
  ; 这是 Windows "打开方式" 对话框显示友好名称的关键
  ; FriendlyAppName 必须是"值"，不是子键
  ; ============================================
  WriteRegStr SHCTX "Software\Classes\Applications\moplayer.exe" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\Applications\moplayer.exe\shell\open\command" "" '"$INSTDIR\moplayer.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\moplayer.exe\DefaultIcon" "" '"$INSTDIR\moplayer.exe",0'

  ; ============================================
  ; 2. 给 Tauri 已创建的 FileClass 添加 FriendlyAppName
  ; Tauri 为每个 fileAssociations 扩展名创建了 FileClass（如 mp4, avi, mp3 等）
  ; 这些 FileClass 默认没有 FriendlyAppName，导致"打开方式"显示命令行
  ; ============================================
  ; 视频
  WriteRegStr SHCTX "Software\Classes\mp4" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\avi" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\mkv" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\mov" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\wmv" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\flv" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\webm" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\m4v" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\3gp" "FriendlyAppName" "MoPlayer"
  ; 音频
  WriteRegStr SHCTX "Software\Classes\mp3" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\wav" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\flac" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\aac" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\ogg" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\wma" "FriendlyAppName" "MoPlayer"
  WriteRegStr SHCTX "Software\Classes\m4a" "FriendlyAppName" "MoPlayer"
  ; PDF
  WriteRegStr SHCTX "Software\Classes\pdf" "FriendlyAppName" "MoPlayer"

  ; ============================================
  ; 3. 为所有支持格式添加 SystemFileAssociations 右键菜单 "用MoPlayer打开"
  ; 注意：这里不写 HKCR 而写 SHCTX\Software\Classes
  ; ============================================
  ; --- 视频 ---
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mp4\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mp4\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mp4\shell\OpenWithMoPlayer" "Icon" '"$INSTDIR\moplayer.exe",0'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.avi\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.avi\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.avi\shell\OpenWithMoPlayer" "Icon" '"$INSTDIR\moplayer.exe",0'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mkv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mkv\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mkv\shell\OpenWithMoPlayer" "Icon" '"$INSTDIR\moplayer.exe",0'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mov\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mov\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wmv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wmv\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.flv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.flv\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.webm\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.webm\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.m4v\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.m4v\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ogv\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ogv\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.3gp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.3gp\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  ; --- 音频 ---
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mp3\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.mp3\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wav\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wav\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.flac\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.flac\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.aac\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.aac\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ogg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ogg\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.m4a\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.m4a\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wma\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wma\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  ; --- 图片 ---
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.jpg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.jpg\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.jpg\shell\OpenWithMoPlayer" "Icon" '"$INSTDIR\moplayer.exe",0'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.png\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.png\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.gif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.gif\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.bmp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.bmp\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.webp\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.webp\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ico\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.ico\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.svg\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.svg\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.tif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.tif\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.tiff\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.tiff\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.heic\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.heic\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.heif\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.heif\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wmf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.wmf\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  ; --- 相机 RAW ---
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.cr2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.cr2\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.nef\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.nef\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.arw\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.arw\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.dng\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.dng\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.rw2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.rw2\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.orf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.orf\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.raf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.raf\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.sr2\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.sr2\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  ; --- PDF（已在 Tauri fileAssociations 中，但也补充右键菜单）---
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.pdf\shell\OpenWithMoPlayer" "" "用MoPlayer打开"
  WriteRegStr SHCTX "Software\Classes\SystemFileAssociations\.pdf\shell\OpenWithMoPlayer\command" "" '"$INSTDIR\moplayer.exe" "%1"'

  ; ============================================
  ; 4. OpenWithList - 把 moplayer.exe 加入各种扩展名的"打开方式"列表
  ; ============================================
  ; 图片格式（Tauri fileAssociations 没有，必须手动添加）
  WriteRegStr SHCTX "Software\Classes\.jpg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.jpeg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.png\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.gif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.bmp\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.webp\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.ico\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.svg\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.tif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.tiff\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.heic\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.heif\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.wmf\OpenWithList\moplayer.exe" "" ""
  ; 相机 RAW
  WriteRegStr SHCTX "Software\Classes\.cr2\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.nef\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.arw\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.dng\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.rw2\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.orf\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.raf\OpenWithList\moplayer.exe" "" ""
  WriteRegStr SHCTX "Software\Classes\.sr2\OpenWithList\moplayer.exe" "" ""
  ; 额外视频格式（Tauri 没处理的）
  WriteRegStr SHCTX "Software\Classes\.ogv\OpenWithList\moplayer.exe" "" ""

  ; ============================================
  ; 5. 通知 Shell 刷新关联
  ; ============================================
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend


!macro NSIS_HOOK_PREUNINSTALL
  ; ============================================
  ; 卸载前清理所有我们添加的注册表项
  ; ============================================

  ; 1. 删除 Applications\moplayer.exe
  DeleteRegKey SHCTX "Software\Classes\Applications\moplayer.exe"

  ; 2. 删除 FileClass 的 FriendlyAppName 值（不删 FileClass 本身，让 Tauri 自己清理）
  DeleteRegValue SHCTX "Software\Classes\mp4" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\avi" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\mkv" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\mov" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\wmv" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\flv" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\webm" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\m4v" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\3gp" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\mp3" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\wav" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\flac" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\aac" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\ogg" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\wma" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\m4a" "FriendlyAppName"
  DeleteRegValue SHCTX "Software\Classes\pdf" "FriendlyAppName"

  ; 3. 删除所有 SystemFileAssociations 右键菜单
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.mp4\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.avi\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.mkv\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.mov\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.wmv\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.flv\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.webm\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.m4v\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.ogv\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.3gp\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.mp3\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.wav\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.flac\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.aac\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.ogg\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.m4a\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.wma\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.jpg\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.jpeg\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.png\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.gif\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.bmp\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.webp\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.ico\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.svg\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.tif\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.tiff\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.heic\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.heif\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.wmf\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.cr2\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.nef\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.arw\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.dng\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.rw2\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.orf\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.raf\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.sr2\shell\OpenWithMoPlayer"
  DeleteRegKey SHCTX "Software\Classes\SystemFileAssociations\.pdf\shell\OpenWithMoPlayer"

  ; 4. 删除 OpenWithList 条目
  DeleteRegKey SHCTX "Software\Classes\.jpg\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.jpeg\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.png\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.gif\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.bmp\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.webp\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.ico\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.svg\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.tif\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.tiff\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.heic\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.heif\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.wmf\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.cr2\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.nef\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.arw\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.dng\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.rw2\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.orf\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.raf\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.sr2\OpenWithList\moplayer.exe"
  DeleteRegKey SHCTX "Software\Classes\.ogv\OpenWithList\moplayer.exe"

  ; 5. 额外：清理之前错误版本钩子残留在 HKCR 下的注册（兼容升级情况）
  DeleteRegKey HKCR "Applications\moplayer.exe"
  DeleteRegKey HKCR "MoPlayer.file"

  ; 6. 通知 Shell 刷新关联
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0x1000, i 0, i 0)'
!macroend
