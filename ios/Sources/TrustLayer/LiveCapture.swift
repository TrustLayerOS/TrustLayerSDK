import AVFoundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers

/// One still JPEG and a short PCM clip from the device camera and mic.
/// The app supplies this to TrustLayerClient.check. The preview controller
/// is the on-screen button. A hosted API is still the caller's apiUrl.
public struct CapturedMedia: Sendable {
    public let imageB64: String
    public let audioPCM: [Double]
    public let sampleRate: Int

    public init(imageB64: String, audioPCM: [Double], sampleRate: Int) {
        self.imageB64 = imageB64
        self.audioPCM = audioPCM
        self.sampleRate = sampleRate
    }
}

public final class LiveCapture: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate, AVCaptureAudioDataOutputSampleBufferDelegate {
    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "dev.trustlayer.capture")
    private var videoOutput = AVCaptureVideoDataOutput()
    private var audioOutput = AVCaptureAudioDataOutput()
    private var jpeg: String?
    private var pcm: [Double] = []
    private var sampleRate = 16000
    private var continuation: CheckedContinuation<CapturedMedia, Error>?

    public override init() {
        super.init()
    }

    public func previewSession() -> AVCaptureSession { session }

    public func capture(seconds: Double = 1.0) async throws -> CapturedMedia {
        try await authorize()
        try configure()
        session.startRunning()
        let media = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<CapturedMedia, Error>) in
            self.continuation = cont
            self.queue.asyncAfter(deadline: .now() + seconds) { [weak self] in
                self?.finish()
            }
        }
        session.stopRunning()
        return media
    }

    private func authorize() async throws {
        let video = AVCaptureDevice.authorizationStatus(for: .video)
        if video == .notDetermined {
            let ok = await AVCaptureDevice.requestAccess(for: .video)
            if !ok { throw TrustLayerError("camera_denied") }
        } else if video != .authorized {
            throw TrustLayerError("camera_denied")
        }
        let audio = AVCaptureDevice.authorizationStatus(for: .audio)
        if audio == .notDetermined {
            let ok = await AVCaptureDevice.requestAccess(for: .audio)
            if !ok { throw TrustLayerError("microphone_denied") }
        } else if audio != .authorized {
            throw TrustLayerError("microphone_denied")
        }
    }

    private func configure() throws {
        session.beginConfiguration()
        session.sessionPreset = .vga640x480
        guard let camera = AVCaptureDevice.default(for: .video),
              let mic = AVCaptureDevice.default(for: .audio),
              let videoIn = try? AVCaptureDeviceInput(device: camera),
              let audioIn = try? AVCaptureDeviceInput(device: mic),
              session.canAddInput(videoIn),
              session.canAddInput(audioIn) else {
            session.commitConfiguration()
            throw TrustLayerError("capture_devices_unavailable")
        }
        session.addInput(videoIn)
        session.addInput(audioIn)
        videoOutput.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
        videoOutput.setSampleBufferDelegate(self, queue: queue)
        audioOutput.setSampleBufferDelegate(self, queue: queue)
        if session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
        if session.canAddOutput(audioOutput) { session.addOutput(audioOutput) }
        session.commitConfiguration()
    }

    public func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === videoOutput, jpeg == nil, let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) {
            jpeg = jpegBase64(buffer)
        }
        if output === audioOutput {
            appendPCM(sampleBuffer)
        }
    }

    private func appendPCM(_ sample: CMSampleBuffer) {
        guard let format = CMSampleBufferGetFormatDescription(sample),
              let block = CMSampleBufferGetDataBuffer(sample) else { return }
        let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(format)?.pointee
        if let rate = asbd?.mSampleRate, rate > 0 { sampleRate = Int(rate) }
        var length = 0
        var data: UnsafeMutablePointer<Int8>?
        if CMBlockBufferGetDataPointer(block, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &data) != noErr {
            return
        }
        guard let data else { return }
        let count = length / MemoryLayout<Int16>.size
        data.withMemoryRebound(to: Int16.self, capacity: count) { ptr in
            for i in 0..<count {
                pcm.append(Double(ptr[i]) / 32768.0)
            }
        }
    }

    private func finish() {
        guard let continuation else { return }
        self.continuation = nil
        guard let jpeg, !pcm.isEmpty else {
            continuation.resume(throwing: TrustLayerError("capture_empty"))
            return
        }
        continuation.resume(returning: CapturedMedia(imageB64: jpeg, audioPCM: pcm, sampleRate: sampleRate))
    }

    private func jpegBase64(_ buffer: CVPixelBuffer) -> String? {
        let image = CIImage(cvPixelBuffer: buffer)
        let context = CIContext()
        guard let data = context.jpegRepresentation(of: image, colorSpace: CGColorSpaceCreateDeviceRGB()) else {
            return nil
        }
        return data.base64EncodedString()
    }
}

#if os(iOS)
import UIKit

/// Preview plus a Check button. Calls LiveCapture and returns the still and PCM.
public final class TrustLayerPreviewController: UIViewController {
    public var onCaptured: ((CapturedMedia) -> Void)?
    public var onFailure: ((Error) -> Void)?
    private let capture = LiveCapture()
    private let preview = AVCaptureVideoPreviewLayer()

    public override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        preview.session = capture.previewSession()
        preview.videoGravity = .resizeAspectFill
        preview.frame = view.bounds
        view.layer.addSublayer(preview)
        let button = UIButton(type: .system)
        button.setTitle("Check", for: .normal)
        button.backgroundColor = .white
        button.layer.cornerRadius = 8
        button.frame = CGRect(x: 24, y: view.bounds.height - 96, width: view.bounds.width - 48, height: 48)
        button.autoresizingMask = [.flexibleWidth, .flexibleTopMargin]
        button.addTarget(self, action: #selector(runCheck), for: .touchUpInside)
        view.addSubview(button)
    }

    public override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview.frame = view.bounds
    }

    @objc private func runCheck() {
        Task {
            do {
                let media = try await capture.capture()
                onCaptured?(media)
            } catch {
                onFailure?(error)
            }
        }
    }
}
#endif
