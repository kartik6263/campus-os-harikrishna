import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { downloadCSV } from '../../../lib/export';
import { formatBytes, useCollection, useFiles, type Stored } from '../../../lib/records';

/**
 * The curriculum: each programme's structure as the system actually holds it
 * (adding a course creates the subject), course outcomes and their mapping to
 * programme outcomes, Board of Studies revisions, and the published syllabus
 * documents students download.
 */

interface Subject { id: string; code: string; name: string; credits: number; semester: number; enrolled: number }
interface Programme { id: string; code: string; name: string; shortName: string; years: number; students: number; subjects: Subject[] }
interface Outcomes { id: string; cos: Array<{ code: string; text: string; bloom: string }>; mapping: Record<string, Record<string, number>> }
interface Revision { id: string; programmeCode: string; title: string; summary: string; stage: 'proposal' | 'bos' | 'academic_council' | 'approved' | 'withdrawn'; effectiveFrom: string; history: Array<{ at: string; stage: string; note?: string }> }

const BLOOM = ['Remember', 'Understand', 'Apply', 'Analyse', 'Evaluate', 'Create'];
const POS = Array.from({ length: 12 }, (_, i) => `PO${i + 1}`);
const REV_STAGES: Array<[Revision['stage'], string]> = [['proposal', 'Proposal'], ['bos', 'Board of Studies'], ['academic_council', 'Academic Council'], ['approved', 'Approved']];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

export default function SyllabusCurriculum() {
  const [tab, setTab] = useState('structure');
  const q = useQuery({ queryKey: ['curriculum'], queryFn: () => api<Programme[]>('/api/office/curriculum') });
  const [code, setCode] = useState<string | null>(null);
  const programmes = q.data ?? [];
  const prog = programmes.find(p => p.code === code) ?? programmes[0];

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="text-[18px] font-bold text-white">Syllabus & Curriculum</h1><p className="text-[13px] text-white/60 mt-0.5">Programme structure, outcomes, revisions and publication</p></div>
        {programmes.length > 0 && <select value={prog?.code} onChange={e => setCode(e.target.value)} className="h-8 px-2 text-[13px] rounded-[4px] bg-white/10 text-white border border-white/20 cursor-pointer">{programmes.map(p => <option key={p.code} value={p.code} className="text-[#16264A]">{p.name}</option>)}</select>}
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'structure', label: 'Programme Structure' }, { id: 'outcomes', label: 'Course Outcomes' }, { id: 'revisions', label: 'BOS Revisions' }, { id: 'publication', label: 'Published Syllabus' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {q.isLoading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : q.isError ? <InlineAlert type="error">{errText(q.error)}</InlineAlert> : !prog ? <EmptyState title="No programmes set up" /> : (
          <>
            {tab === 'structure' && <Structure prog={prog} />}
            {tab === 'outcomes' && <OutcomesTab prog={prog} />}
            {tab === 'revisions' && <Revisions prog={prog} />}
            {tab === 'publication' && <Publication prog={prog} />}
          </>
        )}
      </div>
    </div>
  );
}

function Structure({ prog }: { prog: Programme }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState<number | null>(null);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [f, setF] = useState({ code: '', name: '', credits: '4' });
  const add = useMutation({
    mutationFn: () => api('/api/office/curriculum/subjects', { method: 'POST', body: { programmeId: prog.id, code: f.code.trim(), name: f.name.trim(), credits: Number(f.credits), semester: adding } }),
    onSuccess: () => { toast.success('Course added — it can now be enrolled in and timetabled'); setAdding(null); setF({ code: '', name: '', credits: '4' }); void qc.invalidateQueries({ queryKey: ['curriculum'] }); },
  });
  const save = useMutation({
    mutationFn: () => api(`/api/office/curriculum/subjects/${editing!.id}`, { method: 'PATCH', body: { name: f.name.trim(), credits: Number(f.credits) } }),
    onSuccess: () => { toast.success('Course updated'); setEditing(null); void qc.invalidateQueries({ queryKey: ['curriculum'] }); },
  });
  const sems = Array.from({ length: prog.years * 2 }, (_, i) => i + 1);
  const total = prog.subjects.reduce((n, s) => n + s.credits, 0);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[#5A6577]">{prog.name} · {prog.years} years · {prog.students} students · {total} credits across {prog.subjects.length} courses</p>
        <Button size="sm" variant="secondary" disabled={!prog.subjects.length} onClick={() => downloadCSV(`curriculum-${prog.shortName}`, prog.subjects.map(s => ({ semester: s.semester, code: s.code, course: s.name, credits: s.credits })))}>Export structure</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {sems.map(n => { const list = prog.subjects.filter(s => s.semester === n); return (
          <div key={n} className="bg-white border border-[#D3D8E0] rounded-[4px]">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#D3D8E0] bg-[#EDEFF3]"><p className="text-[13px] font-semibold text-[#16264A]">Semester {n} · {list.reduce((x, s) => x + s.credits, 0)} credits</p><button onClick={() => { setAdding(n); setF({ code: '', name: '', credits: '4' }); add.reset(); }} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">+ Course</button></div>
            {list.length === 0 ? <p className="px-4 py-3 text-[13px] text-[#5A6577]">No courses.</p> : list.map(s => (
              <div key={s.id} className="flex items-center gap-2 px-4 py-2 border-b border-[#EDEFF3] last:border-0 text-[13px]">
                <span className="font-mono text-[#5A6577] w-20 shrink-0">{s.code}</span><span className="flex-1 text-[#16264A]">{s.name}</span><span className="text-[#5A6577] tabular-nums">{s.credits} cr</span>
                <button onClick={() => { setEditing(s); setF({ code: s.code, name: s.name, credits: String(s.credits) }); save.reset(); }} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Edit</button>
              </div>
            ))}
          </div>
        ); })}
      </div>
      <Modal open={adding !== null || !!editing} onClose={() => { setAdding(null); setEditing(null); }} title={editing ? `Edit ${editing.code}` : `Add course — semester ${adding}`}
        footer={<><Button size="sm" variant="secondary" onClick={() => { setAdding(null); setEditing(null); }}>Cancel</Button><Button size="sm" loading={add.isPending || save.isPending} disabled={!f.name.trim() || (!editing && !f.code.trim())} onClick={() => (editing ? save.mutate() : add.mutate())}>Save</Button></>}>
        <div className="space-y-3">
          {(add.isError || save.isError) && <InlineAlert type="error">{errText(add.error ?? save.error)}</InlineAlert>}
          <Input label="Course code" value={f.code} disabled={!!editing} onChange={e => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="BCA601" />
          <Input label="Course title" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Input label="Credits" inputMode="numeric" value={f.credits} onChange={e => setF({ ...f, credits: e.target.value.replace(/\D/g, '') })} />
          {editing && editing.enrolled > 0 && <p className="text-[12px] text-[#5A6577]">{editing.enrolled} students are enrolled; the code and semester cannot change.</p>}
        </div>
      </Modal>
    </div>
  );
}

function OutcomesTab({ prog }: { prog: Programme }) {
  const outcomes = useCollection<Outcomes>('acad:course-outcomes', []);
  const [subjectCode, setSubjectCode] = useState(prog.subjects[0]?.code ?? '');
  const [co, setCo] = useState({ text: '', bloom: 'Apply' });
  const subject = prog.subjects.find(s => s.code === subjectCode);
  const doc = outcomes.items.find(o => o.id === subjectCode);
  const cos = doc?.cos ?? [];
  const mapping = doc?.mapping ?? {};
  function put(next: Partial<Outcomes>) {
    if (doc) outcomes.update(doc.id, next);
    else outcomes.add({ id: subjectCode, cos: [], mapping: {}, ...next });
  }
  if (!prog.subjects.length) return <EmptyState title="No courses in this programme yet" />;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 flex flex-wrap items-end gap-3">
        <Select label="Course" value={subjectCode} onChange={e => setSubjectCode(e.target.value)} className="w-80">{prog.subjects.map(s => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}</Select>
        <Button size="sm" variant="secondary" disabled={!cos.length} onClick={() => downloadCSV(`co-po-${subjectCode}`, cos.map(c => ({ co: c.code, outcome: c.text, bloom: c.bloom, ...Object.fromEntries(POS.map(p => [p, mapping[c.code]?.[p] ?? ''])) })))}>Export CO–PO matrix</Button>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">Course outcomes — {subject?.name}</p>
        {cos.map((c, i) => (
          <div key={c.code} className="flex items-center gap-3 px-4 py-2 border-b border-[#EDEFF3] text-[13px]">
            <span className="font-mono text-[#5A6577] w-10">{c.code}</span><span className="flex-1 text-[#16264A]">{c.text}</span><span className="text-[12px] text-[#5A6577]">{c.bloom}</span>
            <button onClick={() => { const rest = cos.filter((_, j) => j !== i).map((x, j) => ({ ...x, code: `CO${j + 1}` })); put({ cos: rest, mapping: {} }); }} className="text-[12px] text-[#A8242C] cursor-pointer">Remove</button>
          </div>
        ))}
        <div className="flex gap-2 items-end px-4 py-3">
          <Input label={`CO${cos.length + 1}: on completion students will be able to…`} value={co.text} onChange={e => setCo({ ...co, text: e.target.value })} className="flex-1" />
          <Select label="Bloom level" value={co.bloom} onChange={e => setCo({ ...co, bloom: e.target.value })}>{BLOOM.map(b => <option key={b}>{b}</option>)}</Select>
          <Button size="sm" disabled={co.text.trim().length < 5} onClick={() => { put({ cos: [...cos, { code: `CO${cos.length + 1}`, text: co.text.trim(), bloom: co.bloom }] }); setCo({ ...co, text: '' }); }}>Add</Button>
        </div>
      </div>
      {cos.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
          <p className="px-4 py-3 border-b border-[#D3D8E0] text-[14px] font-semibold text-[#16264A]">CO–PO mapping <span className="text-[12px] font-normal text-[#5A6577]">· click a cell: blank → 1 (low) → 2 → 3 (high)</span></p>
          <table className="text-[12px]"><thead><tr><th className="px-3 py-2" />{POS.map(p => <th key={p} className="px-2 py-2 text-[#5A6577] font-semibold">{p}</th>)}</tr></thead>
            <tbody>{cos.map(c => <tr key={c.code}><td className="px-3 py-1.5 font-mono text-[#16264A]">{c.code}</td>{POS.map(p => { const v = mapping[c.code]?.[p] ?? 0; return <td key={p} className="px-1 py-1"><button onClick={() => put({ mapping: { ...mapping, [c.code]: { ...(mapping[c.code] ?? {}), [p]: (v + 1) % 4 } } })} className={`w-8 h-7 rounded-[3px] border cursor-pointer tabular-nums ${v ? 'bg-[#16264A] text-white border-[#16264A]' : 'border-[#D3D8E0] text-[#D3D8E0]'}`} style={v ? { opacity: 0.4 + v * 0.2 } : undefined}>{v || '·'}</button></td>; })}</tr>)}</tbody></table>
        </div>
      )}
    </div>
  );
}

function Revisions({ prog }: { prog: Programme }) {
  const revisions = useCollection<Revision>('acad:bos-revisions', []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: '', summary: '', effectiveFrom: '' });
  const mine = revisions.items.filter(r => r.programmeCode === prog.code);
  function advance(r: Stored<Revision>, note?: string) {
    const i = REV_STAGES.findIndex(s => s[0] === r.stage);
    const next = REV_STAGES[i + 1]?.[0];
    if (!next) return;
    revisions.update(r.id, { stage: next, history: [...r.history, { at: new Date().toISOString(), stage: next, note }] });
    toast.success(`Moved to ${REV_STAGES[i + 1]![1]}`);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Curriculum revisions — {prog.shortName}</p><Button size="sm" onClick={() => setOpen(true)}>+ Propose revision</Button></div>
      {mine.length === 0 ? <div className="p-6"><EmptyState title="No revisions proposed" /></div> : mine.map(r => { const i = REV_STAGES.findIndex(s => s[0] === r.stage); return (
        <div key={r.id} className="px-4 py-3 border-b border-[#EDEFF3]">
          <div className="flex items-start gap-3"><div className="flex-1"><p className="text-[14px] font-medium text-[#16264A]">{r.title}</p><p className="text-[12px] text-[#5A6577]">{r.summary} · effective {r.effectiveFrom}</p></div>
            {r.stage !== 'approved' && r.stage !== 'withdrawn' && <><Button size="sm" variant="ghost" onClick={() => { revisions.update(r.id, { stage: 'withdrawn', history: [...r.history, { at: new Date().toISOString(), stage: 'withdrawn' }] }); toast.success('Withdrawn'); }}>Withdraw</Button><Button size="sm" onClick={() => advance(r, window.prompt('Resolution / minutes reference (optional)') ?? undefined)}>{i === REV_STAGES.length - 2 ? 'Record approval' : `Send to ${REV_STAGES[i + 1]![1]}`}</Button></>}
          </div>
          <ol className="flex gap-1 mt-2">{REV_STAGES.map(([s, l], j) => <li key={s} className="flex-1"><div className={`h-1.5 rounded-full ${r.stage === 'withdrawn' ? 'bg-[#F1F5F9]' : j <= i ? 'bg-[#0E7A5F]' : 'bg-[#EDEFF3]'}`} /><p className="text-[10px] text-[#5A6577] mt-1">{l}</p></li>)}</ol>
          {r.history.some(h => h.note) && <p className="text-[11px] text-[#5A6577] mt-1">{r.history.filter(h => h.note).map(h => `${h.stage}: ${h.note}`).join(' · ')}</p>}
        </div>
      ); })}
      <Modal open={open} onClose={() => setOpen(false)} title="Propose a curriculum revision" footer={<><Button size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" onClick={() => { if (!f.title.trim() || !f.summary.trim() || !f.effectiveFrom.trim()) { toast.error('Fill every field'); return; } revisions.add({ id: `BOS-${Date.now().toString(36).toUpperCase()}`, programmeCode: prog.code, title: f.title.trim(), summary: f.summary.trim(), effectiveFrom: f.effectiveFrom.trim(), stage: 'proposal', history: [{ at: new Date().toISOString(), stage: 'proposal' }] }); toast.success('Revision proposed'); setOpen(false); setF({ title: '', summary: '', effectiveFrom: '' }); }}>Propose</Button></>}>
        <div className="space-y-3">
          <Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="NEP-aligned revision of semesters 1–4" />
          <Input label="What changes" value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} />
          <Input label="Effective from (academic year)" value={f.effectiveFrom} onChange={e => setF({ ...f, effectiveFrom: e.target.value })} placeholder="2027-28" />
        </div>
      </Modal>
    </div>
  );
}

function Publication({ prog }: { prog: Programme }) {
  // Under `campus:` so every signed-in student can download it.
  const files = useFiles(`campus:syllabus/${prog.code}`);
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Published syllabus — {prog.name}</p><Button size="sm" onClick={() => void files.upload('.pdf,application/pdf')}>Upload PDF</Button></div>
      <p className="px-4 py-2 text-[12px] text-[#5A6577] border-b border-[#EDEFF3]">Files here are open to every signed-in student and staff member.</p>
      {files.isLoading ? <div className="p-6 flex justify-center"><Spinner /></div> : files.files.length === 0 ? <div className="p-6"><EmptyState title="Nothing published yet" /></div> : files.files.map(x => (
        <div key={x.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#EDEFF3] text-[13px]">
          <span className="flex-1 text-[#16264A]">{x.name}</span><span className="text-[#5A6577]">{formatBytes(x.size)} · {new Date(x.createdAt).toLocaleDateString('en-IN')}</span>
          <button onClick={() => void files.download(x)} className="text-[#E0952A] hover:underline cursor-pointer">Download</button>
          <button onClick={() => { if (window.confirm(`Withdraw ${x.name}?`)) void files.remove(x.id); }} className="text-[#A8242C] hover:underline cursor-pointer">Withdraw</button>
        </div>
      ))}
    </div>
  );
}
