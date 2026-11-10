# Turbofan Gas-Path Degradation & RUL Prognostics Engineering Report
## Air Power (SIH26249) — C-MAPSS Engine Telemetry & Operating Regimes
### Author: Sudheesh02

---

## 1. Executive Summary

Military combat aircraft operations demand maximum mission-capable (MC) availability while preventing catastrophic inflight gas-turbine engine failures. In combat power architectures (e.g. AL-31FP, Snecma M88, and GE F404/F414 turbofans), degradation occurs across continuous high-thermal and dynamic-pressure operational envelopes.

This document details the metallurgical and thermodynamic foundation governing **Vayu-AI's Module 2 (5-Stage Gas-Path Digital Twin)**, benchmarked across the official **NASA Commercial Modular Aero-Propulsion System Simulation (C-MAPSS)** dataset subsets (**FD001–FD004**).

```
   Sensor Telemetry (P30, T30, T50, Nc, Nf)
                     │
                     ▼
   Regime De-coupling & Operating Cluster Normalization
                     │
                     ▼
   Piecewise Linear RUL Target Formulation (RUL_cap = 125 cycles)
                     │
                     ▼
   5-Stage Gas-Path Conformal Digital Twin & Degradation Tracking
                     │
                     ▼
   Spares-Aware Sortie Clearance (MISSION_GO / NO_GO)
```

---

## 2. 5-Stage Gas-Path Component Decomposition

Vayu-AI maps live sensor readings into 5 critical thermodynamic stages:

| Stage ID | Subsystem Name | Primary Sensor Indicators | Typical Degradation Mechanism |
| :--- | :--- | :--- | :--- |
| **Stage 1** | **Fan & Intake** | $N_f$ (Physical Fan Speed), $P_2$ (Intake Static Pressure) | FOD, blade erosion, aerodynamic imbalance |
| **Stage 2** | **Low-Pressure Compressor (LPC)** | $T_{24}$ (LPC Exit Temp), $P_{24}$ (LPC Exit Pressure) | Fouling, tip clearance expansion |
| **Stage 3** | **High-Pressure Compressor (HPC)** | $T_{30}$ (HPC Exit Temp), $P_{30}$ (Static Combustor Pressure) | Rotor micro-cracking, aerodynamic stall margin loss |
| **Stage 4** | **Combustor & High-Pressure Turbine (HPT)**| $N_c$ (Core Speed), $HtBleed$ (Enthalpy Bleed) | Nozzle guide vane burn-through, thermal stress |
| **Stage 5** | **Low-Pressure Turbine (LPT)** | $T_{50}$ (Exhaust Gas Temp / EGT), $P_{50}$ (LPT Exhaust Pressure) | Blade thermal creep, uncooled shroud degradation |

---

## 3. Operating Regime De-coupling (FD002 & FD004)

In multi-regime flight envelopes (varying altitude from sea-level to 42,000 ft, Mach number up to 0.84, and throttle resolver angles 20%–100%), raw sensor readings undergo up to 40% shifts that mask mechanical wear. 

Vayu-AI applies $k$-means clustering ($k=6$) across operational settings $[op_1, op_2, op_3]$ to establish operating regime centers. Z-score normalization per regime:

$$\hat{s}_{i}^{(k)} = \frac{s_i - \mu_{i}^{(k)}}{\sigma_{i}^{(k)}}$$

This unmasks true metallurgical degradation trends, dropping RUL estimation penalties and preventing false-positive maintenance grounding.

---

## 4. Piecewise RUL Target & 3-σ Onset Drift

Empirical onset analysis demonstrates that turbofan engines remain in a nominal healthy state during early flight hours, with measurable degradation manifesting after initial operational seasoning. Vayu-AI applies an empirical **piecewise-linear RUL cap of 125 cycles** (~100 to 125 flight hours):

$$RUL_{\text{target}}(t) = \min(RUL_{\text{actual}}(t), 125)$$

This aligns with calibrated depot maintenance intervals and prevents early-cycle prognostic over-fitting.

---

## 5. Defense Handoff & Airframe Synchronization

The calibrated model parameters feed directly into `engine/digital_twin_engine.py` and `engine/sortie_planner.py`, providing real-time combat sortie clearance:
- **UNRESTRICTED_COMBAT_CLEARED**: Full flight envelope, conservative RUL margin $> 4.0\text{h}$.
- **SORTIE_CAP_RESTRICTED**: Restricted envelope, low-G mission clearance.
- **GROUNDED_CRITICAL_WEAR**: Immediate hangar induction; triggers automated base-level Line Replaceable Unit (LRU) requisition.
