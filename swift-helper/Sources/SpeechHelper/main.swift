import Foundation
import AppKit
import Speech
import AVFoundation
import Carbon.HIToolbox

// MARK: - Message Types

struct IncomingMessage: Codable {
    let type: String
    let sessionId: String?
    let message: String?
    let size: String?
    let opacity: Double?
    let position: String?
    let hotkey: String?
}

struct PermissionsStatus: Codable {
    let speechRecognition: String  // "granted", "denied", "not_determined", "restricted"
    let microphone: String         // "granted", "denied", "not_determined", "restricted"
}

struct OutgoingMessage: Codable {
    let type: String
    let text: String?
    let level: Double?
    let code: String?
    let message: String?
    let sessionId: String?
    let permissions: PermissionsStatus?
}

// MARK: - Message Sender

func sendMessage(_ message: OutgoingMessage) {
    guard let data = try? JSONEncoder().encode(message),
          let jsonString = String(data: data, encoding: .utf8) else {
        return
    }
    print(jsonString)
    fflush(stdout)
}

func sendReady() {
    sendMessage(OutgoingMessage(type: "ready", text: "key-monitor", level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendStarted() {
    sendMessage(OutgoingMessage(type: "started", text: nil, level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendPartial(_ text: String) {
    sendMessage(OutgoingMessage(type: "partial", text: text, level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendFinal(_ text: String) {
    sendMessage(OutgoingMessage(type: "final", text: text, level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendStopped(_ text: String) {
    sendMessage(OutgoingMessage(type: "stopped", text: text, level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendCancelled() {
    sendMessage(OutgoingMessage(type: "cancelled", text: nil, level: nil, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendLevel(_ level: Double) {
    sendMessage(OutgoingMessage(type: "level", text: nil, level: level, code: nil, message: nil, sessionId: nil, permissions: nil))
}

func sendError(code: String, message: String) {
    sendMessage(OutgoingMessage(type: "error", text: nil, level: nil, code: code, message: message, sessionId: nil, permissions: nil))
}

func sendPermissions() {
    // 音声認識権限
    let speechStatus: String
    switch SFSpeechRecognizer.authorizationStatus() {
    case .authorized:
        speechStatus = "granted"
    case .denied:
        speechStatus = "denied"
    case .notDetermined:
        speechStatus = "not_determined"
    case .restricted:
        speechStatus = "restricted"
    @unknown default:
        speechStatus = "not_determined"
    }

    // マイク権限
    let micStatus: String
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized:
        micStatus = "granted"
    case .denied:
        micStatus = "denied"
    case .notDetermined:
        micStatus = "not_determined"
    case .restricted:
        micStatus = "restricted"
    @unknown default:
        micStatus = "not_determined"
    }

    let permissions = PermissionsStatus(speechRecognition: speechStatus, microphone: micStatus)
    sendMessage(OutgoingMessage(type: "permissions", text: nil, level: nil, code: nil, message: nil, sessionId: nil, permissions: permissions))
}

// MARK: - Speech Recognizer

class SpeechManager: NSObject, SFSpeechRecognizerDelegate {
    private let speechRecognizer: SFSpeechRecognizer?
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    private var lastRecognizedText = ""
    private var isRecording = false
    private var stopTimer: Timer?

    var onLevelChanged: ((Double) -> Void)?

    override init() {
        speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))
        super.init()
        speechRecognizer?.delegate = self
    }

    func requestAuthorization(completion: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            DispatchQueue.main.async {
                switch status {
                case .authorized:
                    fputs("Speech authorization: authorized\n", stderr)
                    completion(true)
                case .denied:
                    sendError(code: "NOT_AUTHORIZED", message: "Speech recognition denied by user")
                    completion(false)
                case .restricted:
                    sendError(code: "NOT_AUTHORIZED", message: "Speech recognition restricted")
                    completion(false)
                case .notDetermined:
                    sendError(code: "NOT_AUTHORIZED", message: "Speech recognition not determined")
                    completion(false)
                @unknown default:
                    sendError(code: "NOT_AUTHORIZED", message: "Speech recognition unknown status")
                    completion(false)
                }
            }
        }
    }

    func startRecording() {
        guard !isRecording else { return }
        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            sendError(code: "START_ERROR", message: "Speech recognizer not available")
            return
        }

        // オンデバイス認識が利用可能か確認
        if !speechRecognizer.supportsOnDeviceRecognition {
            fputs("Warning: On-device recognition not supported, falling back to server\n", stderr)
        }

        // Cancel any previous task
        recognitionTask?.cancel()
        recognitionTask = nil

        // Create recognition request
        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            sendError(code: "START_ERROR", message: "Failed to create recognition request")
            return
        }

        recognitionRequest.shouldReportPartialResults = true
        recognitionRequest.taskHint = .dictation
        recognitionRequest.requiresOnDeviceRecognition = true

        // Configure audio input
        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)

            // Calculate audio level
            let channelData = buffer.floatChannelData?[0]
            let frameLength = Int(buffer.frameLength)
            var sum: Float = 0
            for i in 0..<frameLength {
                sum += abs(channelData?[i] ?? 0)
            }
            let avgPower = sum / Float(frameLength)
            let level = min(1.0, max(0.0, Double(avgPower * 50)))
            sendLevel(level)
            DispatchQueue.main.async {
                self?.onLevelChanged?(level)
            }
        }

        // Start recognition task
        fputs("Starting recognition task...\n", stderr)
        recognitionTask = speechRecognizer.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            guard let self = self else { return }

            if let error = error as NSError? {
                fputs("Recognition error: \(error.domain) code=\(error.code) \(error.localizedDescription)\n", stderr)
                // Ignore temporary Apple errors
                // 203: cancelled, 209/216: temporary server errors, 1110: no speech detected
                let ignorableCodes = [203, 209, 216, 1110]
                if error.domain == "kAFAssistantErrorDomain" && ignorableCodes.contains(error.code) {
                    return
                }
                sendError(code: "RECOGNITION_ERROR", message: error.localizedDescription)
                return
            }

            if let result = result {
                let text = result.bestTranscription.formattedString
                fputs("Recognition result: '\(text)' final=\(result.isFinal)\n", stderr)
                self.lastRecognizedText = text

                if result.isFinal {
                    sendFinal(text)
                } else {
                    sendPartial(text)
                }
            }
        }

        // Start audio engine
        audioEngine.prepare()
        do {
            try audioEngine.start()
            isRecording = true
            lastRecognizedText = ""
            fputs("Audio engine started successfully\n", stderr)
            sendStarted()
        } catch {
            fputs("Audio engine start failed: \(error.localizedDescription)\n", stderr)
            sendError(code: "START_ERROR", message: "Failed to start audio engine: \(error.localizedDescription)")
        }
    }

    func stopRecording() {
        guard isRecording else { return }

        // Stop with delay to capture final words
        stopTimer?.invalidate()
        stopTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: false) { [weak self] _ in
            self?.performStop()
        }
    }

    func cancelRecording() {
        guard isRecording else { return }

        // キャンセル時は即座に停止（遅延なし）
        stopTimer?.invalidate()
        stopTimer = nil

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.recognitionRequest = nil
            self?.recognitionTask?.cancel()
            self?.recognitionTask = nil
        }

        isRecording = false
        lastRecognizedText = ""
        sendCancelled()
    }

    private func performStop() {
        // 最後の認識結果を保持
        let finalText = lastRecognizedText

        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)

        // endAudio を呼んで認識を完了させる
        recognitionRequest?.endAudio()

        // タスクの完了を少し待ってからクリーンアップ
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.recognitionRequest = nil
            self?.recognitionTask?.cancel()
            self?.recognitionTask = nil
        }

        isRecording = false

        // partial結果しかなくても送信
        if !finalText.isEmpty {
            sendFinal(finalText)
        }
        sendStopped(finalText)
    }

    func speechRecognizer(_ speechRecognizer: SFSpeechRecognizer, availabilityDidChange available: Bool) {
        if !available {
            sendError(code: "RECOGNITION_ERROR", message: "Speech recognizer became unavailable")
        }
    }
}

// MARK: - HUD Window

import SwiftUI

class HUDWindow: NSPanel {
    init() {
        super.init(
            contentRect: NSRect(x: 0, y: 0, width: 50, height: 50),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )

        self.level = .floating
        self.backgroundColor = .clear
        self.isOpaque = false
        self.hasShadow = false
        self.ignoresMouseEvents = true
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        // Center on screen
        if let screen = NSScreen.main {
            let screenFrame = screen.frame
            let x = (screenFrame.width - frame.width) / 2
            let y = (screenFrame.height - frame.height) / 2
            setFrameOrigin(NSPoint(x: x, y: y))
        }
    }
}

// MARK: - SwiftUI HUD View

enum HUDState {
    case recording
    case rewriting
    case error(String)
}

class HUDModel: ObservableObject {
    @Published var state: HUDState = .recording
    @Published var audioLevel: Double = 0
}

struct OrbHUDView: View {
    @ObservedObject var model: HUDModel
    @State private var spinnerRotation: Double = 0

    var body: some View {
        ZStack {
            // Background
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(red: 0x11/255.0, green: 0x11/255.0, blue: 0x11/255.0).opacity(0.8))
                .frame(width: 44, height: 44)

            // Main content
            switch model.state {
            case .recording:
                equalizerView
            case .rewriting:
                spinnerView
            case .error:
                errorView
            }
        }
        .frame(width: 50, height: 50)
    }

    // MARK: - Equalizer View (Recording)
    private var equalizerView: some View {
        HStack(spacing: 2) {
            ForEach(0..<5, id: \.self) { index in
                EqualizerBar(level: model.audioLevel, index: index)
            }
        }
    }

    // MARK: - Spinner View (Rewriting)
    private var spinnerView: some View {
        ZStack {
            // Track
            Circle()
                .stroke(Color.white.opacity(0.2), lineWidth: 1.5)
                .frame(width: 16, height: 16)

            // Arc
            Circle()
                .trim(from: 0, to: 0.3)
                .stroke(Color.white.opacity(0.9), style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
                .frame(width: 16, height: 16)
                .rotationEffect(.degrees(spinnerRotation))
        }
        .onAppear {
            spinnerRotation = 0
            withAnimation(.linear(duration: 0.8).repeatForever(autoreverses: false)) {
                spinnerRotation = 360
            }
        }
        .onDisappear {
            spinnerRotation = 0
        }
    }

    // MARK: - Error View
    private var errorView: some View {
        Circle()
            .fill(Color.white.opacity(0.3))
            .frame(width: 20, height: 20)
            .overlay(
                Text("!")
                    .foregroundColor(.white)
                    .font(.system(size: 12, weight: .bold))
            )
    }
}

// MARK: - Equalizer Bar

struct EqualizerBar: View {
    let level: Double
    let index: Int

    @State private var barHeight: CGFloat = 4
    @State private var randomOffset: Double = 0

    private let minHeight: CGFloat = 4
    private let maxHeight: CGFloat = 20

    var body: some View {
        RoundedRectangle(cornerRadius: 1)
            .fill(Color.white.opacity(0.85))
            .frame(width: 2, height: barHeight)
            .onChange(of: level) { newLevel in
                updateHeight(newLevel)
            }
            .onAppear {
                randomOffset = Double.random(in: 0.5...1.0)
                updateHeight(level)
            }
    }

    private func updateHeight(_ level: Double) {
        let delayFactor = Double(index) * 0.015
        let sensitivity = 1.5
        let adjustedLevel = min(1.0, level * sensitivity)

        DispatchQueue.main.asyncAfter(deadline: .now() + delayFactor) {
            withAnimation(.easeOut(duration: 0.06)) {
                let targetHeight = minHeight + (maxHeight - minHeight) * adjustedLevel * randomOffset
                barHeight = max(minHeight, min(maxHeight, targetHeight))
            }
        }
    }
}

class HUDViewController: NSViewController {
    private let model = HUDModel()
    private var hostingView: NSHostingView<OrbHUDView>?

    override func loadView() {
        let hudView = OrbHUDView(model: model)
        hostingView = NSHostingView(rootView: hudView)
        hostingView?.frame = NSRect(x: 0, y: 0, width: 50, height: 50)
        self.view = hostingView!
    }

    func updateState(_ newState: HUDState) {
        DispatchQueue.main.async { [weak self] in
            withAnimation(.easeInOut(duration: 0.3)) {
                self?.model.state = newState
            }
        }
    }

    func updateLevel(_ level: Double) {
        DispatchQueue.main.async { [weak self] in
            self?.model.audioLevel = level
        }
    }
}

// MARK: - Hotkey Configuration

struct HotkeyConfig {
    var triggerKeyCodes: Set<Int64> = [63]  // Default: Fn
    var requiredModifiers: CGEventFlags = []
    var triggerFlag: CGEventFlags = .maskSecondaryFn

    // キー名からkeyCodeへのマッピング
    static let keyNameToCode: [String: Int64] = [
        "Space": 49,
        "Return": 36,
        "Tab": 48,
        "Delete": 51,
        "Escape": 53,
        "Left": 123,
        "Right": 124,
        "Down": 125,
        "Up": 126,
        "F1": 122, "F2": 120, "F3": 99, "F4": 118,
        "F5": 96, "F6": 97, "F7": 98, "F8": 100,
        "F9": 101, "F10": 109, "F11": 103, "F12": 111,
    ]

    // 修飾キーのkeyCode
    static let modifierKeyCodes: [String: (keyCodes: Set<Int64>, flag: CGEventFlags)] = [
        "Control": ([59, 62], .maskControl),
        "Option": ([58, 61], .maskAlternate),
        "Shift": ([56, 60], .maskShift),
        "Command": ([55, 54], .maskCommand),
        "Fn": ([63], .maskSecondaryFn),
    ]

    static func parse(_ hotkeyString: String) -> HotkeyConfig {
        var config = HotkeyConfig()
        let parts = hotkeyString.split(separator: "+").map { $0.trimmingCharacters(in: .whitespaces) }

        guard !parts.isEmpty else { return config }

        // 最後の部分がトリガーキー
        let triggerKey = parts.last!

        // 修飾キーを収集
        var modifiers: CGEventFlags = []
        for i in 0..<(parts.count - 1) {
            let part = parts[i]
            if let modInfo = modifierKeyCodes[part] {
                modifiers.insert(modInfo.flag)
            }
        }
        config.requiredModifiers = modifiers

        // トリガーキーを設定
        if let modInfo = modifierKeyCodes[triggerKey] {
            // 修飾キー単独がトリガー
            config.triggerKeyCodes = modInfo.keyCodes
            config.triggerFlag = modInfo.flag
        } else if let keyCode = keyNameToCode[triggerKey] {
            // 通常キーがトリガー（この場合はkeyDownイベントを使う必要がある）
            config.triggerKeyCodes = [keyCode]
            config.triggerFlag = []
        }

        return config
    }
}

// MARK: - Key Monitor

class KeyMonitor {
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?
    private var isKeyDown = false
    private var hotkeyConfig = HotkeyConfig()

    var onKeyDown: (() -> Void)?
    var onKeyUp: (() -> Void)?
    var onEscapePressed: (() -> Void)?

    private let escapeKeyCode: Int64 = 53

    func setHotkey(_ hotkeyString: String) {
        hotkeyConfig = HotkeyConfig.parse(hotkeyString)
        fputs("KeyMonitor: Hotkey set to '\(hotkeyString)' -> keyCodes=\(hotkeyConfig.triggerKeyCodes), flag=\(hotkeyConfig.triggerFlag.rawValue), requiredMods=\(hotkeyConfig.requiredModifiers.rawValue)\n", stderr)
    }

    func start() -> Bool {
        // flagsChanged と keyDown/keyUp イベントを監視
        let eventMask = (1 << CGEventType.flagsChanged.rawValue) |
                        (1 << CGEventType.keyDown.rawValue) |
                        (1 << CGEventType.keyUp.rawValue)

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: CGEventMask(eventMask),
            callback: { _, type, event, refcon in
                guard let refcon = refcon else { return Unmanaged.passRetained(event) }
                let monitor = Unmanaged<KeyMonitor>.fromOpaque(refcon).takeUnretainedValue()
                return monitor.handleEvent(type: type, event: event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            sendError(code: "EVENT_TAP_FAILED", message: "Failed to create event tap. Please enable Accessibility permissions.")
            return false
        }

        eventTap = tap
        runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
        CGEvent.tapEnable(tap: tap, enable: true)

        return true
    }

    private func handleEvent(type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        let flags = event.flags
        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)

        // 修飾キーのみの場合（flagsChanged）
        if type == .flagsChanged {
            // fnキーは特殊：keyCodeではなくフラグの変化で検出
            let isFnTrigger = hotkeyConfig.triggerFlag == .maskSecondaryFn
            let isTriggerKey = isFnTrigger || hotkeyConfig.triggerKeyCodes.contains(keyCode)
            let triggerPressed = hotkeyConfig.triggerFlag.isEmpty || flags.contains(hotkeyConfig.triggerFlag)

            // 修飾キーがトリガーの場合のみ処理
            if isTriggerKey && !hotkeyConfig.triggerFlag.isEmpty {
                if triggerPressed && !isKeyDown {
                    isKeyDown = true
                    onKeyDown?()
                } else if !triggerPressed && isKeyDown {
                    isKeyDown = false
                    onKeyUp?()
                }
            }
        }

        // 通常キーの押下（keyDown）
        if type == .keyDown {
            // Escapeキーの処理（録音キャンセル用）
            if keyCode == escapeKeyCode {
                onEscapePressed?()
                return Unmanaged.passRetained(event)
            }

            let isTriggerKey = hotkeyConfig.triggerKeyCodes.contains(keyCode)

            // 必要な修飾キーが押されているか
            let modifiersOk = hotkeyConfig.requiredModifiers.isEmpty ||
                              flags.intersection([.maskControl, .maskAlternate, .maskShift, .maskCommand])
                                  .contains(hotkeyConfig.requiredModifiers)

            if isTriggerKey && modifiersOk && !isKeyDown {
                isKeyDown = true
                onKeyDown?()
            }
        }

        // 通常キーのリリース（keyUp）
        if type == .keyUp {
            let isTriggerKey = hotkeyConfig.triggerKeyCodes.contains(keyCode)

            if isTriggerKey && isKeyDown {
                isKeyDown = false
                onKeyUp?()
            }
        }

        return Unmanaged.passRetained(event)
    }

    func stop() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
    }
}

// MARK: - App Controller

class AppController {
    let speechManager = SpeechManager()
    let keyMonitor = KeyMonitor()
    var hudWindow: HUDWindow?
    var hudViewController: HUDViewController?

    func start() {
        // Request speech authorization
        speechManager.requestAuthorization { [weak self] authorized in
            guard authorized else { return }
            self?.setupKeyMonitor()
            self?.setupHUD()
            self?.setupStdinReader()
            self?.setupLevelCallback()
            sendReady()
        }
    }

    private func setupLevelCallback() {
        speechManager.onLevelChanged = { [weak self] level in
            self?.hudViewController?.updateLevel(level)
        }
    }

    private func setupKeyMonitor() {
        keyMonitor.onKeyDown = { [weak self] in
            self?.startRecording()
        }

        keyMonitor.onKeyUp = { [weak self] in
            self?.stopRecording()
        }

        keyMonitor.onEscapePressed = { [weak self] in
            self?.cancelRecording()
        }

        if !keyMonitor.start() {
            // Error already sent in KeyMonitor
        }
    }

    private func setupHUD() {
        hudWindow = HUDWindow()
        hudViewController = HUDViewController()
        hudWindow?.contentViewController = hudViewController
    }

    private func startRecording() {
        DispatchQueue.main.async { [weak self] in
            self?.hudViewController?.updateState(.recording)
            self?.hudWindow?.orderFront(nil)
        }
        speechManager.startRecording()
    }

    private func stopRecording() {
        DispatchQueue.main.async { [weak self] in
            self?.hudViewController?.updateState(.rewriting)
        }
        speechManager.stopRecording()
    }

    private func cancelRecording() {
        DispatchQueue.main.async { [weak self] in
            self?.hudWindow?.orderOut(nil)
        }
        speechManager.cancelRecording()
    }

    private func setupStdinReader() {
        DispatchQueue.global(qos: .background).async { [weak self] in
            while let line = readLine() {
                self?.handleMessage(line)
            }
        }
    }

    private func handleMessage(_ json: String) {
        guard let data = json.data(using: .utf8),
              let message = try? JSONDecoder().decode(IncomingMessage.self, from: data) else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            switch message.type {
            case "rewrite:start":
                self?.hudViewController?.updateState(.rewriting)
            case "rewrite:done":
                self?.hudWindow?.orderOut(nil)
            case "rewrite:error":
                self?.hudViewController?.updateState(.error(message.message ?? "エラー"))
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    self?.hudWindow?.orderOut(nil)
                }
            case "hotkey:set":
                if let hotkey = message.hotkey {
                    self?.keyMonitor.setHotkey(hotkey)
                }
            case "hud:update":
                // TODO: Handle HUD appearance updates
                break
            case "permissions:check":
                sendPermissions()
            default:
                break
            }
        }
    }
}

// MARK: - Main

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // Run as background app

let controller = AppController()
controller.start()

// Keep the run loop alive
RunLoop.current.run()
