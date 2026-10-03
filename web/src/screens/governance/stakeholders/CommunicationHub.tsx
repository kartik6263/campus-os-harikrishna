import { useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, Toggle, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { useCollection, type Stored } from '../../../lib/records';

/**
 * Announcements to students, parents and staff. A published announcement is
 * on every portal's notice board at once; with notifications on, each student
 * in the chosen audience (and their parents) is also notified, and the read
 * count can be followed here.
 */

interface Announcement { id: string; scope: string; title: string; body: string; urgent: boolean; publishedAt: string }
interface Programme { code: string; shortName: string; name: string }
interface Template { id: string; name: string; title: string; body: string }

const SCOPES: Array<[string, string]> = [['UNIVERSITY', 'Whole institution'], ['COLLEGE', 'College'], ['DEPARTMENT', 'Department'], ['BATCH', 'Batch']];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const SAMPLE_TEMPLATES: Template[] = [
  { id: 'TPL-EXAM', name: 'Exam form deadline', title: 'Examination forms — last date {date}', body: 'Students appearing in the coming semester examinations must submit their examination forms and fee by {date}. Late forms will attract a late fee.' },
  { id: 'TPL-FEE', name: 'Fee reminder', title: 'Fee payment due by {date}', body: 'Students with outstanding fees are requested to clear them by {date}, online in the student app or at the college counter.' },
  { id: 'TPL-HOLIDAY', name: 'Holiday notice', title: 'Holiday on {date}', body: 'The institution will remain closed on {date}. Classes will resume on the next working day.' },
];

export default function CommunicationHub() {
  const [tab, setTab] = useState('compose');
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null);
  const list = useQuery({ queryKey: ['announcements', 'all'], queryFn: () => api<Announcement[]>('/api/announcements?limit=100') });
  const templates = useCollection<Template>('gov:announcement-templates', SAMPLE_TEMPLATES);

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">Communication Hub</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Announcements and notifications to students and parents</p>
        </div>
        <div className="flex gap-6 text-center">
          {[['Published', list.data?.length ?? '—'], ['This month', (list.data ?? []).filter(a => a.publishedAt.slice(0, 7) === new Date().toISOString().slice(0, 7)).length], ['Urgent', (list.data ?? []).filter(a => a.urgent).length]].map(([l, v]) => (
            <div key={l}><p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{v}</p><p className="text-white/60 text-[11px]">{l}</p></div>
          ))}
        </div>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={[{ id: 'compose', label: 'Compose' }, { id: 'sent', label: 'Published' }, { id: 'templates', label: 'Templates' }]} activeId={tab} onChange={setTab} />
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'compose' && <Compose draft={draft} onSent={() => { setDraft(null); setTab('sent'); }} templates={templates.items} />}
        {tab === 'sent' && <Published q={list} />}
        {tab === 'templates' && <Templates templates={templates} onUse={t => { setDraft({ title: t.title, body: t.body }); setTab('compose'); }} />}
      </div>
    </div>
  );
}

function Compose({ draft, onSent, templates }: { draft: { title: string; body: string } | null; onSent: () => void; templates: Template[] }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(draft?.title ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [scope, setScope] = useState('UNIVERSITY');
  const [urgent, setUrgent] = useState(false);
  const [notify, setNotify] = useState(true);
  const [progs, setProgs] = useState<string[]>([]);
  const [sems, setSems] = useState<number[]>([]);
  const programmes = useQuery({ queryKey: ['announcements', 'programmes'], queryFn: () => api<Programme[]>('/api/announcements/programmes') });
  const reach = useQuery({
    queryKey: ['announcements', 'audience', progs, sems], enabled: notify,
    queryFn: () => api<{ students: number }>('/api/announcements/audience', { method: 'POST', body: { programmeCodes: progs, semesters: sems } }),
  });
  const send = useMutation({
    mutationFn: () => api<{ id: string; notified: number }>('/api/announcements', { method: 'POST', body: { title: title.trim(), body: body.trim(), scope, urgent, notify, audience: { programmeCodes: progs, semesters: sems } } }),
    onSuccess: r => { toast.success(notify ? `Published and sent to ${r.notified} student(s)` : 'Published on the notice board'); void qc.invalidateQueries({ queryKey: ['announcements'] }); onSent(); },
  });
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
  const placeholders = /\{[a-z]+\}/i.test(title + body);

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-4">
        {send.isError && <InlineAlert type="error">{errText(send.error)}</InlineAlert>}
        <div className="flex items-end gap-3">
          <Input label="Title" value={title} onChange={e => setTitle(e.target.value)} maxLength={160} className="flex-1" />
          {templates.length > 0 && <Select label="Start from template" value="" onChange={e => { const t = templates.find(x => x.id === e.target.value); if (t) { setTitle(t.title); setBody(t.body); } }} className="w-52"><option value="">Choose…</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#16264A]">Message</span>
          <textarea rows={8} value={body} onChange={e => setBody(e.target.value)} maxLength={4000} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#16264A] resize-y" />
          <span className="text-[11px] text-[#5A6577]">{body.length}/4000</span>
        </label>
        {placeholders && <InlineAlert type="warning">Replace the {'{placeholders}'} with real details before publishing.</InlineAlert>}
        <div className="flex flex-wrap gap-6">
          <Select label="Scope (notice-board label)" value={scope} onChange={e => setScope(e.target.value)} className="w-56">{SCOPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <div className="flex items-end gap-6 pb-2">
            <Toggle on={urgent} onChange={setUrgent} label="Urgent" />
            <Toggle on={notify} onChange={setNotify} label="Notify students & parents" />
          </div>
        </div>
        <Button loading={send.isPending} disabled={title.trim().length < 3 || body.trim().length < 3 || placeholders} onClick={() => send.mutate()}>Publish</Button>
      </div>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-4">
        <p className="text-[14px] font-semibold text-[#16264A]">Who is notified</p>
        {!notify ? <p className="text-[13px] text-[#5A6577]">Notice board only — no notifications will be sent.</p> : (
          <>
            <div>
              <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Programmes {progs.length === 0 && <span className="normal-case font-normal">(all)</span>}</p>
              {programmes.isLoading ? <Spinner /> : <div className="flex flex-wrap gap-1.5">{(programmes.data ?? []).map(p => <button key={p.code} onClick={() => setProgs(toggle(progs, p.code))} className={`text-[12px] px-2.5 py-1 rounded-[4px] border cursor-pointer ${progs.includes(p.code) ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{p.shortName}</button>)}</div>}
            </div>
            <div>
              <p className="text-[12px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Semesters {sems.length === 0 && <span className="normal-case font-normal">(all)</span>}</p>
              <div className="flex flex-wrap gap-1.5">{[1, 2, 3, 4, 5, 6, 7, 8].map(n => <button key={n} onClick={() => setSems(toggle(sems, n))} className={`text-[12px] w-9 py-1 rounded-[4px] border cursor-pointer ${sems.includes(n) ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{n}</button>)}</div>
            </div>
            <p className="text-[22px] font-semibold text-[#16264A] tabular-nums">{reach.isLoading ? '…' : reach.data?.students ?? '—'} <span className="text-[13px] font-normal text-[#5A6577]">students (and their parents)</span></p>
          </>
        )}
      </div>
    </div>
  );
}

function Published({ q }: { q: ReturnType<typeof useQuery<Announcement[]>> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState<Announcement | null>(null);
  const items = q.data ?? [];
  const stats = useQueries({ queries: items.slice(0, 30).map(a => ({ queryKey: ['announcements', 'stats', a.id], queryFn: () => api<{ targeted: number; read: number }>(`/api/announcements/${a.id}/stats`), staleTime: 60_000 })) });
  const withdraw = useMutation({
    mutationFn: (id: string) => api(`/api/announcements/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast.success('Announcement withdrawn'); setOpen(null); void qc.invalidateQueries({ queryKey: ['announcements'] }); },
    onError: e => toast.error(errText(e)),
  });
  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <InlineAlert type="error">{errText(q.error)}</InlineAlert>;
  if (!items.length) return <EmptyState title="Nothing published yet" />;
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <table className="w-full text-[13px]">
        <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Published', 'Title', 'Scope', 'Reach', 'Read', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
        <tbody>{items.map((a, i) => {
          const s = stats[i]?.data;
          return (
            <tr key={a.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA] cursor-pointer" onClick={() => setOpen(a)}>
              <td className="px-4 py-3 text-[#5A6577] whitespace-nowrap">{new Date(a.publishedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td className="px-4 py-3 text-[#16264A] font-medium">{a.urgent && <span className="text-[10px] font-bold text-[#A8242C] mr-1">URGENT</span>}{a.title}</td>
              <td className="px-4 py-3 text-[#5A6577]">{SCOPES.find(x => x[0] === a.scope)?.[1] ?? a.scope}</td>
              <td className="px-4 py-3 tabular-nums">{s ? (s.targeted || 'Board only') : '…'}</td>
              <td className="px-4 py-3 tabular-nums">{s && s.targeted ? `${s.read} (${Math.round((s.read / s.targeted) * 100)}%)` : '—'}</td>
              <td className="px-4 py-3 text-right text-[12px] text-[#E0952A]">View</td>
            </tr>
          );
        })}</tbody>
      </table>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ''} width="560px"
        footer={<><Button size="sm" variant="destructive" loading={withdraw.isPending} onClick={() => { if (open && window.confirm('Withdraw this announcement? It disappears from every notice board and notification list.')) withdraw.mutate(open.id); }}>Withdraw</Button><Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button></>}>
        {open && <p className="text-[14px] text-[#16264A] whitespace-pre-wrap">{open.body}</p>}
      </Modal>
    </div>
  );
}

function Templates({ templates, onUse }: { templates: ReturnType<typeof useCollection<Template>>; onUse: (t: Template) => void }) {
  const [editing, setEditing] = useState<Stored<Template> | 'new' | null>(null);
  const [f, setF] = useState({ name: '', title: '', body: '' });
  function save() {
    if (!f.name.trim() || !f.title.trim() || !f.body.trim()) { toast.error('Fill every field'); return; }
    if (editing === 'new') templates.add({ id: `TPL-${Date.now().toString(36)}`, name: f.name.trim(), title: f.title.trim(), body: f.body.trim() });
    else if (editing) templates.update(editing.id, { name: f.name.trim(), title: f.title.trim(), body: f.body.trim() });
    toast.success('Template saved'); setEditing(null);
  }
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]"><p className="text-[14px] font-semibold text-[#16264A]">Templates</p><Button size="sm" onClick={() => { setEditing('new'); setF({ name: '', title: '', body: '' }); }}>+ New template</Button></div>
      {templates.items.length === 0 ? <div className="p-6"><EmptyState title="No templates" /></div> : (
        <ul className="divide-y divide-[#EDEFF3]">{templates.items.map(t => (
          <li key={t.id} className="px-4 py-3 flex items-start gap-3">
            <div className="flex-1 min-w-0"><p className="text-[13px] font-medium text-[#16264A]">{t.name}</p><p className="text-[12px] text-[#5A6577] truncate">{t.title} — {t.body}</p></div>
            <Button size="sm" onClick={() => onUse(t)}>Use</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setF({ name: t.name, title: t.title, body: t.body }); }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Delete template "${t.name}"?`)) templates.remove(t.id); }}>Delete</Button>
          </li>
        ))}</ul>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New template' : 'Edit template'} width="560px" footer={<><Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button size="sm" onClick={save}>Save</Button></>}>
        <div className="space-y-3">
          <Input label="Template name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <Input label="Title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} hint="Use {date}, {venue} etc. for details to fill in" />
          <label className="flex flex-col gap-1"><span className="text-[13px] font-medium text-[#16264A]">Message</span><textarea rows={6} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#16264A]" /></label>
        </div>
      </Modal>
    </div>
  );
}
