package dev.trustlayer

import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * HTTP client for the same session, media, and evaluate calls the JS SDK posts.
 * It does not open a camera. Pass JPEG base64 and PCM the app already captured.
 * apiUrl defaults to a local OS. A hosted API is not part of this client.
 */
class TrustLayerClient(
    private val apiKey: String,
    private val apiUrl: String = "http://127.0.0.1:8080",
) {
    data class CheckInput(
        val preset: String,
        val userId: String? = null,
        val imageB64: String? = null,
        val audioPcm: DoubleArray? = null,
        val sampleRate: Int = 16000,
        val referenceAudioPcm: DoubleArray? = null,
        val virtualCamera: Boolean = false,
        val captureLabel: String = "",
        val frameHash: String? = null,
        val repeatedFrame: Boolean = false,
        val screenEdge: Double? = null,
        val motion: Map<String, Double>? = null,
    )

    fun check(input: CheckInput): JSONObject {
        val modules = modules(input.preset)
        val created = post(
            "/v1/sessions",
            JSONObject()
                .put("type", sessionType(input.preset))
                .put("user_id", input.userId ?: "")
                .put("modules", JSONArray(modules))
                .put(
                    "metadata",
                    JSONObject().put("surface", "android").put("preset", input.preset),
                ),
        )
        val sessionId = created.optString("id").ifEmpty { created.optString("session_id") }
        if (sessionId.isEmpty()) error("session_id_missing")
        input.referenceAudioPcm?.let { pcm ->
            if (pcm.isNotEmpty()) {
                event(
                    sessionId,
                    "speaker_reference",
                    JSONObject()
                        .put("audio_pcm", JSONArray(pcm.toList()))
                        .put("sample_rate", input.sampleRate)
                        .put("consent", true),
                )
            }
        }
        input.imageB64?.let { image ->
            val data = JSONObject()
                .put("image_b64", image)
                .put("consent", true)
                .put("virtual_camera", input.virtualCamera)
                .put("capture_label", input.captureLabel)
                .put("repeated_frame", input.repeatedFrame)
            input.frameHash?.let { data.put("frame_hash", it) }
            input.screenEdge?.let { data.put("screen_edge", it) }
            event(sessionId, "face_frame", data)
        }
        input.motion?.let { motion ->
            val body = JSONObject().put("passed_client", true)
            val motionJson = JSONObject()
            motion.forEach { (k, v) -> motionJson.put(k, v) }
            body.put("motion", motionJson)
            event(sessionId, "liveness_challenge_passed", body)
        }
        input.audioPcm?.let { pcm ->
            if (pcm.isNotEmpty()) {
                event(
                    sessionId,
                    "voice_liveness",
                    JSONObject()
                        .put("audio_pcm", JSONArray(pcm.toList()))
                        .put("sample_rate", input.sampleRate)
                        .put("consent", true),
                )
            }
        }
        return post("/v1/sessions/$sessionId/evaluate", JSONObject().put("modules", JSONArray(modules)))
    }

    private fun event(sessionId: String, type: String, data: JSONObject) {
        post(
            "/v1/events",
            JSONObject().put("session_id", sessionId).put("type", type).put("data", data),
        )
    }

    private fun post(path: String, body: JSONObject): JSONObject {
        val connection = (URL(apiUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $apiKey")
            doOutput = true
        }
        connection.outputStream.use { it.write(body.toString().toByteArray()) }
        val code = connection.responseCode
        val stream = if (code in 200..299) connection.inputStream else connection.errorStream
        val text = stream.bufferedReader().readText()
        if (code !in 200..299) error("http_$code $text")
        return if (text.isBlank()) JSONObject() else JSONObject(text)
    }

    private fun sessionType(preset: String): String = when (preset) {
        "login", "payment" -> "authentication"
        "signup", "review" -> "onboarding"
        else -> "interview"
    }

    private fun modules(preset: String): List<String> = when (preset) {
        "signup", "login", "payment", "review" -> listOf("bot", "fraud")
        else -> listOf("interview", "deepfake", "bot")
    }
}
