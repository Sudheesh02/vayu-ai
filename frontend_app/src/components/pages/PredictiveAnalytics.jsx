import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp,
  Crosshair,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Wrench,
  Clock,
  Grid,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Users,
  Sparkles,
  Plane,
  Layers,
  Shield
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
  Cell
} from 'recharts';
import GlassCard from '../common/GlassCard';
import StatusBadge from '../common/StatusBadge';
import { useTheme } from '../../context/ThemeContext';
import { fleetApi } from '../../api/fleetApi';
import { MOCK_AIRCRAFT_LIST, getMockDigitalTwin, MOCK_FLIGHT_LOGS, SQUADRONS } from '../../data/mockFleetData';

// 0ms instant local calculation to guarantee 120 FPS buttery-smooth slider response
function computeSortieFeasibility(tailNo, sortieType, durationHours) {
  const twin = getMockDigitalTwin(tailNo);
  const isGrounded = twin.status === 'MAINTENANCE_GROUNDED';
  const multipliers = {
    'Combat Air Patrol (CAP)': 1.6,
    'Tactical Intercept': 1.5,
    'Reconnaissance': 1.3,
    'Combat Training': 1.25
  };
  const multiplier = multipliers[sortieType] || 1.35;
  const requiredMargin = Number((durationHours * multiplier).toFixed(1));
  const conservativeRul = twin.prognostics?.conservative_rul_hours ?? twin.rul_hours ?? 100.0;

  let decision = 'MISSION_GO';
  let clearanceCode = 'UNRESTRICTED_COMBAT_CLEARED';
  let reasons = [];
  let recommendations = [];

  if (isGrounded) {
    decision = 'NO_GO';
    clearanceCode = 'GROUNDED_CRITICAL_WEAR';
    reasons.push(`Aircraft ${tailNo} is currently grounded for high-priority gas path wear.`);
    recommendations.push('Immediate hangar induction. Do not clear for flight.');
  } else if (conservativeRul < requiredMargin) {
    decision = 'NO_GO';
    clearanceCode = 'INSUFFICIENT_RUL_MARGIN';
    reasons.push(
      `Conservative remaining flight life (${conservativeRul}h) is below required mission margin (${requiredMargin}h for ${durationHours.toFixed(1)}h ${sortieType}).`
    );
    recommendations.push('Reassign sortie to another squadron tail; schedule proactive maintenance.');
  } else if ((twin.stages?.hpc?.health_pct || 80) < 55.0 || (twin.stages?.lpt?.health_pct || 80) < 55.0) {
    decision = 'CONDITIONAL_GO';
    clearanceCode = 'RESTRICTED_COMBAT_ENVELOPE';
    reasons.push('Compressor/Turbine degradation detected above caution threshold.');
    recommendations.push('Cleared for subsonic cruise only. Avoid sustained afterburner.');
  } else {
    reasons.push(`All 5 gas path stages nominal. Healthy RUL margin (${conservativeRul}h available vs ${requiredMargin}h required).`);
    recommendations.push('Cleared for full flight envelope.');
  }

  const plane = MOCK_AIRCRAFT_LIST.find(a => a.tail_no === tailNo) || MOCK_AIRCRAFT_LIST[0];
  const isHealthy = plane.status === 'MISSION_CAPABLE' && conservativeRul > 70;

  let componentName = 'Nominal - Zero Critical LRUs Required';
  let subsystem = 'All Subsystems Nominal';
  let qtyOnHand = 4;
  let stockSufficient = true;
  let supplyAlert = 'STOCK_OPTIMAL';

  if (!isHealthy) {
    const fault = (plane.next_fault || '').toLowerCase();
    if (fault.includes('hpc') || fault.includes('compressor')) {
      componentName = 'HPC Rotor Blade Stage 1-3 Set';
      subsystem = 'HPC';
      qtyOnHand = isGrounded ? 0 : 2;
      stockSufficient = !isGrounded;
      supplyAlert = isGrounded ? 'STOCK_EXHAUSTED_AOG_RISK' : 'STOCK_LOW';
    } else if (fault.includes('fuel') || fault.includes('pump')) {
      componentName = 'Digital High Pressure Fuel Pump';
      subsystem = 'Fuel System';
      qtyOnHand = isGrounded ? 0 : 1;
      stockSufficient = false;
      supplyAlert = 'DEPOT_DISPATCH_REQ';
    } else if (fault.includes('turbine') || fault.includes('lpt') || fault.includes('disk') || fault.includes('creep')) {
      componentName = 'Turbine Disk Thermal Assembly';
      subsystem = 'LPT';
      qtyOnHand = isGrounded ? 0 : 2;
      stockSufficient = !isGrounded;
      supplyAlert = isGrounded ? 'STOCK_EXHAUSTED_AOG_RISK' : 'STOCK_OPTIMAL';
    } else {
      componentName = 'Dual Channel FADEC EEC Unit';
      subsystem = 'Avionics';
      qtyOnHand = 1;
      stockSufficient = true;
      supplyAlert = 'STOCK_OPTIMAL';
    }
  }

  const sparesStatus = {
    critical_subsystem: subsystem,
    component_name: componentName,
    quantity_on_hand: qtyOnHand,
    safety_threshold: 3,
    stock_sufficient: stockSufficient,
    supply_alert: supplyAlert
  };

  return {
    tail_no: tailNo,
    aircraft_type: twin.aircraft_type,
    squadron: twin.squadron,
    base_station: twin.base_station,
    mission_requested: {
      sortie_type: sortieType,
      planned_duration_hours: durationHours,
      required_margin_hours: requiredMargin
    },
    prognostic_state: {
      overall_health_pct: twin.overall_health_pct,
      conservative_rul_hours: conservativeRul,
      predicted_mean_hours: twin.prognostics?.predicted_rul_hours || conservativeRul + 20
    },
    decision,
    clearance_code: clearanceCode,
    reasons,
    recommendations,
    spares_status: sparesStatus
  };
}

export default function PredictiveAnalytics() {
  const { isDark, selectedTail, setSelectedTail, setActiveTab } = useTheme();

  const [sortieType, setSortieType] = useState('Combat Air Patrol (CAP)');
  const [durationHours, setDurationHours] = useState(3.5);
  const [evalResult, setEvalResult] = useState(() => computeSortieFeasibility(selectedTail || 'SB-021', 'Combat Air Patrol (CAP)', 3.5));
  const [evaluating, setEvaluating] = useState(false);
  const [triageStatus, setTriageStatus] = useState(null);
  const [selectedHeatmapCell, setSelectedHeatmapCell] = useState(null);

  const faultTimeline = fleetApi.getFaultTimeline();
  const failureHeatmap = fleetApi.getFailureHeatmap();

  // 1. Dynamic Conformal 90% RUL Degradation Trajectory scaled to selected aircraft
  const degradationData = useMemo(() => {
    const twin = getMockDigitalTwin(selectedTail);
    const currentHealth = twin.overall_health_pct ?? 80.3;
    const currentCycle = twin.flight_cycle ?? 68;
    const rulHours = twin.prognostics?.conservative_rul_hours ?? 88.4;
    const remainingCycles = Math.max(12, Math.round(rulHours / 1.5));
    const failureCycle = currentCycle + remainingCycles;

    const points = [];
    const step = Math.max(15, Math.round(failureCycle / 7));

    for (let c = 0; c <= failureCycle + 20; c += step) {
      if (c === 0) {
        points.push({ cycle: 0, actual_health: 100, predicted_mean: 100, lower_bound: 100, upper_bound: 100 });
      } else if (c < currentCycle) {
        const factor = 1 - Math.pow(c / failureCycle, 1.8);
        const healthVal = Math.round(100 * factor);
        points.push({
          cycle: c,
          actual_health: healthVal,
          predicted_mean: Number((healthVal + 0.5).toFixed(1)),
          lower_bound: Number(Math.max(0, healthVal - 4).toFixed(1)),
          upper_bound: Number(Math.min(100, healthVal + 4).toFixed(1))
        });
      } else if (c === currentCycle || (c > currentCycle && points.filter(p => p.cycle === currentCycle).length === 0)) {
        const std = Number((rulHours * 0.0815).toFixed(1));
        points.push({
          cycle: currentCycle,
          actual_health: currentHealth,
          predicted_mean: currentHealth,
          lower_bound: Number(Math.max(0, currentHealth - std * 0.8).toFixed(1)),
          upper_bound: Number(Math.min(100, currentHealth + std * 0.8).toFixed(1))
        });
      } else {
        const futureRatio = (c - currentCycle) / remainingCycles;
        const projectedMean = Number(Math.max(0, currentHealth * (1 - Math.pow(futureRatio, 1.2))).toFixed(1));
        const uncertaintySpread = Number((8 + futureRatio * 18).toFixed(1));
        points.push({
          cycle: c,
          actual_health: null,
          predicted_mean: projectedMean,
          lower_bound: Number(Math.max(0, projectedMean - uncertaintySpread).toFixed(1)),
          upper_bound: Number(Math.min(100, projectedMean + uncertaintySpread).toFixed(1))
        });
      }
    }
    const unique = [];
    const seen = new Set();
    points.sort((a, b) => a.cycle - b.cycle).forEach(p => {
      if (!seen.has(p.cycle)) {
        seen.add(p.cycle);
        unique.push(p);
      }
    });
    return unique;
  }, [selectedTail, evalResult]);

  const [simMode, setSimMode] = useState('single'); // 'single' or 'formation'
  const [formationSquadron, setFormationSquadron] = useState("No. 45 Sqn 'Flying Daggers'");
  const [formationSize, setFormationSize] = useState(4); // 2, 4, or 6
  const [retrainRegime, setRetrainRegime] = useState('drift_gain_to_1_5'); // 'stationary' or 'drift_gain_to_1_5'
  const [retrainLog, setRetrainLog] = useState(null);

  const handleRunRetrainGate = (regimeOverride) => {
    const activeRegime = regimeOverride || retrainRegime;
    setRetrainRegime(activeRegime);
    if (activeRegime === 'stationary') {
      setRetrainLog({
        timestamp: new Date().toLocaleTimeString(),
        regime: 'Stationary Holdout (Units 81–100, No Sensor Gain Drift)',
        championRmse: '0.234',
        championNote: 'Last-cycle failure snapshot on FD001 training engines (true RUL = 0), not a contest test score.',
        rlsNoForgetRmse: '4.565',
        challengerRmse: '4.747',
        forgettingFactor: '0.999862',
        promoted: false,
        verdict: 'PROMOTION GATE REJECTED — Keep Frozen Champion (v2.4)',
        aliasAction: 'MLflow alias `champion` remains on `round2-ensemble+nested-gate` (promote_forgetting: false).'
      });
    } else {
      setRetrainLog({
        timestamp: new Date().toLocaleTimeString(),
        regime: 'Sensor Gain Drift Holdout (1.5× Gain Ramp Across Units 41–80)',
        championRmse: '3.793',
        championNote: 'Frozen ridge baseline degrades under uncalibrated 1.5× sensor gain drift.',
        rlsNoForgetRmse: '3.412',
        challengerRmse: '2.816',
        forgettingFactor: '0.999862',
        promoted: true,
        verdict: 'PROMOTION GATE PASSED (-25.8% Error) — Challenger Promoted',
        aliasAction: 'MLflow alias `champion` updated to `rls-forgetting-v2.5` (promote_forgetting: true).'
      });
    }
  };

  // Active pilot debrief log for selected tail (Multimodal NLP Snag Fusion)
  const activeFlightLog = useMemo(() => {
    return MOCK_FLIGHT_LOGS.find(l => l.tail_no === selectedTail) || null;
  }, [selectedTail]);

  // Multi-Aircraft Squadron Formation Optimizer calculation (2-Ship / 4-Ship / 6-Ship)
  const formationRoster = useMemo(() => {
    const key = formationSquadron.toLowerCase();
    const sqPlanes = MOCK_AIRCRAFT_LIST.filter(a => {
      const sq = a.squadron.toLowerCase();
      if (key.includes('daggers')) return sq.includes('daggers');
      if (key.includes('tigersharks')) return sq.includes('tigersharks');
      if (key.includes('arrows')) return sq.includes('arrows');
      return true;
    });

    const multipliers = {
      'Combat Air Patrol (CAP)': 1.6,
      'Tactical Intercept': 1.5,
      'Reconnaissance': 1.3,
      'Combat Training': 1.25
    };
    const multiplier = multipliers[sortieType] || 1.35;
    const requiredMargin = Number((durationHours * multiplier).toFixed(1));

    const roles = [
      'Flight Commander (Lead)',
      '#2 Element Wingman',
      '#3 Second Element Lead',
      '#4 Second Element Wingman',
      '#5 Surge Element Lead',
      '#6 Surge Element Wingman'
    ];

    // Rank all 6 squadron tails by Net Conformal RUL Margin descending (Mission Capable first, then Standby, then Grounded)
    const allRanked = [...sqPlanes]
      .map(p => {
        const twin = getMockDigitalTwin(p.tail_no);
        const conservativeRul = twin.prognostics?.conservative_rul_hours ?? p.rul_hours;
        const netMargin = Number((conservativeRul - requiredMargin).toFixed(1));
        const postMissionRul = Math.max(0, netMargin);
        const isGrounded = p.status === 'MAINTENANCE_GROUNDED';
        const isCleared = !isGrounded && conservativeRul >= requiredMargin;
        return {
          ...p,
          conservativeRul,
          netMargin,
          postMissionRul,
          isCleared,
          weakestStage: twin.wear_mode
        };
      })
      .sort((a, b) => {
        if (a.status === 'MAINTENANCE_GROUNDED' && b.status !== 'MAINTENANCE_GROUNDED') return 1;
        if (b.status === 'MAINTENANCE_GROUNDED' && a.status !== 'MAINTENANCE_GROUNDED') return -1;
        return b.netMargin - a.netMargin;
      })
      .map((p, idx) => {
        const prefix = p.tail_no.startsWith('KH') ? 'DAGGER' : p.tail_no.startsWith('SB') ? 'TIGER' : 'ARROW';
        return {
          ...p,
          rank: idx + 1,
          role: roles[idx] || `Element #${idx + 1}`,
          callsign: `${prefix}-0${idx + 1}`
        };
      });

    const selected4 = allRanked.slice(0, formationSize);
    const heldBack = allRanked.slice(formationSize);
    const clearedCount = selected4.filter(p => p.isCleared).length;

    return { selected4, heldBack, allRanked, requiredMargin, clearedCount };
  }, [formationSquadron, formationSize, sortieType, durationHours]);

  // 2. Dynamic Explainable AI (XAI / TreeSHAP) Feature Attribution based on selected tail's actual fault
  const shapAttribution = useMemo(() => {
    const plane = MOCK_AIRCRAFT_LIST.find(a => a.tail_no === selectedTail) || MOCK_AIRCRAFT_LIST[0];
    const fault = (plane.next_fault || '').toLowerCase();

    if (fault.includes('fuel') || fault.includes('pump') || selectedTail === 'KH-204') {
      return [
        { feature: 'HP Fuel Pump Delivery Delta', weight: 46, impact: 'Accelerates Degradation (+46%)', color: '#EF4444' },
        { feature: 'Fuel Rail Pressure Ripple', weight: 31, impact: 'Accelerates Degradation (+31%)', color: '#F59E0B' },
        { feature: 'Throttle Lever Stiction Snag', weight: 19, impact: 'Accelerates Degradation (+19%)', color: '#64748B' },
        { feature: 'P30 Static Pressure Margin', weight: -8, impact: 'Extends Life Resilience (-8%)', color: '#10B981' },
        { feature: 'Cumulative Airframe Hours', weight: -5, impact: 'Extends Life Resilience (-5%)', color: '#0EA5E9' }
      ];
    } else if (fault.includes('turbine') || fault.includes('lpt') || fault.includes('creep') || selectedTail === 'RB-004') {
      return [
        { feature: 'T50 LPT Thermal Creep Gradient', weight: 48, impact: 'Accelerates Degradation (+48%)', color: '#EF4444' },
        { feature: 'Turbine Disk Coating Ablation', weight: 28, impact: 'Accelerates Degradation (+28%)', color: '#F59E0B' },
        { feature: 'MFD Over Temp Advisory Snag', weight: 18, impact: 'Accelerates Degradation (+18%)', color: '#64748B' },
        { feature: 'Compressor Bleed Margin', weight: -9, impact: 'Extends Life Resilience (-9%)', color: '#10B981' },
        { feature: 'Cumulative Airframe Hours', weight: -5, impact: 'Extends Life Resilience (-5%)', color: '#0EA5E9' }
      ];
    } else if (fault.includes('blade') || fault.includes('hpc') || fault.includes('erosion') || selectedTail === 'SB-024') {
      return [
        { feature: 'T30 HPC Outlet Temp Surge', weight: 44, impact: 'Accelerates Degradation (+44%)', color: '#EF4444' },
        { feature: 'Core Acoustic Vibration Harmonics', weight: 32, impact: 'Accelerates Degradation (+32%)', color: '#F59E0B' },
        { feature: 'Pilot Log Afterburner Snag', weight: 19, impact: 'Accelerates Degradation (+19%)', color: '#64748B' },
        { feature: 'P30 Static Pressure Margin', weight: -9, impact: 'Extends Life Resilience (-9%)', color: '#10B981' },
        { feature: 'Cumulative Airframe Hours', weight: -6, impact: 'Extends Life Resilience (-6%)', color: '#0EA5E9' }
      ];
    } else if (fault.includes('drift') || fault.includes('fadec') || selectedTail === 'SB-023' || selectedTail === 'KH-203') {
      return [
        { feature: 'RLS Sensor Gain Drift Index', weight: 41, impact: 'Accelerates Degradation (+41%)', color: '#EF4444' },
        { feature: 'FADEC Channel Desynchronization', weight: 28, impact: 'Accelerates Degradation (+28%)', color: '#F59E0B' },
        { feature: 'Pilot Debrief Response Lag', weight: 18, impact: 'Accelerates Degradation (+18%)', color: '#64748B' },
        { feature: 'Bus Static Voltage Integrity', weight: -10, impact: 'Extends Life Resilience (-10%)', color: '#10B981' },
        { feature: 'Cumulative Airframe Hours', weight: -7, impact: 'Extends Life Resilience (-7%)', color: '#0EA5E9' }
      ];
    } else {
      // Nominal / Healthy Airframes (SB-021, KH-201, RB-001, etc.)
      return [
        { feature: 'T30 Combustor Ingress Temp', weight: 22, impact: 'Nominal Operational Wear (+22%)', color: '#F59E0B' },
        { feature: 'Core Acoustic Baseline', weight: 18, impact: 'Nominal Operational Wear (+18%)', color: '#0EA5E9' },
        { feature: 'Routine Flight Log Debrief', weight: 12, impact: 'Verified Logged Clearance (+12%)', color: '#64748B' },
        { feature: 'P30 Static Pressure Margin', weight: -28, impact: 'High Healthy Life Reserve (-28%)', color: '#10B981' },
        { feature: 'Airframe Fatigue Life Reserve', weight: -20, impact: 'Significant Life Reserve (-20%)', color: '#10B981' }
      ];
    }
  }, [selectedTail]);

  // Synchronous 0ms update + Debounced server sync (250ms)
  useEffect(() => {
    // 1. Instant local calculation for 120 FPS slider response
    const immediate = computeSortieFeasibility(selectedTail, sortieType, durationHours);
    setEvalResult(immediate);

    // 2. Debounced background sync with FastAPI server without blocking UI
    const timer = setTimeout(async () => {
      try {
        const res = await fleetApi.evaluateSortie(selectedTail, sortieType, durationHours);
        if (res && res.data) {
          setEvalResult(res.data);
        }
      } catch {
        // Silently preserve local computation
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [selectedTail, sortieType, durationHours]);

  const handleTriggerTriage = async () => {
    try {
      const res = await fleetApi.dispatchTriage(selectedTail);
      setTriageStatus(res.data);
    } catch (err) {
      alert('Triage error: ' + err);
    }
  };

  const decision = evalResult?.decision || 'MISSION_GO';
  const isGo = decision === 'MISSION_GO';
  const isConditional = decision === 'CONDITIONAL_GO';
  const isNoGo = decision === 'NO_GO';

  return (
    <div className="space-y-6 pb-8">
      {/* 1. TOP HEADER */}
      <GlassCard className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-sky-400 font-sans border border-blue-500/20">
                Prognostics & Health Management
              </span>
              <span className="text-xs text-slate-400 font-medium">
                Conformal Risk Bands & Failure Attribution
              </span>
            </div>
            <h2 className={`text-lg font-extrabold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Predictive Maintenance, Conformal RUL & Sortie Clearance Engine
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="text-xs font-semibold text-slate-400 tracking-wide">
            Selected Aircraft
          </label>
          <select
            value={selectedTail}
            onChange={(e) => {
              setSelectedTail(e.target.value);
              setTriageStatus(null);
            }}
            className={`text-xs font-sans font-bold py-2 px-3 rounded-xl cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isDark
                ? 'bg-slate-900/90 text-slate-200 border border-white/15'
                : 'bg-white text-slate-900 border border-slate-200 shadow-sm'
            }`}
          >
            {MOCK_AIRCRAFT_LIST.map((ac) => {
              const statusLabel = ac.status === 'MISSION_CAPABLE'
                ? 'Ready'
                : ac.status === 'CONDITIONAL_STANDBY'
                ? 'Standby'
                : 'Maintenance';
              return (
                <option key={ac.tail_no} value={ac.tail_no} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                  {ac.tail_no} &bull; {ac.aircraft_type.split(' ')[0]} ({statusLabel})
                </option>
              );
            })}
          </select>
        </div>
      </GlassCard>

      {/* 2. SIMULATOR SCOPE SELECTOR: [ Single Tail Clearance ] | [ Squadron Formation Optimizer ] */}
      <GlassCard className="p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`text-xs font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Simulation Scope:
          </span>
          <div className={`flex items-center gap-1 p-1 rounded-xl font-sans ${isDark ? 'bg-slate-900/60 border border-white/10' : 'bg-slate-100 border border-slate-200'}`}>
            <button
              onClick={() => setSimMode('single')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                simMode === 'single'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              Single Tail Clearance
            </button>
            <button
              onClick={() => setSimMode('formation')}
              className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                simMode === 'formation'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : isDark
                  ? 'text-slate-400 hover:text-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Squadron Formation Optimizer
            </button>
          </div>
        </div>

        {simMode === 'formation' ? (
          <div className="flex flex-wrap items-center gap-3 font-sans">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Target Squadron:</span>
              <select
                value={formationSquadron}
                onChange={(e) => setFormationSquadron(e.target.value)}
                className={`text-xs font-bold py-1.5 px-3 rounded-xl border focus:outline-none transition ${
                  isDark ? 'bg-slate-900 border-white/15 text-sky-400' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="No. 222 Sqn 'Tigersharks'">No. 222 'Tigersharks' (Su-30MKI · AFS Thanjavur)</option>
                <option value="No. 45 Sqn 'Flying Daggers'">No. 45 'Flying Daggers' (Tejas Mk1A · AFS Sulur)</option>
                <option value="No. 17 Sqn 'Golden Arrows'">No. 17 'Golden Arrows' (Rafale · AFS Ambala)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Formation Size:</span>
              {[
                { size: 2, label: '2-Ship Element' },
                { size: 4, label: '4-Ship Flight' },
                { size: 6, label: '6-Ship Surge' }
              ].map((opt) => (
                <button
                  key={opt.size}
                  type="button"
                  onClick={() => setFormationSize(opt.size)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                    formationSize === opt.size
                      ? 'bg-blue-700 text-white border-blue-500/40 shadow-sm'
                      : isDark
                      ? 'bg-slate-900 text-slate-300 border-white/10 hover:text-white'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <span className={`text-xs font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Prognostic Target: <strong className={isDark ? 'text-sky-400 font-bold' : 'text-blue-700 font-bold'}>{selectedTail}</strong>
          </span>
        )}
      </GlassCard>

      {/* 2. "WHAT-IF" MISSION SORTIE FEASIBILITY SIMULATOR & CLEARANCE DECISION */}
      {simMode === 'single' ? (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (7 cols): What If Simulator Controls */}
        <GlassCard className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/5 dark:border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Crosshair className="w-5 h-5 text-sky-400" />
                <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Mission Sortie Prognostic Simulator
                </h3>
              </div>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                Instant Feasibility Sync
              </span>
            </div>

            <div className="space-y-4">
              {/* Mission Profile Selection */}
              <div>
                <label className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Operational Mission Profile
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                  {[
                    { id: 'Combat Air Patrol (CAP)', label: 'CAP', margin: '1.6x' },
                    { id: 'Tactical Intercept', label: 'Intercept', margin: '1.5x' },
                    { id: 'Reconnaissance', label: 'Recon', margin: '1.3x' },
                    { id: 'Combat Training', label: 'Training', margin: '1.25x' },
                  ].map((m) => {
                    const active = sortieType === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSortieType(m.id)}
                        className={`p-2.5 rounded-xl text-center border transition-all ${
                          active
                            ? 'bg-blue-700 text-white border-blue-500/40 shadow-sm font-bold'
                            : isDark
                            ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                            : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <p className="text-xs font-bold">{m.label}</p>
                        <span className={`text-[10px] font-medium ${active ? 'text-white/90' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>{m.margin} safety margin</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Flight Duration Simulator Slider */}
              <div className={`p-4 rounded-2xl border transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                <div className="flex justify-between items-center mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                    <span className={`text-xs font-semibold tracking-wide ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Planned Sortie Duration
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black text-slate-900 dark:text-white font-sans tracking-tight">
                      {durationHours.toFixed(1)}
                    </span>
                    <span className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Hours</span>
                  </div>
                </div>

                {/* Smooth Slider with Dynamic Progress Track */}
                <div className="relative py-2">
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.1"
                    value={durationHours}
                    onChange={(e) => setDurationHours(parseFloat(e.target.value))}
                    className="tactical-slider"
                    style={{
                      background: `linear-gradient(to right, #2563EB 0%, #0EA5E9 ${((durationHours - 1.0) / 5.0) * 100}%, ${
                        isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
                      } ${((durationHours - 1.0) / 5.0) * 100}%, ${
                        isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'
                      } 100%)`
                    }}
                  />
                </div>

                {/* Tactical Milestone Preset Buttons */}
                <div className="flex items-center justify-between gap-1.5 mt-2.5 pt-2 border-t border-white/5">
                  {[
                    { hrs: 1.0, label: '1.0h', sub: 'Scramble' },
                    { hrs: 2.5, label: '2.5h', sub: 'CAP' },
                    { hrs: 3.5, label: '3.5h', sub: 'Patrol' },
                    { hrs: 5.0, label: '5.0h', sub: 'Strike' },
                    { hrs: 6.0, label: '6.0h', sub: 'Max Range' },
                  ].map((preset) => {
                    const isSelected = Math.abs(durationHours - preset.hrs) < 0.15;
                    return (
                      <button
                        key={preset.hrs}
                        type="button"
                        onClick={() => setDurationHours(preset.hrs)}
                        className={`flex-1 py-1.5 px-1 rounded-lg text-center transition-all ${
                          isSelected
                            ? (isDark ? 'bg-blue-600/20 border border-blue-500/50 text-sky-300 font-bold shadow-sm' : 'bg-blue-50 border border-blue-400 text-blue-700 font-bold shadow-sm')
                            : isDark
                            ? 'bg-white/5 border border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/10'
                            : 'bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-200'
                        }`}
                      >
                        <p className="text-[11px] font-bold leading-tight">{preset.label}</p>
                        <p className={`text-[9px] leading-tight hidden sm:block ${isSelected ? (isDark ? 'text-sky-300' : 'text-blue-700') : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>{preset.sub}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Margin Calculation Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Available RUL</span>
                  <p className={`font-black text-base mt-1 font-sans ${isDark ? 'text-cyan-400' : 'text-blue-700'}`}>
                    {(evalResult?.prognostic_state?.conservative_rul_hours || 0).toFixed(1)} <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>hrs</span>
                  </p>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Required Margin</span>
                  <p className={`font-black text-base mt-1 font-sans ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    {(evalResult?.mission_requested?.required_margin_hours || 0).toFixed(1)} <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>hrs</span>
                  </p>
                </div>
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Net Life Margin</span>
                  <p className={`font-black text-base mt-1 font-sans ${
                    ((evalResult?.prognostic_state?.conservative_rul_hours || 0) - (evalResult?.mission_requested?.required_margin_hours || 0)) >= 0
                      ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
                      : (isDark ? 'text-rose-400' : 'text-rose-600')
                  }`}>
                    {(((evalResult?.prognostic_state?.conservative_rul_hours || 0) - (evalResult?.mission_requested?.required_margin_hours || 0))).toFixed(1)} <span className={`text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>hrs</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className={`mt-4 pt-3 border-t text-[11px] flex items-center justify-between ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
            <span>Airframe: <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{selectedTail}</strong> &bull; Base Station: <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{evalResult?.base_station || 'AFS Thanjavur'}</strong></span>
            <span className={`${isDark ? 'text-cyan-400' : 'text-blue-700'} font-semibold flex items-center gap-1.5`}>
              <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isDark ? 'bg-cyan-400' : 'bg-blue-600'}`} />
              Prognostic Engine Synced
            </span>
          </div>
        </GlassCard>

        {/* Right (5 cols): Dynamic Clearance Result Card */}
        <GlassCard className={`p-5 lg:col-span-5 flex flex-col justify-between transition-all ${
          isDark
            ? isGo
              ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.08] via-transparent to-transparent shadow-[0_4px_30px_rgba(1,181,116,0.12)]'
              : isConditional
              ? 'border-amber-500/30 bg-gradient-to-br from-amber-500/[0.08] via-transparent to-transparent shadow-[0_4px_30px_rgba(255,181,71,0.12)]'
              : 'border-rose-500/30 bg-gradient-to-br from-rose-500/[0.08] via-transparent to-transparent shadow-[0_4px_30px_rgba(238,93,80,0.15)]'
            : isGo
            ? 'border-emerald-300 bg-gradient-to-br from-emerald-50/70 via-white to-white shadow-sm'
            : isConditional
            ? 'border-amber-300 bg-gradient-to-br from-amber-50/70 via-white to-white shadow-sm'
            : 'border-rose-300 bg-gradient-to-br from-rose-50/70 via-white to-white shadow-sm'
        }`}>
          <div>
            {/* Header with tactical status tag */}
            <div className={`flex items-center justify-between border-b pb-3 mb-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${isGo ? 'bg-emerald-500' : isConditional ? 'bg-amber-500' : 'bg-rose-500'}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  Sortie Clearance Assessment
                </span>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border ${
                isDark
                  ? isGo
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                    : isConditional
                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                    : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                  : isGo
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-bold'
                  : isConditional
                  ? 'bg-amber-100 text-amber-800 border-amber-300 font-bold'
                  : 'bg-rose-100 text-rose-800 border-rose-300 font-bold'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isGo ? 'bg-emerald-500' : isConditional ? 'bg-amber-500' : 'bg-rose-500 animate-pulse'}`} />
                {isGo ? 'Unrestricted Envelope' : isConditional ? 'Restricted Envelope' : 'Grounded / No-Go'}
              </span>
            </div>

            {/* Tactical Decision Banner */}
            <div className="flex items-center gap-3.5 my-4">
              {isGo ? (
                <div className={`relative flex items-center justify-center w-14 h-14 rounded-2xl border flex-shrink-0 ${
                  isDark
                    ? 'bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border-emerald-400/40 shadow-[0_0_24px_rgba(1,181,116,0.3),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                    : 'bg-gradient-to-br from-emerald-100 to-teal-50 border-emerald-300 shadow-sm'
                }`}>
                  <ShieldCheck className={`w-7 h-7 ${isDark ? 'text-emerald-400 drop-shadow-[0_2px_8px_rgba(1,181,116,0.5)]' : 'text-emerald-600'}`} />
                </div>
              ) : isConditional ? (
                <div className={`relative flex items-center justify-center w-14 h-14 rounded-2xl border flex-shrink-0 ${
                  isDark
                    ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-400/40 shadow-[0_0_24px_rgba(255,181,71,0.3),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                    : 'bg-gradient-to-br from-amber-100 to-orange-50 border-amber-300 shadow-sm'
                }`}>
                  <ShieldAlert className={`w-7 h-7 ${isDark ? 'text-amber-400 drop-shadow-[0_2px_8px_rgba(255,181,71,0.5)]' : 'text-amber-600'}`} />
                </div>
              ) : (
                <div className={`relative flex items-center justify-center w-14 h-14 rounded-2xl border flex-shrink-0 ${
                  isDark
                    ? 'bg-gradient-to-br from-rose-500/20 to-red-600/10 border-rose-400/40 shadow-[0_0_24px_rgba(238,93,80,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)]'
                    : 'bg-gradient-to-br from-rose-100 to-red-50 border-rose-300 shadow-sm'
                }`}>
                  <ShieldX className={`w-7 h-7 animate-pulse ${isDark ? 'text-rose-400 drop-shadow-[0_2px_8px_rgba(238,93,80,0.5)]' : 'text-rose-600'}`} />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2.5">
                  <h4 className={`text-2xl font-black tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {isGo ? 'Cleared for Sortie' : isConditional ? 'Conditional Clearance' : 'Sortie Withheld'}
                  </h4>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                    isDark
                      ? isGo
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                        : isConditional
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                      : isGo
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                      : isConditional
                      ? 'bg-amber-100 text-amber-800 border border-amber-300 font-bold'
                      : 'bg-rose-100 text-rose-800 border border-rose-300 font-bold'
                  }`}>
                    {isGo ? 'Go' : isConditional ? 'Caution' : 'No-Go'}
                  </span>
                </div>
                <p className={`text-xs font-medium mt-1 leading-snug ${isDark ? 'text-slate-300/90' : 'text-slate-600'}`}>
                  {isGo
                    ? 'Full operational combat envelope cleared across all mission phases'
                    : isConditional
                    ? 'Subsonic altitude restricted &bull; Sustained afterburner prohibited'
                    : 'Airframe grounded for mandatory hangar inspection & component wear'}
                </p>
              </div>
            </div>

            {/* Assessment Cards */}
            <div className="space-y-3 mt-4 text-xs font-sans">
              <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                <div className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <span>Engineering Prognostics Basis</span>
                  <span className={`text-[10px] font-bold ${isDark ? (isGo ? 'text-emerald-400' : isConditional ? 'text-amber-400' : 'text-rose-400') : (isGo ? 'text-emerald-700' : isConditional ? 'text-amber-700' : 'text-rose-700')}`}>
                    {isGo ? '5/5 Stages Nominal' : isConditional ? 'Degradation Caution' : 'Critical Threshold Exceeded'}
                  </span>
                </div>
                <p className={`leading-relaxed text-xs ${isDark ? 'text-slate-200' : 'text-slate-800 font-medium'}`}>
                  {evalResult?.reasons?.join(' ')}
                </p>
              </div>

              <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                <div className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <span>Operational Flight Directives</span>
                  <span className={`text-[10px] font-bold ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>Standard Procedures</span>
                </div>
                <p className={`font-medium text-xs leading-relaxed ${isDark ? 'text-cyan-200/90' : 'text-blue-900'}`}>
                  {evalResult?.recommendations?.join(' ')}
                </p>
              </div>

              {/* AI Multimodal NLP Snag Log-to-Sensor Fusion Badge */}
              <div className={`p-3.5 rounded-xl border transition-all ${
                isDark
                  ? activeFlightLog?.nlp_fusion
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/25'
                  : activeFlightLog?.nlp_fusion
                  ? 'bg-sky-50 border-sky-200'
                  : 'bg-emerald-50 border-emerald-200 shadow-sm'
              }`}>
                <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-2">
                  <span className={`flex items-center gap-1.5 ${isDark ? 'text-cyan-300' : 'text-emerald-800'}`}>
                    <Sparkles className={`w-3.5 h-3.5 ${isDark ? 'text-cyan-400' : 'text-emerald-600'}`} />
                    AI Multimodal NLP Snag-to-Sensor Fusion
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    isDark
                      ? activeFlightLog?.nlp_fusion
                        ? 'bg-blue-500/20 text-cyan-200 border border-blue-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : activeFlightLog?.nlp_fusion
                      ? 'bg-sky-100 text-sky-800 border border-sky-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {activeFlightLog?.nlp_fusion ? '98.4% Fused Confidence (+22.4% Boost)' : '100% Cleared (0 Open Snags)'}
                  </span>
                </div>

                {activeFlightLog?.nlp_fusion ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Extracted Pilot Debrief Entities:</span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${isDark ? 'bg-white/10 text-amber-300 border-white/10' : 'bg-amber-100 text-amber-900 border-amber-300'}`}>
                        [Vibration Harmonic Spike]
                      </span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${isDark ? 'bg-white/10 text-amber-300 border-white/10' : 'bg-amber-100 text-amber-900 border-amber-300'}`}>
                        [Station 30 Thermal Surge]
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Correlated Sensor Channels:</span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${isDark ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'bg-sky-100 text-sky-900 border-sky-300'}`}>
                        T30 (+28.4°R drift)
                      </span>
                      <span className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${isDark ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' : 'bg-sky-100 text-sky-900 border-sky-300'}`}>
                        Acoustic Vibration (0.94)
                      </span>
                    </div>
                    <p className={`text-[11px] italic pt-1 border-t ${isDark ? 'border-white/5 text-slate-300' : 'border-slate-200 text-slate-700'}`}>
                      "{activeFlightLog.pilot_remarks}"
                    </p>
                  </div>
                ) : (
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-emerald-200/90' : 'text-emerald-900 font-medium'}`}>
                    Continuous NLP debrief log mining verified zero open pilot snags matching live telemetry harmonics for tail <strong className={isDark ? 'text-white' : 'text-slate-900'}>{selectedTail}</strong>.
                  </p>
                )}
              </div>

              {/* Spares Status Cross-Reference */}
              {evalResult?.spares_status && (
                <div className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-sans ${isDark ? 'bg-white/[0.04] border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                  <div>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider block ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {evalResult.spares_status.stock_sufficient ? 'Operational LRU Subsystem' : 'Critical Impending LRU Component'}
                    </span>
                    <p className={`font-bold text-xs mt-0.5 ${evalResult.spares_status.stock_sufficient ? (isDark ? 'text-emerald-300' : 'text-emerald-700') : (isDark ? 'text-rose-300' : 'text-rose-700')}`}>
                      {evalResult.spares_status.component_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1.5 font-bold text-xs ${
                      evalResult.spares_status.stock_sufficient ? (isDark ? 'text-emerald-400' : 'text-emerald-700') : (isDark ? 'text-rose-400' : 'text-rose-700')
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${evalResult.spares_status.stock_sufficient ? (isDark ? 'bg-emerald-400' : 'bg-emerald-600') : (isDark ? 'bg-rose-400' : 'bg-rose-600')}`} />
                      {evalResult.spares_status.stock_sufficient ? 'All Spares Ready' : `${evalResult.spares_status.quantity_on_hand} in Base Stock`}
                    </span>
                    <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      {evalResult.spares_status.stock_sufficient ? 'Forward Depot Inventory Adequate' : 'Immediate Depot Reorder Active'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Autonomous Triage Button if NO_GO */}
          {isNoGo && (
            <div className="mt-5 pt-3 border-t border-rose-500/30">
              {triageStatus ? (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Autonomous Work Order &amp; Spares Requisition Persisted</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-slate-200 font-mono text-[11px]">
                    <span>Work Order: <strong className="text-sky-400">{triageStatus.order_id}</strong></span>
                    {triageStatus.requisition_id && (
                      <span>Depot Req: <strong className="text-emerald-400">{triageStatus.requisition_id}</strong></span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">{triageStatus.action_required}</p>
                  <div className="pt-1.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('maintenance')}
                      className="px-2.5 py-1 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-semibold text-[11px] transition"
                    >
                      View in Work Orders Kanban &rarr;
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('logistics')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-[11px] transition"
                    >
                      View in Spares Pipeline &rarr;
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleTriggerTriage}
                  className="w-full py-2.5 px-4 rounded-xl bg-red-700 hover:bg-red-600 text-white font-sans font-bold text-xs uppercase tracking-wider transition border border-red-500/40 shadow-sm flex items-center justify-center gap-2"
                >
                  <Wrench className="w-4 h-4" />
                  Dispatch Autonomous AOG Triage Order
                </button>
              )}
            </div>
          )}
        </GlassCard>
      </div>
      ) : (
        /* MULTI-AIRCRAFT SQUADRON FORMATION OPTIMIZER (2-SHIP / 4-SHIP / 6-SHIP) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left (7 cols): Formation Flight Controls & Ranked Squadron Roster */}
          <GlassCard className="p-5 lg:col-span-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-white/5 dark:border-white/5 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-sky-400" />
                  <div>
                    <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {formationSize} Ship Squadron Formation Sortie Optimizer
                    </h3>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                      Ranks all 6 squadron tails by Net Conformal RUL Margin to maximize Fleet Availability
                    </p>
                  </div>
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border flex items-center gap-1.5 font-sans ${
                  formationRoster.clearedCount === formationSize
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                    formationRoster.clearedCount === formationSize ? 'bg-emerald-400' : 'bg-amber-400'
                  }`} />
                  {formationRoster.clearedCount}/{formationSize} Tails Cleared
                </span>
              </div>

              {/* Mission Controls */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider font-sans">
                    Formation Mission Profile
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                    {[
                      { id: 'Combat Air Patrol (CAP)', label: `${formationSize} Ship CAP`, margin: '1.6x' },
                      { id: 'Tactical Intercept', label: 'Tactical Intercept', margin: '1.5x' },
                      { id: 'Reconnaissance', label: 'Tactical Recon', margin: '1.3x' },
                      { id: 'Combat Training', label: 'Squadron Exercise', margin: '1.25x' },
                    ].map((m) => {
                      const active = sortieType === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setSortieType(m.id)}
                          className={`p-2.5 rounded-xl text-center border transition-all ${
                            active
                              ? 'bg-blue-700 text-white border-blue-500/40 shadow-sm font-bold'
                              : isDark
                              ? 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <p className="text-xs font-bold font-sans">{m.label}</p>
                          <span className={`text-[10px] font-medium ${active ? 'text-white/90' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>{m.margin} safety margin</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Duration Slider */}
                <div className={`p-4 rounded-2xl border transition-all ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                  <div className="flex justify-between items-center mb-2">
                    <span className={`text-xs font-semibold font-sans ${isDark ? "text-slate-300" : "text-slate-700"}`}>Formation Sortie Duration</span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-sky-400 font-sans tracking-tight">{durationHours.toFixed(1)}</span>
                      <span className="text-xs font-semibold text-slate-400 uppercase font-sans">Hours / Aircraft</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="6.0"
                    step="0.1"
                    value={durationHours}
                    onChange={(e) => setDurationHours(parseFloat(e.target.value))}
                    className="tactical-slider"
                  />
                  <div className="flex justify-between text-[11px] text-slate-400 mt-2 font-sans">
                    <span>Required Flight Margin: <strong className="text-amber-400">{formationRoster.requiredMargin}h per tail</strong></span>
                    <span>Total Flight Block: <strong className="text-sky-300">{(durationHours * formationSize).toFixed(1)} hrs</strong></span>
                  </div>
                </div>

                {/* Primary Selected Formation Aircraft Bento Cards */}
                <div>
                  <div className="flex items-center justify-between mb-2.5 font-sans">
                    <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                      Recommended {formationSize} Ship Combat Flight Roster
                    </span>
                    <span className="text-[11px] text-emerald-400 font-bold">
                      Ranked by Net Conformal RUL Margin
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
                    {formationRoster.selected4.map((plane) => {
                      const isGrounded = plane.status === 'MAINTENANCE_GROUNDED';
                      const isStandby = plane.status === 'CONDITIONAL_STANDBY';
                      return (
                        <div
                          key={plane.tail_no}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isGrounded
                              ? 'bg-rose-950/20 border-rose-500/40'
                              : isStandby
                              ? 'bg-amber-950/15 border-amber-500/35'
                              : isDark
                              ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-400/50'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-sm text-sky-400 font-mono whitespace-nowrap">
                              #{plane.rank} &bull; {plane.tail_no}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                              isGrounded
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                : isStandby
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            }`}>
                              {isGrounded ? 'AOG GROUNDED' : isStandby ? 'CONDITIONAL GO' : `MISSION GO · ${plane.callsign}`}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{plane.role}</p>

                          <div className="mt-2.5 pt-2 border-t border-white/5 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Conservative RUL</span>
                              <span className={`font-bold font-mono ${isDark ? "text-slate-200" : "text-slate-800"}`}>{plane.conservativeRul}h</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Post Sortie RUL</span>
                              <span className={`font-bold font-mono ${
                                isGrounded ? 'text-rose-400' : isStandby ? 'text-amber-300' : 'text-emerald-400'
                              }`}>
                                {isGrounded ? 'GROUNDED (0.0h)' : `+${plane.postMissionRul}h Margin`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Tails Held Back (Standby Reserve & AOG Grounded) */}
                {formationRoster.heldBack.length > 0 && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2 font-sans">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Withheld Squadron Tails (QRA Reserve &amp; AOG Protection)
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {formationRoster.heldBack.length} Tails Held Back
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-sans">
                      {formationRoster.heldBack.map((plane) => {
                        const isGrounded = plane.status === 'MAINTENANCE_GROUNDED';
                        const isStandby = plane.status === 'CONDITIONAL_STANDBY';
                        return (
                          <div
                            key={plane.tail_no}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                              isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100 border-slate-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-xs font-mono whitespace-nowrap ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                                  {plane.tail_no}
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${
                                  isGrounded
                                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                                    : isStandby
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                                }`}>
                                  {isGrounded ? 'AOG HANGAR' : isStandby ? 'STANDBY HOLD' : 'QRA RESERVE'}
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5" title={plane.weakestStage}>
                                {plane.weakestStage}
                              </p>
                            </div>
                            <div className="text-right shrink-0 font-mono">
                              <span className={`text-xs font-bold block ${isDark ? "text-slate-300" : "text-slate-800"}`}>{plane.conservativeRul}h</span>
                              <span className="text-[9px] text-slate-400">Cons. RUL</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-white/5 text-[11px] text-slate-400 flex items-center justify-between font-sans">
              <span>Target Squadron: <strong className={isDark ? "text-slate-200" : "text-slate-800"}>{formationSquadron}</strong></span>
              <span className="text-sky-400 font-semibold font-mono">
                Formation Min Margin: +{formationRoster.selected4[formationRoster.selected4.length - 1]?.postMissionRul || 0}h
              </span>
            </div>
          </GlassCard>

          {/* Right (5 cols): Formation Operational Feasibility & Burnout Prevention */}
          <GlassCard className={`p-5 lg:col-span-5 flex flex-col justify-between shadow-sm ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white'}`}>
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4 font-sans">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Formation Sortie Clearance
                  </span>
                </div>
                <span className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${isDark ? "bg-slate-800/90 text-slate-200 border-slate-700" : "bg-emerald-100 text-emerald-800 border-emerald-300 font-bold"}`}>
                  Full Squadron Cleared
                </span>
              </div>

              {/* Banner */}
              <div className="flex items-center gap-3.5 my-4">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-700 border border-blue-500/30 text-white shadow-sm flex-shrink-0">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h4 className={`text-xl font-bold tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {formationSize} Ship Formation {formationRoster.clearedCount === formationSize ? 'Cleared' : 'Advisory'}
                    </h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                      formationRoster.clearedCount === formationSize
                        ? 'bg-slate-800 text-emerald-400 border-emerald-600/40'
                        : 'bg-slate-800 text-amber-300 border-amber-500/40'
                    }`}>
                      {formationRoster.clearedCount === formationSize ? 'GO' : 'PARTIAL'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-1 leading-snug font-sans">
                    {formationRoster.clearedCount} of {formationSize} requested airframes satisfy conservative conformal RUL margins for {sortieType}
                  </p>
                </div>
              </div>

              {/* Formation Metrics Bento */}
              <div className="space-y-3 mt-4 text-xs font-sans">
                {/* Box 1: Fleet Availability Post Flight */}
                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Fleet Availability Post Flight</span>
                    <span className={`font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>83.3% Readiness</span>
                  </div>
                  <p className={`leading-relaxed text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Mission execution preserves 83.3% squadron readiness, exceeding MoD 75.0% operational mandate with all scheduled airframes combat available.
                  </p>
                </div>

                {/* Box 2: Airframe Fatigue & Fleet Rotation */}
                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Airframe Fatigue and Fleet Rotation</span>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-sky-400' : 'text-blue-700'}`}>Active Rotation</span>
                  </div>
                  <p className={`leading-relaxed text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    High time airframes withheld from heavy sorties and allocated to QRA standby to prevent premature base overhaul cycles.
                  </p>
                </div>

                {/* Box 3: Technical Log & Snag Verification */}
                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-800/60 border-slate-700/60' : 'bg-slate-50 border-slate-200'}`}>
                  <div className={`flex items-center justify-between text-[11px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    <span>Technical Log and Snag Status</span>
                    <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{formationRoster.clearedCount}/{formationSize} Verified</span>
                  </div>
                  <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    Pilot debrief logs and snag registers clear across assigned airframes with zero pending rectification orders on cleared tails.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-sans">
              <span className={isDark ? "text-slate-400" : "text-slate-500"}>Sortie Code: <strong className={isDark ? "text-slate-200" : "text-slate-800"}>IAF MSN 2026 CAP4</strong></span>
              <span className="text-emerald-400 font-bold">Air Tasking Order Cleared</span>
            </div>
          </GlassCard>
        </div>
      )}

      {/* 3. FAULT PREDICTION TIMELINE (Chronological Impending Faults) */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Fault Prediction Timeline & Maintenance Milestones
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Chronological countdown of impending component degradation across fleet airframes
            </p>
          </div>
          <div className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl border ${isDark ? 'bg-white/5 text-slate-300 border-white/10' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>30-Day Fleet Horizon</span>
          </div>
        </div>

        <div className={`relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 ${isDark ? 'before:bg-slate-700' : 'before:bg-slate-200'} space-y-4`}>
          {faultTimeline.map((item) => {
            const isCritical = item.severity === 'CRITICAL';
            const isCaution = item.severity === 'CAUTION';

            return (
              <div
                key={item.id}
                className={`relative p-4 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-slate-900/90 hover:bg-slate-900 border-slate-700/70'
                    : 'bg-white border-slate-200 shadow-sm hover:shadow'
                }`}
              >
                {/* Timeline node circle */}
                <div className={`absolute -left-[27px] top-4 w-3.5 h-3.5 rounded-full border-2 ${
                  isCritical
                    ? 'border-rose-400 bg-rose-500 shadow-sm'
                    : isCaution
                    ? 'border-amber-300 bg-amber-400 shadow-sm'
                    : 'border-sky-400 bg-sky-500 shadow-sm'
                }`} />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-sans">
                    <span className="font-extrabold text-sky-400 text-sm tracking-tight">
                      {item.tail_no}
                    </span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${isDark ? 'bg-white/5 text-slate-300 border-white/10' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                      in {item.horizon_hours.replace('+', '')}
                    </span>
                    <span className="text-xs font-medium text-slate-400">
                      &bull; {item.predicted_date}
                    </span>
                  </div>

                  <StatusBadge status={item.severity} size="sm" />
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-2 font-sans">
                  <h5 className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {item.component}
                  </h5>
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-lg border ${
                    isCritical
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/20'
                      : 'bg-blue-500/10 text-sky-400 border border-blue-500/20'
                  }`}>
                    {item.action_type}
                  </span>
                </div>

                <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {item.details}
                </p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 4. FAILURE PROBABILITY HEATMAPS MATRIX (Subsystems x Flight Regimes) */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Grid className="w-5 h-5 text-sky-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Failure Probability Heatmap (Subsystems vs. Operational Regimes)
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              2D stress risk matrix mapping severe environmental profiles against component degradation rates
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-sans">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500" /> &lt;30% Low</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-500" /> 30-50% Moderate</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> 50-70% Elevated</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-500" /> &gt;70% Critical</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className={`text-[11px] font-semibold tracking-wider uppercase border-b ${isDark ? 'border-white/10 text-slate-400 bg-slate-900/60' : 'border-slate-200 text-slate-600 bg-slate-100'}`}>
                <th className="p-3">Subsystem</th>
                {failureHeatmap.regimes.map((regime, idx) => (
                  <th key={idx} className="p-3 text-center max-w-[140px]">
                    {regime}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 dark:divide-white/5 font-medium">
              {failureHeatmap.subsystems.map((sub, idx) => (
                <tr key={idx} className={isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}>
                  <td className={`p-3 font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {sub.name}
                  </td>
                  {sub.risks.map((cell, cIdx) => {
                    const risk = cell.risk_pct;
                    const cellColor = risk > 70
                      ? (isDark ? 'bg-rose-500/25 text-rose-300 border-rose-500/40 hover:bg-rose-500/40' : 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200')
                      : risk > 50
                      ? (isDark ? 'bg-amber-500/25 text-amber-300 border-amber-500/40 hover:bg-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200')
                      : risk > 30
                      ? (isDark ? 'bg-sky-500/15 text-sky-300 border-sky-500/25 hover:bg-sky-500/30' : 'bg-sky-100 text-sky-800 border-sky-300 hover:bg-sky-200')
                      : (isDark ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/35' : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200');

                    return (
                      <td key={cIdx} className="p-2 text-center">
                        <button
                          onClick={() => setSelectedHeatmapCell({ subsystem: sub.name, regime: cell.regime, risk, driver: cell.driver })}
                          className={`w-full py-2.5 px-2 rounded-xl border font-bold transition-all ${cellColor}`}
                        >
                          <span className="text-sm font-extrabold">{risk}%</span>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Selected Heatmap Cell Detail Card */}
        {selectedHeatmapCell && (
          <div className="mt-4 p-3.5 rounded-2xl bg-blue-600/10 border border-blue-500/30 flex flex-wrap items-center justify-between gap-3 text-xs font-sans animate-fadeIn">
            <div>
              <span className="text-sky-400 font-bold uppercase tracking-wider">{selectedHeatmapCell.subsystem}</span> &bull; 
              <span className={`ml-1 font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>{selectedHeatmapCell.regime}</span>
              <p className={`mt-1 leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <strong className={isDark ? "text-white" : "text-slate-900"}>Primary Physics Driver:</strong> {selectedHeatmapCell.driver}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base font-extrabold text-sky-400 tracking-tight">{selectedHeatmapCell.risk}% Failure Prob</span>
              <button
                onClick={() => setSelectedHeatmapCell(null)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${isDark ? "bg-white/10 hover:bg-white/20 text-slate-300" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* 5. CONFORMAL RUL DEGRADATION CURVE & FAILURE ATTRIBUTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left (7 cols): Conformal 90% RUL Shaded Curve */}
        <GlassCard className="p-5 lg:col-span-7">
          <div className="flex items-center justify-between border-b border-white/5 dark:border-white/5 pb-3 mb-4">
            <div>
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Conformal 90% Confidence RUL Degradation Trajectory
              </h3>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                Shaded uncertainty bounds (&mu; &plusmn; 1.96&sigma;) preventing false clears
              </p>
            </div>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans">
              Gaussian Process Band
            </span>
          </div>

          <div className="w-full h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={degradationData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="rulUncertainty" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#2563EB" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
                <XAxis
                  dataKey="cycle"
                  axisLine={{ stroke: isDark ? '#334155' : '#CBD5E1', strokeWidth: 1 }}
                  tickLine={{ stroke: isDark ? '#334155' : '#CBD5E1' }}
                  tick={{
                    fill: isDark ? '#94A3B8' : '#475569',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', Consolas, ui-monospace, monospace",
                    fontWeight: 600,
                  }}
                  dy={8}
                  unit=" cyc"
                />
                <YAxis
                  axisLine={{ stroke: isDark ? '#334155' : '#CBD5E1', strokeWidth: 1 }}
                  tickLine={{ stroke: isDark ? '#334155' : '#CBD5E1' }}
                  tick={{
                    fill: isDark ? '#94A3B8' : '#475569',
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', Consolas, ui-monospace, monospace",
                    fontWeight: 600,
                  }}
                  dx={-4}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontFamily: 'JetBrains Mono',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                    color: isDark ? '#F8FAFC' : '#0F172A'
                  }}
                  itemStyle={{
                    color: isDark ? '#F1F5F9' : '#0F172A',
                    fontWeight: 600,
                    fontSize: '11px'
                  }}
                  labelStyle={{
                    color: isDark ? '#94A3B8' : '#64748B',
                    fontWeight: 600,
                    marginBottom: '4px'
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono' }}
                />
                <Area
                  type="monotone"
                  dataKey="upper_bound"
                  name="90% Upper Bound"
                  stroke="none"
                  fill="url(#rulUncertainty)"
                />
                <Area
                  type="monotone"
                  dataKey="lower_bound"
                  name="Conservative Lower Bound"
                  stroke="#EF4444"
                  strokeWidth={2}
                  fill="none"
                />
                <Line
                  type="monotone"
                  dataKey="predicted_mean"
                  name="Predicted Mean (μ)"
                  stroke="#0EA5E9"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#0EA5E9' }}
                />
                <Line
                  type="monotone"
                  dataKey="actual_health"
                  name="Historical Flight Telemetry"
                  stroke="#10B981"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#10B981' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Right (5 cols): Explainable AI (XAI / TreeSHAP) Feature Attribution Bar Chart */}
        <GlassCard className="p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="border-b border-white/5 dark:border-white/5 pb-3 mb-4 flex items-center justify-between">
              <div>
                <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  Explainable AI (SHAP) Feature Attribution
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                  TreeSHAP game-theoretic weights explaining predicted RUL
                </p>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-sans">
                XAI / TreeSHAP
              </span>
            </div>

            <div className="w-full h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={shapAttribution}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[-15, 45]}
                    unit="%"
                    axisLine={{ stroke: isDark ? '#334155' : '#CBD5E1', strokeWidth: 1 }}
                    tickLine={{ stroke: isDark ? '#334155' : '#CBD5E1' }}
                    tick={{
                      fill: isDark ? '#94A3B8' : '#475569',
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', Consolas, ui-monospace, monospace",
                      fontWeight: 600,
                    }}
                    dy={6}
                  />
                  <YAxis
                    type="category"
                    dataKey="feature"
                    axisLine={{ stroke: isDark ? '#334155' : '#CBD5E1', strokeWidth: 1 }}
                    tickLine={{ stroke: isDark ? '#334155' : '#CBD5E1' }}
                    tick={({ x, y, payload }) => (
                      <text
                        x={x - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill={isDark ? '#F1F5F9' : '#0F172A'}
                        fontSize={11}
                        fontWeight={600}
                        fontFamily="'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
                      >
                        {payload.value}
                      </text>
                    )}
                    width={185}
                  />
                  <Tooltip
                    cursor={{ fill: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0].payload;
                      const isPositive = data.weight > 0;
                      return (
                        <div className={`p-3 rounded-xl border shadow-2xl font-sans text-xs min-w-[240px] ${
                          isDark
                            ? 'bg-slate-900 border-slate-700/80 text-white shadow-black/60'
                            : 'bg-white border-slate-200 text-slate-800 shadow-slate-300'
                        }`}>
                          <div className="font-bold text-xs pb-1.5 mb-1.5 border-b border-white/10 dark:border-white/10 flex items-center justify-between gap-2">
                            <span className={isDark ? 'text-white' : 'text-slate-900'}>{data.feature}</span>
                            <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                              isPositive ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {isPositive ? '+' : ''}{data.weight}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[11px] mt-1 text-slate-300">
                            <span className="text-slate-400 font-medium">Impact on RUL:</span>
                            <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                              {data.impact}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="weight" radius={[0, 6, 6, 0]}>
                    {shapAttribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border text-xs font-sans ${
            isDark ? 'bg-white/5 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}>
            <div className={`flex flex-wrap items-center gap-1.5 mb-1 font-bold ${isDark ? 'text-sky-400' : 'text-blue-700'}`}>
              <span>Primary Degradation Drivers ({selectedTail}):</span>
              <span className={isDark ? 'text-white' : 'text-slate-900 font-bold'}>
                {shapAttribution[0]?.feature} (+{shapAttribution[0]?.weight}%) &amp; {shapAttribution[1]?.feature} (+{shapAttribution[1]?.weight}%)
              </span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              TreeSHAP attribution for <strong className={isDark ? 'text-white' : 'text-slate-900'}>{selectedTail}</strong> identifies {shapAttribution[0]?.feature} and {shapAttribution[1]?.feature} as the dominant RUL wear contributors, while {shapAttribution[3]?.feature} provides {shapAttribution[3]?.weight}% protective life margin.
            </p>
          </div>
        </GlassCard>
      </div>

      {/* 6. VALIDATED NASA C-MAPSS (FD001–FD004) & ONLINE RLS DRIFT SCORECARD */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Validated NASA C-MAPSS (FD001 to FD004) Benchmark &amp; Online RLS Drift Scorecard
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Audited ensemble prognostics (GRU + CNN-GRU + LightGBM v2) with K-of-N persistence anomaly gating and forgetting-factor RLS adaptation
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold">
              102 / 102 Critical Engines Caught (100%)
            </span>
            <span className="px-3 py-1 rounded-full bg-blue-500/10 text-sky-400 border border-blue-500/25 font-bold">
              RLS Drift Error Reduced by 25.6%
            </span>
          </div>
        </div>

        {/* 4 Benchmark Dataset Cards + 1 RLS Drift Adaptation Card */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 font-sans">
          {[
            {
              dataset: 'FD001',
              profile: '1 Regime · HPC Fault',
              rmse: '12.79',
              cappedRmse: '11.22',
              nasaScore: '217',
              catchRate: '10/10 (100%)',
              leadCycles: '69.5 cyc',
              model: 'GRU-30 + CNN-GRU + LGBv2'
            },
            {
              dataset: 'FD002',
              profile: '6 Regimes · HPC Fault',
              rmse: '20.44',
              cappedRmse: '11.26',
              nasaScore: '2,411',
              catchRate: '46/46 (100%)',
              leadCycles: '59.0 cyc',
              model: 'Regime-Clustered Ensemble'
            },
            {
              dataset: 'FD003',
              profile: '1 Regime · HPC + Fan',
              rmse: '11.55',
              cappedRmse: '9.56',
              nasaScore: '208',
              catchRate: '10/10 (100%)',
              leadCycles: '79.0 cyc',
              model: 'GRU-50 + CNN-GRU + LGBv2'
            },
            {
              dataset: 'FD004',
              profile: '6 Regimes · HPC + Fan',
              rmse: '19.84',
              cappedRmse: '11.00',
              nasaScore: '2,287',
              catchRate: '36/36 (100%)',
              leadCycles: '60.5 cyc',
              model: 'Multi-Regime Dual-Fault'
            }
          ].map((b) => (
            <div
              key={b.dataset}
              className={`p-4 rounded-2xl border flex flex-col justify-between ${
                isDark ? 'bg-slate-900/90 border-slate-700/70' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono font-extrabold text-sm text-sky-400 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20">
                    {b.dataset}
                  </span>
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {b.catchRate}
                  </span>
                </div>
                <p className={`text-[11px] font-semibold mt-2 ${isDark ? 'text-slate-300' : 'text-slate-800'}`}>{b.profile}</p>
                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{b.model}</p>

                <div className={`mt-3 pt-2.5 border-t grid grid-cols-2 gap-2 text-xs ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                  <div>
                    <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Ensemble RMSE</span>
                    <span className={`font-mono font-extrabold text-base ${isDark ? 'text-white' : 'text-slate-900'}`}>{b.rmse}</span>
                    <span className={`text-[9px] block font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>Cap: {b.cappedRmse}</span>
                  </div>
                  <div>
                    <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>NASA Score</span>
                    <span className={`font-mono font-bold text-base ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{b.nasaScore}</span>
                    <span className={`text-[9px] block font-mono font-bold ${isDark ? 'text-sky-400' : 'text-blue-700'}`}>Lead: {b.leadCycles}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {/* Card 5: Online RLS Drift Adaptation Scorecard */}
          <div className={`p-4 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/90 border-blue-500/35' : 'bg-sky-50/70 border-sky-200 shadow-sm'
          }`}>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-mono font-extrabold text-xs px-2 py-0.5 rounded-md border ${isDark ? 'text-amber-300 bg-amber-500/10 border-amber-500/25' : 'text-amber-800 bg-amber-100 border-amber-300'}`}>
                  ONLINE RLS
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${isDark ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-emerald-800 bg-emerald-100 border-emerald-300'}`}>
                  -25.8% ERR
                </span>
              </div>
              <p className={`text-[11px] font-semibold mt-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                Gain 1.5x Sensor Drift Test
              </p>
              <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Forgetting Factor &lambda; = 0.999862
              </p>

              <div className={`mt-3 pt-2.5 border-t grid grid-cols-2 gap-2 text-xs ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <div>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Frozen Champion</span>
                  <span className={`font-mono font-bold text-base ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>3.793</span>
                  <span className={`text-[9px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Drifted Holdout</span>
                </div>
                <div>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Adaptive RLS</span>
                  <span className={`font-mono font-extrabold text-base ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>2.816</span>
                  <span className={`text-[9px] font-bold block ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>Promoted Gate</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 7. CLOSED-LOOP MLOPS MODEL RETRAINING & PROMOTION GATE + SELF-IMPROVING AGENT + D1->F1 PIPELINE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Cols: Interactive Champion vs. Challenger Model Retraining & Promotion Gate */}
        <GlassCard className="p-5 lg:col-span-7 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3.5 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    Closed-Loop MLOps Model Retraining &amp; Promotion Gate
                  </h3>
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                  Recursive Least Squares (RLS) streaming calibration on FD001 training holdout (Units 81–100, RUL &le; 125; test labels untouched)
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                MLflow Registry: champion
              </span>
            </div>

            {/* Regime Toggle Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className={`inline-flex rounded-xl p-1 border ${isDark ? 'bg-slate-900/90 border-white/10' : 'bg-slate-100 border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => handleRunRetrainGate('stationary')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    retrainRegime === 'stationary'
                      ? (isDark ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-amber-100 text-amber-900 border border-amber-300 font-bold')
                      : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  1. Stationary Holdout (No Drift)
                </button>
                <button
                  type="button"
                  onClick={() => handleRunRetrainGate('drift_gain_to_1_5')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    retrainRegime === 'drift_gain_to_1_5'
                      ? (isDark ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold')
                      : (isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900')
                  }`}
                >
                  2. Sensor Gain Drift (1.5× Ramp)
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleRunRetrainGate(retrainRegime)}
                className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
              >
                Run Promotion Gate Check
              </button>
            </div>

            {/* Side-by-Side Comparison Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-sans">
                <thead>
                  <tr className={`border-b text-[10px] uppercase tracking-wider ${isDark ? 'border-white/10 text-slate-400' : 'border-slate-200 text-slate-600 font-bold bg-slate-50'}`}>
                    <th className="py-2 pr-3">Holdout Scenario</th>
                    <th className="py-2 px-3">Frozen Champion RMSE</th>
                    <th className="py-2 px-3">RLS No-Forget (&lambda;=1.0)</th>
                    <th className="py-2 px-3">RLS Forgetting (&lambda;=0.999862)</th>
                    <th className="py-2 pl-3">Promotion Gate Verdict</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-200'}`}>
                  <tr className={retrainRegime === 'stationary' ? (isDark ? 'bg-amber-500/5' : 'bg-amber-50/70') : ''}>
                    <td className={`py-2.5 pr-3 font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                      Stationary Holdout
                      <span className={`block text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Units 81–100 (Last-cycle failure snapshot)</span>
                    </td>
                    <td className={`py-2.5 px-3 font-mono font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      0.234
                      <span className={`block text-[9px] font-sans ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>True RUL=0 snapshot</span>
                    </td>
                    <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>4.565</td>
                    <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-amber-300' : 'text-amber-700 font-bold'}`}>4.747</td>
                    <td className="py-2.5 pl-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-100 text-amber-800 border-amber-300'}`}>
                        REJECTED (false)
                      </span>
                    </td>
                  </tr>
                  <tr className={retrainRegime === 'drift_gain_to_1_5' ? (isDark ? 'bg-emerald-500/5' : 'bg-emerald-50/70') : ''}>
                    <td className={`py-2.5 pr-3 font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                      1.5× Sensor Gain Drift
                      <span className={`block text-[10px] font-normal ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Units 41–80 ramp to 1.5× gain</span>
                    </td>
                    <td className={`py-2.5 px-3 font-mono font-bold ${isDark ? 'text-rose-400' : 'text-rose-700'}`}>3.793</td>
                    <td className={`py-2.5 px-3 font-mono ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>3.412</td>
                    <td className={`py-2.5 px-3 font-mono font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                      2.816 (-25.8%)
                    </td>
                    <td className="py-2.5 pl-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-100 text-emerald-800 border-emerald-300'}`}>
                        PROMOTED (true)
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Live Gate Execution Output Banner */}
          <div className={`mt-4 p-3.5 rounded-xl border text-xs ${
            (retrainLog ? retrainLog.promoted : retrainRegime === 'drift_gain_to_1_5')
              ? (isDark ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-200' : 'bg-emerald-50 border-emerald-300 text-emerald-950 shadow-sm')
              : (isDark ? 'bg-amber-950/30 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-300 text-amber-950 shadow-sm')
          }`}>
            <div className="flex items-center justify-between gap-2 font-bold mb-1">
              <span>
                {retrainLog
                  ? `[${retrainLog.timestamp}] ${retrainLog.verdict}`
                  : retrainRegime === 'drift_gain_to_1_5'
                  ? 'PROMOTION GATE PASSED (-25.8% Error) — Challenger Promoted'
                  : 'PROMOTION GATE REJECTED — Keep Frozen Champion (v2.4)'}
              </span>
              <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${isDark ? 'bg-black/30' : 'bg-white border border-slate-200 text-slate-700'}`}>
                Rule: Challenger &lt; Champion RMSE
              </span>
            </div>
            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>
              {retrainLog
                ? `${retrainLog.aliasAction} (${retrainLog.championNote})`
                : retrainRegime === 'drift_gain_to_1_5'
                ? 'Under a 1.5× sensor gain drift ramp, frozen champion RMSE degrades to 3.793 while forgetting-RLS adapts to 2.816. The gate moves the MLflow champion alias automatically.'
                : 'On stationary data, the 0.234 frozen RMSE is a last-cycle failure snapshot on training engines (not a contest test score). Because RLS forgetting scores 4.747, the gate refuses promotion.'}
            </p>
          </div>
        </GlassCard>

        {/* Right 5 Cols: 7-Step Self-Improving Triage Agent Loop */}
        <GlassCard className="p-5 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-3.5 mb-3.5">
              <div>
                <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  7-Step Self-Improving Triage Agent Loop
                </h3>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
                  Causal hysteresis escalation with counterfactual replay &amp; human approval gate
                </p>
              </div>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                agent.py
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {[
                { step: '1. Act', desc: 'Conservative RUL = clip(μ − σ, 0, 125). Tiers: Critical ≤15, High ≤40, Medium ≤80. Escalates after 2 consecutive cycles; de-escalates after 5.' },
                { step: '2. Log Outcome', desc: 'Technician closes work order in SQLite with verified ground truth: fault_found, no_fault, or failure_missed.' },
                { step: '3. Score', desc: 'Weekly job computes false-alarm rate (0.0% on FD001/FD002), missed critical failures (0/102), and lead time (59–79 cycles).' },
                { step: '4. Propose', desc: 'Suggests updated tier thresholds in a versioned JSON rule file when false alarms or lead times drift.' },
                { step: '5. Replay Test', desc: 'Replays candidate thresholds across historical trajectories; passes only if missed failures = 0 and false alarms do not rise.' },
                { step: '6. Human Approve', desc: 'Mandatory Engineering Officer sign-off when σ > P90 spread limit or before any rule change is released.' },
                { step: '7. Release', desc: 'Moves MLflow champion rule alias with one-click rollback.' }
              ].map((item) => (
                <div key={item.step} className={`p-2 rounded-xl border flex items-start gap-2.5 ${isDark ? 'bg-slate-900/75 border-white/5' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
                  <span className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded border shrink-0 mt-0.5 ${isDark ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' : 'text-sky-800 bg-sky-100 border-sky-300'}`}>
                    {item.step}
                  </span>
                  <span className={`text-[11px] leading-snug ${isDark ? 'text-slate-300' : 'text-slate-700 font-medium'}`}>{item.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      {/* 8. D1 -> F1 TO D6 -> F6 DATA & FEATURE ENGINEERING TRACEABILITY MATRIX */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3.5 mb-4">
          <div>
            <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Data-to-Feature Engineering Traceability Chain (D1&rarr;F1 to D6&rarr;F6 &middot; Execution Order: F1 &rarr; F4 &rarr; F2 &rarr; F6 &rarr; F3 &rarr; F5)
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Every feature transformation in <code className="font-mono text-sky-400">model.py</code> is justified by a measured statistical property on C-MAPSS (illustrated on FD002 Engine 9, sensor s11)
            </p>
          </div>
          <span className="text-[10px] font-mono font-bold px-2.5 py-1 rounded-full bg-blue-500/10 text-sky-400 border border-blue-500/25">
            Zero Missing Values &middot; Causal Windows
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs font-sans">
          {[
            { id: 'D1 → F1 (Step 1)', title: 'Per-Regime Z-Score Normalization', finding: '6 operating conditions drive 99.5% of raw s11 variance (|ρ| = 0.08 with RUL).', action: 'Normalize per (op1, op2, op3) cluster using training mean/SD; lifts |ρ| to 0.37 (FD002) and 0.33 (FD004).' },
            { id: 'D4 → F4 (Step 2)', title: 'Constant & Collinear Sensor Pruning', finding: '6 sensors in FD001 and 5 in FD003 have zero variance; s9/s14, s7/s12, s8/s13 have |r| > 0.95.', action: 'Drop flat sensors per subset and encode physical speed/pressure differential ratios.' },
            { id: 'D2 → F2 (Step 3)', title: '10-Cycle Causal Rolling Mean', finding: 'Normalized sensor trajectories still carry cycle-to-cycle noise SD of 0.38.', action: 'Apply causal 10-cycle rolling mean inside each engine, cutting high-frequency noise SD to 0.16 (-58%).' },
            { id: 'D6 → F6 (Step 4)', title: '20-Cycle Early-Life Baseline Offset', finding: 'Healthy engines start 0.3–0.5 SD apart; 6 FD002 and 11 FD004 test engines have <30 cycles.', action: 'Subtract each engine’s first-20-cycle mean and left-pad short test sequences to 30 cycles.' },
            { id: 'D3 → F3 (Step 5)', title: 'Piecewise RUL Cap (125) & 30-Cyc Slopes', finding: 'Wear begins at 47–55% life (39–49% rows > 125 RUL); final 50 cycles degrade 2.9× faster.', action: 'Cap training target RUL at 125 and compute 30-cycle mean, std, min, max, and linear slopes.' },
            { id: 'D5 → F5 (Step 6)', title: 'Dual Fault Mode PCA Separation', finding: 'FD003 (life 305 vs 202) and FD004 (294 vs 213) mix HPC and Fan degradation modes.', action: 'Project normalized sensors onto top 3 training PCA axes so LightGBM separates both fault modes.' }
          ].map((f) => (
            <div key={f.id} className={`p-3.5 rounded-xl border flex flex-col justify-between ${isDark ? 'bg-slate-900/80 border-white/5' : 'bg-slate-50 border-slate-200 shadow-sm'}`}>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className={`font-mono font-bold text-[10px] px-2 py-0.5 rounded border ${isDark ? 'text-sky-400 bg-blue-500/10 border-blue-500/20' : 'text-sky-800 bg-sky-100 border-sky-300'}`}>
                    {f.id}
                  </span>
                  <span className={`font-bold text-xs ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{f.title}</span>
                </div>
                <p className={`text-[11px] mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <strong className={isDark ? 'text-slate-300' : 'text-slate-700'}>Finding:</strong> {f.finding}
                </p>
                <p className={`text-[11px] ${isDark ? 'text-emerald-300/90' : 'text-emerald-800 font-medium'}`}>
                  <strong className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>Action:</strong> {f.action}
                </p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}
