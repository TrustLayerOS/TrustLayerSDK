"""
Bot Detection Example (Python)

Shows how a platform detects automated accounts using BotShield.

Run:
    TRUSTLAYER_SECRET_KEY=tl_secret_xxx python examples/bot_detection.py
"""

import os
from trustlayer import TrustLayer

API_KEY = os.environ.get("TRUSTLAYER_SECRET_KEY", "tl_secret_example")
API_URL = os.environ.get("TRUSTLAYER_API_URL", "http://localhost:8080")


def check_user_for_bot(user_id: str, is_suspicious: bool = False) -> None:
    print(f"\nChecking user {user_id} for bot signals...")

    with TrustLayer(api_key=API_KEY, api_url=API_URL) as client:
        session = client.create_session(
            type="user_verification",
            user_id=user_id,
            modules=["bot_detection"],
        )

        if is_suspicious:
            # Inject signals that indicate automation
            session.track_event("mouse_activity", {
                "mouse_movements": 0,
                "velocity_variance": 0.001,
                "robotic": True,
            })
            session.track_event("typing_pattern", {
                "keystrokes": 1500,
                "avg_typing_speed": 18.5,   # superhuman
                "cadence_variance": 0.001,  # perfectly robotic
                "automated": True,
            })
            session.track_event("suspicious_activity", {
                "automation_framework": True,
            })
        else:
            # Normal human signals
            session.track_event("mouse_activity", {
                "mouse_movements": 245,
                "velocity_variance": 0.38,
                "robotic": False,
            })
            session.track_event("typing_pattern", {
                "keystrokes": 89,
                "avg_typing_speed": 4.2,
                "cadence_variance": 0.41,
                "automated": False,
            })

        # Analyse
        bot = client.bot(session)
        result = bot.analyze()

        print("─── Bot Detection Result ─────────────────────────────")
        print(f"  Bot Probability  : {result.bot_probability:.1%}")
        print(f"  Human Probability: {result.human_probability:.1%}")
        print(f"  Is Bot           : {'YES ⚠' if result.is_bot else 'NO ✓'}")
        print(f"  Confidence       : {result.confidence:.0%}")
        if result.signals:
            print("  Bot Signals:")
            for s in result.signals:
                print(f"    • {s}")
        print("──────────────────────────────────────────────────────")

        session.complete()


if __name__ == "__main__":
    check_user_for_bot("user_normal_001", is_suspicious=False)
    check_user_for_bot("user_bot_002",    is_suspicious=True)
