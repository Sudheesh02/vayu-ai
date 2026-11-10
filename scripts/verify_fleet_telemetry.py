#!/usr/bin/env python3
"""
Vayu-AI Fleet Readiness & Telemetry Audit Verification CLI
Evaluates all 20 combat aircraft, digital twin prognostics,
and base-level spares inventory health.

Author: Sudheesh02
"""

import sys
import json
import sqlite3
import argparse
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from engine.digital_twin_engine import GasPathDigitalTwin

DB_PATH = BASE_DIR / "data" / "air_power_fleet.db"


def audit_fleet(db_path: Path = DB_PATH) -> dict:
    """Runs end-to-end fleet readiness and spares availability analysis."""
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found at {db_path}")

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1. Fetch Aircraft Fleet
    cur.execute("SELECT * FROM aircraft_fleet ORDER BY tail_no ASC;")
    airframes = [dict(r) for r in cur.fetchall()]

    digital_twin = GasPathDigitalTwin(db_path=str(db_path))

    mc_count = 0
    grounded_count = 0
    fleet_health_list = []
    aircraft_evals = []

    for af in airframes:
        tail = af["tail_no"]
        eval_data = digital_twin.evaluate_aircraft_digital_twin(tail)
        health = eval_data.get("overall_health_pct", 0.0)
        status = eval_data.get("status", "UNKNOWN")
        rul_h = eval_data.get("prognostics", {}).get("conservative_rul_hours", 0.0)

        if status == "MISSION_CAPABLE":
            mc_count += 1
        else:
            grounded_count += 1

        fleet_health_list.append(health)
        aircraft_evals.append({
            "tail_no": tail,
            "type": af.get("aircraft_type", "Unknown"),
            "squadron": af.get("squadron", "Unknown"),
            "base": af.get("base_station", "Unknown"),
            "health_pct": round(health, 1),
            "status": status,
            "conservative_rul_hours": round(rul_h, 1),
            "wear_mode": eval_data.get("wear_mode", "Nominal"),
        })

    total_aircraft = len(airframes)
    mc_rate = (mc_count / total_aircraft * 100.0) if total_aircraft > 0 else 0.0
    mean_health = sum(fleet_health_list) / len(fleet_health_list) if fleet_health_list else 0.0

    # 2. Fetch Spares Pipeline
    cur.execute("SELECT * FROM base_spares_inventory WHERE quantity_on_hand < safety_stock_threshold;")
    critical_spares = [dict(r) for r in cur.fetchall()]

    conn.close()

    return {
        "total_airframes": total_aircraft,
        "mission_capable": mc_count,
        "maintenance_grounded": grounded_count,
        "mc_rate_pct": round(mc_rate, 1),
        "mean_fleet_health_pct": round(mean_health, 1),
        "readiness_status": "OPTIMAL" if mc_rate >= 75.0 else ("WARNING" if mc_rate >= 60.0 else "CRITICAL"),
        "critical_spares_alerts": len(critical_spares),
        "aircraft_summary": aircraft_evals,
    }


def main():
    parser = argparse.ArgumentParser(description="Vayu-AI Fleet Readiness Verification")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    parser.add_argument("--verbose", action="store_true", help="Print individual airframe telemetry")
    args = parser.parse_args()

    results = audit_fleet()

    if args.json:
        print(json.dumps(results, indent=2))
        return

    print("=" * 72)
    print("  VAYU-AI: COMBAT FLEET READINESS & PROGNOSTICS AUDIT")
    print("=" * 72)
    print(f"  Total Aircraft Monitored: {results['total_airframes']}")
    print(f"  Mission Capable (MC):     {results['mission_capable']} / {results['total_airframes']}")
    print(f"  Grounded / Maintenance:   {results['maintenance_grounded']}")
    print(f"  Mission Capable Rate:     {results['mc_rate_pct']}%  [{results['readiness_status']}]")
    print(f"  Mean Fleet Health Index:  {results['mean_fleet_health_pct']}%")
    print(f"  Spares Safety Alerts:     {results['critical_spares_alerts']} items below threshold")
    print("-" * 72)

    if args.verbose or True:
        print(f"  {'Tail No':<8} {'Type':<28} {'Base':<16} {'Health':<8} {'Status':<16}")
        print("  " + "-" * 68)
        for a in results["aircraft_summary"][:8]:  # preview first 8
            print(f"  {a['tail_no']:<8} {a['type'][:26]:<28} {a['base'][:14]:<16} {a['health_pct']:<5}%  {a['status']:<16}")
        if len(results["aircraft_summary"]) > 8:
            print(f"  ... and {len(results['aircraft_summary']) - 8} more combat airframes verified.")

    print("=" * 72)
    print("  [AUDIT COMPLETED] Digital Twin telemetry and prognostics operational.")
    print("=" * 72)


if __name__ == "__main__":
    main()
