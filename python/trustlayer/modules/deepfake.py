"""DeepfakeShield — forensic frame/audio features → TrustLayerOS evaluate."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from ..session import TrustSession


@dataclass
class DeepfakeVideoResult:
    deepfake_probability: float
    confidence: float
    status: str
    reasons: list[str] = field(default_factory=list)


@dataclass
class DeepfakeAudioResult:
    synthetic_probability: float
    confidence: float
    reasons: list[str] = field(default_factory=list)


def extract_frame_features(
    pixels: list[int],
    width: int,
    height: int,
) -> list[float]:
    """
    Compact 32-d forensic vector from RGBA pixels (row-major).
    Matches the JS SDK / OS forensics detector layout.
    """
    n = max(1, width * height)
    r_sum = g_sum = b_sum = 0.0
    for i in range(0, min(len(pixels), n * 4), 4):
        r_sum += pixels[i] / 255.0
        g_sum += pixels[i + 1] / 255.0
        b_sum += pixels[i + 2] / 255.0
    r_mean = r_sum / n
    g_mean = g_sum / n
    b_mean = b_sum / n
    vec = [0.0] * 32
    vec[0], vec[1], vec[2] = r_mean, g_mean, b_mean
    # Compute real channel std instead of hardcoded placeholders.
    r_var = g_var = b_var = 0.0
    for i in range(0, min(len(pixels), n * 4), 4):
        r_var += (pixels[i] / 255.0 - r_mean) ** 2
        g_var += (pixels[i + 1] / 255.0 - g_mean) ** 2
        b_var += (pixels[i + 2] / 255.0 - b_mean) ** 2
    vec[3] = (r_var / n) ** 0.5
    vec[4] = (g_var / n) ** 0.5
    vec[5] = (b_var / n) ** 0.5
    # Edge energy proxy from channel variance
    vec[9] = min(1.0, (vec[3] + vec[4] + vec[5]) / 1.5)
    vec[14] = width / 1920.0
    vec[15] = height / 1080.0
    return vec


class DeepfakeShield:
    def __init__(self, session: "TrustSession") -> None:
        self._session = session

    def analyze_video_frame(
        self,
        features: Optional[list[float]] = None,
        *,
        pixels: Optional[list[int]] = None,
        width: int = 0,
        height: int = 0,
    ) -> DeepfakeVideoResult:
        if features is None:
            if pixels is None:
                raise ValueError("pass features= or pixels=/width/height")
            features = extract_frame_features(pixels, width, height)

        self._session.track_event(
            "face_frame",
            {"analysis_type": "video", "ml_features": features, "frame_analyzed": True},
        )
        evaluation = self._session.evaluate(modules=["deepfake", "interview", "bot"])
        df = (evaluation.modules.deepfake if evaluation.modules else None) or {}
        prob = float(df.get("deepfake_probability", evaluation.deepfake_risk or 0))
        status = str(df.get("status") or ("likely_real" if prob < 0.2 else "suspicious" if prob < 0.6 else "likely_deepfake"))
        return DeepfakeVideoResult(
            deepfake_probability=round(prob, 3),
            confidence=float(df.get("confidence", evaluation.confidence)),
            status=status,
            reasons=list(df.get("reasons") or evaluation.reasons),
        )

    def analyze_audio(self, features: list[float]) -> DeepfakeAudioResult:
        self._session.track_event(
            "voice_liveness",
            {"ml_features": features, "analysis_type": "audio"},
        )
        self._session.track_event(
            "voice_clone_risk",
            {"ml_features": features, "analysis_type": "audio"},
        )
        evaluation = self._session.evaluate(modules=["deepfake"])
        df = (evaluation.modules.deepfake if evaluation.modules else None) or {}
        synthetic = float(
            df.get("voice_clone_risk")
            or df.get("deepfake_probability")
            or evaluation.deepfake_risk
            or 0
        )
        return DeepfakeAudioResult(
            synthetic_probability=round(synthetic, 3),
            confidence=float(df.get("confidence", evaluation.confidence)),
            reasons=list(df.get("reasons") or evaluation.reasons),
        )
