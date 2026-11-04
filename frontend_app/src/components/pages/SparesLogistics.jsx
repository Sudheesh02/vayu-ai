import React, { useState, useEffect } from 'react';
import {
  Boxes,
  Truck,
  AlertTriangle,
  CheckCircle,
  Package,
  PlusCircle,
  Clock,
  Search,
  Send,
  X,
  Zap,
  Check
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import StatusBadge from '../common/StatusBadge';
import { useTheme } from '../../context/ThemeContext';
import { fleetApi } from '../../api/fleetApi';

export default function SparesLogistics() {
  const { isDark } = useTheme();

  const [baseSpares, setBaseSpares] = useState([]);
  const [depotPipeline, setDepotPipeline] = useState([]);
  const [aiTriggers, setAiTriggers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBase, setSelectedBase] = useState('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New requisition form state (defaulted to an active operational tail needing preventive rotation)
  const [reqTail, setReqTail] = useState('RB-001');
  const [reqBase, setReqBase] = useState('AFS Ambala');
  const [reqComponent, setReqComponent] = useState('Dual-Channel FADEC EEC Unit');
  const [reqPriority, setReqPriority] = useState('EXPEDITED_MISSION');

  useEffect(() => {
    async function loadLogistics() {
      setLoading(true);
      const res = await fleetApi.getLogisticsInventory();
      setBaseSpares(res.data.base_spares);
      setDepotPipeline(res.data.depot_pipeline);
      setAiTriggers(fleetApi.getAiReorderTriggers());
      setLoading(false);
    }
    loadLogistics();
  }, []);

  const handleCreateRequisition = async (e) => {
    e.preventDefault();
    const newReq = {
      req_id: `REQ-${Math.floor(1000 + Math.random() * 9000)}-EMERGENCY`,
      tail_no: reqTail,
      base_station: reqBase,
      component_name: reqComponent,
      priority: reqPriority,
      status: 'IN_TRANSIT',
      eta_hours: reqPriority === 'CRITICAL_AOG' ? 12 : 24,
      created_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      depot_source: 'Central IAF Depot (Air Express)',
      transit_mode: 'Dedicated Logistics Airlift',
      tat_elapsed_hours: 1.0,
      tat_target_hours: 24.0,
      tracking_steps: [
        { step: 'Requisition Raised by Commander', done: true, time: 'Just now' },
        { step: 'Depot Allocation & Quality Clearance', done: true, time: 'Immediate' },
        { step: 'Air Transit En Route to Base', done: true, time: 'In Transit' },
        { step: 'Forward Base Handover & Hangar Fit', done: false, time: 'Pending' }
      ]
    };
    setDepotPipeline([newReq, ...depotPipeline]);
    setIsModalOpen(false);
    try {
      await fleetApi.createEmergencyRequisition({ req_id: newReq.req_id,
        tail_no: reqTail,
        base_station: reqBase,
        component_name: reqComponent,
        priority: reqPriority,
        status: 'IN_TRANSIT',
        eta_hours: reqPriority === 'CRITICAL_AOG' ? 12 : 24,
        depot_source: 'Central IAF Depot (Air Express)',
        transit_mode: 'Dedicated Logistics Airlift'
      });
    } catch (err) {
      console.warn('Backend requisition creation failed, local state preserved:', err);
    }
  };

  const handleApproveTrigger = (triggerId) => { fleetApi.approveAiReorderTrigger?.(triggerId);
    setAiTriggers(prev =>
      prev.map(t =>
        t.trigger_id === triggerId ? { ...t, status: 'APPROVED_DISPATCHED' } : t
      )
    );
  };

  const filteredSpares = baseSpares.filter((sp) => {
    const matchesBase = selectedBase === 'ALL' || sp.base_station === selectedBase;
    const matchesSearch =
      (sp.component_name || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
      (sp.subsystem || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
      (sp.location_bin || '').toLowerCase().includes(searchFilter.toLowerCase()) ||
      (sp.part_number || '').toLowerCase().includes(searchFilter.toLowerCase());
    return matchesBase && matchesSearch;
  });

  const outOfStockCount = baseSpares.filter(sp => sp.quantity_on_hand === 0).length;

  if (loading && baseSpares.length === 0) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400 font-sans text-sm">
        <Boxes className="w-5 h-5 animate-pulse mr-2 text-blue-500" />
        Loading Spares Inventory & Depot Pipelines...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* 1. TOP HEADER & DISPATCH BUTTON */}
      <GlassCard className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm">
            <Boxes className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-sans px-2.5 py-0.5 rounded-full bg-blue-500/10 text-sky-400 font-semibold border border-blue-500/20">
                Unified Defense Supply Chain
              </span>
              <span className="text-xs text-slate-400 font-sans">
                Forward Operating Bases &bull; Central Air Force Depot
              </span>
            </div>
            <h2 className={`text-lg font-extrabold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Spares Logistics, Automated AI Reorder Triggers & Turnaround Tracking
            </h2>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-sans text-xs font-semibold transition flex items-center gap-2 border border-blue-500/40 shadow-sm"
        >
          <PlusCircle className="w-4 h-4" />
          Dispatch Emergency Requisition
        </button>
      </GlassCard>

      {/* 2. LOGISTICS KPI OVERVIEW ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Active LRU Inventory */}
        <GlassCard className="p-4 sm:p-5 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 border-slate-800 bg-slate-900/90 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                <Boxes className="w-4 h-4" />
              </div>
              <span className="inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 font-sans font-medium whitespace-nowrap shrink-0 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 shrink-0" />
                Forward Wings
              </span>
            </div>
            <div className="mt-3">
              <span className={`text-xs font-semibold font-sans tracking-wide uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Active LRU Inventory
              </span>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans mt-0.5">
                {baseSpares.length || 18} <span className="text-sm font-semibold text-slate-400">Assemblies</span>
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 dark:border-white/5">
            <span className={`text-xs font-sans ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Tracked across 3 frontline operating wings
            </span>
          </div>
        </GlassCard>

        {/* Card 2: Critical Spares Shortage */}
        <GlassCard className="p-4 sm:p-5 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 border-slate-800 bg-slate-900/90 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <span className="inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-rose-200 border border-rose-600/40 font-sans font-medium whitespace-nowrap shrink-0 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mr-1.5 shrink-0" />
                Action Required
              </span>
            </div>
            <div className="mt-3">
              <span className={`text-xs font-semibold font-sans tracking-wide uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Critical Stockout Alert
              </span>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans mt-0.5">
                {outOfStockCount} <span className="text-sm font-semibold text-rose-400">Assembly Depleted</span>
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 dark:border-white/5">
            <span className="text-xs text-rose-300/90 font-sans">
              HPC Rotor Blades &bull; AFS Thanjavur
            </span>
          </div>
        </GlassCard>

        {/* Card 3: Proactive Replenishment */}
        <GlassCard className="p-4 sm:p-5 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 border-slate-800 bg-slate-900/90 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <span className="inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 font-sans font-medium whitespace-nowrap shrink-0 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 shrink-0" />
                Depot Inbound
              </span>
            </div>
            <div className="mt-3">
              <span className={`text-xs font-semibold font-sans tracking-wide uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Proactive Replenishment
              </span>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans mt-0.5">
                {aiTriggers.length} <span className="text-sm font-semibold text-slate-400">Depot Inductions</span>
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 dark:border-white/5">
            <span className="text-xs text-slate-400 font-sans">
              Automated reorders triggered by RUL wear
            </span>
          </div>
        </GlassCard>

        {/* Card 4: Depot Turnaround Time */}
        <GlassCard className="p-4 sm:p-5 flex flex-col justify-between hover:translate-y-[-2px] transition-all duration-300 border-slate-800 bg-slate-900/90 shadow-sm">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <span className="inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 font-sans font-medium whitespace-nowrap shrink-0 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 shrink-0" />
                Within SLA
              </span>
            </div>
            <div className="mt-3">
              <span className={`text-xs font-semibold font-sans tracking-wide uppercase ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Depot Turnaround Time
              </span>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-sans mt-0.5">
                18.4 <span className="text-sm font-semibold text-emerald-400">Hours Avg</span>
              </h3>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-white/5 dark:border-white/5">
            <span className="text-xs text-emerald-300/90 font-sans">
              Base Repair Depot limit: 48.0h
            </span>
          </div>
        </GlassCard>
      </div>

      {/* 3. AUTOMATED AI REORDER TRIGGERS (Predictive Supply Chain Integration) */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-sky-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Automated Spares Replenishment Triggers
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Depot pull requisitions dispatched when projected component wear breaches safety stock minimums
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-500/10 text-sky-400 border border-blue-500/20 font-sans">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span>Autonomous Supply Replenishment</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {aiTriggers.map((trig) => {
            const isApproved = trig.status === 'APPROVED_DISPATCHED';

            return (
              <div
                key={trig.trigger_id}
                className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition-all ${
                  isDark
                    ? 'bg-white/[0.03] hover:bg-white/[0.05] border-white/10'
                    : 'bg-white border-slate-200 shadow-sm'
                } ${isApproved ? 'border-l-4 border-l-emerald-500/80' : 'border-l-4 border-l-sky-500/80'}`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-xs font-bold text-sky-400 tracking-tight">
                      {trig.trigger_id}
                    </span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold bg-white/5 text-slate-300 border border-white/10 font-sans">
                      Confidence {trig.confidence_score}%
                    </span>
                  </div>

                  <h4 className={`font-bold text-sm mt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {trig.lru_component}
                  </h4>

                  <div className={`mt-2 p-2.5 rounded-xl border text-[11px] font-sans space-y-1 ${
                    isDark ? 'bg-black/30 border-white/5 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
                  }`}>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Trigger Target:</span>
                      <strong className="text-sky-400">Tail {trig.tail_no} ({trig.base_station})</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stock vs Safety:</span>
                      <span className="text-rose-300 font-bold">{trig.current_stock} on hand / Min {trig.safety_stock}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Demand Horizon:</span>
                      <span>{trig.predicted_demand_hours} flight hours</span>
                    </div>
                  </div>

                  <p className={`text-xs mt-2 leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {trig.trigger_reason}
                  </p>
                </div>

                <div className="pt-2 border-t border-white/5 dark:border-white/5 flex items-center justify-between font-sans">
                  <span className="text-[11px] text-slate-400">
                    Action: <strong className={isDark ? "text-slate-300" : "text-slate-900"}>{trig.recommended_action}</strong>
                  </span>

                  {isApproved ? (
                    <span className={`text-xs font-bold flex items-center gap-1 ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                    
                      <CheckCircle className="w-3.5 h-3.5" /> Dispatched
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleApproveTrigger(trig.trigger_id)}
                      className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold transition border border-blue-500/40 shadow-sm"
                    >
                      Approve & Fast-Track
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 4. CENTRAL DEPOT PROCUREMENT & TURNAROUND TRACKING PIPELINE */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-sky-400" />
              <h3 className={`font-extrabold text-base tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                Depot Turnaround Tracking (TAT) & Logistics In-Transit Pipeline
              </h3>
            </div>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Multi-agency fulfillment tracking between Central Air Force Depots, HAL manufacturing, and frontline air bases
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 border border-white/10 font-sans">
            <Truck className="w-3.5 h-3.5 text-sky-400" />
            <span>{depotPipeline.length} Shipments in Transit</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {depotPipeline.map((dp) => (
            <div
              key={dp.req_id}
              className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-sans text-xs font-bold text-sky-400 tracking-tight">
                    {dp.req_id}
                  </span>
                  <StatusBadge status={dp.priority} size="sm" />
                </div>

                <h4 className={`font-bold text-sm mt-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {dp.component_name}
                </h4>

                <div className={`mt-2.5 text-xs font-sans space-y-1.5 ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Target Airframe:</span>
                    <strong className={isDark ? 'text-white' : 'text-slate-900'}>{dp.tail_no} &bull; {dp.base_station}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Depot Origin:</span>
                    <span className="text-cyan-300 font-medium">{dp.depot_source || 'Central Depot'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Transit Mode:</span>
                    <span className={isDark ? "text-slate-300" : "text-slate-800 font-bold"}>{dp.transit_mode || 'Air Transport Scramble'}</span>
                  </div>
                </div>

                {/* Milestone Stepper (with automatic fallback if fetched directly from SQLite) */}
                {(() => {
                  const steps = dp.tracking_steps || [
                    { step: 'Requisition Raised by AI Engine', done: true, time: '2.5h ago' },
                    { step: 'Depot Allocation & Quality Clearance', done: true, time: '1.2h ago' },
                    { step: 'Air Transit En Route to Base', done: dp.status === 'IN_TRANSIT', time: dp.status === 'IN_TRANSIT' ? 'In Flight' : 'Pending' },
                    { step: 'Forward Base Handover & Hangar Fit', done: dp.status === 'DELIVERED', time: `ETA +${dp.eta_hours}h` }
                  ];

                  return (
                    <div className="mt-3.5 pt-3 border-t border-white/5 dark:border-white/5 space-y-2">
                      <p className="text-[11px] font-sans text-slate-400 uppercase tracking-wider font-semibold">Turnaround Lifecycle</p>
                      <div className="space-y-1.5 text-xs font-sans">
                        {steps.map((st, sIdx) => (
                          <div key={sIdx} className="flex items-center gap-2">
                            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
                              st.done ? 'bg-emerald-500 text-black' : 'bg-slate-700 text-slate-400'
                            }`}>
                              {st.done ? <Check className="w-2.5 h-2.5 stroke-[3]" /> : <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
                            </div>
                            <span className={st.done ? (isDark ? 'text-slate-200' : 'text-slate-800') : 'text-slate-500'}>
                              {st.step}
                            </span>
                            <span className="text-[11px] text-slate-400 ml-auto">{st.time}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="pt-2.5 border-t border-white/5 dark:border-white/5 flex items-center justify-between font-sans text-xs">
                <div className="flex items-center gap-1.5 text-amber-300 font-bold">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>ETA: {dp.eta_hours} hrs</span>
                </div>
                <StatusBadge status={dp.status} size="sm" />
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 5. FORWARD OPERATING BASE SPARES INVENTORY MATRIX (LRUs) */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 dark:border-white/5 pb-4 mb-4">
          <div>
            <h3 className={`font-extrabold text-base tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <Package className="w-5 h-5 text-sky-400" />
              Forward Operating Base Spares Inventory Matrix (LRUs)
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Line Replaceable Units tracked against safety stock thresholds across frontline bases
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-3">
            {/* Base Selector */}
            <select
              value={selectedBase}
              onChange={(e) => setSelectedBase(e.target.value)}
              className={`text-xs font-semibold py-2 px-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDark
                  ? 'bg-slate-900 text-slate-200 border border-white/15'
                  : 'bg-slate-100 text-slate-900 border border-slate-200'
              }`}
            >
              <option value="ALL">All Forward Bases</option>
              <option value="AFS Thanjavur">AFS Thanjavur (Su-30MKI)</option>
              <option value="AFS Sulur">AFS Sulur (Tejas Mk1A)</option>
              <option value="AFS Ambala">AFS Ambala (Rafale)</option>
            </select>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search component, bin..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className={`text-xs py-2 pl-8 pr-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDark
                    ? 'bg-slate-900/80 text-white placeholder-slate-500 border border-white/10'
                    : 'bg-slate-100 text-slate-800 placeholder-slate-400 border border-slate-200'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Spares Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`text-[11px] font-semibold tracking-wider uppercase border-b font-sans ${
              isDark ? 'text-slate-400 bg-slate-900/60 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-200'
            }`}>
              <tr>
                <th className="p-3">Assembly & Bin</th>
                <th className="p-3">Component Description</th>
                <th className="p-3">Subsystem</th>
                <th className="p-3">Base Airfield</th>
                <th className="p-3">Stock on Hand</th>
                <th className="p-3">Safety Margin</th>
                <th className="p-3">Unit Valuation</th>
                <th className="p-3 text-right">Logistics Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 dark:divide-white/5 font-medium">
              {filteredSpares.map((sp) => {
                const isOutOfStock = sp.quantity_on_hand === 0;
                const isBelowSafety = sp.quantity_on_hand <= sp.safety_stock_threshold && !isOutOfStock;

                return (
                  <tr
                    key={sp.item_id}
                    className={`transition-colors ${
                      isOutOfStock
                        ? 'bg-rose-500/[0.08]'
                        : isDark
                        ? 'hover:bg-white/[0.04]'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="p-3 font-sans">
                      <span className="font-bold text-cyan-300 text-xs tracking-tight">{sp.item_id}</span>
                      <p className="text-[11px] text-slate-400">{sp.location_bin}</p>
                    </td>
                    <td className={`p-3 font-sans font-semibold text-xs ${isDark ? 'text-white' : 'text-slate-800'}`}>
                      {sp.component_name}
                      <p className="text-[11px] text-slate-400 font-normal">{sp.part_number}</p>
                    </td>
                    <td className="p-3 font-sans">
                      <span className="px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[11px] font-medium text-slate-300">
                        {sp.subsystem}
                      </span>
                    </td>
                    <td className={`p-3 font-sans text-xs font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      {sp.base_station}
                    </td>
                    <td className="p-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-black text-sm tracking-tight ${
                          isOutOfStock ? (isDark ? 'text-rose-400' : 'text-rose-700') : isBelowSafety ? (isDark ? 'text-amber-200' : 'text-amber-800 font-bold') : (isDark ? 'text-emerald-400' : 'text-emerald-700 font-bold')
                        }`}>
                          {sp.quantity_on_hand}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">units</span>
                      </div>
                    </td>
                    <td className={`p-3 font-sans text-xs ${isDark ? "text-slate-400" : "text-slate-700 font-medium"}`}>
                          
                      Min. {sp.safety_stock_threshold} units
                    </td>
                    <td className={`p-3 font-sans font-semibold text-xs ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                      ₹{(sp.unit_cost_inr / 100000).toFixed(1)} Lakh
                    </td>
                    <td className="p-3 text-right">
                      <StatusBadge
                        status={isOutOfStock ? 'AOG EXHAUSTED' : isBelowSafety ? 'SAFETY WARNING' : 'HEALTHY'}
                        size="sm"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* 6. EMERGENCY REQUISITION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg rounded-3xl p-6 transition-all ${
            isDark ? 'bg-slate-900 text-white border border-slate-700/60' : 'bg-white text-slate-800 border border-slate-200'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 dark:border-white/10">
              <h3 className="font-bold text-base flex items-center gap-2">
                <Truck className="w-5 h-5 text-sky-400" />
                Dispatch Emergency Depot Requisition
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRequisition} className="mt-4 space-y-4 text-xs font-sans">
              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Select Target Aircraft Tail
                </label>
                <select
                  value={reqTail}
                  onChange={(e) => setReqTail(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="SB-024">SB-024 (Su-30MKI Grounded - AFS Thanjavur)</option>
                  <option value="KH-204">KH-204 (Tejas Mk1A Grounded - AFS Sulur)</option>
                  <option value="RB-004">RB-004 (Rafale Grounded - AFS Ambala)</option>
                  <option value="SB-023">SB-023 (Su-30MKI Standby)</option>
                </select>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Forward Operating Base
                </label>
                <select
                  value={reqBase}
                  onChange={(e) => setReqBase(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-white'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="AFS Thanjavur">AFS Thanjavur (Tamil Nadu)</option>
                  <option value="AFS Sulur">AFS Sulur (Tamil Nadu)</option>
                  <option value="AFS Ambala">AFS Ambala (Haryana)</option>
                </select>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Required Line Replaceable Unit (LRU)
                </label>
                <select
                  value={reqComponent}
                  onChange={(e) => setReqComponent(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-white'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="HPC Rotor Blade Stage 1-3 Set">HPC Rotor Blade Stage 1-3 Set</option>
                  <option value="Digital High Pressure Fuel Pump">Digital High Pressure Fuel Pump</option>
                  <option value="LPT Thermocouple Wiring Harness">LPT Thermocouple Wiring Harness</option>
                  <option value="Fan Rotor Blade Set (Titanium)">Fan Rotor Blade Set (Titanium)</option>
                  <option value="Dual-Channel FADEC EEC Unit">Dual-Channel FADEC EEC Unit</option>
                </select>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Logistics Priority
                </label>
                <select
                  value={reqPriority}
                  onChange={(e) => setReqPriority(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-rose-300'
                      : 'bg-white border-slate-200 text-rose-600'
                  }`}
                >
                  <option value="CRITICAL_AOG">Critical AOG (Air Express ETA 12h)</option>
                  <option value="EXPEDITED_MISSION">Expedited Mission (Priority Rail/Road 24h)</option>
                  <option value="ROUTINE_DEPOT">Routine Depot (Depot Batch 48h)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white font-bold border border-blue-500/40 shadow-sm transition flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
