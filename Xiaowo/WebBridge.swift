import UIKit
import WebKit
import CoreLocation

/// 原生 ⇄ JS 桥。
/// 目标只有一个：让网页在小窝 App 里更像原生 App，同时**不改网页代码**——
/// 通过 WKUserScript 注入一小段垫片，把网页已有的浏览器 API 转接到原生：
///   · navigator.geolocation        → CoreLocation（网页定位更快更稳，后台可续）
///   · <input type=file>            → 原生相册/拍照（UIDocumentPicker 不弹「相机」问题）
///   · document.title / 标题角标     → 主屏角标（悄悄话小红点搬上图标）
///   · Cookie 同步                  → WKWebView 的 Cookie 交给 HTTPCookieStorage
final class WebBridge: NSObject, CLLocationManagerDelegate, WKScriptMessageHandler {

    private weak var webView: WKWebView?
    private weak var viewController: UIViewController?
    private let locationManager = CLLocationManager()
    var baseURL: URL?

    /// 后台定位任务（离开 App 后定位上报仍继续一小段）
    private var bgTask: UIBackgroundTaskIdentifier = .invalid

    init(webView: WKWebView, viewController: UIViewController) {
        self.webView = webView
        self.viewController = viewController
        super.init()
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        locationManager.activityType = CLActivityType.otherNavigation
        locationManager.pausesLocationUpdatesAutomatically = false
        installUserScripts()
        observeTitle()
    }

    // MARK: - 垫片脚本（页面文档加载前注入）

    private func installUserScripts() {
        // 1) 记录原生 geolocation 是否可用，把浏览器的定位调用转发给原生
        let geoShim = """
        (function(){
          if (!window.webkit || !window.webkit.messageHandlers || !window.messageHandlers.xiaowoGeo) return;
          const handler = window.webkit.messageHandlers.xiaowoGeo;
          if (!navigator.geolocation) return;
          const orig = navigator.geolocation.__orig || navigator.geolocation;
          let seq = 0;
          const native = {
            getCurrentPosition(success, error, options) {
              const id = 'cur' + (++seq);
              pending.set(id, {success, error});
              handler.postMessage({type:'getCurrent', id, options: {accuracy: options && options.enableHighAccuracy ? 'hi' : 'co'}});
            },
            watchPosition(success, error, options) {
              const id = 'w' + (++seq);
              pending.set(id, {success, error});
              handler.postMessage({type:'watch', id, options: {accuracy: options && options.enableHighAccuracy ? 'hi' : 'co'}});
              return id;
            },
            clearWatch(id) { pending.delete(id); handler.postMessage({type:'clear', id}); },
          };
          navigator.geolocation.__orig = orig;
          Object.defineProperty(navigator, 'geolocation', {value: native, configurable: true});
          const pending = new Map();
          window.__xiaowoGeoEvent = function(id, ok, lat, lng, acc, code, msg) {
            const cb = pending.get(id); if (!cb) return;
            if (ok) { cb.success({coords:{latitude:lat, longitude:lng, accuracy:acc, altitude:null, altitudeAccuracy:null, heading:null, speed:null}, timestamp: Date.now()}); }
            else { cb.error && cb.error({code: code===1?1:(code===2?2:3), message: msg || '定位失败', PERMISSION_DENIED:1, POSITION_UNAVAILABLE:2, TIMEOUT:3}); }
            if (String(id).startsWith('cur')) pending.delete(id);
          };
        })();
        """
        let geoScript = WKUserScript(source: geoShim, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView?.configuration.userContentController.addUserScript(geoScript)
        webView?.configuration.userContentController.add(self, name: "xiaowoGeo")

        // 2) 标题角标：网页把未读数写进 document.title（"悄悄话 · 小窝 (3)"）时同步到 App 图标
        let titleShim = """
        (function(){
          const orig = document.__origTitleDesc || Object.getOwnPropertyDescriptor(Document.prototype, 'title');
          document.__origTitleDesc = orig;
          Object.defineProperty(document, 'title', {
            get() { return orig.get.call(document); },
            set(v) {
              orig.set.call(document, v);
              if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.xiaowoTitle) {
                window.webkit.messageHandlers.xiaowoTitle.postMessage(String(v));
              }
            },
            configurable: true
          });
        })();
        """
        let titleScript = WKUserScript(source: titleShim, injectionTime: .atDocumentStart, forMainFrameOnly: false)
        webView?.configuration.userContentController.addUserScript(titleScript)
        webView?.configuration.userContentController.add(self, name: "xiaowoTitle")
    }

    // MARK: - 标题 → 角标

    private func observeTitle() {
        webView?.addObserver(self, forKeyPath: "title", options: [.new], context: nil)
    }

    override func observeValue(forKeyPath keyPath: String?, of object: Any?,
                               change: [NSKeyValueChangeKey: Any]?, context: UnsafeMutableRawPointer?) {
        if keyPath == "title", let vc = viewController as? MainViewController {
            // 原生侧兜底：JS 垫片万一没跑（页面崩溃重载），标题变化也能被抓到
            applyBadge(fromTitle: webView?.title ?? "")
            vc.view.setNeedsLayout()
        }
    }

    private func applyBadge(fromTitle title: String) {
        // 网页标题格式："悄悄话 · 小窝 (3)" / "小窝 · 专属" —— 只把括号里的数字当未读
        let pattern = "\\((\\d+)\\)\\s*$"
        guard let re = try? NSRegularExpression(pattern: pattern) else { return }
        let ns = title as NSString
        if let m = re.firstMatch(in: title, range: NSRange(location: 0, length: ns.length)),
           let n = Int(ns.substring(with: m.range(at: 1))), n > 0 {
            UIApplication.shared.applicationIconBadgeNumber = n
        } else {
            UIApplication.shared.applicationIconBadgeNumber = 0
        }
    }

    // MARK: - Cookie 同步

    /// 把 WKWebView 里的 Cookie 同步到 HTTPCookieStorage，供后台定位上报请求复用
    func syncAppCookies(completion: @escaping (Error?) -> Void) {
        guard let store = webView?.configuration.websiteDataStore.httpCookieStore,
              let base = baseURL else { completion(nil); return }
        let sema = DispatchSemaphore(value: 0)
        store.getAllCookies { cookies in
            let target = HTTPCookieStorage.shared
            for c in cookies {
                if let host = base.host, c.domain.contains(host) {
                    target.setCookie(c)
                }
            }
            sema.signal()
        }
        DispatchQueue.global().async {
            _ = sema.wait(timeout: .now() + 3)
            completion(nil)
        }
    }

    // MARK: - WKScriptMessageHandler

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        switch message.name {
        case "xiaowoGeo": handleGeoMessage(message.body)
        case "xiaowoTitle": applyBadge(fromTitle: (message.body as? String) ?? "")
        default: break
        }
    }

    // MARK: - 定位

    private struct GeoPending {
        var watching = false
    }

    private var geoPending: [String: GeoPending] = [:]

    private func handleGeoMessage(_ body: Any) {
        guard let dict = body as? [String: Any] else { return }
        let type = dict["type"] as? String ?? ""
        let id = dict["id"] as? String ?? ""
        switch type {
        case "getCurrent", "watch":
            let isWatch = (type == "watch")
            geoPending[id] = GeoPending(watching: isWatch)
            askAndStart(id: id)
        case "clear":
            geoPending.removeValue(forKey: id)
            if geoPending.isEmpty { stopLocation() }
        default: break
        }
    }

    private func askAndStart(id: String) {
        let status = locationManager.authorizationStatus
        switch status {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
            pendingFirstFix = id
        case .denied, .restricted:
            emitGeo(id: id, ok: false, code: 1, msg: "定位权限被关闭，请到 设置 → 隐私 → 定位服务 里打开")
        case .authorizedWhenInUse, .authorizedAlways:
            startUpdating(id: id)
        @unknown default:
            emitGeo(id: id, ok: false, code: 2, msg: "未知定位状态")
        }
    }

    private var pendingFirstFix: String?

    private func startUpdating(id: String) {
        currentGeoId = id
        if !CLLocationManager.locationServicesEnabled() {
            emitGeo(id: id, ok: false, code: 2, msg: "系统定位服务已关闭")
            return
        }
        locationManager.startUpdatingLocation()
        // 15 秒还没拿到点就报 TIMEOUT，跟浏览器一致
        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            guard let self, self.currentGeoId == id else { return }
            if self.lastEmittedAt == nil {
                self.emitGeo(id: id, ok: false, code: 3, msg: "定位超时，信号不好")
            }
        }
    }

    private func stopLocation() {
        locationManager.stopUpdatingLocation()
        currentGeoId = nil
        pendingFirstFix = nil
    }

    private var currentGeoId: String?
    private var lastEmittedAt: Date?

    private func emitGeo(id: String, ok: Bool, lat: Double = 0, lng: Double = 0, acc: Double = 0, code: Int = 0, msg: String = "") {
        lastEmittedAt = ok ? Date() : lastEmittedAt
        let script = "window.__xiaowoGeoEvent && window.__xiaowoGeoEvent(\(json(id)), \(ok), \(lat), \(lng), \(acc), \(code), \(json(msg)));"
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private func json(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        return String(data: data ?? Data("".utf8), encoding: .utf8) ?? "\"\""
    }

    // MARK: - CLLocationManagerDelegate

    func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        guard let id = pendingFirstFix else { return }
        if status == .authorizedWhenInUse || status == .authorizedAlways {
            pendingFirstFix = nil
            startUpdating(id: id)
        } else if status == .denied {
            pendingFirstFix = nil
            emitGeo(id: id, ok: false, code: 1, msg: "定位权限被拒绝")
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let id = currentGeoId, let loc = locations.last else { return }
        emitGeo(id: id, ok: true,
                lat: loc.coordinate.latitude, lng: loc.coordinate.longitude,
                acc: loc.horizontalAccuracy)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard let id = currentGeoId else { return }
        emitGeo(id: id, ok: false, code: 2, msg: error.localizedDescription)
    }
}
