"""Preset and threat → module map.

This is the Python copy of src/presets.ts and src/check.ts.
Swift and Kotlin keep the same five plans in their clients.
"""

from __future__ import annotations

from typing import Any, Optional

from .exceptions import TrustLayerError

PRESETS: dict[str, dict[str, Any]] = {
    "signup": {"threats": ["bot", "fraud"], "type": "user_verification", "media": False},
    "login": {"threats": ["bot", "fraud"], "type": "authentication", "media": False},
    "call": {"threats": ["human"], "type": "interview", "media": True},
    "payment": {"threats": ["fraud", "bot", "anomaly"], "type": "transaction", "media": False},
    "review": {"threats": ["spam", "bot"], "type": "user_verification", "media": False},
}


def plan_for_preset(preset: Optional[str]) -> Optional[dict[str, Any]]:
    if not preset:
        return None
    plan = PRESETS.get(preset)
    if plan is None:
        raise TrustLayerError(f"unknown preset: {preset}")
    return plan


def modules_for_threats(threats: Optional[list[str]]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()

    def add(*names: str) -> None:
        for name in names:
            if name not in seen:
                seen.add(name)
                out.append(name)

    for threat in threats or ["human"]:
        if threat == "human":
            add("interview", "deepfake", "bot")
        elif threat in ("voice", "video", "deepfake"):
            add("deepfake", "bot")
        elif threat == "bot":
            add("bot")
        elif threat == "spam":
            add("spam")
        elif threat == "agent":
            add("agent", "bot")
        elif threat == "fraud":
            add("fraud", "anomaly")
        elif threat == "anomaly":
            add("anomaly")
        elif threat == "ai":
            add("interview", "spam", "bot")
    return out or ["interview", "deepfake", "bot"]


def session_type_for_threats(threats: list[str]) -> str:
    if "agent" in threats:
        return "agent"
    if "fraud" in threats:
        return "transaction"
    if "spam" in threats and not any(t in threats for t in ("human", "deepfake", "voice", "video")):
        return "user_verification"
    return "interview"
