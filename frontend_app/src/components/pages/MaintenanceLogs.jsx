import React, { useState, useEffect } from 'react';
import {
  ClipboardList,
  CheckCircle,
  AlertTriangle,
  User,
  FileText,
  Search,
  X,
  Kanban,
  Table as TableIcon,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Zap,
  Cpu,
  Layers,
  Sparkles,
  Link2,
  Wrench,
  ShieldCheck,
  Activity,
  UserCheck,
  Plane,
  MapPin,
  CheckCircle2,
  Clock
} from 'lucide-react';
import GlassCard from '../common/GlassCard';
import StatusBadge from '../common/StatusBadge';
import { useTheme } from '../../context/ThemeContext';
import { fleetApi } from '../../api/fleetApi';

export default function MaintenanceLogs() {
  const { isDark } = useTheme();

  const [workOrders, setWorkOrders] = useState([]);
  const [flightLogs, setFlightLogs] = useState([]);
  const [viewMode, setViewMode] = useState('kanban'); // 'kanban' or 'table'
  const [activeFilter, setActiveFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [snagOnly, setSnagOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedNlpLogId, setExpandedNlpLogId] = useState('LOG-SB-024-05'); // Default expand primary snag

  // Assignment Modal
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [assignedEngineer, setAssignedEngineer] = useState('Sqn Ldr R. Sharma (Chief Tech)');
  const [assignedBay, setAssignedBay] = useState('Hangar Bay 03 (Heavy Overhaul)');

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      const [ordersRes, logsRes] = await Promise.all([
        fleetApi.getWorkOrders(),
        fleetApi.getFlightLogs()
      ]);
      setWorkOrders(ordersRes.data);
      setFlightLogs(logsRes.data);
      setLoading(false);
    }
    loadData();
  }, []);

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!assignModalOrder) return;
    const orderId = assignModalOrder.order_id;
    setWorkOrders(prev =>
      prev.map(wo =>
        wo.order_id === orderId
          ? { ...wo, status: 'IN_PROGRESS', technician: assignedEngineer, hangar_bay: assignedBay }
          : wo
      )
    );
    setAssignModalOrder(null);
    try {
      await fleetApi.updateWorkOrder(orderId, {
        status: 'IN_PROGRESS',
        technician: assignedEngineer,
        hangar_bay: assignedBay
      });
    } catch (err) {
      console.warn('Backend update error, local state preserved:', err);
    }
  };

  const handleAdvanceStatus = async (orderId, newStatus) => {
    setWorkOrders(prev =>
      prev.map(wo =>
        wo.order_id === orderId ? { ...wo, status: newStatus } : wo
      )
    );
    try {
      await fleetApi.updateWorkOrder(orderId, { status: newStatus });
    } catch (err) {
      console.warn('Backend update error, local state preserved:', err);
    }
  };

  // Filter orders:
  // In Kanban view: we filter by severity & search so that columns NEVER get wiped out to 0!
  // In Table view: we filter by activeFilter (status), severity, and search.
  const filteredOrders = workOrders.filter(wo => {
    const matchesStatus = viewMode === 'kanban' 
      ? true 
      : (activeFilter === 'ALL' || wo.status === activeFilter);
      
    const matchesSeverity = severityFilter === 'ALL' || 
      (severityFilter === 'CRITICAL' && (wo.severity_tier === 3 || wo.severity_label === 'CRITICAL_AOG')) ||
      (severityFilter === 'ADVISORY' && (wo.severity_tier === 2 || wo.severity_label === 'PREVENTIVE_ADVISORY')) ||
      (severityFilter === 'WATCHLIST' && (wo.severity_tier === 1 || wo.severity_label === 'WATCHLIST'));

    const matchesSearch =
      (wo.order_id || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.tail_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.fault_subsystem || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wo.action_required || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesStatus && matchesSeverity && matchesSearch;
  });

  const filteredLogs = flightLogs.filter(log => {
    if (snagOnly && log.snags_reported === 0) return false;
    return (
      (log.tail_no || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.pilot_callsign || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.mission_type || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const kanbanColumns = [
    { id: 'DISPATCHED', title: 'Scheduled & Dispatched', color: 'blue', nextStatus: 'IN_PROGRESS' },
    { id: 'IN_PROGRESS', title: 'In Progress in Hangar', color: 'amber', nextStatus: 'RESOLVED' },
    { id: 'AWAITING_SPARES', title: 'Awaiting Depot Spares', color: 'rose', nextStatus: 'IN_PROGRESS' },
    { id: 'RESOLVED', title: 'QA Cleared & Resolved', color: 'emerald', nextStatus: null },
  ];

  if (loading && workOrders.length === 0) {
    return (
      <div className="flex items-center justify-center p-16 text-slate-400 font-sans text-sm">
        <ClipboardList className="w-5 h-5 animate-pulse mr-2 text-blue-500" />
        Loading Maintenance Work Orders & Flight Logbooks...
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* 1. TOP HEADER & VIEW MODE TOGGLE */}
      <GlassCard className="p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-sans border border-emerald-500/25">
                Proactive Hangar Execution
              </span>
              <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Structured Workflows & Flight Logbooks
              </span>
            </div>
            <h2 className={`text-lg font-extrabold tracking-tight mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Maintenance Work Orders, Technician Assignment & Pilot Flight Logs
            </h2>
          </div>
        </div>

        {/* View Mode Toggle Button */}
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 font-sans text-xs">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-bold ${
                viewMode === 'kanban'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              Kanban Board
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition font-bold ${
                viewMode === 'table'
                  ? 'bg-blue-700 text-white border border-blue-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              Structured Table
            </button>
          </div>
        </div>
      </GlassCard>

      {/* 2. CONTROLS: SEARCH & STATUS FILTER */}
      <GlassCard className="p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center flex-wrap gap-2 font-sans text-xs">
          {viewMode === 'kanban' ? (
            [
              { id: 'ALL', label: 'All Severities (8 Orders)' },
              { id: 'CRITICAL', label: 'Critical AOG (4)' },
              { id: 'ADVISORY', label: 'Preventive Advisory (3)' },
              { id: 'WATCHLIST', label: 'Watchlist (1)' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSeverityFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl border transition-all ${
                  severityFilter === f.id
                    ? 'bg-blue-700 text-white border-blue-500/40 font-bold shadow-sm'
                    : isDark
                    ? 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))
          ) : (
            [
              { id: 'ALL', label: 'All Statuses' },
              { id: 'DISPATCHED', label: 'Dispatched' },
              { id: 'IN_PROGRESS', label: 'In Hangar' },
              { id: 'AWAITING_SPARES', label: 'Awaiting Spares' },
              { id: 'RESOLVED', label: 'QA Cleared' }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl border transition-all ${
                  activeFilter === f.id
                    ? 'bg-blue-700 text-white border-blue-500/40 font-bold shadow-sm'
                    : isDark
                    ? 'bg-white/5 text-slate-400 border-white/10 hover:text-white hover:bg-white/10'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
                }`}
              >
                {f.label}
              </button>
            ))
          )}
        </div>

        {/* Quick Search */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search order ID, tail, fault..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`text-xs py-2 pl-8 pr-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
              isDark
                ? 'bg-slate-900/80 text-white placeholder-slate-500 border border-white/10'
                : 'bg-slate-100 text-slate-800 placeholder-slate-400 border border-slate-200'
            }`}
          />
        </div>
      </GlassCard>

      {/* 3. KANBAN BOARD VIEW */}
      {viewMode === 'kanban' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kanbanColumns.map((col) => {
            const columnOrders = filteredOrders.filter(wo => wo.status === col.id);

            return (
              <GlassCard key={col.id} className="p-4 flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-700/60 dark:border-slate-800 pb-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        col.id === 'DISPATCHED' ? 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.5)]' :
                        col.id === 'IN_PROGRESS' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' :
                        col.id === 'AWAITING_SPARES' ? 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.5)]' : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                      }`} />
                      <h4 className={`font-bold text-xs tracking-wider uppercase font-sans ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                        {col.title}
                      </h4>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold border ${
                      col.id === 'DISPATCHED' ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' :
                      col.id === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' :
                      col.id === 'AWAITING_SPARES' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                    }`}>
                      {columnOrders.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {columnOrders.length === 0 ? (
                      <div className="py-12 text-center text-xs font-sans text-slate-500 border border-dashed border-white/5 rounded-xl">
                        No active work orders in this state
                      </div>
                    ) : (
                      columnOrders.map((wo) => {
                        const isCritical = wo.severity_tier === 3 || wo.severity_label === 'CRITICAL_AOG';
                        const isAdvisory = wo.severity_tier === 2;

                        return (
                          <div
                            key={wo.order_id}
                            className={`p-3.5 rounded-xl border transition-all ${
                              isDark
                                ? 'bg-slate-900 border-slate-700/70 hover:border-slate-500 shadow-sm hover:shadow-md'
                                : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                            }`}
                          >
                            {/* Header Row: Tail Number + Designation + Refined Status (No loud colored stripes) */}
                            <div className={`flex items-center justify-between gap-2 pb-2 border-b ${isDark ? "border-slate-800" : "border-slate-200"}`}>

                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-blue-600/15 text-sky-400 border border-blue-500/30 whitespace-nowrap shrink-0 flex items-center gap-1">
                                  <Plane className="w-3 h-3 text-sky-400 shrink-0" />
                                  Tail {wo.tail_no}
                                </span>
                                <span className={`text-[11px] font-medium truncate ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                                  {wo.aircraft_type || 'IAF Combat Jet'}
                                </span>
                              </div>

                              {/* Subtle Military Severity Dot + Label (No garish pills) */}
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`w-1.5 h-1.5 rounded-full ${
                                  isCritical ? 'bg-rose-500' : isAdvisory ? 'bg-amber-400' : 'bg-slate-400'
                                }`} />
                                <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${
                                  isCritical ? (isDark ? 'text-rose-300' : 'text-rose-700 font-bold') : isAdvisory ? (isDark ? 'text-slate-300' : 'text-slate-800 font-bold') : (isDark ? 'text-slate-400' : 'text-slate-600')
                                }`}>
                                  {isCritical ? 'Critical' : isAdvisory ? 'Advisory' : 'Routine'}
                                </span>
                              </div>
                            </div>

                            {/* Order ID & Air Base (Un-truncated, clean monospace) */}
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 font-mono">
                              <span className="truncate text-slate-400">
                                <span className="text-slate-500">WO:</span> <span className={`font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{wo.order_id}</span>
                              </span>
                              <span className="text-slate-400 text-[10px] whitespace-nowrap shrink-0 pl-1 flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                <span>{wo.base_station || 'Forward Base'}</span>
                              </span>
                            </div>

                            {/* Subsystem & Action Directive */}
                            <div className="mt-2.5">
                              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-400">
                                <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                                <span className="truncate">{wo.fault_subsystem}</span>
                              </div>
                              <p className={`text-xs mt-1 leading-relaxed font-sans ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                                {wo.action_required}
                              </p>
                            </div>

                            {/* Telemetry RUL Block - Clean Slate, Crisp Contrast (No Piercing Yellow) */}
                            <div className={`mt-2.5 p-2 rounded-lg ${isDark ? "bg-slate-800/60 border-slate-700/60" : "bg-slate-50 border-slate-200"} grid grid-cols-2 gap-2 text-[11px]`}>
                              <div>
                                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Predicted RUL</div>
                                <div className="text-xs font-bold text-sky-400 font-mono mt-0.5">
                                  {wo.predicted_rul} <span className="text-[10px] text-slate-400 font-normal">hrs</span>
                                </div>
                              </div>
                              <div className="border-l border-slate-700/60 pl-2">
                                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Safe Margin (95% CI)</div>
                                <div className="text-xs font-bold text-slate-100 font-mono mt-0.5">
                                  {wo.lower_bound_rul} <span className="text-[10px] text-slate-400 font-normal">hrs</span>
                                </div>
                              </div>
                            </div>

                            {/* Tooling & Logistics Link (Restrained Tactical Slate) */}
                            {(wo.required_tooling || wo.linked_requisition) && (
                              <div className="mt-2 space-y-1 font-sans">
                                {wo.required_tooling && (
                                  <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 text-slate-300">
                                    <Wrench className="w-3 h-3 text-sky-400 shrink-0" />
                                    <span className="truncate">{wo.required_tooling}</span>
                                  </div>
                                )}
                                {wo.linked_requisition && (
                                  <div className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-slate-800/80 border border-slate-700/70 text-slate-300">
                                    <span className="flex items-center gap-1.5 min-w-0">
                                      <Link2 className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className={`truncate font-semibold font-mono ${isDark ? "text-slate-200" : "text-slate-900"}`}>{wo.linked_requisition}</span>
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider shrink-0 pl-1">Depot Requisition</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Technician / Bay Assignment (Clean, unclipped layout) */}
                            <div className={`mt-2 p-2 rounded-lg text-xs font-sans border flex items-center justify-between gap-2 ${
                              isDark ? 'bg-slate-800/50 border-slate-700/50 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                            }`}>
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-sky-400 shrink-0">
                                  <UserCheck className="w-3 h-3" />
                                </div>
                                <div className="min-w-0">
                                  <div className={`text-[11px] font-bold truncate ${isDark ? "text-slate-100" : "text-slate-900"}`}>

                                    {wo.technician || 'Unassigned Crew'}
                                  </div>
                                  <div className={`text-[10px] truncate ${isDark ? "text-slate-400" : "text-slate-600"}`}>

                                    {wo.hangar_bay || 'Awaiting Bay Allocation'}
                                  </div>
                                </div>
                              </div>
                              <button
                                onClick={() => setAssignModalOrder(wo)}
                                className={`text-[10px] font-bold px-2 py-1 rounded transition shrink-0 ${isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200" : "bg-slate-200 hover:bg-slate-300 text-slate-800"}`}
                              >
                                {wo.technician ? 'Reassign' : 'Assign'}
                              </button>
                            </div>

                            {/* Card Footer Actions */}
                            <div className={`mt-2.5 pt-2 border-t flex items-center justify-between gap-2 text-xs font-sans ${isDark ? "border-slate-800" : "border-slate-200"}`}>

                              <span className="text-[10px] font-mono text-slate-400 truncate">
                                STAGE: <strong className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-900"}`}>{col.title}</strong>
                              </span>

                              {col.nextStatus ? (
                                <button
                                  onClick={() => handleAdvanceStatus(wo.order_id, col.nextStatus)}
                                  className="px-2.5 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white font-bold text-[11px] shadow-sm transition flex items-center gap-1 shrink-0"
                                >
                                  <span>Advance</span>
                                  <ChevronRight className="w-3 h-3" />
                                </button>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 shrink-0">
                                  <CheckCircle2 className="w-3 h-3" />
                                  QA Cleared
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </GlassCard>
            );
          })}
        </div>
      ) : (
        /* STRUCTURED TABLE VIEW */
        <GlassCard className="p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className={`text-[11px] font-semibold tracking-wider uppercase border-b font-sans ${
                isDark ? 'text-slate-400 bg-slate-900/60 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-200'
              }`}>
                <tr>
                  <th className="p-3">Order ID</th>
                  <th className="p-3">Aircraft Tail</th>
                  <th className="p-3">Subsystem</th>
                  <th className="p-3">Action Required</th>
                  <th className="p-3">Spares Status</th>
                  <th className="p-3">Assigned Lead & Bay</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 dark:divide-white/5 font-medium">
                {filteredOrders.map((wo) => (
                  <tr key={wo.order_id} className={isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'}>
                    <td className="p-3 font-sans font-bold text-sky-400 text-xs tracking-tight">
                      {wo.order_id}
                    </td>
                    <td className={`p-3 font-sans font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {wo.tail_no}
                    </td>
                    <td className="p-3">
                      <span className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 font-sans text-[11px] font-medium text-slate-300">
                        {wo.fault_subsystem}
                      </span>
                    </td>
                    <td className={`p-3 max-w-sm text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      {wo.action_required}
                    </td>
                    <td className="p-3 font-sans text-xs">
                      {wo.spares_allocated ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Allocated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-200/90 border border-amber-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          Awaiting Depot
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-[11px] font-sans">
                      {wo.technician ? (
                        <div>
                          <p className="text-sky-400 font-semibold">{wo.technician}</p>
                          <span className="text-slate-400 text-[10px]">{wo.hangar_bay}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={wo.status} size="sm" />
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => setAssignModalOrder(wo)}
                        className="px-2.5 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-700 text-sky-300 hover:text-white border border-blue-500/40 text-[11px] font-sans font-semibold transition"
                      >
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* 4. HISTORICAL TECHNICAL FLIGHT LOGS & PILOT DEBRIEFS */}
      <GlassCard className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/5 dark:border-white/5 pb-3 mb-4">
          <div>
            <h3 className={`font-extrabold text-base tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              <FileText className="w-5 h-5 text-emerald-400" />
              Historical Technical Flight Logs & Pilot Debriefs
            </h3>
            <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'} mt-0.5`}>
              Recorded pilot snag logs, mission telemetry observations, and peak G-force loads
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSnagOnly(!snagOnly)}
              className={`px-3 py-1.5 rounded-xl border font-sans text-xs font-semibold transition flex items-center gap-1.5 ${
                snagOnly
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
                  : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
              }`}
            >
              <AlertTriangle className={`w-3.5 h-3.5 ${snagOnly ? 'text-rose-400' : 'text-slate-400'}`} />
              <span>{snagOnly ? 'Showing Snags Only' : 'Filter Snags Only'}</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className={`text-[11px] font-semibold tracking-wider uppercase border-b font-sans ${
              isDark ? 'text-slate-400 bg-slate-900/60 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-200'
            }`}>
              <tr>
                <th className="p-3">Log Reference</th>
                <th className="p-3">Tail Number</th>
                <th className="p-3">Sortie Profile</th>
                <th className="p-3">Flight Time</th>
                <th className="p-3">Pilot Callsign</th>
                <th className="p-3">Peak G-Load</th>
                <th className="p-3">Snag Status</th>
                <th className="p-3">Debrief Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 dark:divide-white/5 font-medium">
              {filteredLogs.map((log) => {
                const isNlpExpanded = expandedNlpLogId === log.log_id && log.nlp_fusion;

                return (
                  <React.Fragment key={log.log_id}>
                    <tr
                      className={`transition-colors ${
                        log.snags_reported > 0
                          ? 'bg-rose-500/[0.04]'
                          : isDark
                          ? 'hover:bg-white/[0.04]'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="p-3 font-sans font-bold text-cyan-300 text-xs tracking-tight">
                        {log.log_id}
                      </td>
                      <td className={`p-3 font-sans font-bold text-xs ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {log.tail_no}
                      </td>
                      <td className={`p-3 font-sans text-xs ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                          
                        {log.mission_type}
                      </td>
                      <td className={`p-3 font-sans text-xs ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                          
                        {log.duration_hours} hrs
                      </td>
                      <td className="p-3 font-sans font-semibold text-cyan-200 text-xs">
                        {log.pilot_callsign}
                      </td>
                      <td className="p-3 font-sans text-xs">
                        <div className="flex items-center gap-1 font-sans">
                          <span className={`font-bold ${log.g_force_peak > 7.0 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {log.g_force_peak}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal">G</span>
                        </div>
                      </td>
                      <td className="p-3">
                        {log.snags_reported > 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/25 font-sans">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            {log.snags_reported} Snag Flagged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 font-sans">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Nominal (Nil)
                          </span>
                        )}
                      </td>
                      <td className={`p-3 font-sans text-xs leading-relaxed max-w-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        <div>{log.pilot_remarks}</div>
                        {log.nlp_fusion && (
                          <button
                            type="button"
                            onClick={() => setExpandedNlpLogId(isNlpExpanded ? null : log.log_id)}
                            className={`mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition text-xs font-semibold ${
                              isNlpExpanded
                                ? 'bg-blue-700 text-white border-blue-500/40 shadow-sm'
                                : isDark
                                ? 'bg-blue-600/15 text-sky-300 border-blue-500/30 hover:bg-blue-600/25'
                                : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            }`}
                          >
                            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
                            <span>{isNlpExpanded ? 'Collapse Correlation Drawer' : 'Inspect Multimodal Correlation'}</span>
                            {isNlpExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>

                    {/* UPGRADE 2: MULTIMODAL NLP PILOT SNAG TO TELEMETRY SENSOR CORRELATION DRAWER */}
                    {isNlpExpanded && (
                      <tr className={`${isDark ? 'bg-slate-950/60' : 'bg-slate-50/90'} border-y border-slate-700/60 transition-all`}>
                        <td colSpan={8} className="p-4 sm:p-5">
                          <div className={`p-5 rounded-2xl border transition-all ${
                            isDark ? 'bg-slate-900/95 border-slate-700/80 shadow-lg' : 'bg-white border-slate-200 shadow-md'
                          }`}>
                            {/* Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-3.5 mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-700 border border-blue-500/30 flex items-center justify-center text-white shadow-sm shrink-0">
                                  <Cpu className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className={`font-bold text-sm tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                      AI Multimodal Correlation: Pilot Debrief NLP & Telemetry Sensors
                                    </h5>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-semibold border border-slate-700">
                                      Dual Stream Fusion
                                    </span>
                                  </div>
                                  <p className={`text-xs mt-0.5 font-sans ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                    Correlating unstructured natural language debrief remarks with high-frequency time-series IoT telemetry
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-emerald-300 bg-emerald-500/15 px-3 py-1.5 rounded-xl border border-emerald-500/30 flex items-center gap-1.5">
                                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                                  Multimodal Confidence: {log.nlp_fusion.multi_modal_confidence}% (+{log.nlp_fusion.confidence_lift_pct}% Lift)
                                </span>
                              </div>
                            </div>

                            {/* 3-Column Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-sans items-stretch">
                              {/* 1. NLP Entity Extraction */}
                              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                                isDark ? 'bg-slate-800/60 border-slate-700/70' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <div>
                                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/50">
                                    <div className="flex items-center gap-1.5">
                                      <FileText className="w-3.5 h-3.5 text-sky-400" />
                                      <span className={`text-[11px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                        Extracted Debrief Entities (NER)
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-400">3 Detected</span>
                                  </div>
                                  <div className="space-y-2">
                                    {log.nlp_fusion.extracted_entities.map((ent, eIdx) => (
                                      <div key={eIdx} className={`p-2.5 rounded-lg border flex flex-col ${
                                        isDark ? 'bg-slate-900/90 border-slate-700/60 hover:border-slate-600' : 'bg-white border-slate-200'
                                      }`}>
                                        <span className="text-[10px] text-sky-400 font-mono font-semibold uppercase tracking-wider">{ent.category}</span>
                                        <span className={`text-xs font-bold mt-0.5 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{ent.value}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* 2. Correlated Telemetry Residuals */}
                              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                                isDark ? 'bg-slate-800/60 border-slate-700/70' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <div>
                                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/50">
                                    <div className="flex items-center gap-1.5">
                                      <Activity className="w-3.5 h-3.5 text-amber-400" />
                                      <span className={`text-[11px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                        Cross Correlated IoT Telemetry
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-amber-400 font-bold">Residual Anomalies</span>
                                  </div>
                                  <div className="space-y-2">
                                    {log.nlp_fusion.telemetry_correlations.map((tele, tIdx) => (
                                      <div key={tIdx} className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                                        isDark ? 'bg-slate-900/90 border-slate-700/60 hover:border-slate-600' : 'bg-white border-slate-200'
                                      }`}>
                                        <div className="min-w-0">
                                          <span className="text-[10px] text-slate-400 font-mono font-medium block truncate">{tele.station}</span>
                                          <p className={`text-sm font-bold font-mono mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{tele.reading}</p>
                                        </div>
                                        <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-500/15 px-2 py-1 rounded border border-rose-500/30 shrink-0">
                                          {tele.delta}
                                        </span>
                                      </div>
                                    ))}
                                    <div className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${
                                      isDark ? 'bg-slate-900/90 border-slate-700/60' : 'bg-white border-slate-200'
                                    }`}>
                                      <div>
                                        <span className="text-[10px] text-slate-400 font-mono font-medium block">Sampling Rate & Sync</span>
                                        <p className="text-xs font-bold font-mono text-sky-400 mt-0.5">50 Hz Synchronized</p>
                                      </div>
                                      <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded border border-emerald-500/30">
                                        Phase Locked
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 3. AI Diagnostic Resolution */}
                              <div className={`p-4 rounded-xl border flex flex-col justify-between ${
                                isDark ? 'bg-slate-800/60 border-slate-700/70' : 'bg-slate-50 border-slate-200'
                              }`}>
                                <div>
                                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-700/50">
                                    <div className="flex items-center gap-1.5">
                                      <Zap className="w-3.5 h-3.5 text-sky-400" />
                                      <span className={`text-[11px] font-bold uppercase tracking-wider font-mono ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                        Fused Prognostic Action
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-emerald-400 font-bold">Actionable</span>
                                  </div>
                                  <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
                                    Root Cause Synthesis
                                  </div>
                                  <p className={`text-xs font-medium leading-relaxed mt-1 ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                    {log.nlp_fusion.diagnosis.replace(/1-3/g, '1 to 3').replace(/sensor-debrief/g, 'sensor and debrief').replace(/multi-modal/g, 'multimodal')}
                                  </p>

                                  <div className="mt-2.5 p-2.5 rounded-lg bg-blue-600/10 border border-blue-500/30">
                                    <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-sky-400 uppercase tracking-wider">
                                      <Wrench className="w-3 h-3 text-sky-400 shrink-0" />
                                      <span>Mandatory Hangar Directive</span>
                                    </div>
                                    <p className={`text-xs font-bold mt-1 leading-snug ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                      {log.nlp_fusion.recommended_action}
                                    </p>
                                  </div>
                                </div>

                                <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between text-xs font-mono">
                                  <div className="flex items-center gap-1 text-slate-400">
                                    <span>Auto Triage:</span>
                                    <span className="font-bold text-emerald-400">PASSED</span>
                                  </div>
                                  <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-sky-300 font-bold text-[10px] border border-blue-500/20">
                                    <CheckCircle2 className="w-3 h-3 text-sky-400" />
                                    <span>Bay Verified</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* 5. TECHNICIAN & HANGAR BAY ASSIGNMENT MODAL */}
      {assignModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
          <div className={`w-full max-w-lg rounded-3xl p-6 transition-all ${
            isDark ? 'bg-slate-900 text-white border border-slate-700/60' : 'bg-white text-slate-800 border border-slate-200'
          }`}>
            <div className="flex items-center justify-between pb-3 border-b border-white/10 dark:border-white/10">
              <h3 className="font-bold text-base flex items-center gap-2">
                <User className="w-5 h-5 text-sky-400" />
                Assign Maintenance Crew & Hangar Bay
              </h3>
              <button onClick={() => setAssignModalOrder(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="mt-4 space-y-4 text-xs font-sans">
              <div className={`p-3.5 rounded-2xl border ${
                isDark ? 'bg-white/[0.03] border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className="text-[11px] font-medium text-slate-400">Target Work Order</span>
                <p className="text-sm font-bold text-sky-400 mt-0.5">{assignModalOrder.order_id} &bull; Tail {assignModalOrder.tail_no}</p>
                <p className={`text-xs mt-1 leading-snug ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{assignModalOrder.action_required}</p>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Lead Maintenance Technician / Officer
                </label>
                <select
                  value={assignedEngineer}
                  onChange={(e) => setAssignedEngineer(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-slate-200'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="Sqn Ldr R. Sharma (Chief Tech)">Sqn Ldr R. Sharma (Chief Tech &bull; Su-30MKI)</option>
                  <option value="Flt Lt K. Patel (Propulsion Lead)">Flt Lt K. Patel (Propulsion Lead &bull; Tejas)</option>
                  <option value="Wg Cdr V. Rao (Quality Assurance)">Wg Cdr V. Rao (Quality Assurance &bull; Rafale)</option>
                  <option value="JWO A. Verma (Avionics Tech)">JWO A. Verma (Avionics Specialist)</option>
                  <option value="Sgt M. Singh (Gas Path Overhaul)">Sgt M. Singh (Gas Path Overhaul Specialist)</option>
                </select>
              </div>

              <div>
                <label className={`block text-[11px] font-semibold tracking-wider uppercase mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Assigned Hangar Bay Location
                </label>
                <select
                  value={assignedBay}
                  onChange={(e) => setAssignedBay(e.target.value)}
                  className={`w-full p-2.5 rounded-xl border text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    isDark
                      ? 'bg-slate-900 border-white/15 text-white'
                      : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="Hangar Bay 01 (Engine Test Bed)">Hangar Bay 01 (Engine Test Bed & High-Speed Run)</option>
                  <option value="Hangar Bay 02 (Advanced Composites)">Hangar Bay 02 (Advanced Composites & Radar Calibration)</option>
                  <option value="Hangar Bay 03 (Heavy Overhaul)">Hangar Bay 03 (Heavy Turbofan Overhaul & Crane)</option>
                  <option value="Hangar Bay 04 (Line Maintenance)">Hangar Bay 04 (Line Maintenance & Rapid Turnaround)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setAssignModalOrder(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 border border-blue-500/40 text-white font-bold shadow-sm transition flex items-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Confirm & Move to In-Progress
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
