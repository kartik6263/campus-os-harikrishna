import { useState } from 'react';
import type { Screen } from '../lib/data';
import { ToastContainer } from '../components/ui';
import PortalUser, { WorkspaceLink } from '../components/PortalUser';

import AIChatAssistant from './intelligence/AIChatAssistant';
import VoiceAssistant from './intelligence/VoiceAssistant';
import DropoutPrediction from './intelligence/DropoutPrediction';
import PredictivePerformance from './intelligence/PredictivePerformance';
import LearningRecommendations from './intelligence/LearningRecommendations';
import { inst } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void }

type Module = 'chat' | 'voice' | 'dropout' | 'performance' | 'learning';

const NAV: Array<{ id: Module; label: string; sub: string; icon: string; tag?: string }> = [
  { id: 'chat', label: 'AI Chat Assistant', sub: 'Gemini · English & Hindi · live records', icon: '💬', tag: 'LIVE' },
  { id: 'voice', label: 'Voice Assistant', sub: 'Speak Hindi or English · any browser', icon: '🎤', tag: 'LIVE' },
  { id: 'dropout', label: 'Early Dropout Prediction', sub: 'Risk board + AI counselling briefs', icon: '📉', tag: 'AI' },
  { id: 'performance', label: 'Predictive Performance', sub: 'Projected band + AI performance coach', icon: '📈', tag: 'AI' },
  { id: 'learning', label: 'Personalised Learning', sub: 'Weak topics + AI study plans', icon: '📚', tag: 'AI' },
];

const TAG_COLORS: Record<string, string> = {
  LIVE: 'bg-green-500',
  BETA: 'bg-amber-500',
  AI: 'bg-purple-600',
};

export default function IntelligenceLayer({ onNavigate }: Props) {
  const [module, setModule] = useState<Module>('chat');

  return (
    <div className="flex flex-col min-h-screen" style={{ background: '#0D1B35' }}>
      <ToastContainer />

      <header className="h-14 bg-[#0A1428] border-b border-white/10 flex items-center px-4 gap-3 shrink-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-[2px] flex items-center justify-center text-white font-bold text-[10px]" style={{ background: 'linear-gradient(135deg, #6C47FF, #A855F7)' }}>{inst().shortCode}</div>
          <div>
            <p className="text-white font-semibold text-[12px] leading-tight">Intelligence Layer</p>
            <p className="text-white/40 text-[10px] leading-tight">AI-powered insights · {inst().name}</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <WorkspaceLink screen="governance" label="Governance ↗" onNavigate={onNavigate} />
          <WorkspaceLink screen="acad-ops" label="Academic Ops ↗" onNavigate={onNavigate} />
          <WorkspaceLink screen="faculty-portal" label="Faculty Workspace ↗" onNavigate={onNavigate} />
          <PortalUser onNavigate={onNavigate} />
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-64 bg-[#0A1428] border-r border-white/10 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10">
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">AI Modules</p>
          </div>
          {NAV.map(item => (
            <button
              key={item.id}
              onClick={() => setModule(item.id)}
              className={`w-full text-left flex items-start gap-3 px-4 py-3.5 border-b border-white/5 transition-colors cursor-pointer ${
                module === item.id ? 'bg-white/10 border-l-2 border-l-purple-500' : 'hover:bg-white/5'
              }`}
            >
              <span className="text-xl mt-0.5">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-white">{item.label}</span>
                  {item.tag && (
                    <span className={`text-[9px] font-bold text-white px-1.5 py-0.5 rounded ${TAG_COLORS[item.tag]}`}>{item.tag}</span>
                  )}
                </div>
                <p className="text-[11px] text-white/40 mt-0.5">{item.sub}</p>
              </div>
            </button>
          ))}
          <div className="mt-auto p-4 border-t border-white/10">
            <div className="bg-white/5 rounded p-3">
              <p className="text-[10px] text-white/40 leading-relaxed">Answers are built only from the institution's own records, scoped to your role. Each answer names the registers it used, and every question is audited.</p>
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto">
          {module === 'chat' && <AIChatAssistant />}
          {module === 'voice' && <VoiceAssistant />}
          {module === 'dropout' && <DropoutPrediction />}
          {module === 'performance' && <PredictivePerformance />}
          {module === 'learning' && <LearningRecommendations />}
        </main>
      </div>
    </div>
  );
}
