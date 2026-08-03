"""
Interview Shield Example (Python)

Shows how a hiring platform uses TrustLayer to protect interview integrity.

Run:
    TRUSTLAYER_SECRET_KEY=tl_secret_xxx python examples/interview_shield.py
"""

import os
import time
from trustlayer import TrustLayer

API_KEY = os.environ.get("TRUSTLAYER_SECRET_KEY", "tl_secret_example")
API_URL = os.environ.get("TRUSTLAYER_API_URL", "http://localhost:8080")


def run_interview_session(candidate_id: str, position: str) -> None:
    print(f"\nStarting interview session for candidate {candidate_id}")
    print(f"  Position: {position}")

    with TrustLayer(api_key=API_KEY, api_url=API_URL) as client:
        # 1. Create interview session
        session = client.create_session(
            type="interview",
            user_id=candidate_id,
            modules=["interview", "deepfake", "anomaly"],
            metadata={"position": position, "round": 2},
        )
        print(f"  Session: {session.session_id}")

        # 2. Attach InterviewShield
        shield = client.interview(session)

        # 3. Simulate interview events ─────────────────────────────────────────

        # Identity verification passes
        session.track_event("face_match_completed", {
            "confidence": 0.94,
            "verified": True,
        })
        print("  ✓ Face match: 94% confidence")

        session.track_event("voice_verified", {
            "confidence": 0.91,
            "verified": True,
        })
        print("  ✓ Voice verified: 91% confidence")

        # Normal typing during coding section
        session.track_event("typing_pattern", {
            "keystrokes": 412,
            "avg_typing_speed": 3.8,
            "cadence_variance": 0.38,
            "automated": False,
        })

        # Candidate switches windows (suspicious)
        shield.report_window_switch()
        print("  ⚠ Window switch detected")

        # AI assistance signal detected
        shield.report_ai_assistance(probability=0.74)
        print("  ⚠ AI assistance detected (74%)")

        # External app detected
        shield.report_external_application("GitHub Copilot")
        print("  ⚠ External app: GitHub Copilot")

        # 4. Get integrity score ───────────────────────────────────────────────
        print("\n  Calculating integrity score...")
        result = shield.get_integrity_score()

        print("\n─── Interview Integrity Report ───────────────────────")
        print(f"  Integrity Score      : {result.integrity_score}/100")
        print(f"  AI Assistance Prob   : {result.ai_assistance_probability:.1%}")
        print(f"  Identity Consistency : {result.identity_consistency:.0f}/100")
        print(f"  Recommendation       : {result.recommendation.upper()}")
        if result.risk_factors:
            print("  Risk Factors:")
            for f in result.risk_factors[:5]:
                print(f"    • {f}")
        print("──────────────────────────────────────────────────────")

        # 5. Complete session
        final = session.complete()
        print(f"\n  Final trust score : {final.trust_score.trust_score:.0f}")
        print(f"  Final risk score  : {final.risk_score.risk_score:.0f}")


if __name__ == "__main__":
    run_interview_session(
        candidate_id="candidate_alice_123",
        position="Senior Backend Engineer",
    )
