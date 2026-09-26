import Foundation

/// HTTP client for the same session, media, and evaluate calls the JS SDK posts.
/// It does not draw a camera UI. Pass JPEG bytes and PCM the app already captured.
/// `apiUrl` is required until a hosted API exists.
public final class TrustLayerClient {
    public let apiKey: String
    public let apiUrl: URL
    private let session: URLSession

    public init(apiKey: String, apiUrl: String = "http://127.0.0.1:8080", session: URLSession = .shared) {
        self.apiKey = apiKey
        self.apiUrl = URL(string: apiUrl) ?? URL(string: "http://127.0.0.1:8080")!
        self.session = session
    }

    public struct CheckInput {
        public var preset: String
        public var userId: String?
        public var imageB64: String?
        public var audioPCM: [Double]?
        public var sampleRate: Int
        public var referenceAudioPCM: [Double]?
        public var virtualCamera: Bool
        public var captureLabel: String
        public var frameHash: String?
        public var repeatedFrame: Bool
        public var screenEdge: Double?
        public var motion: [String: Double]?

        public init(
            preset: String,
            userId: String? = nil,
            imageB64: String? = nil,
            audioPCM: [Double]? = nil,
            sampleRate: Int = 16000,
            referenceAudioPCM: [Double]? = nil,
            virtualCamera: Bool = false,
            captureLabel: String = "",
            frameHash: String? = nil,
            repeatedFrame: Bool = false,
            screenEdge: Double? = nil,
            motion: [String: Double]? = nil
        ) {
            self.preset = preset
            self.userId = userId
            self.imageB64 = imageB64
            self.audioPCM = audioPCM
            self.sampleRate = sampleRate
            self.referenceAudioPCM = referenceAudioPCM
            self.virtualCamera = virtualCamera
            self.captureLabel = captureLabel
            self.frameHash = frameHash
            self.repeatedFrame = repeatedFrame
            self.screenEdge = screenEdge
            self.motion = motion
        }
    }

    public func check(_ input: CheckInput) async throws -> [String: Any] {
        let modules = modules(for: input.preset)
        let created = try await post("/v1/sessions", [
            "type": sessionType(for: input.preset),
            "user_id": input.userId ?? "",
            "modules": modules,
            "metadata": ["surface": "ios", "preset": input.preset],
        ])
        guard let sessionId = created["id"] as? String ?? created["session_id"] as? String else {
            throw TrustLayerError("session_id_missing")
        }
        if let reference = input.referenceAudioPCM, !reference.isEmpty {
            try await event(sessionId, "speaker_reference", [
                "audio_pcm": reference,
                "sample_rate": input.sampleRate,
                "consent": true,
            ])
        }
        if let image = input.imageB64 {
            var data: [String: Any] = [
                "image_b64": image,
                "consent": true,
                "virtual_camera": input.virtualCamera,
                "capture_label": input.captureLabel,
                "repeated_frame": input.repeatedFrame,
            ]
            if let hash = input.frameHash { data["frame_hash"] = hash }
            if let edge = input.screenEdge { data["screen_edge"] = edge }
            try await event(sessionId, "face_frame", data)
        }
        if let motion = input.motion {
            try await event(sessionId, "liveness_challenge_passed", [
                "motion": motion,
                "passed_client": true,
            ])
        }
        if let pcm = input.audioPCM, !pcm.isEmpty {
            try await event(sessionId, "voice_liveness", [
                "audio_pcm": pcm,
                "sample_rate": input.sampleRate,
                "consent": true,
            ])
        }
        return try await post("/v1/sessions/\(sessionId)/evaluate", ["modules": modules])
    }

    private func event(_ sessionId: String, _ type: String, _ data: [String: Any]) async throws {
        _ = try await post("/v1/events", [
            "session_id": sessionId,
            "type": type,
            "data": data,
        ])
    }

    private func post(_ path: String, _ body: [String: Any]) async throws -> [String: Any] {
        let base = apiUrl.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: base + path) else {
            throw TrustLayerError("bad_url")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await session.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else {
            throw TrustLayerError("http_\(code)")
        }
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        return json ?? [:]
    }

    private func sessionType(for preset: String) -> String {
        switch preset {
        case "login", "payment": return "authentication"
        case "signup", "review": return "onboarding"
        default: return "interview"
        }
    }

    private func modules(for preset: String) -> [String] {
        switch preset {
        case "signup", "login", "payment", "review": return ["bot", "fraud"]
        default: return ["interview", "deepfake", "bot"]
        }
    }
}

public struct TrustLayerError: Error, CustomStringConvertible {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var description: String { message }
}
