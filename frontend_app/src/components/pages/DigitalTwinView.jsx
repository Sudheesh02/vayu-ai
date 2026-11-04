import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Activity,
  Gauge,
  Zap,
  ArrowRight,
  RefreshCw,
  Layers
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import StatusBadge from '../common/StatusBadge';
import { useTheme } from '../../context/ThemeContext';
import { fleetApi } from '../../api/fleetApi';
import { MOCK_AIRCRAFT_LIST } from '../../data/mockFleetData';

export default function DigitalTwinView() {
  const { isDark, selectedTail, setSelectedTail, setActiveTab } = useTheme();

  // Helper to remove dashes/hyphens from subsystem names (e.g. Fly by Wire -> Fly by Wire)
  const formatSubsystemName = (rawName) => {
    if (!rawName) return '';
    return rawName
      .replace(/[–—]/g, ' ')
      .replace(/\b([A-Za-z0-9]+)-([A-Za-z0-9]+)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const [twinData, setTwinData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubsystemTab, setActiveSubsystemTab] = useState('ALL'); // ALL, avionics, propulsion, hydraulics, airframe
  const [selectedStageKey, setSelectedStageKey] = useState(null);
  const [injectionMode, setInjectionMode] = useState('nominal'); // 'nominal' | 'rls_drift' | 'hpc_surge'

  useEffect(() => {
    async function loadTwin() {
      setLoading(true);
      setInjectionMode('nominal');
      const res = await fleetApi.getAircraftDigitalTwin(selectedTail);
      setTwinData(res.data);
      setLoading(false);
    }
    loadTwin();
  }, [selectedTail]);

  if (!twinData && loading) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400 font-sans text-sm">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-500" />
        Loading 5 Stage Gas Path Digital Twin & Subsystem Telemetry...
      </div>
    );
  }

  const stageKeys = [
    { key: 'fan', label: '1. Fan & Intake', station: 'STA 2' },
    { key: 'lpc', label: '2. Low Pressure Comp', station: 'STA 24' },
    { key: 'hpc', label: '3. High Pressure Comp', station: 'STA 30' },
    { key: 'combustor_hpt', label: '4. Combustor & HPT', station: 'STA 40' },
    { key: 'lpt', label: '5. Low Pressure Turb', station: 'STA 50' },
  ];

  const rawTel = twinData?.telemetry || {};
  const prog = twinData?.prognostics || {};
  const rawStages = twinData?.stages || {};
  const rawDrift = twinData?.in_flight_drift_adaptation || {};
  const subsystems = twinData?.subsystems || {};

  // Apply Live Fault / Drift Injection Demo Overrides
  const tel = injectionMode === 'hpc_surge'
    ? {
        ...rawTel,
        T30_HPC_Temp_R: 1648.4,
        P30_HPC_Pres_psia: 518.4,
        T50_LPT_Temp_R: 1452.6,
        Nc_Core_RPM: 9112.0
      }
    : injectionMode === 'rls_drift'
    ? {
        ...rawTel,
        T30_HPC_Temp_R: Number(((rawTel.T30_HPC_Temp_R || 1588.0) + 14.2).toFixed(1)),
        P30_HPC_Pres_psia: Number(((rawTel.P30_HPC_Pres_psia || 553.8) + 6.4).toFixed(1))
      }
    : rawTel;

  const stages = injectionMode === 'hpc_surge'
    ? {
        ...rawStages,
        hpc: {
          ...(rawStages.hpc || {}),
          name: 'High Pressure Compressor (HPC)',
          health_pct: 34.0,
          status: 'CRITICAL',
          key_sensors: ['T30 (HPC 1648.4 °R)', 'P30 (Static 518.4 psia)'],
          wear_mode: 'Foreign Object / Sand Ingestion (HPC Stall & Surge)'
        }
      }
    : rawStages;

  const drift = injectionMode === 'rls_drift'
    ? {
        rls_drift_active: true,
        drift_type: 'Thermocouple Gain Drift (Gain D=1.5x on T30/P30)',
        correction_residual_compensated: true,
        gain_factor: 'D=1.5x'
      }
    : {
        ...rawDrift,
        gain_factor: rawDrift.rls_drift_active ? 'D=1.5x' : 'D=1.0x'
      };

  return (
    <div className="space-y-6 pb-8">
      {/* 1. TOP HEADER & TAIL SELECTOR CARD */}
      <GlassCard className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm">
            <Cpu className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-sans px-2.5 py-0.5 rounded-full bg-blue-500/15 text-sky-300 font-semibold border border-blue-500/30">
                Multi-Subsystem Digital Twin
              </span>
              <span className={`text-xs font-sans ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              
                Sortie Cycle #{twinData?.flight_cycle || 0}
              </span>
            </div>
            <h2 className={`text-lg font-extrabold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Aircraft Subsystems & Gas Path Health Monitor
            </h2>
          </div>
        </div>

        {/* Tail Picker */}
        <div className="flex items-center gap-3">
          <label className={`text-xs font-semibold font-sans uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            
            Select Asset:
          </label>
          <select
            value={selectedTail}
            onChange={(e) => setSelectedTail(e.target.value)}
            className={`text-xs font-sans font-semibold py-2 px-3 rounded-xl cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
              isDark
                ? 'bg-slate-900 text-slate-200 border border-white/15'
                : 'bg-slate-100 text-slate-900 border border-slate-200'
            }`}
          >
            {MOCK_AIRCRAFT_LIST.map((ac) => (
              <option key={ac.tail_no} value={ac.tail_no} className={isDark ? "bg-slate-900 text-white" : "bg-white text-slate-900"}>
                {ac.tail_no} - {ac.aircraft_type.split(' ')[0]} ({ac.status})
              </option>
            ))}
          </select>
        </div>
      </GlassCard>

      {/* 2. ASSET SUMMARY & OVERALL HEALTH */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <GlassCard className="p-4 flex flex-col justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Airframe & Engine
          </p>
          <div className="mt-2">
            <h4 className={`text-xl font-sans font-black tracking-tight ${isDark ? 'text-cyan-300' : 'text-blue-700'}`}>
              {twinData?.tail_no}
            </h4>
            <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {twinData?.aircraft_type}
            </p>
          </div>
          <div className={`mt-3 pt-2 border-t text-[11px] font-sans ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-600 font-medium'}`}>
            Serial: {twinData?.engine_serial || 'AL31FP'}
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Squadron & Base
          </p>
          <div className="mt-2">
            <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {twinData?.squadron}
            </h4>
            <p className={`text-xs font-sans mt-0.5 font-bold ${isDark ? 'text-sky-400' : 'text-blue-700'}`}>
              {twinData?.base_station}
            </p>
          </div>
          <div className={`mt-3 pt-2 border-t text-[11px] font-sans ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-600 font-medium'}`}>
            Logged FH: {twinData?.airframe_hours} hrs
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Composite Fleet Health
          </p>
          <div className="flex items-baseline justify-between mt-2">
            <h4 className={`text-3xl font-sans font-extrabold tracking-tight ${
              (twinData?.overall_health_pct || 0) > 75
                ? (isDark ? 'text-emerald-400' : 'text-emerald-700')
                : (twinData?.overall_health_pct || 0) > 50
                ? (isDark ? 'text-amber-400' : 'text-amber-700')
                : (isDark ? 'text-rose-400' : 'text-rose-700')
            }`}>
              {twinData?.overall_health_pct}%
            </h4>
            <StatusBadge status={twinData?.status} size="sm" />
          </div>
          <div className={`mt-3 pt-2 border-t ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
            <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`}>
              <div
                className={`h-full rounded-full ${
                  (twinData?.overall_health_pct || 0) > 75
                    ? (isDark ? 'bg-[#10B981]' : 'bg-[#059669]')
                    : (twinData?.overall_health_pct || 0) > 50
                    ? 'bg-[#F59E0B]'
                    : 'bg-[#EF4444]'
                }`}
                style={{ width: `${twinData?.overall_health_pct || 0}%` }}
              />
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-4 flex flex-col justify-between">
          <p className={`text-[11px] font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Conservative RUL (90% Conf)
          </p>
          <div className="mt-2">
            <h4 className={`text-2xl font-sans font-bold tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {prog.conservative_rul_hours} hrs
            </h4>
            <p className={`text-xs font-sans mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
              Point Estimate (Mean): <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{prog.predicted_rul_hours} hrs</strong>
            </p>
          </div>
          <div className={`mt-3 pt-2 border-t text-[11px] font-sans flex items-center justify-between ${isDark ? 'border-white/5 text-emerald-300' : 'border-slate-200 text-emerald-800 font-semibold'}`}>
            <span>90% Conformal Interval:</span>
            <span className={`font-bold font-mono ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}>[{prog.conformal_interval?.[0]}h - {prog.conformal_interval?.[1]}h]</span>
          </div>
        </GlassCard>
      </div>

      {/* 3. VISUAL 4-SUBSYSTEM BREAKDOWN (Avionics, Propulsion/Engine, Hydraulics, Airframe) */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-sky-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Aircraft Subsystem Architecture & AI Anomaly Detection Scores
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Avionics, Propulsion, Hydraulics, and Airframe real time telemetry with AI anomaly risk scoring
            </p>
          </div>

          {/* Subsystem Filter Tabs */}
          <div className="flex items-center gap-2 font-sans text-xs">
            {[
              { id: 'ALL', label: 'All Subsystems' },
              { id: 'avionics', label: 'Avionics' },
              { id: 'propulsion', label: 'Propulsion' },
              { id: 'hydraulics', label: 'Hydraulics' },
              { id: 'airframe', label: 'Airframe' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubsystemTab(tab.id)}
                className={`px-3 py-1.5 rounded-xl border transition ${
                  activeSubsystemTab === tab.id
                    ? 'bg-blue-700 text-white border-blue-500/40 font-bold shadow-sm'
                    : isDark
                    ? 'bg-white/5 text-slate-400 border-white/10 hover:text-white'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-slate-900 hover:bg-slate-200 font-semibold'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4 Subsystem Bento Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Subsystem 1: Avionics */}
          {(activeSubsystemTab === 'ALL' || activeSubsystemTab === 'avionics') && (
            <div className={`p-5 rounded-2xl border transition-all ${
              isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-sans whitespace-nowrap shrink-0 border ${
                  isDark ? 'bg-blue-500/10 text-sky-400 border-blue-500/20' : 'bg-blue-50 text-blue-800 border-blue-300'
                }`}>
                  Avionics & Bus
                </span>
                <StatusBadge status={subsystems.avionics?.status} size="sm" />
              </div>

              <h4 className={`font-bold text-sm mt-3.5 tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {formatSubsystemName(subsystems.avionics?.name) || 'Avionics System'}
              </h4>

              <div className="mt-3 flex items-baseline justify-between font-sans">
                <div>
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Subsystem Health</span>
                  <p className={`text-2xl font-black tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {subsystems.avionics?.health_score || 94}%
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>AI Anomaly Risk</span>
                  <p className={`text-base font-bold mt-0.5 ${
                    (subsystems.avionics?.anomaly_score || 0) > 0.2
                      ? (isDark ? 'text-amber-300' : 'text-amber-700')
                      : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  }`}>
                    {Math.round((subsystems.avionics?.anomaly_score || 0.04) * 100)}%
                  </p>
                </div>
              </div>

              {/* 2x2 Clean Bento Metric Grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-sans">
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Bus Voltage</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-white' : 'text-slate-900'}`}>{subsystems.avionics?.telemetry?.bus_voltage_v || 28.2} V</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>FADEC Desync</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{subsystems.avionics?.telemetry?.fadec_channel_desync_ms || 0.02} ms</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Core Temp</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{subsystems.avionics?.telemetry?.processor_core_temp_c || 45.2} °C</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>AESA Modules</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{subsystems.avionics?.telemetry?.radar_t_r_modules_active || '1536/1536'}</span>
                </div>
              </div>

              <p className={`text-xs mt-3 font-sans leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                {subsystems.avionics?.diagnostics}
              </p>
            </div>
          )}

          {/* Subsystem 2: Propulsion & Engine */}
          {(activeSubsystemTab === 'ALL' || activeSubsystemTab === 'propulsion') && (
            <div className={`p-5 rounded-2xl border transition-all ${
              isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-sans whitespace-nowrap shrink-0 border ${
                  isDark ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-sky-50 text-sky-800 border-sky-300'
                }`}>
                  Propulsion & Turbofan
                </span>
                <StatusBadge status={subsystems.propulsion?.status} size="sm" />
              </div>

              <h4 className={`font-bold text-sm mt-3.5 tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {formatSubsystemName(subsystems.propulsion?.name) || 'Propulsion System'}
              </h4>

              <div className="mt-3 flex items-baseline justify-between font-sans">
                <div>
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Subsystem Health</span>
                  <p className={`text-2xl font-black tracking-tight mt-0.5 ${
                    (subsystems.propulsion?.health_score || 0) < 50
                      ? (isDark ? 'text-rose-400' : 'text-rose-700')
                      : (subsystems.propulsion?.health_score || 0) < 75
                      ? (isDark ? 'text-amber-400' : 'text-amber-700')
                      : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  }`}>
                    {subsystems.propulsion?.health_score || 80.3}%
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>AI Anomaly Risk</span>
                  <p className={`text-base font-bold mt-0.5 ${
                    (subsystems.propulsion?.anomaly_score || 0) > 0.5
                      ? (isDark ? 'text-rose-400' : 'text-rose-700')
                      : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  }`}>
                    {Math.round((subsystems.propulsion?.anomaly_score || 0.18) * 100)}%
                  </p>
                </div>
              </div>

              {/* 2x2 Clean Bento Metric Grid: EGT, Oil Pressure, Vibration, Fan/Core RPM */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-sans">
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Exhaust Gas Temp</span>
                  <span className={`text-xs font-bold mt-0.5 block ${
                    (subsystems.propulsion?.telemetry?.exhaust_gas_temperature_c || 750) > 820
                      ? (isDark ? 'text-rose-400' : 'text-rose-700')
                      : (isDark ? 'text-amber-400' : 'text-amber-700')
                  }`}>
                    {subsystems.propulsion?.telemetry?.exhaust_gas_temperature_c || 755} °C
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Oil Pressure</span>
                  <span className={`text-xs font-bold mt-0.5 block ${
                    (subsystems.propulsion?.telemetry?.oil_pressure_psi || 48) < 40
                      ? (isDark ? 'text-rose-400' : 'text-rose-700')
                      : (isDark ? 'text-white' : 'text-slate-900')
                  }`}>
                    {subsystems.propulsion?.telemetry?.oil_pressure_psi || 49.2} psi
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Vibration Index</span>
                  <span className={`text-xs font-bold mt-0.5 block ${
                    (subsystems.propulsion?.telemetry?.vibration_anomaly_index || 0.3) > 0.6
                      ? (isDark ? 'text-rose-400' : 'text-rose-700')
                      : (isDark ? 'text-emerald-400' : 'text-emerald-700')
                  }`}>
                    {subsystems.propulsion?.telemetry?.vibration_anomaly_index || 0.32} mm/s
                  </span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Fan / Core RPM</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>
                    {subsystems.propulsion?.telemetry?.fan_speed_rpm || 2388} / {subsystems.propulsion?.telemetry?.core_speed_rpm || 9051}
                  </span>
                </div>
              </div>

              <p className={`text-xs mt-3 font-sans leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                {subsystems.propulsion?.diagnostics}
              </p>
            </div>
          )}

          {/* Subsystem 3: Hydraulics */}
          {(activeSubsystemTab === 'ALL' || activeSubsystemTab === 'hydraulics') && (
            <div className={`p-5 rounded-2xl border transition-all ${
              isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-sans whitespace-nowrap shrink-0 border ${
                  isDark ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                }`}>
                  Hydraulics & Actuators
                </span>
                <StatusBadge status={subsystems.hydraulics?.status} size="sm" />
              </div>

              <h4 className={`font-bold text-sm mt-3.5 tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {formatSubsystemName(subsystems.hydraulics?.name) || 'Hydraulic Subsystem'}
              </h4>

              <div className="mt-3 flex items-baseline justify-between font-sans">
                <div>
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Subsystem Health</span>
                  <p className={`text-2xl font-black tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {subsystems.hydraulics?.health_score || 91}%
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>AI Anomaly Risk</span>
                  <p className={`text-base font-bold mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {Math.round((subsystems.hydraulics?.anomaly_score || 0.06) * 100)}%
                  </p>
                </div>
              </div>

              {/* 2x2 Clean Bento Metric Grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-sans">
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Circuit A Pres</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-white' : 'text-slate-900'}`}>{subsystems.hydraulics?.telemetry?.sys_a_pressure_psi || 3045} psi</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Circuit B Pres</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-white' : 'text-slate-900'}`}>{subsystems.hydraulics?.telemetry?.sys_b_pressure_psi || 3020} psi</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Actuator Latency</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{subsystems.hydraulics?.telemetry?.actuator_response_time_ms || 11.8} ms</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Fluid Temp</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{subsystems.hydraulics?.telemetry?.fluid_temperature_c || 58.6} °C</span>
                </div>
              </div>

              <p className={`text-xs mt-3 font-sans leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                {subsystems.hydraulics?.diagnostics}
              </p>
            </div>
          )}

          {/* Subsystem 4: Airframe Structure */}
          {(activeSubsystemTab === 'ALL' || activeSubsystemTab === 'airframe') && (
            <div className={`p-5 rounded-2xl border transition-all ${
              isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-sans whitespace-nowrap shrink-0 border ${
                  isDark ? 'bg-slate-700/30 text-slate-300 border-slate-600/30' : 'bg-slate-100 text-slate-800 border-slate-300'
                }`}>
                  Airframe Structure
                </span>
                <StatusBadge status={subsystems.airframe?.status} size="sm" />
              </div>

              <h4 className={`font-bold text-sm mt-3.5 tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {formatSubsystemName(subsystems.airframe?.name) || 'Airframe Structure'}
              </h4>

              <div className="mt-3 flex items-baseline justify-between font-sans">
                <div>
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Subsystem Health</span>
                  <p className={`text-2xl font-black tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {subsystems.airframe?.health_score || 88}%
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>AI Anomaly Risk</span>
                  <p className={`text-base font-bold mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
                    {Math.round((subsystems.airframe?.anomaly_score || 0.09) * 100)}%
                  </p>
                </div>
              </div>

              {/* 2x2 Clean Bento Metric Grid */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-sans">
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Vibration Index</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>{subsystems.airframe?.telemetry?.vibration_anomaly_index || 0.28} mm/s</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Wing Root Strain</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-white' : 'text-slate-900'}`}>{subsystems.airframe?.telemetry?.wing_root_strain_g || 3.2} G</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Acoustic dB</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{subsystems.airframe?.telemetry?.acoustic_emission_db || 108.5} dB</span>
                </div>
                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[11px] block font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Gear Cycles</span>
                  <span className={`text-xs font-bold mt-0.5 block ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>{subsystems.airframe?.telemetry?.landing_gear_cycles_count || 310} cyc</span>
                </div>
              </div>

              <p className={`text-xs mt-3 font-sans leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>
                {subsystems.airframe?.diagnostics}
              </p>
            </div>
          )}
        </div>
      </GlassCard>

      {/* 4. VISUAL 5-STAGE GAS-PATH ENGINE DIAGRAM */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <h3 className={`font-extrabold text-base tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Turbofan 5-Stage Gas Path Health (Stations 2 &rarr; 50)
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5 font-sans`}>
              Thermodynamic degradation mapping across stages &bull; NASA C-MAPSS gas path state
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('predictive')}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-sans text-xs font-semibold transition flex items-center gap-1.5 border border-blue-500/40 shadow-sm"
            >
              Test in Sortie Simulator
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Interactive Live Telemetry Stress & Sensor Drift Simulator Controls */}
        <div className={`mb-4 p-3.5 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark ? 'bg-slate-900/90 border-slate-700/70' : 'bg-slate-50 border-slate-200'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className={`text-xs font-bold uppercase tracking-wider font-sans ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              
              Live Telemetry Stress &amp; Sensor Drift Simulator:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-sans">
            <button
              type="button"
              onClick={() => {
                setInjectionMode('nominal');
                setSelectedStageKey(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                injectionMode === 'nominal'
                  ? 'bg-blue-700 text-white border-blue-500/40 shadow-sm'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
                  : 'bg-white text-slate-700 border-slate-200 hover:text-slate-900'
              }`}
            >
              Nominal Baseline
            </button>
            <button
              type="button"
              onClick={() => {
                setInjectionMode('rls_drift');
                setSelectedStageKey('hpc');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                injectionMode === 'rls_drift'
                  ? 'bg-amber-600/25 text-amber-300 border-amber-500/50 shadow-sm'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-amber-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:text-amber-700'
              }`}
            >
              Simulate RLS Thermocouple Drift (Gain D=1.5x)
            </button>
            <button
              type="button"
              onClick={() => {
                setInjectionMode('hpc_surge');
                setSelectedStageKey('hpc');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                injectionMode === 'hpc_surge'
                  ? 'bg-rose-600/25 text-rose-300 border-rose-500/50 shadow-sm'
                  : isDark
                  ? 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-rose-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:text-rose-700'
              }`}
            >
              Simulate Foreign Object / Sand Ingestion (HPC Surge)
            </button>
          </div>
        </div>

        

        {/* 5 Stages Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {stageKeys.map(({ key, label, station }) => {
            const st = stages[key] || {
              name: label,
              health_pct: 85,
              status: 'NOMINAL',
              key_sensors: [],
              wear_mode: 'Nominal baseline'
            };

            const isCaution = st.status === 'CAUTION';
            const isCritical = st.status === 'CRITICAL';
            const isSelected = selectedStageKey === key;

            // Authentic tactical aerospace border & elevation (no gaudy border-l-4 stripes)
            const cardBorder = isSelected
              ? 'ring-2 ring-blue-500 border-blue-500/60 bg-blue-950/20 shadow-sm'
              : isCritical
              ? (isDark ? 'border-red-500/35 bg-red-950/[0.08]' : 'border-red-300 bg-red-50 shadow-sm')
              : isCaution
              ? (isDark ? 'border-amber-500/25 bg-amber-950/[0.04]' : 'border-amber-300 bg-amber-50 shadow-sm')
              : (isDark ? 'border-white/10 bg-white/[0.02]' : 'border-slate-200 bg-slate-50/80 shadow-sm');

            const valueColor = isCritical
              ? (isDark ? 'text-red-400' : 'text-rose-700')
              : isCaution
              ? (isDark ? 'text-amber-300' : 'text-amber-700')
              : (isDark ? 'text-emerald-400' : 'text-emerald-700');

            return (
              <div
                key={key}
                onClick={() => setSelectedStageKey(selectedStageKey === key ? null : key)}
                className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between hover:translate-y-[-2px] cursor-pointer ${cardBorder}`}
              >
                <div>
                  {/* Stage Station Header: Tonal Pill on Left, Status Badge on Right */}
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg font-sans whitespace-nowrap shrink-0 border ${
                      isDark ? 'bg-blue-500/10 text-sky-400 border-blue-500/20' : 'bg-blue-50 text-blue-800 border-blue-300'
                    }`}>
                      {station.replace(' ', '\u00A0')}
                    </span>
                    <StatusBadge status={st.status} size="sm" />
                  </div>

                  <h5 className={`font-bold text-xs mt-3 tracking-tight font-sans line-clamp-1 ${isDark ? 'text-white' : 'text-slate-900'}`} title={st.name}>
                    {st.name}
                  </h5>

                  {/* Metric Value Row */}
                  <div className="mt-2.5 mb-1.5 flex items-baseline justify-between font-sans">
                    <span className={`text-2xl font-black tracking-tight ${valueColor}`}>
                      {st.health_pct}%
                    </span>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Health Index
                    </span>
                  </div>

                  {/* Tactile Progress Meter */}
                  <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-800/80' : 'bg-slate-200'}`}>
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isCritical ? 'bg-red-500' : isCaution ? 'bg-amber-500' : (isDark ? 'bg-emerald-400' : 'bg-emerald-600')
                      }`}
                      style={{ width: `${st.health_pct}%` }}
                    />
                  </div>
                </div>

                {/* Mid-section: Active Station Telemetry (Fills the previous empty gap with real telemetry) */}
                <div className="mt-3.5 pt-3 border-t border-white/5 dark:border-white/5 space-y-1.5">
                  <div className={`flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider font-sans ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    <span>Active Sensors</span>
                    <span className={`text-[9px] font-mono font-bold flex items-center gap-1 ${isDark ? 'text-sky-400' : 'text-blue-700'}`}>
                      <span className={`w-1 h-1 rounded-full animate-pulse ${isDark ? 'bg-sky-400' : 'bg-blue-600'}`} />
                      LIVE
                    </span>
                  </div>
                  <div className="space-y-1">
                    {st.key_sensors?.map((s, idx) => (
                      <div
                        key={idx}
                        className={`text-[11px] font-medium px-2 py-1 rounded-lg border font-sans truncate flex items-center justify-between ${
                          isDark
                            ? 'bg-slate-900/70 text-slate-200 border-white/10'
                            : 'bg-white text-slate-900 border-slate-200 shadow-sm font-semibold'
                        }`}
                        title={s}
                      >
                        <span className="truncate">{s}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400/80 ml-1.5 shrink-0" />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Footer: Wear Diagnosis */}
                <div className={`mt-2.5 pt-2 border-t font-sans ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                  <div className="flex items-start justify-between gap-1 text-[11px]">
                    <span className={`text-[10px] shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-600 font-medium'}`}>Diagnosis:</span>
                    <span
                      className={`font-bold text-right text-[10px] truncate max-w-[130px] ${
                        isCritical
                          ? (isDark ? 'text-red-300' : 'text-rose-700')
                          : isCaution
                          ? (isDark ? 'text-amber-300' : 'text-amber-700')
                          : (isDark ? 'text-slate-300' : 'text-slate-800')
                      }`}
                      title={st.wear_mode}
                    >
                      {st.wear_mode || 'Normal baseline'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 5. REAL-TIME SENSORS TELEMETRY STREAM & RLS DRIFT FILTER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left (2 cols): Real Time Sensors Gauge Ribbon */}
        <GlassCard className="p-5 lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/5 dark:border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Gauge className="w-5 h-5 text-sky-400" />
                <h3 className={`font-extrabold text-base tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  IoT Gas Path Sensor Telemetry Stream (Live Values)
                </h3>
              </div>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 font-sans">
                {Object.keys(tel).length > 0 ? Object.keys(tel).length : 6} Telemetry Channels Active
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {/* Sensor 1: T24 */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-sky-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>LPC Temp (T24)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Station 24
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {tel.T24_LPC_Temp_R || 642.3}
                  </span>
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>°R</span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Nominal:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>642.3 °R</span>
                </div>
              </div>

              {/* Sensor 2: T30 */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-amber-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>HPC Temp (T30)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20">
                    Station 30
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className={`text-2xl font-black tracking-tight ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                    
                    {tel.T30_HPC_Temp_R || 1588.0}
                  </span>
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>°R</span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Nominal:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>1588.0 °R</span>
                </div>
              </div>

              {/* Sensor 3: P30 */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-sky-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>HPC Pressure (P30)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Station 30
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                    {tel.P30_HPC_Pres_psia || 553.8}
                  </span>
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>psia</span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Nominal:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>553.8 psia</span>
                </div>
              </div>

              {/* Sensor 4: T50 */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-rose-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>EGT Exhaust (T50)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/20">
                    Station 50
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className={`text-2xl font-black tracking-tight ${isDark ? "text-rose-400" : "text-rose-700"}`}>
                    
                    {tel.T50_LPT_Temp_R || 1405.2}
                  </span>
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>°R</span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Nominal:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>1405.2 °R</span>
                </div>
              </div>

              {/* Sensor 5: Fan Speed */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-sky-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>Fan Speed (Nf)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    Rotor
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {tel.Nf_Fan_RPM || 2388.1}
                  </span>
                  <span className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-600"}`}>RPM</span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Core Nc:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>{tel.Nc_Core_RPM || 9050.5} RPM</span>
                </div>
              </div>

              {/* Sensor 6: Bypass Ratio */}
              <div className={`p-4 rounded-2xl border transition-all duration-200 hover:border-emerald-500/30 flex flex-col justify-between ${
                isDark ? 'bg-white/5 border-white/5 hover:bg-white/[0.07]' : 'bg-slate-50 border-slate-200 hover:bg-white'
              }`}>
                <div className="flex items-center justify-between gap-1.5 font-sans">
                  <span className={`text-xs font-bold ${isDark ? "text-slate-300" : "text-slate-900"}`}>Bypass Ratio (BPR)</span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                    Aero
                  </span>
                </div>
                <div className="my-2 flex items-baseline gap-1.5 font-sans">
                  <span className={`text-2xl font-black tracking-tight ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                    
                    {tel.BPR || 8.42}
                  </span>
                </div>
                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-[11px] font-sans">
                  <span className={isDark ? "text-slate-400" : "text-slate-600 font-medium"}>Nominal Target:</span>
                  <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>8.42</span>
                </div>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Right (1 col): In Flight RLS Sensor Drift Adaptation */}
        <GlassCard className="p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-white/5 dark:border-white/5 pb-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center justify-center">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className={`font-bold text-sm tracking-tight font-sans ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    RLS Drift Adaptation Filter
                  </h3>
                  <p className={`text-[11px] font-sans ${isDark ? "text-slate-400" : "text-slate-600"}`}>Real-time sensor gain & bias tracking</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-semibold border border-emerald-500/30 font-sans">
                Active
              </span>
            </div>

            <div className="space-y-3 font-sans">
              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span className={`text-[11px] font-medium block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Filter Calibration State</span>
                  <p className="font-bold text-xs text-sky-400 mt-0.5">
                    {drift.drift_type || 'Calibrated RLS State'}
                  </p>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 font-medium border border-sky-500/20">
                  Locked
                </span>
              </div>

              <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-200'
              }`}>
                <div>
                  <span className={`text-[11px] font-medium block ${isDark ? "text-slate-400" : "text-slate-600"}`}>Online Adaptation Status</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${drift.rls_drift_active ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
                    <span className={`font-bold text-xs ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      {drift.rls_drift_active
                        ? 'Active Residual Compensation (False Grounding Prevented)'
                        : 'Nominal Gain (No Drift)'}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold border ${
                  drift.rls_drift_active
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
                }`}>
                  Gain {drift.gain_factor || (drift.rls_drift_active ? 'D=1.5x' : 'D=1.0x')}
                </span>
              </div>

              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Recursive Least Squares continuously tracks sensor gain variations. When sensor drift is detected on Station 30, the filter compensates residuals in real time to prevent false engine grounding.
              </p>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 dark:border-white/5 flex items-center justify-between text-xs font-sans">
            <span className={isDark ? "text-slate-400" : "text-slate-600"}>Aerospace Protocol</span>
            <span className={`font-bold ${isDark ? "text-slate-300" : "text-slate-800"}`}>MoD SIH26249 Prognostic Loop</span>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
