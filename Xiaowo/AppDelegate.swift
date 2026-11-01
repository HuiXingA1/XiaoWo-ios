import UIKit
import WebKit

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        // 无 SceneDelegate：Info.plist 不带 UIApplicationSceneManifest 时走 window 生命周期
        window = UIWindow(frame: UIScreen.main.bounds)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        // 进后台 → PushRelay 保持 SSE 长连接收悄悄话事件（回前台由 MainViewController 停掉）
        NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main
        ) { _ in
            PushRelay.shared.handleDidEnterBackground()
        }
        return true
    }

    // 冷启动点开 http(s) 链接也进 App（用系统分享/浏览器打开链接的场景）
    func application(
        _ app: UIApplication,
        open url: URL,
        options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    ) -> Bool {
        if let vc = window?.rootViewController as? MainViewController {
            vc.handleIncomingURL(url)
            return true
        }
        return false
    }
}
