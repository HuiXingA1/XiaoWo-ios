# 小窝 iOS（xiaowo-ios）

只属于两个人的私密空间 —— iOS 壳 App，加载自家「小窝」服务器。网页版零改动。

```
xiaowo-ios/
├── Xiaowo.xcodeproj/          # Xcode 工程（手写 pbxproj，Xcode 15+ 兼容）
├── Xiaowo/
│   ├── AppDelegate.swift      # @main 入口
│   ├── MainViewController.swift  # WKWebView 全屏壳 + 进度条 + 错误重试
│   ├── SetupView.swift        # 首启服务器地址配置卡片（粉白主题）
│   ├── WebBridge.swift        # 原生桥：定位/角标/Cookie 同步
│   ├── AppConfig.swift        # 服务器地址持久化
│   ├── Info.plist             # 权限文案/ATS/后台定位/URL Scheme
│   ├── LaunchScreen.storyboard
│   └── Assets.xcassets/       # AppIcon（favicon 爱心重绘）/ AccentColor
├── scripts/
│   ├── gen_icons.py           # Windows 上生成全套图标 PNG（Pillow）
│   └── build-ipa.sh           # macOS CI 上 xcodebuild archive + export
└── .github/workflows/build.yml  # GitHub Actions 云端打包
```

## 快速开始

1. 推到 GitHub 私有仓库
2. 配 4 个 Secret：`AUTHKEY_B64` / `AUTHKEY_ID` / `AUTHKEY_ISSUER_ID` / `APPLE_TEAM_ID`
3. Actions → `Build iOS IPA` → Run workflow（选 ad-hoc）
4. 8 分钟后下载 `xiaowo-ipa` artifact → 装到手机

详见 [README.md](README.md)。
