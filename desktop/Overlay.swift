import AppKit
import ImageIO

// Updating/orderFrontRegardless never activates the app. A standard window
// supports accessibility; only deliberate interaction can give it focus.
// Transparent pixels are excluded from mouse handling below.
final class FloatingPanel: NSWindow {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }

    init(title: String, size: NSSize) {
        super.init(contentRect: NSRect(origin: .zero, size: size),
                   styleMask: [.titled, .fullSizeContentView],
                   backing: .buffered, defer: false)
        self.title = title
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
        isMovableByWindowBackground = false
        isReleasedWhenClosed = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        level = .floating
        hidesOnDeactivate = false
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .ignoresCycle]
    }
}

class DragView: NSView {
    var onDrag: ((NSSize) -> Void)?
    var onRelease: (() -> Void)?
    var onRightClick: (() -> Void)?
    var onClick: (() -> Void)?
    private var moved = false
    private var lastPoint: NSPoint?
    var dragging: Bool { lastPoint != nil }
    override var isFlipped: Bool { true }
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
    override func mouseDown(with event: NSEvent) { lastPoint = window?.convertPoint(toScreen: event.locationInWindow); moved = false }
    override func mouseDragged(with event: NSEvent) {
        moved = true
        let point = window?.convertPoint(toScreen: event.locationInWindow) ?? NSEvent.mouseLocation
        if let last = lastPoint {
            onDrag?(NSSize(width: point.x - last.x, height: point.y - last.y))
        }
        lastPoint = point
    }
    override func mouseUp(with event: NSEvent) {
        lastPoint = nil
        onRelease?()
        if !moved { onClick?() }
    }
    override func rightMouseUp(with event: NSEvent) { onRightClick?() }
}

final class FlippedView: NSView { override var isFlipped: Bool { true } }
struct BubbleTheme: Decodable {
    let name: String, symbol: String, accent: String, soft: String
    let surface: String, bottom: String, border: String, ink: String, muted: String
    static let all = try! JSONDecoder().decode([String: BubbleTheme].self,
        from: Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("assets/bubble-themes.json")))
    static func forCharacter(_ id: String) -> BubbleTheme { all[String(id.split(separator: "-").first ?? "deepseek")] ?? all["deepseek"]! }
}
func tint(_ hex: String) -> NSColor { color(UInt32(hex, radix: 16)!) }

final class BubbleView: NSView {
    var theme = BubbleTheme.forCharacter("deepseek") { didSet { needsDisplay = true } }
    var tailX: CGFloat = 234 { didSet { needsDisplay = true } }
    override var isFlipped: Bool { true }
    var outline: NSBezierPath {
        let w = bounds.width - 1, h = bounds.height - 13, r: CGFloat = 22
        let t = max(40, min(tailX, w - 40))
        let p = NSBezierPath()
        p.move(to: NSPoint(x: r, y: 0.5))
        p.line(to: NSPoint(x: w-r, y: 0.5))
        p.curve(to: NSPoint(x: w, y: r), controlPoint1: NSPoint(x: w-7, y: 0.5), controlPoint2: NSPoint(x: w, y: 7))
        p.line(to: NSPoint(x: w, y: h-r))
        p.curve(to: NSPoint(x: w-r, y: h), controlPoint1: NSPoint(x: w, y: h-7), controlPoint2: NSPoint(x: w-7, y: h))
        p.line(to: NSPoint(x: t+14, y: h))
        p.curve(to: NSPoint(x: t, y: h+12), controlPoint1: NSPoint(x: t+12, y: h+6), controlPoint2: NSPoint(x: t+6, y: h+11))
        p.curve(to: NSPoint(x: t-10, y: h), controlPoint1: NSPoint(x: t, y: h+8), controlPoint2: NSPoint(x: t-3, y: h+4))
        p.line(to: NSPoint(x: r, y: h))
        p.curve(to: NSPoint(x: 0.5, y: h-r), controlPoint1: NSPoint(x: 7, y: h), controlPoint2: NSPoint(x: 0.5, y: h-7))
        p.line(to: NSPoint(x: 0.5, y: r))
        p.curve(to: NSPoint(x: r, y: 0.5), controlPoint1: NSPoint(x: 0.5, y: 7), controlPoint2: NSPoint(x: 7, y: 0.5))
        p.close(); return p
    }
    override func draw(_ dirtyRect: NSRect) {
        let path = outline
        NSGradient(starting: tint(theme.surface), ending: tint(theme.bottom))!.draw(in: path, angle: 90)
        tint(theme.border).setStroke(); path.lineWidth = 1; path.stroke()
    }
}
final class Label: NSTextField {
    // Let the header/orb underneath receive drag events.
    override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

struct Task: Decodable {
    let id: String
    let parentId: String?
    let title: String
    let state: String
    let stage: String
    let detail: String?
    let startedAt: Double?
    var active: Bool { ["running", "approval", "input"].contains(state) }
    var waiting: Bool { ["approval", "input"].contains(state) }
}
struct Snapshot: Decodable {
    let type: String
    let `protocol`: Int
    let tasks: [Task]
    let companion: CompanionState?
}

struct AnimationState: Decodable { let row: Int; let durations: [Double] }
struct CharacterOption: Decodable { let id: String; let label: String }
struct CompanionState: Decodable {
    let id: String; let label: String; let state: String
    let scale: Double; let mode: String; let rotationSeconds: Double
    let bubbleHidden: Bool
    let favorites: [String]; let line: String
    let animation: AnimationState; let options: [CharacterOption]
}
final class SpriteView: DragView {
    var atlas: CGImage?
    var spriteID = ""
    var row = 0
    var durations: [Double] = [1680, 660, 660, 840, 840, 1920]
    var epoch = ProcessInfo.processInfo.systemUptime
    var currentFrame = 0
    var frameImage: NSImage?
    var mask: [UInt8] = []
    var tickCount = 0
    func configure(_ state: CompanionState) {
        if spriteID != state.id {
            spriteID = state.id
            let url = Bundle.main.resourceURL!.appendingPathComponent("assets/sprites/\(state.id).png")
            if let source = CGImageSourceCreateWithURL(url as CFURL, nil) { atlas = CGImageSourceCreateImageAtIndex(source, 0, nil) }
            else { atlas = nil; FileHandle.standardError.write(Data("Missing character atlas: \(state.id)\n".utf8)) }
            frameImage = nil
        }
        if row != state.animation.row { epoch = ProcessInfo.processInfo.systemUptime; frameImage = nil }
        row = state.animation.row; durations = state.animation.durations
        setAccessibilityLabel(state.label + " · " + state.state)
        advance()
    }
    func advance() {
        guard !durations.isEmpty else { return }
        let total = durations.reduce(0, +)
        var time = ((ProcessInfo.processInfo.systemUptime - epoch) * 1000).truncatingRemainder(dividingBy: total)
        var index = 0
        while index < durations.count - 1 && time >= durations[index] { time -= durations[index]; index += 1 }
        if index != currentFrame || frameImage == nil {
            currentFrame = index; tickCount += 1
            if let cg = atlas?.cropping(to: CGRect(x: index * 192, y: row * 208, width: 192, height: 208)) {
                frameImage = NSImage(cgImage: cg, size: NSSize(width: 192, height: 208))
                var pixels = [UInt8](repeating: 0, count: 192 * 208 * 4)
                pixels.withUnsafeMutableBytes { bytes in
                    if let context = CGContext(data: bytes.baseAddress, width: 192, height: 208, bitsPerComponent: 8, bytesPerRow: 192 * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) {
                        context.draw(cg, in: CGRect(x: 0, y: 0, width: 192, height: 208))
                    }
                }
                mask = stride(from: 3, to: pixels.count, by: 4).map { pixels[$0] }
            }
            needsDisplay = true
        }
    }
    func containsPixel(_ point: NSPoint) -> Bool {
        let x = Int(point.x / bounds.width * 192), y = Int(point.y / bounds.height * 208)
        return x >= 0 && x < 192 && y >= 0 && y < 208 && mask.count == 192 * 208 && mask[y * 192 + x] > 24
    }
    override func draw(_ dirtyRect: NSRect) {
        frameImage?.draw(in: bounds, from: .zero, operation: .sourceOver, fraction: 1, respectFlipped: true, hints: [.interpolation: NSImageInterpolation.high])
    }
}

func color(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

@discardableResult
func label(_ text: String, size: CGFloat, color value: UInt32,
           frame: NSRect, in parent: NSView, bold: Bool = false, lines: Int = 1) -> Label {
    let view = Label(wrappingLabelWithString: text)
    view.frame = frame
    view.font = .systemFont(ofSize: size, weight: bold ? .semibold : .regular)
    view.textColor = color(value)
    view.maximumNumberOfLines = lines
    view.lineBreakMode = lines > 1 ? .byWordWrapping : .byTruncatingTail
    view.cell?.usesSingleLineMode = lines == 1
    view.cell?.truncatesLastVisibleLine = true
    view.isSelectable = false
    parent.addSubview(view)
    return view
}

final class Overlay: NSObject, NSApplicationDelegate {
    let panel = FloatingPanel(title: "AI 娘值班室 · 全局任务", size: NSSize(width: 66, height: 66))
    let root = FlippedView()
    let orbView = SpriteView(frame: NSRect(x: 0, y: 0, width: 192, height: 208))
    let body = BubbleView()
    let header = DragView()
    let scroll = NSScrollView()
    let cards = FlippedView()
    var heading: Label!
    var subtitle: Label!
    var emblem: Label!
    var emblemPlate = FlippedView()
    var headerButtons: [NSButton] = []
    var theme = BubbleTheme.forCharacter("deepseek")
    var characterButton: NSButton!
    var companion: CompanionState?
    var animationTimer: Timer?
    var statusItem: NSStatusItem?
    var menuOpen = false
    var petWidth: CGFloat { 192 * CGFloat(companion?.scale ?? 1) }
    var petHeight: CGFloat { 208 * CGFloat(companion?.scale ?? 1) + 28 }
    var expandButton: NSButton!
    var tasks: [Task] = []
    var elapsed: [(Label, Double)] = []
    var expanded = false
    var bubbleHidden = false
    var bubbleVisible: Bool { !bubbleHidden && (!tasks.isEmpty || !(companion?.line.isEmpty ?? true)) }
    var bubbleHeight: CGFloat = 100
    var bubbleWidth: CGFloat { tasks.isEmpty ? 270 : 320 }
    var revision = 0
    var clock: Timer?
    var hitTimer: Timer?
    var anchor = NSPoint.zero
    // The reader coalesces input before dispatching to AppKit's main thread.
    let inputLock = NSLock()
    var pending: Snapshot?
    var queued = false
    let positionURL = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/DshAiGirls/window.json")

    func applicationDidFinishLaunching(_ notification: Notification) {
        panel.contentView = root
        NSApp.mainMenu = NSMenu()
        NSApp.mainMenu?.addItem(NSMenuItem(title: "角色与设置", action: nil, keyEquivalent: ""))
        root.addSubview(orbView)
        orbView.toolTip = "拖动角色调整位置；右键打开角色与显示设置"
        characterButton = button("角色与设置 ⚙", action: #selector(showMenu), frame: .zero, in: root, help: "角色与显示设置")
        characterButton.wantsLayer = true
        characterButton.layer?.cornerRadius = 12
        characterButton.layer?.borderWidth = 1
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem?.button?.title = "鲸"
        statusItem?.button?.target = self
        statusItem?.button?.action = #selector(showMenu)
        root.addSubview(body)
        header.frame = NSRect(x: 16, y: 13, width: 288, height: 34)
        body.addSubview(header)
        emblemPlate.frame = NSRect(x: 0, y: 0, width: 32, height: 32)
        emblemPlate.wantsLayer = true; emblemPlate.layer?.cornerRadius = 11
        header.addSubview(emblemPlate)
        emblem = label("≈", size: 23, color: 0x596EC0, frame: NSRect(x: 0, y: 0, width: 32, height: 30), in: emblemPlate)
        emblem.alignment = .center
        heading = label("DeepSeek", size: 12, color: 0x34415F,
                        frame: NSRect(x: 42, y: 0, width: 180, height: 17), in: header, bold: true)
        subtitle = label("全局任务", size: 10, color: 0x7A86A2,
                        frame: NSRect(x: 42, y: 18, width: 180, height: 15), in: header)
        headerButtons = [button("−", action: #selector(collapse), frame: .zero, in: header, help: "收起气泡；右键角色可恢复"),
                         button("×", action: #selector(closeOverlay), frame: .zero, in: header, help: "关闭桌面窗口（不停止任务）")]
        scroll.drawsBackground = false
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.documentView = cards
        body.addSubview(scroll)
        expandButton = button("展开任务", action: #selector(toggleExpanded), frame: .zero,
                              in: body, help: "展开全部任务和子任务")
        for view in [orbView, header] {
            view.onDrag = { [weak self] delta in
                guard let self = self else { return }
                self.anchor.x += delta.width; self.anchor.y += delta.height
                self.placePanels()
            }
            view.onRelease = { [weak self] in self?.savePosition() }
        }
        orbView.onRightClick = { [weak self] in self?.showMenu() }
        orbView.onClick = { [weak self] in self?.toggleBubble() }
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 700)
        anchor = NSPoint(x: screen.maxX - 230, y: screen.minY + 36)
        if let data = try? Data(contentsOf: positionURL),
           let xy = try? JSONDecoder().decode([Double].self, from: data), xy.count == 2,
           xy.allSatisfy({ $0.isFinite }) {
            anchor = NSPoint(x: xy[0], y: xy[1])
        }
        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
        render()
        panel.orderFrontRegardless()
        clock = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.updateElapsed() }
        hitTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.updateHitRegions() }
        animationTimer = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in self?.orbView.advance() }
        RunLoop.main.add(animationTimer!, forMode: .common)
        emit(["type": "ready"])
        DispatchQueue.global(qos: .utility).async { [weak self] in self?.readInput() }
    }

    func button(_ title: String, action: Selector, frame: NSRect, in parent: NSView, help: String) -> NSButton {
        let view = NSButton(title: title, target: self, action: action)
        view.frame = frame
        view.isBordered = false
        view.font = .systemFont(ofSize: 13)
        view.contentTintColor = color(0xA6CFF1)
        view.focusRingType = .none
        view.toolTip = help
        view.setAccessibilityLabel(help)
        parent.addSubview(view)
        return view
    }

    func readInput() {
        while let line = readLine() {
            guard let data = line.data(using: .utf8),
                  let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
                  snapshot.type == "snapshot", snapshot.protocol == 1 else { continue }
            inputLock.lock()
            pending = snapshot
            let schedule = !queued
            queued = true
            inputLock.unlock()
            if schedule {
                DispatchQueue.main.async { [weak self] in
                    guard let self = self else { return }
                    self.inputLock.lock()
                    self.tasks = self.pending?.tasks ?? []
                    self.companion = self.pending?.companion
                    self.bubbleHidden = self.companion?.bubbleHidden ?? false
                    self.pending = nil; self.queued = false
                    self.inputLock.unlock()
                    self.revision += 1
                    self.render()
                }
            }
        }
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }

    func render() {
        cards.subviews.forEach { $0.removeFromSuperview() }
        elapsed.removeAll()
        let active = tasks.filter { $0.active }.count
        if let state = companion {
            theme = BubbleTheme.forCharacter(state.id); body.theme = theme
            orbView.configure(state)
            characterButton.title = theme.name + (state.id.hasSuffix("chibi") ? " · Q 版" : "") + "  ⚙"
            NSApp.mainMenu?.items.first?.submenu = makeMenu()
        }
        heading.stringValue = theme.name
        heading.textColor = tint(theme.ink)
        subtitle.stringValue = tasks.isEmpty ? "陪你歇一会儿" : active > 0 ? "全局任务 · \(active) 项进行中" : "本轮结果"
        subtitle.textColor = tint(theme.muted)
        emblem.stringValue = theme.symbol; emblem.textColor = tint(theme.accent)
        emblemPlate.layer?.backgroundColor = tint(theme.soft).cgColor
        characterButton.layer?.backgroundColor = tint(theme.surface).withAlphaComponent(0.96).cgColor
        characterButton.layer?.borderColor = tint(theme.border).cgColor
        characterButton.contentTintColor = tint(theme.accent)
        characterButton.font = .systemFont(ofSize: 10, weight: .medium)
        expandButton.contentTintColor = tint(theme.accent)
        header.frame.size.width = bubbleWidth - 32
        for (i, button) in headerButtons.enumerated() {
            button.frame = NSRect(x: header.bounds.width - 48 + CGFloat(i) * 26, y: 3, width: 22, height: 24)
            button.contentTintColor = tint(theme.muted)
        }
        let ids = Set(tasks.map { $0.id })
        let roots = tasks.enumerated().filter { $0.element.parentId == nil || !ids.contains($0.element.parentId!) }
            .sorted {
                let l = priority($0.element), r = priority($1.element)
                return l == r ? $0.offset < $1.offset : l < r
            }.map { $0.element }
        var y: CGFloat = 0
        for task in expanded ? roots : Array(roots.prefix(3)) {
            addCard(task, child: false, y: &y)
            let children = descendants(task.id)
            if expanded {
                for child in children { addCard(child, child: true, y: &y) }
            } else if !children.isEmpty {
                label("↳ \(children.count) 个子任务" + (children.contains { $0.waiting } ? " · 需要处理" : ""),
                      size: 10, color: UInt32(theme.muted, radix: 16)!, frame: NSRect(x: 14, y: y, width: 264, height: 20), in: cards)
                y += 28
            }
        }
        if let line = companion?.line, !line.isEmpty {
            let lineWidth = bubbleWidth - 48
            let lineHeight = min(60, max(22, ceil((line as NSString).boundingRect(with: NSSize(width: lineWidth, height: 60), options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: NSFont.systemFont(ofSize: 13)]).height)))
            label(line, size: 13, color: UInt32(theme.ink, radix: 16)!, frame: NSRect(x: 8, y: y + 3, width: lineWidth, height: lineHeight), in: cards, lines: 3)
            y += lineHeight + 14
        }
        let showExpand = roots.count > 3 || roots.count != tasks.count
        expandButton.isHidden = !showExpand
        expandButton.title = expanded ? "收起任务列表" : "展开全部 \(tasks.count) 个任务"
        let screenHeight = screenForAnchor().visibleFrame.height
        let height = min(y, min(380, max(72, screenHeight - petHeight - 110)))
        scroll.frame = NSRect(x: 16, y: 58, width: bubbleWidth - 32, height: height)
        cards.frame = NSRect(x: 0, y: 0, width: bubbleWidth - 32, height: y)
        expandButton.frame = NSRect(x: 18, y: 58 + height, width: bubbleWidth - 36, height: 24)
        bubbleHeight = 80 + height + (showExpand ? 26 : 0)
        body.isHidden = !bubbleVisible
        placePanels()
        updateElapsed()
        emit(["type": "rendered", "revision": revision, "count": tasks.count,
              "active": active, "topmost": panel.level == .floating,
              "visible": panel.isVisible, "bubbleVisible": bubbleVisible,
              "foreground": NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0,
              "window": panel.windowNumber, "character": companion?.id ?? "",
              "animation": companion?.state ?? "", "frame": orbView.currentFrame, "framesDrawn": orbView.tickCount])
    }

    func descendants(_ id: String, seen: Set<String> = []) -> [Task] {
        guard !seen.contains(id) else { return [] }
        let visited = seen.union([id])
        return tasks.filter { $0.parentId == id && !visited.contains($0.id) }
            .flatMap { [$0] + descendants($0.id, seen: visited) }
    }
    func priority(_ task: Task) -> Int {
        if task.waiting || descendants(task.id).contains(where: { $0.waiting }) { return 0 }
        return task.active ? 1 : 2
    }

    func addCard(_ task: Task, child: Bool, y: inout CGFloat) {
        let x: CGFloat = child ? 12 : 0, width: CGFloat = bubbleWidth - 32 - x
        let card = FlippedView()
        card.wantsLayer = true
        card.layer?.backgroundColor = NSColor.white.withAlphaComponent(0.78).cgColor
        card.layer?.cornerRadius = 14
        card.layer?.borderColor = tint(theme.border).withAlphaComponent(0.55).cgColor
        card.layer?.borderWidth = 0.75
        cards.addSubview(card)
        var cy: CGFloat = 10
        let title = button((child ? "↳ " : "") + task.title + " ↗", action: #selector(openTask),
                           frame: NSRect(x: 12, y: cy, width: width - 24, height: 22), in: card, help: "打开任务：" + task.title)
        title.identifier = NSUserInterfaceItemIdentifier(task.id)
        title.alignment = .left
        title.font = .systemFont(ofSize: 13, weight: .semibold)
        title.contentTintColor = tint(theme.ink)
        title.lineBreakMode = .byTruncatingTail
        cy += 27
        let statusColor: UInt32 = task.state == "failed" ? 0xAD5268 : task.waiting ? 0xA27335 : UInt32(theme.accent, radix: 16)!
        let stageWidth = min(width - 100, CGFloat((task.stage as NSString).size(withAttributes: [.font: NSFont.systemFont(ofSize: 10, weight: .medium)]).width) + 27)
        let chip = FlippedView(frame: NSRect(x: 12, y: cy, width: max(54, stageWidth), height: 20))
        chip.wantsLayer = true; chip.layer?.cornerRadius = 7
        chip.layer?.backgroundColor = color(statusColor).withAlphaComponent(0.09).cgColor
        card.addSubview(chip)
        label("• " + task.stage, size: 10, color: statusColor, frame: NSRect(x: 6, y: 3, width: chip.bounds.width - 12, height: 15), in: chip, bold: true)
        if task.active, let start = task.startedAt {
            let view = label("", size: 10, color: UInt32(theme.muted, radix: 16)!,
                             frame: NSRect(x: width - 78, y: cy + 3, width: 64, height: 16), in: card)
            view.alignment = .right
            view.font = .monospacedDigitSystemFont(ofSize: 10, weight: .regular)
            elapsed.append((view, start))
        }
        cy += 27
        if let detail = task.detail, !detail.isEmpty {
            let rect = (detail as NSString).boundingRect(with: NSSize(width: width - 28, height: 36),
                options: [.usesLineFragmentOrigin, .usesFontLeading],
                attributes: [.font: NSFont.systemFont(ofSize: 12)])
            let height = min(36, max(18, ceil(rect.height)))
            label(detail, size: 12, color: UInt32(theme.muted, radix: 16)!,
                  frame: NSRect(x: 14, y: cy, width: width - 28, height: height), in: card, lines: 2)
            cy += height + 2
        }
        card.frame = NSRect(x: x, y: y, width: width, height: cy + 8)
        y += cy + 16
    }

    func updateElapsed() {
        for (view, start) in elapsed {
            let seconds = Int(max(0, Date().timeIntervalSince1970 - start / 1000))
            view.stringValue = String(format: "%02d:%02d", seconds / 60, seconds % 60)
        }
    }

    func screenForAnchor() -> NSScreen {
        let point = NSPoint(x: anchor.x + petWidth / 2, y: anchor.y + petHeight / 2)
        return NSScreen.screens.first { $0.frame.contains(point) } ?? NSScreen.screens[0]
    }
    func placePanels() {
        let visible = screenForAnchor().visibleFrame.insetBy(dx: 8, dy: 8)
        let width: CGFloat = bubbleVisible ? max(bubbleWidth, petWidth) : petWidth
        let height: CGFloat = bubbleVisible ? bubbleHeight + petHeight - 28 : petHeight
        anchor.x = max(visible.minX + width - petWidth, min(anchor.x, visible.maxX - petWidth))
        anchor.y = max(visible.minY, min(anchor.y, visible.maxY - height))
        panel.setFrame(NSRect(x: anchor.x + petWidth - width, y: anchor.y, width: width, height: height), display: true)
        body.frame = NSRect(x: width - bubbleWidth, y: 0, width: bubbleWidth, height: bubbleHeight)
        body.tailX = bubbleWidth - petWidth / 2 + 10
        orbView.frame = NSRect(x: width - petWidth, y: height - petHeight, width: petWidth, height: petHeight - 28)
        let badgeWidth = min(144, petWidth)
        characterButton.frame = NSRect(x: width - petWidth / 2 - badgeWidth / 2, y: height - 25, width: badgeWidth, height: 23)
        updateHitRegions()
    }

    func updateHitRegions() {
        guard !orbView.dragging && !header.dragging && !menuOpen else { return }
        let point = NSEvent.mouseLocation
        let local = NSPoint(x: point.x - panel.frame.minX, y: panel.frame.maxY - point.y)
        let inOrb = orbView.containsPixel(NSPoint(x: local.x - orbView.frame.minX, y: local.y - orbView.frame.minY)) || characterButton.frame.contains(local)
        let inBubble = bubbleVisible && body.outline.contains(NSPoint(x: local.x - body.frame.minX, y: local.y - body.frame.minY))
        panel.ignoresMouseEvents = !inOrb && !inBubble
    }
    func savePosition() {
        do {
            try FileManager.default.createDirectory(at: positionURL.deletingLastPathComponent(), withIntermediateDirectories: true)
            try JSONEncoder().encode([Double(anchor.x), Double(anchor.y)]).write(to: positionURL, options: .atomic)
        } catch { FileHandle.standardError.write(Data("Overlay position: \(error.localizedDescription)\n".utf8)) }
    }
    @objc func openTask(_ sender: NSButton) {
        guard let id = sender.identifier?.rawValue else { return }
        emit(["type": "navigate", "sessionId": id])
        NSWorkspace.shared.open(URL(string: "dsh://open")!)
    }
    func menuItem(_ title: String, patch: [String: Any], checked: Bool, in menu: NSMenu) {
        let item = NSMenuItem(title: title, action: #selector(changePreference), keyEquivalent: "")
        item.target = self; item.representedObject = patch; item.state = checked ? .on : .off
        menu.addItem(item)
    }
    func makeMenu() -> NSMenu {
        let menu = NSMenu(title: "角色与设置")
        guard let state = companion else { return menu }
        for option in state.options {
            menuItem(option.label, patch: ["id": option.id, "mode": "fixed"], checked: option.id == state.id, in: menu)
        }
        menu.addItem(.separator())
        for (id, title) in [("fixed", "固定当前角色"), ("sequential", "顺序轮换"), ("favorites", "收藏轮换"), ("random", "随机轮换")] {
            menuItem(title, patch: ["mode": id], checked: state.mode == id, in: menu)
        }
        var favorites = state.favorites
        if let index = favorites.firstIndex(of: state.id) { favorites.remove(at: index) } else { favorites.append(state.id) }
        menuItem(state.favorites.contains(state.id) ? "取消收藏当前形态" : "收藏当前形态", patch: ["favorites": favorites], checked: false, in: menu)
        let intervals = NSMenu(title: "轮换间隔")
        for seconds in [5, 10, 30, 60, 300, 900] { menuItem("\(seconds) 秒", patch: ["rotationSeconds": seconds], checked: state.rotationSeconds == Double(seconds), in: intervals) }
        let intervalItem = NSMenuItem(title: "轮换间隔", action: nil, keyEquivalent: ""); intervalItem.submenu = intervals; menu.addItem(intervalItem)
        let scales = NSMenu(title: "角色大小")
        for scale in [0.75, 1.0, 1.25, 1.5] { menuItem("\(Int(scale * 100))%", patch: ["scale": scale], checked: state.scale == scale, in: scales) }
        let scaleItem = NSMenuItem(title: "角色大小", action: nil, keyEquivalent: ""); scaleItem.submenu = scales; menu.addItem(scaleItem)
        menu.addItem(.separator())
        let toggle = NSMenuItem(title: bubbleHidden ? "显示任务气泡" : "隐藏任务气泡", action: #selector(toggleFromMenu), keyEquivalent: ""); toggle.target = self; menu.addItem(toggle)
        let reset = NSMenuItem(title: "恢复到主屏右下角", action: #selector(resetPosition), keyEquivalent: ""); reset.target = self; menu.addItem(reset)
        let close = NSMenuItem(title: "关闭桌宠", action: #selector(closeOverlay), keyEquivalent: ""); close.target = self; menu.addItem(close)
        return menu
    }
    @objc func showMenu() {
        let menu = makeMenu()
        menuOpen = true; panel.ignoresMouseEvents = false
        menu.popUp(positioning: nil, at: NSPoint(x: 0, y: characterButton.bounds.height), in: characterButton)
        menuOpen = false; updateHitRegions()
    }
    @objc func changePreference(_ sender: NSMenuItem) {
        if let patch = sender.representedObject as? [String: Any] { emit(["type": "preferences", "patch": patch]) }
    }
    @objc func toggleFromMenu() { toggleBubble() }
    @objc func resetPosition() {
        let frame = (NSScreen.main ?? NSScreen.screens[0]).visibleFrame
        anchor = NSPoint(x: frame.maxX - petWidth - 30, y: frame.minY + 36)
        placePanels(); savePosition()
    }
    @objc func screensChanged() { placePanels(); savePosition() }
    @objc func collapse() { bubbleHidden = true; emit(["type": "preferences", "patch": ["bubbleHidden": true]]); render() }
    @objc func toggleExpanded() { expanded.toggle(); render() }
    func toggleBubble() { bubbleHidden.toggle(); emit(["type": "preferences", "patch": ["bubbleHidden": bubbleHidden]]); render() }
    @objc func closeOverlay() { NSApp.terminate(nil) }
    func applicationWillTerminate(_ notification: Notification) {
        clock?.invalidate(); hitTimer?.invalidate(); animationTimer?.invalidate()
        savePosition()
    }
    func emit(_ message: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: message) {
            FileHandle.standardOutput.write(data + Data([10]))
        }
    }
}

let app = NSApplication.shared
if CommandLine.arguments.contains("--verify-assets") {
    // Runs the actual renderer's mask against AppKit's independent pixel reader.
    // No windows, model calls or settings changes in this mode.
    let url = Bundle.main.resourceURL!.appendingPathComponent("assets/manifest.json")
    let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: Any]
    let entries = manifest["characters"] as! [[String: Any]]
    var failures = 0, checked = 0
    let view = SpriteView(frame: NSRect(x: 0, y: 0, width: 192, height: 208))
    for entry in entries {
        let id = entry["id"] as! String
        for row in [0, 4, 5, 6, 7, 8] {
            view.configure(CompanionState(id: id, label: id, state: "test", scale: 1, mode: "fixed",
                rotationSeconds: 300, bubbleHidden: false, favorites: [], line: "",
                animation: AnimationState(row: row, durations: [10000]), options: []))
            guard let atlas = view.atlas, atlas.width == 1536, atlas.height == 2288,
                  let frame = atlas.cropping(to: CGRect(x: 0, y: row * 208, width: 192, height: 208)) else {
                failures += 1; continue
            }
            let reference = NSBitmapImageRep(cgImage: frame)
            for scale in [1.0, 1.25] {
                view.frame.size = NSSize(width: 192 * scale, height: 208 * scale)
                for y in stride(from: 0, to: 208, by: 4) {
                    for x in stride(from: 0, to: 192, by: 4) {
                        let expected = (reference.colorAt(x: x, y: y)?.alphaComponent ?? 0) > 24.0 / 255.0
                        let actual = view.containsPixel(NSPoint(x: (Double(x) + 0.5) * scale, y: (Double(y) + 0.5) * scale))
                        if expected != actual { failures += 1 }
                        checked += 1
                    }
                }
            }
        }
    }
    print("Native sprite checks: \(checked) pixels, \(failures) mismatches")
    exit(failures == 0 ? 0 : 1)
}
let delegate = Overlay()
app.setActivationPolicy(.accessory)
app.delegate = delegate
app.run()
