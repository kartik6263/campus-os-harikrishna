import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Module } from '../StudentPortal';
import { EmptyState, InlineAlert, Spinner } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { openMaterial } from '../../lib/records';
import StudyPlanCard from '../../components/StudyPlanCard';

interface Props { onNavigate: (m: Module) => void }

interface SubjectMaterials {
  code: string; name: string; faculty: string;
  materials: Array<{ id: string; unit: number; unitTitle: string; filename: string; url: string | null; type: 'PDF' | 'PPT' | 'VIDEO' | 'LINK'; size: string | null; uploadedAt: string; by: string }>;
}

const TYPE_BADGE: Record<string, string> = { PDF: 'bg-[#A8242C]', PPT: 'bg-[#C05621]', VIDEO: 'bg-[#1D4ED8]', LINK: 'bg-[#0E7A5F]' };

/**
 * Course material: what each of the student's teachers has shared, by subject
 * and unit — notes, slides, videos, links and past papers.
 */
export default function Syllabus(_props: Props) {
  const q = useQuery({ queryKey: ['student', 'materials'], queryFn: () => api<SubjectMaterials[]>('/api/student/materials') });
  const [code, setCode] = useState<string | null>(null);

  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <div className="p-4"><InlineAlert type="error">{q.error instanceof ApiError ? q.error.message : 'Could not load materials.'}</InlineAlert></div>;
  const subjects = q.data ?? [];
  if (!subjects.length) return <div className="p-4"><EmptyState title="No subjects this term" /></div>;
  const current = subjects.find(s => s.code === code) ?? subjects[0]!;
  const units = [...new Set(current.materials.map(m => m.unit))].sort((a, b) => a - b);

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Syllabus & Study Material</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">Shared by your teachers, unit by unit</p>
      </div>
      <div className="px-4 pt-3"><StudyPlanCard theme="light" /></div>
      <div className="bg-white border-b border-[#D3D8E0] flex overflow-x-auto px-4 py-2 gap-2">
        {subjects.map(s => (
          <button key={s.code} onClick={() => setCode(s.code)} className={`shrink-0 px-3 py-1.5 rounded-[4px] text-[12px] font-medium font-mono cursor-pointer ${current.code === s.code ? 'bg-[#16264A] text-white' : 'bg-[#EDEFF3] text-[#5A6577] hover:bg-[#D3D8E0]'}`}>
            {s.code}{s.materials.length ? ` · ${s.materials.length}` : ''}
          </button>
        ))}
      </div>
      <div className="bg-white px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[15px] font-semibold text-[#16264A]">{current.name}</p>
        <p className="text-[12px] text-[#5A6577]">{current.faculty}</p>
      </div>
      {units.length === 0 ? (
        <div className="px-4 mt-3"><EmptyState title="Nothing shared yet" description="Your teacher's notes, slides and links for this subject will appear here." /></div>
      ) : units.map(u => {
        const items = current.materials.filter(m => m.unit === u);
        return (
          <div key={u} className="mt-3">
            <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Unit {u} · {items[0]!.unitTitle}</span></div>
            <div className="bg-white border-t border-b border-[#D3D8E0]">
              {items.map((m, i) => (
                <div key={m.id} className={`flex items-center gap-3 px-4 py-3.5 ${i < items.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
                  <div className={`w-9 h-9 rounded-[4px] flex items-center justify-center shrink-0 text-[10px] font-bold text-white ${TYPE_BADGE[m.type] ?? 'bg-[#5A6577]'}`}>{m.type}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#16264A] truncate">{m.filename}</p>
                    <p className="text-[11px] text-[#5A6577]">{m.by} · {new Date(m.uploadedAt).toLocaleDateString('en-IN')}{m.size ? ` · ${m.size}` : ''}</p>
                  </div>
                  <button onClick={() => void openMaterial(m.url, m.filename)} disabled={!m.url} className="text-[12px] font-medium text-[#16264A] border border-[#D3D8E0] rounded-[4px] px-3 py-1.5 hover:border-[#16264A] cursor-pointer disabled:opacity-40 disabled:cursor-default">
                    {m.url?.startsWith('campusos-file:') ? 'Download' : 'Open'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
