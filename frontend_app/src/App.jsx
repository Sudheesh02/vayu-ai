import React, { useState, useEffect } from 'react';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import Sidebar from './components/layout/Sidebar';
import Navbar from './components/layout/Navbar';
import DocsModal from './components/common/DocsModal';
import TacticalVoiceCopilot from './components/common/TacticalVoiceCopilot';

import CommandOverview from './components/pages/CommandOverview';
import DigitalTwinView from './components/pages/DigitalTwinView';
import PredictiveAnalytics from './components/pages/PredictiveAnalytics';
import SparesLogistics from './components/pages/SparesLogistics';
import MaintenanceLogs from './components/pages/MaintenanceLogs';
import TacticalCopilotView from './components/pages/TacticalCopilotView';

function MainLayout() {
  const {
    isDark,
    activeTab,
    isDocsOpen,
    setIsDocsOpen,
    isSidebarCollapsed,
    toggleSidebarCollapse
  } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Keyboard shortcut Ctrl+B / Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (window.innerWidth >= 1024) {
          toggleSidebarCollapse();
        } else {
          setSidebarOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebarCollapse]);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <CommandOverview />;
      case 'twin':
        return <DigitalTwinView />;
      case 'predictive':
        return <PredictiveAnalytics />;
      case 'spares':
        return <SparesLogistics />;
      case 'logs':
        return <MaintenanceLogs />;
      case 'copilot':
        return <TacticalCopilotView />;
      default:
        return <CommandOverview />;
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 ${
        isDark
          ? 'tactical-mesh-dark text-white'
          : 'tactical-mesh-light text-slate-900'
      }`}
    >
      {/* AeroTactical C2 Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main Content Area (Smoothly expands when sidebar is collapsed) */}
      <div
        className={`flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
          isSidebarCollapsed ? 'lg:pl-28' : 'lg:pl-80'
        }`}
      >
        {/* Top Command Navbar */}
        <Navbar onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

        {/* Dynamic Page Content */}
        <main className="flex-1 px-4 sm:px-6 pt-2">
          {renderActivePage()}
        </main>

        {/* Tactical Aerospace Footer */}
        <footer className={`px-6 py-3.5 text-center text-xs font-sans border-t ${isDark ? 'border-white/5 text-slate-400' : 'border-slate-200 text-slate-600'}`}>
          <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            SIH 2026 (SIH26249) &bull; Team <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-900 font-bold'}`}>BioXtreme</span> &bull; Ministry of Defence & Indian Air Force
          </p>
        </footer>
      </div>

      {/* Technical Documentation Modal */}
      <DocsModal isOpen={isDocsOpen} onClose={() => setIsDocsOpen(false)} />

      {/* Vayu-AI Tactical Voice Agent & Chatbot */}
      <TacticalVoiceCopilot />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainLayout />
    </ThemeProvider>
  );
}
