import Foundation
import UIKit
import UserNotifications
import CoreLocation

/// 悄悄话实时通知中继
/// ─────────────────────
/// WebView 在前台时，网页自己的 8 秒轮询负责界面刷新，这里什么都不做；
/// WebView 进后台/锁屏后，由本类保持一条 SSE 长连接（GET /api/push/stream），
/// 收到 message 事件就弹本地通知（横幅 + 声音 + 角标）。
///
/// 连接生命周期：
///   · 进后台 → start()（若已有连接则复用）
///   · 回前台 → stop()（把通知的未读角标清掉，交给网页轮询）
///   · 连接断开 → 指数退避重连（2s 起，封顶 60s），回前台立即重置
///
/// 后台保活：iOS 默认只给退到后台的 app 约 30 秒执行窗口，之后进程被挂起、
/// SSE 连接冻结。本类借 Info.plist 里已声明的 location 后台模式，用一个
/// 最低精度（3 公里）的定位会话维持进程存活，让长连接一直活着。
/// 代价是状态栏可能出现定位箭头，电量影响接近可忽略。
///
/// 免签说明：通知授权弹窗、横幅展示都不依赖开发者账号，爱思助手/eSign
/// 签名后即可用。
final class PushRelay: NSObject, CLLocationManagerDelegate {

    static let shared = PushRelay()

    // MARK: - 状态

    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var receivedData = Data()
    private var serverBase: URL?
    private var reconnectAttempt = 0
    private var reconnectTimer: Timer?
    private var lastMessageId: Int64 = 0

    /// 前台时不弹横幅（网页在拉新消息，弹了会重复打扰）
    private var isForeground = true

    private let timeoutInterval: TimeInterval = 300   // SSE 读超时：5 分钟无数据视为断线
    private let maxReconnectDelay: TimeInterval = 60

    /// 后台保活用的定位管理器：只为让进程不被系统挂起，不参与业务定位。
    /// 功耗压到最低（3 公里精度 + 1 公里距离过滤），对电量影响接近可忽略。
    private let keepAliveLocation = CLLocationManager()
    private var keepAliveRunning = false

    // MARK: - 进出后台

    func handleDidEnterBackground() {
        isForeground = false
        startKeepAlive()   // 幂等：正常在启动时已开，这里只兜底
        connectIfNeeded()
    }

    /// 后台保活：iOS 给 app 退到后台的默认执行窗口只有约 30 秒，
    /// 之后进程被挂起，SSE 长连接随之冻结 —— 通知就收不到了。
    /// 声明了 location 后台模式后，只要定位服务在跑，进程就不会被挂起。
    /// 这里用最低精度（3 公里）把耗电压到接近零，纯粹当「心跳」用。
    private func startKeepAlive() {
        guard !keepAliveRunning else { return }
        guard CLLocationManager.locationServicesEnabled() else { return }
        let status = keepAliveLocation.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else { return }

        keepAliveLocation.delegate = self
        keepAliveLocation.desiredAccuracy = kCLLocationAccuracyThreeKilometers
        keepAliveLocation.distanceFilter = 1000
        keepAliveLocation.pausesLocationUpdatesAutomatically = false
        keepAliveLocation.activityType = CLActivityType.other
        // 必须在 Info.plist 声明 UIBackgroundModes=location，否则这行会抛异常
        keepAliveLocation.allowsBackgroundLocationUpdates = true
        keepAliveLocation.startUpdatingLocation()
        keepAliveRunning = true
    }

    /// 启动时调用：先要定位权限（保活的前提），再把保活定位跑起来。
    /// iOS 规定「使用期间」授权下只能在**前台**启动定位更新，所以必须在这里开，
    /// 不能等到进后台才开 —— 那时系统会直接忽略。
    func prepareBackgroundKeepAlive() {
        if keepAliveLocation.authorizationStatus == .notDetermined {
            keepAliveLocation.requestWhenInUseAuthorization()
        }
        startKeepAlive()
    }

    private func stopKeepAlive() {
        guard keepAliveRunning else { return }
        keepAliveRunning = false
        keepAliveLocation.allowsBackgroundLocationUpdates = false
        keepAliveLocation.stopUpdatingLocation()
    }

    func handleWillEnterForeground() {
        isForeground = true
        // 保活定位故意不停：iOS 在「使用期间」授权下只允许前台启动定位，
        // 停了就得等下次进前台才能再开，中间的后台窗口会丢通知。
        reconnectAttempt = 0
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        // 回前台立刻断开后台连接：界面交给网页轮询，避免双通道重复处理
        task?.cancel()
        task = nil
    }

    /// 服务器地址变化（首启配置/换地址）时调用
    func updateServerBase(_ url: URL?) {
        serverBase = url
        if url == nil { task?.cancel(); task = nil }
    }

    // MARK: - 连接

    private func connectIfNeeded() {
        guard !isForeground, let base = serverBase else { return }
        guard task == nil || task?.state == .completed || task?.state == .canceling else { return }

        // Cookie：WKWebView 的登录态在 setupWebView 的 websiteDataStore 里，
        // 后台请求走 HTTPCookieStorage —— syncAppCookies 已在进后台前同步过
        var req = URLRequest(url: base.appendingPathComponent("api/push/stream"))
        req.timeoutInterval = timeoutInterval
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        req.cachePolicy = .reloadIgnoringLocalCacheData

        if session == nil {
            // 必须用 default 配置：ephemeral 不带 HTTPCookieStorage.shared，
            // syncAppCookies 同步过来的 nest_session 就发不出去，服务端会 302 到 /login。
            let cfg = URLSessionConfiguration.default
            cfg.waitsForConnectivity = false
            cfg.shouldUseExtendedBackgroundIdleMode = true
            cfg.httpCookieStorage = HTTPCookieStorage.shared
            cfg.httpShouldSetCookies = true
            cfg.timeoutIntervalForRequest = timeoutInterval
            session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
        }
        receivedData = Data()
        task = session?.dataTask(with: req)
        task?.resume()
    }

    private func scheduleReconnect() {
        task = nil
        guard !isForeground, serverBase != nil else { return }
        reconnectAttempt += 1
        let delay = min(pow(2.0, Double(min(reconnectAttempt, 6))), maxReconnectDelay)
        let t = Timer(timeInterval: delay, repeats: false) { [weak self] _ in
            self?.connectIfNeeded()
        }
        RunLoop.main.add(t, forMode: .default)
        reconnectTimer = t
    }

    // MARK: - SSE 解析（逐事件，格式：event: xxx\ndata: {...}\n\n）

    private func consumeSSEBuffer() {
        while let range = receivedData.range(of: Data("\n\n".utf8)) {
            let chunk = receivedData.subdata(in: receivedData.startIndex..<range.lowerBound)
            receivedData.removeSubrange(receivedData.startIndex..<range.upperBound)
            guard let text = String(data: chunk, encoding: .utf8) else { continue }

            var eventName = "message"
            var payload = ""
            for line in text.components(separatedBy: "\n") {
                if line.hasPrefix("event:") {
                    eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
                } else if line.hasPrefix("data:") {
                    payload += line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                }
                // 注释行（:ping / :connected）忽略 —— 正是心跳，说明链路活着
            }
            handleEvent(eventName, payload: payload)
        }
    }

    private func handleEvent(_ name: String, payload: String) {
        // 任何字节流到达都证明连接可用，重置退避
        reconnectAttempt = 0

        guard name == "message", !payload.isEmpty,
              let d = payload.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { return }

        let msgId = (obj["msgId"] as? NSNumber)?.int64Value ?? 0
        guard msgId > lastMessageId else { return }   // 去重：重连后服务端不重发，此为兜底
        lastMessageId = msgId

        // 前台不打扰：网页自己的 8 秒轮询已经把新消息画到界面上了
        guard !isForeground else { return }

        let preview = (obj["body"] as? String) ?? "给你发了新悄悄话"
        let unread = (obj["unread"] as? NSNumber)?.intValue ?? 0

        notify(title: "小窝 · 新悄悄话", body: preview, unread: unread)
    }

    // MARK: - 本地通知

    private func notify(title: String, body: String, unread: Int) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.badge = NSNumber(value: max(unread, 1))
        content.userInfo = ["xiaowo.msgId": lastMessageId]

        let req = UNNotificationRequest(
            identifier: "xiaowo.message.\(lastMessageId)", content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    /// 通知授权：启动后尽早调一次（用户会看到系统弹窗）
    func requestAuthorization() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, _ in }
    }

    /// 点击通知横幅 → 拉起 app（cleanBadge 由 AppDelegate 在 applicationDidBecomeActive 调）
    func cleanBadge() {
        UIApplication.shared.applicationIconBadgeNumber = 0
    }

    // MARK: - CLLocationManagerDelegate（只为保活，不消费坐标）

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        // 坐标本身没用，收到回调即证明进程还活着、连接还能跑
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // 定位失败不影响通知主链路（SSE 仍然连着），保持静默
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        if status == .denied || status == .restricted {
            // 没权限：保活做不了，通知降级为「App 还活着时能收到」
            keepAliveRunning = false
            manager.stopUpdatingLocation()
        } else if status == .authorizedAlways || status == .authorizedWhenInUse {
            startKeepAlive()   // 用户刚点了允许，补开保活
        }
    }
}

// MARK: - URLSessionDataDelegate（重定向 / 状态码 / 字节流 / 断线）

extension PushRelay: URLSessionDataDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest,
                    completionHandler: @escaping (URLRequest?) -> Void) {
        // /api/push/stream 未登录会被 302 到 /login —— 跟过去没有意义，直接断开重连
        completionHandler(nil)
        scheduleReconnect()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                    didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse else {
            completionHandler(.cancel); return
        }
        if http.statusCode == 200 {
            completionHandler(.allow)
        } else {
            // 401：登录态失效。回前台让网页重新登录，这里安静退避
            completionHandler(.cancel)
            scheduleReconnect()
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        receivedData.append(data)
        consumeSSEBuffer()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        // SSE 长连接断开是常态（超时/网络切换/服务器重启），退避重连
        scheduleReconnect()
    }
}
