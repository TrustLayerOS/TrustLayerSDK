from trustlayer.client import _modules_for_threats, _session_type_for_threats
from trustlayer.exceptions import TrustLayerError
from trustlayer.models import CreateSessionResponse
from trustlayer.session import TrustSession


def _session() -> TrustSession:
    data = CreateSessionResponse(
        id="sess_test",
        organization_id="org_dev",
        type="interview",
        status="active",
        expires_at="2099-01-01T00:00:00Z",
        created_at="2026-01-01T00:00:00Z",
    )
    return TrustSession(data, http=None)  # type: ignore[arg-type]


def test_verify_human_requires_consent_for_media():
    s = _session()
    try:
        s.verify_human(liveness_passed=True, consent=False)
        raise AssertionError("expected consent_required")
    except TrustLayerError as e:
        assert "consent_required" in str(e)


def test_threat_presets():
    assert _modules_for_threats(["human"]) == ["interview", "deepfake", "bot"]
    assert _modules_for_threats(["spam"]) == ["spam"]
    assert _modules_for_threats(["agent"]) == ["agent", "bot"]
    assert _session_type_for_threats(["fraud"]) == "transaction"


def test_product_presets():
    from trustlayer.client import _PRESETS

    assert _PRESETS["signup"]["media"] is False
    assert _PRESETS["login"]["type"] == "authentication"
    assert _PRESETS["call"]["threats"] == ["human"]
    assert _PRESETS["payment"]["type"] == "transaction"
    assert "spam" in _PRESETS["review"]["threats"]


def test_verify_voice_requires_consent():
    s = _session()
    try:
        s.verify_voice(consent=False, audio_pcm=[0.0, 0.1])
        raise AssertionError("expected consent_required")
    except TrustLayerError as e:
        assert "consent_required" in str(e)
