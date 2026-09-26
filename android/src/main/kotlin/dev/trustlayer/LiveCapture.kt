package dev.trustlayer

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.ImageReader
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import android.util.Base64
import java.nio.ByteBuffer

/**
 * One JPEG and one second of 16 kHz PCM. The activity requests CAMERA and
 * RECORD_AUDIO, then passes the result into TrustLayerClient.check.
 * This is a capture helper, not a branded full-screen product UI.
 */
class LiveCapture(private val context: Context) {
    data class CapturedMedia(val imageB64: String, val audioPcm: DoubleArray, val sampleRate: Int)

    fun permitted(): Boolean =
        context.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    fun capture(onResult: (CapturedMedia) -> Unit, onError: (String) -> Unit) {
        if (!permitted()) {
            onError("camera_denied")
            return
        }
        val thread = HandlerThread("trustlayer-camera").also { it.start() }
        val handler = Handler(thread.looper)
        val reader = ImageReader.newInstance(640, 480, ImageFormat.JPEG, 1)
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val cameraId = manager.cameraIdList.firstOrNull()
        if (cameraId == null) {
            onError("capture_devices_unavailable")
            thread.quitSafely()
            return
        }
        try {
            manager.openCamera(cameraId, object : CameraDevice.StateCallback() {
                override fun onOpened(camera: CameraDevice) {
                    camera.createCaptureSession(listOf(reader.surface), object : CameraCaptureSession.StateCallback() {
                        override fun onConfigured(session: CameraCaptureSession) {
                            val request = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                                addTarget(reader.surface)
                            }
                            reader.setOnImageAvailableListener({ imageReader ->
                                val image = imageReader.acquireLatestImage()
                                val buffer: ByteBuffer = image.planes[0].buffer
                                val bytes = ByteArray(buffer.remaining())
                                buffer.get(bytes)
                                image.close()
                                camera.close()
                                thread.quitSafely()
                                val audio = recordPcm()
                                onResult(
                                    CapturedMedia(
                                        imageB64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
                                        audioPcm = audio,
                                        sampleRate = 16000,
                                    ),
                                )
                            }, handler)
                            session.capture(request.build(), null, handler)
                        }

                        override fun onConfigureFailed(session: CameraCaptureSession) {
                            camera.close()
                            thread.quitSafely()
                            onError("capture_empty")
                        }
                    }, handler)
                }

                override fun onDisconnected(camera: CameraDevice) {
                    camera.close()
                }

                override fun onError(camera: CameraDevice, error: Int) {
                    camera.close()
                    thread.quitSafely()
                    onError("capture_empty")
                }
            }, handler)
        } catch (err: SecurityException) {
            thread.quitSafely()
            onError("camera_denied")
        }
    }

    private fun recordPcm(): DoubleArray {
        val rate = 16000
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val recorder = AudioRecord(
            MediaRecorder.AudioSource.MIC,
            rate,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
            min,
        )
        val bytes = ByteArray(rate * 2)
        recorder.startRecording()
        var read = 0
        while (read < bytes.size) {
            val n = recorder.read(bytes, read, bytes.size - read)
            if (n <= 0) break
            read += n
        }
        recorder.stop()
        recorder.release()
        val samples = DoubleArray(read / 2)
        var i = 0
        while (i < samples.size) {
            val lo = bytes[i * 2].toInt() and 0xff
            val hi = bytes[i * 2 + 1].toInt()
            samples[i] = ((hi shl 8) or lo).toShort().toDouble() / 32768.0
            i++
        }
        return samples
    }
}
