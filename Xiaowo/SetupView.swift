import UIKit

/// 第一次启动的服务器地址配置层。
/// 全代码构建（不进 XIB/Storyboard），风格跟着小窝的粉白主题走。
final class SetupView: UIView, UITextFieldDelegate {

    var onConnect: ((String) -> Bool)?

    private let card = UIView()
    private let iconView = UIImageView()
    private let titleLabel = UILabel()
    private let field = UITextField()
    private let hintLabel = UILabel()
    private let goButton = UIButton(type: .system)
    private let errorLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        build()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        build()
    }

    private let pink = UIColor(red: 0.957, green: 0.396, blue: 0.541, alpha: 1) // #f4658a
    private let cream = UIColor(red: 0.992, green: 0.969, blue: 0.957, alpha: 1) // #fdf7f4

    private func build() {
        backgroundColor = cream

        // 背景：左上/右下两团淡粉圆做装饰，呼应网页版
        let blob1 = UIView()
        blob1.backgroundColor = pink.withAlphaComponent(0.10)
        blob1.layer.cornerRadius = 140
        blob1.frame = CGRect(x: -90, y: -70, width: 280, height: 280)
        blob1.isUserInteractionEnabled = false
        addSubview(blob1)

        let blob2 = UIView()
        blob2.backgroundColor = pink.withAlphaComponent(0.08)
        blob2.layer.cornerRadius = 110
        blob2.frame = CGRect(x: UIScreen.main.bounds.width - 120, y: UIScreen.main.bounds.height - 220, width: 220, height: 220)
        blob2.isUserInteractionEnabled = false
        addSubview(blob2)

        // 卡片
        card.backgroundColor = .white
        card.layer.cornerRadius = 24
        card.layer.shadowColor = pink.cgColor
        card.layer.shadowOpacity = 0.12
        card.layer.shadowRadius = 20
        card.layer.shadowOffset = CGSize(width: 0, height: 8)
        card.translatesAutoresizingMaskIntoConstraints = false
        addSubview(card)

        iconView.contentMode = .scaleAspectFit
        iconView.image = UIImage(named: "SetupHeart") ?? makeFallbackHeart()
        iconView.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(iconView)

        titleLabel.text = "小窝 · 专属"
        titleLabel.font = .systemFont(ofSize: 26, weight: .bold)
        titleLabel.textColor = .init(red: 0.24, green: 0.13, blue: 0.17, alpha: 1)
        titleLabel.textAlignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(titleLabel)

        let subtitle = UILabel()
        subtitle.text = "把家里那台小窝服务器的地址填进来\n手机和电脑连同一个 Wi-Fi 就能进"
        subtitle.font = .systemFont(ofSize: 14)
        subtitle.textColor = .secondaryLabel
        subtitle.textAlignment = .center
        subtitle.numberOfLines = 0
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(subtitle)

        field.placeholder = "例如 192.168.1.5:7788 或 你的域名"
        field.keyboardType = .URL
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.returnKeyType = .go
        field.clearButtonMode = .whileEditing
        field.delegate = self
        field.borderStyle = .roundedRect
        field.font = .systemFont(ofSize: 16)
        field.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(field)

        goButton.setTitle("推门进去", for: .normal)
        goButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        goButton.setTitleColor(.white, for: .normal)
        goButton.backgroundColor = pink
        goButton.layer.cornerRadius = 14
        goButton.translatesAutoresizingMaskIntoConstraints = false
        goButton.addTarget(self, action: #selector(goTapped), for: .touchUpInside)
        card.addSubview(goButton)

        hintLabel.text = "不知道地址？在电脑上打开 start.bat，\n窗口里写的「本机访问」和「局域网」就是。"
        hintLabel.font = .systemFont(ofSize: 12)
        hintLabel.textColor = .tertiaryLabel
        hintLabel.textAlignment = .center
        hintLabel.numberOfLines = 0
        hintLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(hintLabel)

        errorLabel.font = .systemFont(ofSize: 13, weight: .medium)
        errorLabel.textColor = .systemRed
        errorLabel.textAlignment = .center
        errorLabel.numberOfLines = 0
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(errorLabel)

        NSLayoutConstraint.activate([
            card.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -20),
            card.leadingAnchor.constraint(equalTo: leadingAnchor, constant: 28),
            card.trailingAnchor.constraint(equalTo: trailingAnchor, constant: -28),

            iconView.topAnchor.constraint(equalTo: card.topAnchor, constant: 28),
            iconView.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            iconView.widthAnchor.constraint(equalToConstant: 84),
            iconView.heightAnchor.constraint(equalToConstant: 84),

            titleLabel.topAnchor.constraint(equalTo: iconView.bottomAnchor, constant: 12),
            titleLabel.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            titleLabel.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),

            subtitle.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            subtitle.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 20),
            subtitle.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -20),

            field.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 20),
            field.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 24),
            field.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -24),
            field.heightAnchor.constraint(equalToConstant: 46),

            goButton.topAnchor.constraint(equalTo: field.bottomAnchor, constant: 16),
            goButton.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            goButton.trailingAnchor.constraint(equalTo: field.trailingAnchor),
            goButton.heightAnchor.constraint(equalToConstant: 50),

            errorLabel.topAnchor.constraint(equalTo: goButton.bottomAnchor, constant: 10),
            errorLabel.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            errorLabel.trailingAnchor.constraint(equalTo: field.trailingAnchor),

            hintLabel.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 6),
            hintLabel.leadingAnchor.constraint(equalTo: field.leadingAnchor),
            hintLabel.trailingAnchor.constraint(equalTo: field.trailingAnchor),
            hintLabel.bottomAnchor.constraint(lessThanOrEqualTo: card.bottomAnchor, constant: -24),
        ])
    }

    private func makeFallbackHeart() -> UIImage? {
        let size = CGSize(width: 84, height: 84)
        let renderer = UIGraphicsImageRenderer(size: size)
        return renderer.image { ctx in
            // 简版爱心：两圆一三角
            let pinkFill = pink.cgColor
            ctx.cgContext.setFillColor(pinkFill)
            ctx.cgContext.addEllipse(in: CGRect(x: 12, y: 14, width: 30, height: 30))
            ctx.cgContext.addEllipse(in: CGRect(x: 42, y: 14, width: 30, height: 30))
            ctx.cgContext.fillPath()
            let path = UIBezierPath()
            path.move(to: CGPoint(x: 12, y: 36))
            path.addLine(to: CGPoint(x: 72, y: 36))
            path.addLine(to: CGPoint(x: 42, y: 74))
            path.close()
            ctx.cgContext.addPath(path.cgPath)
            ctx.cgContext.fillPath()
        }
    }

    @objc private func goTapped() {
        errorLabel.text = nil
        guard let cb = onConnect else { return }
        let ok = cb(field.text ?? "")
        if ok { endEditing(true) }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        goTapped()
        return true
    }

    func showError(_ text: String) {
        errorLabel.text = text
    }
}
