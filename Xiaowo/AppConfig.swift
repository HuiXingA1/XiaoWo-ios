import Foundation

/// 服务器地址 + 小偏好，持久化在 UserDefaults。
/// 只存 App 自己的东西，聊天记录/日记等业务数据全在小窝服务器上。
final class AppConfig {
    static let shared = AppConfig()

    private enum Keys {
        static let serverBase = "xiaowo.serverBase"
        static let lastVisit = "xiaowo.lastVisit"
    }

    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// 已配置的服务器根地址；nil 表示第一次启动还没配
    var serverBaseURL: URL? {
        get {
            guard let s = defaults.string(forKey: Keys.serverBase), !s.isEmpty else { return nil }
            return URL(string: s)
        }
        set {
            if let u = newValue {
                defaults.set(u.absoluteString, forKey: Keys.serverBase)
            } else {
                defaults.removeObject(forKey: Keys.serverBase)
            }
        }
    }

    var lastVisitDate: Date? {
        get { defaults.object(forKey: Keys.lastVisit) as? Date }
        set { defaults.set(newValue, forKey: Keys.lastVisit) }
    }
}
