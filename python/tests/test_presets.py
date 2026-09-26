from trustlayer.presets import modules_for_threats, plan_for_preset, session_type_for_threats
from trustlayer.exceptions import TrustLayerError
import pytest


def test_presets_match_the_js_module_map():
    assert modules_for_threats(plan_for_preset("signup")["threats"]) == ["bot", "fraud", "anomaly"]
    assert modules_for_threats(plan_for_preset("login")["threats"]) == ["bot", "fraud", "anomaly"]
    assert modules_for_threats(plan_for_preset("call")["threats"]) == ["interview", "deepfake", "bot"]
    assert modules_for_threats(plan_for_preset("payment")["threats"]) == ["fraud", "anomaly", "bot"]
    assert modules_for_threats(plan_for_preset("review")["threats"]) == ["spam", "bot"]
    assert plan_for_preset("payment")["type"] == "transaction"
    assert plan_for_preset("review")["type"] == "user_verification"
    assert plan_for_preset("call")["media"] is True
    assert session_type_for_threats(["agent"]) == "agent"


def test_unknown_preset_is_rejected():
    with pytest.raises(TrustLayerError):
        plan_for_preset("onboarding")
