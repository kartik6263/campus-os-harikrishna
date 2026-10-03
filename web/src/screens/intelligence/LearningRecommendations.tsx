import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Modal, Button, Input, Select, toast, ToastContainer } from '../../components/ui';
import { api } from '../../lib/api';
import { useRiskList } from '../../lib/intelligencequeries';
import { useCollection, openMaterial } from '../../lib/records';

interface Resource { id: string; kind: string; title: string; source: string; type: string; url: string | null; size: string | null }
interface Plan {
  student: { id: string; name: string; enrolmentNo: string; programme: string };
  subjects: Array<{ code: string; name: string; basis: string; percent: number; level: 'needs attention' | 'watch' | 'on track' }>;
  plan: Array<{ subject: { code: string; name: string }; basis: string; percent: number; level: string; resources: Resource[] }>;
  note: string;
}
interface Progress { id: string; resourceId: string; done: boolean; at: string }
interface CatalogueItem { id: string; courseCode: string; topic: string; title: string; source: string; url: string; resourceType: string; estimatedMinutes: number }

const LEVEL_STYLE: Record<string, string> = {
  'needs attention': 'text-red-300 bg-red-900/30 border-red-800',
  watch: 'text-amber-300 bg-amber-900/30 border-amber-800',
  'on track': 'text-green-300 bg-green-900/30 border-green-800',
};

const TYPE_ICON: Record<string, string> = { video: '🎬', notes: '📄', pdf: '📄', ppt: '📊', course: '🎓', practice_questions: '❓', reference_book: '📖', link: '🔗' };

/** Seeded on the demo only: a few curated pages for the demo programme's subjects. */
const DEMO_CATALOGUE: CatalogueItem[] = [
  { id: 'LR-001', courseCode: 'BCA503', topic: 'Computer Networks', title: 'Computer Network Tutorial — layers, TCP/IP, subnetting', source: 'GeeksforGeeks (curated by CS dept.)', url: 'https://www.geeksforgeeks.org/computer-network-tutorials/', resourceType: 'notes', estimatedMinutes: 60 },
  { id: 'LR-002', courseCode: 'BCA502', topic: 'Database Management', title: 'DBMS Tutorial — ER model, normalisation, SQL', source: 'GeeksforGeeks (curated by CS dept.)', url: 'https://www.geeksforgeeks.org/dbms/', resourceType: 'notes', estimatedMinutes: 60 },
  { id: 'LR-003', courseCode: 'BCA504', topic: 'Operating Systems', title: 'Operating System Tutorial — processes, scheduling, memory', source: 'GeeksforGeeks (curated by CS dept.)', url: 'https://www.geeksforgeeks.org/operating-systems/', resourceType: 'notes', estimatedMinutes: 60 },
];

export default function LearningRecommendations() {
  const risk = useRiskList();
  const students = risk.data?.students ?? [];
  const [studentId, setStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  // Highest-risk students first, as the ones most worth a plan.
  const sorted = useMemo(() => [...students].sort((a, b) => b.score - a.score), [students]);
  const chosen = studentId ?? sorted[0]?.id ?? null;
  const filtered = sorted.filter(s => `${s.name} ${s.enrolmentNo}`.toLowerCase().includes(search.toLowerCase())).slice(0, 60);

  const plan = useQuery({
    queryKey: ['learning', chosen],
    queryFn: () => api<Plan>(`/api/learning/${chosen}`),
    enabled: Boolean(chosen),
  });

  const progress = useCollection<Progress>('student:learning-progress', [], { studentId: chosen ?? undefined, enabled: Boolean(chosen) });
  const catalogue = useCollection<CatalogueItem>('campus:learning-resources', DEMO_CATALOGUE);
  const done = new Set(progress.items.filter(p => p.done).map(p => p.resourceId));

  function toggle(resourceId: string) {
    const existing = progress.items.find(p => p.resourceId === resourceId);
    if (existing) progress.update(existing.id, { done: !existing.done, at: new Date().toISOString() });
    else progress.add({ id: `P-${resourceId}`, resourceId, done: true, at: new Date().toISOString() });
  }

  const all = plan.data?.plan.flatMap(p => p.resources) ?? [];
  const completed = all.filter(r => done.has(r.id)).length;

  return (
    <div className="min-h-full bg-[#0D1B35] text-white">
      <ToastContainer />
      <div className="px-6 py-4 border-b border-white/10 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-[18px] font-semibold">Personalised learning</h2>
          <p className="text-[12px] text-white/50">Each student's weakest subjects, from approved internal marks or subject attendance, with what to study for each.</p>
        </div>
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => setAddOpen(true)}>+ Add to catalogue ({catalogue.items.length})</Button>
      </div>

      <div className="flex min-h-[calc(100vh-170px)]">
        <aside className="w-72 border-r border-white/10 flex flex-col shrink-0">
          <div className="p-3 border-b border-white/10">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search students…" className="w-full bg-white/5 border border-white/15 rounded px-3 py-2 text-[13px] outline-none focus:border-purple-400 placeholder-white/30" />
            <p className="text-[11px] text-white/40 mt-2">{students.length} students · highest risk first</p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {risk.isLoading && <p className="p-4 text-[12px] text-white/50">Loading students…</p>}
            {filtered.map(s => (
              <button key={s.id} onClick={() => setStudentId(s.id)} className={`w-full text-left px-3 py-2.5 border-b border-white/5 cursor-pointer ${chosen === s.id ? 'bg-white/10 border-l-2 border-l-purple-400' : 'hover:bg-white/5'}`}>
                <p className="text-[13px] font-medium">{s.name}</p>
                <p className="text-[11px] text-white/40">{s.enrolmentNo} · risk {s.score}</p>
              </button>
            ))}
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-6">
          {!chosen && <p className="text-white/50 text-[14px]">No students yet.</p>}
          {plan.isLoading && <p className="text-white/50 text-[14px]">Building the plan…</p>}
          {plan.data && (
            <div className="max-w-4xl">
              <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                <div>
                  <p className="text-[18px] font-semibold">{plan.data.student.name}</p>
                  <p className="text-[12px] text-white/50">{plan.data.student.enrolmentNo} · {plan.data.student.programme}</p>
                </div>
                {all.length > 0 && (
                  <div className="text-right">
                    <p className="text-[12px] text-white/50">Plan progress</p>
                    <p className="text-[18px] font-mono">{completed} / {all.length}</p>
                  </div>
                )}
              </div>
              <p className="text-[12px] text-white/50 mb-4">{plan.data.note}</p>

              <div className="flex flex-wrap gap-2 mb-6">
                {plan.data.subjects.map(s => (
                  <span key={s.code} className={`text-[12px] border rounded-full px-3 py-1 ${LEVEL_STYLE[s.level]}`} title={`Judged on ${s.basis}`}>
                    {s.name} · {s.percent}% {s.basis === 'attendance' ? 'attendance' : 'marks'}
                  </span>
                ))}
                {plan.data.subjects.length === 0 && <span className="text-[13px] text-white/50">No enrolled subjects with classes or marks yet.</span>}
              </div>

              {plan.data.plan.map(p => (
                <section key={p.subject.code} className="mb-6">
                  <h3 className="text-[15px] font-semibold mb-1">{p.subject.name} <span className="text-white/40 font-mono text-[12px]">{p.subject.code}</span></h3>
                  <p className="text-[12px] text-white/50 mb-3">{p.level === 'on track' ? 'On track — material to stay ahead.' : `${p.level === 'needs attention' ? 'Needs attention' : 'Worth watching'}: ${p.percent}% ${p.basis === 'attendance' ? 'attendance in this subject' : 'in approved internal marks'}.`}</p>
                  <div className="grid md:grid-cols-2 gap-3">
                    {p.resources.map(r => {
                      const isDone = done.has(r.id);
                      return (
                        <div key={r.id} className={`bg-[#0A1428] border rounded-xl p-4 flex flex-col gap-2 ${isDone ? 'border-green-700/60' : 'border-[#1E3A5F]'}`}>
                          <div className="flex items-start gap-3">
                            <span className="text-[22px] shrink-0">{TYPE_ICON[r.type] ?? '📄'}</span>
                            <div className="min-w-0">
                              <p className={`text-[13px] font-medium leading-snug ${isDone ? 'line-through text-white/50' : ''}`}>{r.title}</p>
                              <p className="text-[11px] text-white/40 mt-0.5">{r.kind} · {r.source}{r.size ? ` · ${r.size}` : ''}</p>
                            </div>
                          </div>
                          <div className="flex gap-2 mt-1">
                            {r.url
                              ? <button onClick={() => void openMaterial(r.url, r.title)} className="text-[12px] px-3 py-1.5 rounded bg-white/10 hover:bg-white/15 cursor-pointer">Open ↗</button>
                              : <span className="text-[12px] px-3 py-1.5 rounded bg-white/5 text-white/40" title="Uploaded file — open it from the Faculty study-material register">In course files</span>}
                            <button onClick={() => toggle(r.id)} className={`text-[12px] px-3 py-1.5 rounded cursor-pointer ${isDone ? 'bg-green-800/60 text-green-100' : 'bg-[#7C3AED] hover:bg-[#8B5CF6]'}`}>{isDone ? '✓ Done' : 'Mark done'}</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      </div>

      <AddResource open={addOpen} onClose={() => setAddOpen(false)} onAdd={item => { catalogue.add(item); toast.success('Added to the catalogue — it now appears in every matching student\'s plan'); void plan.refetch(); }} />
    </div>
  );
}

function AddResource({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (i: CatalogueItem) => void }) {
  const [f, setF] = useState({ courseCode: '', topic: '', title: '', source: '', url: '', resourceType: 'notes', estimatedMinutes: '30' });
  const valid = f.courseCode.trim() && f.title.trim() && /^https?:\/\//.test(f.url.trim());
  return (
    <Modal open={open} onClose={onClose} title="Add a learning resource" width="520px"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => { onAdd({ id: `LR-${Date.now().toString(36).toUpperCase()}`, courseCode: f.courseCode.trim().toUpperCase(), topic: f.topic.trim(), title: f.title.trim(), source: f.source.trim() || 'Faculty', url: f.url.trim(), resourceType: f.resourceType, estimatedMinutes: Number(f.estimatedMinutes) || 30 }); setF({ ...f, title: '', url: '' }); onClose(); }}>Add resource</Button></>}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Subject code" placeholder="e.g. BCA503" value={f.courseCode} onChange={e => setF({ ...f, courseCode: e.target.value })} />
        <Input label="Topic" value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} />
        <div className="col-span-2"><Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
        <div className="col-span-2"><Input label="Link (https://…)" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} /></div>
        <Input label="Source" placeholder="e.g. NPTEL, dept. notes" value={f.source} onChange={e => setF({ ...f, source: e.target.value })} />
        <Select label="Type" value={f.resourceType} onChange={e => setF({ ...f, resourceType: e.target.value })}>
          <option value="notes">Notes</option><option value="video">Video</option><option value="practice_questions">Practice questions</option><option value="reference_book">Reference book</option><option value="course">Course</option>
        </Select>
      </div>
    </Modal>
  );
}
