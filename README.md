# 小窝 iOS · 打包成 ipa 完整指南

> 项目根：`D:\DeepseekWork\xiaowo-ios`（Xcode 工程已写好，Windows 上无法编译 iOS，
> GitHub Actions 云端跑一次 `xcodebuild`，8 分钟出**未签名 ipa**，
> 手机上用 eSign/爱思 + 你自己的证书签名安装。网页版代码零改动。）

---

## 一、这个壳做了什么

| 能力 | 实现 |
| --- | --- |
| 加载网页版 | `MainViewController.swift` 用 WKWebView 加载你配置的「小窝」服务器地址 |
| 首次启动配置 | `SetupView.swift` 粉色卡片让你填 `192.168.1.5:7788` 或 `你的域名`，存在手机本地 |
| 定位加速 | `WebBridge.swift` 把 `navigator.geolocation` 转成原生 CoreLocation（网页代码没改，无感替换）|
| App 图标角标 | 网页把未读数写进 `document.title`（如「悄悄话 · 小窝 (3)」）时，自动搬到图标 badge |
| Cookie 持久化 | 登录态保存，重启 App 不用重新输暗号 |
| 图标 | 用项目 favicon 的粉色爱心重新矢量绘制（`scripts/gen_icons.py` 生成全套尺寸）|

网页版**一行代码都没改**——ipa 只是一扇通往同一个服务器的「门」，网页继续在
浏览器/局域网/公网照常使用，两端数据完全一致（因为就是同一个服务器）。

---

## 二、云端打包（零 Apple 密钥版 · 当前配置）

已不需要 App Store Connect / API 密钥 / 付费开发者账号。
Actions 只做编译，产出**未签名 ipa**，签名你在手机上完成。

### 步骤

1. **建私有仓库**：GitHub 新建 `xiaowo-ios`（Private）。
2. **推代码**（见下文「GitHub 登录被标记怎么办」）：
   ```bash
   cd D:\DeepseekWork\xiaowo-ios
   git init  # 已 init 过，跳过
   git remote add origin https://github.com/<你的用户名>/xiaowo-ios.git
   git push -u origin main
   ```
3. **跑 Workflow**：仓库 → Actions → `Build iOS IPA (unsigned)` → Run workflow → Run。
4. **下载 ipa**：构建完成后（约 6–8 分钟）从该次运行的 Artifacts 里下载 `xiaowo-unsigned-ipa`。

> ⚠️ 第一次跑如果失败，点进失败的 job 看红叉步骤日志发给我，我来修。

### 手机上签名安装（eSign / 轻松签 / 爱思助手）

**材料：你的 Apple ID + p12 证书 + 描述文件（mobileprovision）**

1. **拿证书**（三选一）：
   - 爱思助手 PC 版 → 工具箱 → **自签名证书** → 输 Apple ID 和密码 → 生成 p12 + 描述文件（免费账号 7 天有效，到期重新生成一次）
   - 手机 eSign App 内自带「申请证书」功能（填 Apple ID → 自动拿 p12）
   - 付费开发者账号：developer.apple.com → Certificates 生成正式 p12（1 年有效）
2. **签名**：
   - eSign/轻松签（手机上直接装）：导入 `xiaowo-unsigned.ipa` → 选择 p12 证书 → 签名 → 安装 → 设置里信任企业/开发者证书
   - 爱思助手（电脑连线）：工具箱 → ipa 签名 → 选 ipa + p12 → 签完 → 安装应用
3. **首次打开**：iOS 设置 → 通用 → VPN与设备管理 → 信任你的开发者证书。

---

## 三、GitHub 登录被标记（无法授权第三方应用）怎么办

Git Credential Manager 走的是 **OAuth 网页授权**，被风控的账户会在这步被拦。
但 **Fine-grained Personal Access Token（PAT）不走 OAuth**，被标记的账户通常仍能创建：

1. 登录 github.com（浏览器正常登录就行）→ 右上角头像 → **Settings**
2. 最底下 **Developer settings** → **Personal access tokens** → **Fine-grained tokens** → **Generate new token**
3. 填写：
   - Token name: `xiaowo-push`
   - Expiration: 90 天
   - Repository access: **Only select repositories** → 选 `xiaowo-ios`
   - Permissions → Repository permissions → **Contents: Read and write**
4. Generate → **立刻复制 token**（ghp_ 开头，只显示一次）
5. 推代码时用 token 当密码：
   ```bash
   cd D:\DeepseekWork\xiaowo-ios
   git remote add origin https://github.com/<你的用户名>/xiaowo-ios.git
   git push -u origin main
   # 弹出登录框：Username 填你的 GitHub 用户名，Password 填刚才的 token（不是账号密码）
   ```
   如果弹窗还是走 OAuth 被拦，改用命令行直接带 token（把 token 嵌进 URL，push 完建议清除）：
   ```bash
   git remote set-url origin https://<用户名>:<TOKEN>@github.com/<用户名>/xiaowo-ios.git
   git push -u origin main
   git remote set-url origin https://github.com/<用户名>/xiaowo-ios.git   # 推完清掉
   ```

如果连 Settings 都进不去（账户被冻结），换一个小号创建仓库+token，一样能推。

---

## 四、App 里第一次启动

1. 打开「小窝」App，会看到粉色卡片让你填服务器地址。
   - **在家**：填电脑上 `start.bat` 打印的「局域网」地址，例如 `192.168.101.15:7788`
   - **在外**：如果你部署了公网（deploy/ 目录里的 push.sh），填 `你的域名`
2. 点「推门进去」→ 进入和浏览器一模一样的小窝界面 → 输暗号 → 完事。
3. 之后 App 会记住地址，打开直接进。

---

## 五、常见问题

**Q: 网页版还能用吗？**
能。服务器代码和网页都没动，浏览器照常访问 `http://192.168.x.x:7788` 或域名。

**Q: ipa 装好后我改了网页版代码，App 会更新吗？**
会。App 每次启动都重新从服务器加载网页，网页改了刷新即可，不用重装 App。

**Q: App Store Connect 提示「尚未启用 iTunes Connect / 账户被标记」？**
不影响。那条路是付费开发者云签用的，证书签名安装（eSign/爱思）完全用不到。

**Q: 悄悄话/动态照片会被苹果扫描吗？**
不会。数据全走你自己的服务器，App 只是带原生定位的浏览器壳，苹果不碰内容。

**Q: 7 天签名是什么意思？**
免费 Apple ID 签的 App 7 天有效，到期用 eSign/爱思重新签一次即可；付费开发者账号（$99/年）签一次管 1 年。

