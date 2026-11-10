"""
Unit tests for Vayu-AI 5-Stage Gas-Path Digital Twin & Sortie Planner
Author: Sudheesh02
"""

import sys
from pathlib import Path
import pytest

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from engine.digital_twin_engine import GasPathDigitalTwin, AIRCRAFT_PROFILES
from engine.sortie_planner import SparesAwareSortiePlanner


class TestGasPathDigitalTwin:
    """Verifies 5-stage gas-path thermodynamic degradation and RUL estimations."""

    @pytest.fixture(autouse=True)
    def setup_engine(self):
        self.engine = GasPathDigitalTwin()

    def test_known_aircraft_profiles_exist(self):
        """Ensure all primary combat airframes have calibrated digital twin parameters."""
        expected_tails = ["SB-021", "SB-022", "SB-023", "SB-024", "KH-201", "KH-202", "RB-001", "RB-002", "CB-8001", "IA-3104"]
        for tail in expected_tails:
            assert tail in AIRCRAFT_PROFILES, f"Missing airframe telemetry profile for {tail}"

    def test_healthy_aircraft_digital_twin(self):
        """Su-30MKI SB-021 should exhibit high health and mission-capable status."""
        health = self.engine.evaluate_aircraft_digital_twin("SB-021")
        assert health["status"] == "MISSION_CAPABLE"
        assert health["overall_health_pct"] >= 75.0
        assert health["prognostics"]["conservative_rul_hours"] >= 80.0
        # Check 5-stage gas-path wear components
        stages = health["stages"]
        for stage in ["fan", "lpc", "hpc", "combustor_hpt", "lpt"]:
            assert stage in stages
            assert stages[stage]["health_pct"] >= 70.0
            assert stages[stage]["status"] == "NOMINAL"

    def test_grounded_aircraft_digital_twin(self):
        """Su-30MKI SB-024 should be flagged as grounded due to critical HPC wear."""
        health = self.engine.evaluate_aircraft_digital_twin("SB-024")
        assert health["status"] == "MAINTENANCE_GROUNDED"
        assert health["overall_health_pct"] < 30.0
        assert health["stages"]["hpc"]["status"] == "CRITICAL"
        assert health["prognostics"]["conservative_rul_hours"] < 20.0

    def test_conformal_interval_monotonicity(self):
        """Conservative RUL must not exceed mean RUL; lower interval bound <= upper bound."""
        for tail, profile in AIRCRAFT_PROFILES.items():
            lower, upper = profile["conformal_interval"]
            assert lower <= upper, f"Conformal interval inverted for {tail}"
            assert profile["conservative_rul_hours"] <= profile["rul_hours"] + 1e-4


class TestSortiePlanner:
    """Verifies operational feasibility evaluation and mission go/no-go logic."""

    @pytest.fixture(autouse=True)
    def setup_planner(self):
        self.planner = SparesAwareSortiePlanner()

    def test_healthy_aircraft_sortie_cleared(self):
        """SB-021 with healthy RUL margin must be approved for 2.5h Combat Air Patrol."""
        eval_res = self.planner.evaluate_sortie_feasibility(
            tail_no="SB-021",
            sortie_type="Combat Air Patrol (CAP)",
            planned_duration_hours=2.5
        )
        assert eval_res["decision"] == "MISSION_GO"
        assert eval_res["clearance_code"] == "UNRESTRICTED_COMBAT_CLEARED"
        assert eval_res["spares_status"]["stock_sufficient"] is True

    def test_grounded_aircraft_sortie_rejected(self):
        """SB-024 with low RUL and critical HPC wear must be rejected."""
        eval_res = self.planner.evaluate_sortie_feasibility(
            tail_no="SB-024",
            sortie_type="Tactical Deep Strike",
            planned_duration_hours=4.0
        )
        assert eval_res["decision"] == "NO_GO"
        assert eval_res["clearance_code"] == "GROUNDED_CRITICAL_WEAR"
        assert len(eval_res["reasons"]) > 0
        assert eval_res["spares_status"]["stock_sufficient"] is False
