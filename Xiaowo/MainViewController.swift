import UIKit
import WebKit

/// WKWebView 全屏壳，加载「小窝」自托管服务器。
/// 服务器地址第一次启动时让用户填，保存在 UserDefaults；
/// 之后每次启动直连。网页版保持原样 —— App 只是它的一扇门。
final class MainViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {

    // MARK: - 状态

    private var webView: WKWebView!
    private let config = AppConfig.shared

    /// 首次进入的地址输入层（服务器存好后不再出现，可在设置页重开）
    private var setupView: SetupView?

    /// 首次加载进度条
    private lazy var progressView: UIProgressView = {
        let p = UIProgressView(progressViewStyle: .bar)
        p.tintColor = UIColor(red: 0.957, green: 0.396, blue: 0.541, alpha: 1) // #f4658a
        p.translatesAutoresizingMaskIntoConstraints = false
        p.isHidden = true
        return p
    }()

    private var progressObserver: NSKeyValueObservation?

    /// 需要以后台轮询驱动的能力（还没配服务器时不启动）
    private var bridge: WebBridge?

    // MARK: - 生命周期

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.992, green: 0.969, blue: 0.957, alpha: 1) // #fdf7f4

        setupWebView()
        applyAppearance()

        // 通知：启动即请求授权（对方发悄悄话 → 后台横幅）
        PushRelay.shared.requestAuthorization()
        PushRelay.shared.updateServerBase(config.serverBaseURL)

        if let base = config.serverBaseURL {
            loadServer(base)
        } else {
            showSetup(firstRun: true)
        }

        NotificationCenter.default.addObserver(
            self, selector: #selector(appWillEnterForeground),
            name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    deinit {
        progressObserver?.invalidate()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - WebView

    private func setupWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = [] // 自动播提示音/语音
        cfg.websiteDataStore = .`default`()               // 持久 Cookie：登录态能活过重启
        cfg.applicationNameForUserAgent = "XiaowoApp/1.0" // 服务器端可识别 App 来源

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        cfg.defaultWebpagePreferences = prefs

        // App 内的 Cookie 需要同步进 HTTPCookieStorage 才能被后台请求复用
        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never // 网页自己有安全区 meta
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        progressView.isHidden = true
        view.addSubview(progressView)

        progressObserver = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] wv, change in
            guard let self else { return }
            let p = Float(change.newValue ?? 0)
            if p >= 1.0 {
                self.progressView.setAnimationProgress(p, animated: true)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self] in
                    self?.progressView.isHidden = true
                    self?.progressView.setAnimationProgress(0, animated: false)
                }
            } else {
                self.progressView.isHidden = false
                self.progressView.setAnimationProgress(p, animated: true)
            }
        }

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            progressView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            progressView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        // 原生桥：定位、上传、标题角标
        bridge = WebBridge(webView: webView, viewController: self)
    }

    private func applyAppearance() {
        let pink = UIColor(red: 0.957, green: 0.396, blue: 0.541, alpha: 1)
        // 键盘「完成」条按钮配色
        let appearance = UIToolbarAppearance()
        appearance.backgroundColor = .systemBackground
        // WebView 内部下拉刷新交给网页自己处理（不装原生 refreshControl）
        UINavigationBar.appearance().tintColor = pink
    }

    // MARK: - 加载

    func loadServer(_ base: URL) {
        bridge?.baseURL = base
        webView.load(URLRequest(url: base))
    }

    // MARK: - 首启配置层

    func showSetup(firstRun: Bool) {
        let setup = SetupView(frame: view.bounds)
        setup.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        setup.onConnect = { [weak self] text -> Bool in
            guard let self else { return false }
            let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard let url = Self.normalizeServerURL(cleaned) else {
                setup.showError("地址看起来不对，要 http:// 或 https:// 开头")
                return false
            }
            self.config.serverBaseURL = url
            PushRelay.shared.updateServerBase(url)
            self.loadServer(url)
            return true
        }
        view.addSubview(setup)
        setupView = setup
    }

    func hideSetup() {
        setupView?.removeFromSuperview()
        setupView = nil
    }

    /// 用户可能输入 `192.168.1.5:7788`、`http://…`、`你的域名`，统一补协议
    static func normalizeServerURL(_ raw: String) -> URL? {
        var s = raw
        if !s.lowercased().hasPrefix("http://") && !s.lowercased().hasPrefix("https://") {
            s = "http://" + s
        }
        guard var comps = URLComponents(string: s) else { return nil }
        comps.path = comps.path.isEmpty ? "/" : comps.path
        guard comps.host != nil, let url = comps.url else { return nil }
        return url
    }

    // MARK: - 外部 URL

    func handleIncomingURL(_ url: URL) {
        // 只接受 http/https；其他 scheme 忽略
        guard url.scheme == "http" || url.scheme == "https" else { return }
        config.serverBaseURL = url
        loadServer(url)
    }

    // MARK: - 前后台

    @objc private func appWillEnterForeground() {
        // 回前台时刷新一次登录态/新消息（网页自己也会拉，这里兜底）
        bridge?.syncAppCookies { _ in }
        PushRelay.shared.handleWillEnterForeground()
        PushRelay.shared.cleanBadge()
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        bridge?.syncAppCookies { _ in }
        hideSetupIfLoaded()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleLoadError(error)
    }

    private func hideSetupIfLoaded() {
        if setupView != nil {
            hideSetup()
        }
    }

    private func handleLoadError(_ error: Error) {
        let ns = error as NSError
        // 用户取消/重定向中断不算错误
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        // 还没连上服务器时留在配置层
        if setupView != nil { return }
        let alert = UIAlertController(
            title: "连不上小窝",
            message: "\(error.localizedDescription)\n\n检查：\n· 和家里电脑连的是不是同一个 Wi-Fi\n· 服务器（start.bat）开着没有\n· 地址端口对不对（默认 7788）",
            preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "重试", style: .default) { [weak self] _ in
            if let url = self?.webView.url {
                self?.webView.load(URLRequest(url: url))
            }
        })
        alert.addAction(UIAlertAction(title: "换服务器地址", style: .default) { [weak self] _ in
            self?.showSetup(firstRun: false)
        })
        present(alert, animated: true)
    }

    // MARK: - WKUIDelegate（JS alert/confirm/prompt）

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "好", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo,
                 completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(nil) })
        present(alert, animated: true)
    }
}

// MARK: - 进度条动画小助手（UIProgressView 没有 animated setter）

private extension UIProgressView {
    func setAnimationProgress(_ progress: Float, animated: Bool) {
        if animated {
            setProgress(progress, animated: true)
        } else {
            setProgress(progress, animated: false)
        }
    }
}
