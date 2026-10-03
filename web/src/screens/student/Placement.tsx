import { useState } from 'react';
import type { Module } from '../StudentPortal';
import { Button, EmptyState, InlineAlert, Modal, Spinner, toast } from '../../components/ui';
import { useProfile, useResults } from '../../lib/queries';
import { formatBytes, useCollection, useFiles, type Stored } from '../../lib/records';
import {
  SAMPLE_DRIVES, STATUS_LABEL, STATUS_TONE, eligibility, pkg, statusOf,
  type Drive, type Outcome, type PlacementApp,
} from '../../lib/placement';

interface Props { onNavigate: (m: Module) => void }

const TABS = ['Drives', 'My Applications', 'Offers'] as const;
const day = (iso?: string) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The student's placements: open drives they qualify for, their applications
 * and where each stands with the placement cell, and offers to accept or
 * decline. Their résumé is uploaded once and shared with every application.
 */
export default function Placement(_props: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>('Drives');
  const drives = useCollection<Drive>('campus:placement-drives', SAMPLE_DRIVES);
  const apps = useCollection<PlacementApp>('student:placement-applications', []);
  const outcomes = useCollection<Outcome>('desk:placement-outcomes', []);
  const profile = useProfile();
  const results = useResults();
  const resume = useFiles(profile.data ? `student:placement/${profile.data.id}` : null);

  const cgpa = [...(results.data ?? [])].sort((a, b) => b.semester - a.semester)[0]?.cgpa;
  const facts = { cgpa, programme: profile.data?.programme.shortName };
  const outcomeOf = (a: PlacementApp) => outcomes.items.find(o => o.id === a.id) ?? null;
  const offers = apps.items.filter(a => outcomeOf(a)?.status === 'offer' && !a.withdrawn);
  const loading = drives.isLoading || apps.isLoading;

  function apply(d: Drive) {
    if (resume.files.length === 0) { toast.error('Upload your résumé first (top of this page)'); return; }
    if (apps.items.some(a => a.id === d.id && !a.withdrawn)) return;
    const existing = apps.items.find(a => a.id === d.id);
    if (existing) apps.update(d.id, { withdrawn: false, appliedAt: new Date().toISOString() });
    else apps.add({ id: d.id, driveId: d.id, company: d.company, role: d.role, kind: d.kind, appliedAt: new Date().toISOString() });
    toast.success(`Applied to ${d.company} — ${d.role}`);
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Placements & Internships</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">CGPA {cgpa?.toFixed(2) ?? '—'} · {profile.data?.programme.shortName ?? ''}</p>
      </div>

      <div className="bg-white border-b border-[#D3D8E0] px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[#16264A]">Résumé</p>
          {resume.isLoading ? <Spinner /> : resume.files[0]
            ? <p className="text-[12px] text-[#5A6577] truncate">{resume.files[0].name} · {formatBytes(resume.files[0].size)} · <button onClick={() => void resume.download(resume.files[0]!)} className="text-[#E0952A] hover:underline cursor-pointer">Open</button></p>
            : <p className="text-[12px] text-[#A8242C]">Not uploaded — required to apply</p>}
        </div>
        <Button size="sm" variant="secondary" disabled={!profile.data} onClick={async () => { const old = resume.files; const f = await resume.upload('application/pdf,.doc,.docx'); if (f) { for (const o of old) await resume.remove(o.id); toast.success('Résumé uploaded'); } }}>{resume.files[0] ? 'Replace' : 'Upload'} résumé</Button>
      </div>

      <div className="bg-white border-b border-[#D3D8E0] flex">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ minHeight: 44 }} className={`px-4 py-3 text-[13px] font-medium cursor-pointer ${tab === t ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>
            {t}{t === 'Offers' && offers.length ? ` (${offers.length})` : ''}
          </button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
        <div className="mt-3">
          {tab === 'Drives' && <DrivesList drives={drives.items} apps={apps.items} facts={facts} onApply={apply} />}
          {tab === 'My Applications' && <MyApps apps={apps} outcomeOf={outcomeOf} drives={drives.items} />}
          {tab === 'Offers' && <Offers offers={offers} outcomeOf={outcomeOf} apps={apps} />}
        </div>
      )}
    </div>
  );
}

function DrivesList({ drives, apps, facts, onApply }: { drives: Drive[]; apps: PlacementApp[]; facts: { cgpa?: number; programme?: string }; onApply: (d: Drive) => void }) {
  const [open, setOpen] = useState<Drive | null>(null);
  const live = drives.filter(d => d.status === 'open');
  if (live.length === 0) return <div className="px-4"><EmptyState title="No open drives right now" description="New drives appear here as soon as the placement cell opens them." /></div>;
  return (
    <div className="bg-white border-t border-b border-[#D3D8E0]">
      {live.map((d, i) => {
        const block = eligibility(d, facts);
        const applied = apps.some(a => a.id === d.id && !a.withdrawn);
        const closed = d.deadline < today();
        return (
          <div key={d.id} className={`px-4 py-4 ${i < live.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#16264A]">{d.company}</p>
                <p className="text-[12px] text-[#5A6577]">{d.role} · {d.kind === 'internship' ? 'Internship' : 'Full-time'} · {d.location}</p>
              </div>
              <p className="text-[14px] font-semibold text-[#0E7A5F] shrink-0">{pkg(d)}</p>
            </div>
            <p className={`text-[12px] mt-1 ${applied ? 'text-[#1D4ED8]' : block || closed ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}`}>{applied ? 'Applied' : closed ? 'Applications closed' : block ? `Not eligible — ${block}` : `Eligible · apply by ${day(d.deadline)}`}</p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="secondary" onClick={() => setOpen(d)}>Details</Button>
              {!applied && !block && !closed && <Button size="sm" onClick={() => onApply(d)}>Apply</Button>}
            </div>
          </div>
        );
      })}
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${open.company} — ${open.role}` : ''} footer={<Button size="sm" variant="secondary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && (
          <div className="space-y-3 text-[13px]">
            <p className="text-[#5A6577]">{open.description}</p>
            <div className="grid grid-cols-2 gap-2">
              {[['Package', pkg(open)], ['Location', open.location], ['Apply by', day(open.deadline)], ['Drive date', day(open.driveDate)], ['Minimum CGPA', open.minCgpa ?? 'None'], ['Programmes', open.programmes.join(', ') || 'All']].map(([l, v]) => <div key={String(l)}><p className="text-[11px] text-[#5A6577] uppercase">{l}</p><p className="text-[#16264A]">{v}</p></div>)}
            </div>
            {open.rounds.length > 0 && <p className="text-[#16264A]">Rounds: {open.rounds.join(' → ')}</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}

function MyApps({ apps, outcomeOf, drives }: { apps: ReturnType<typeof useCollection<PlacementApp>>; outcomeOf: (a: PlacementApp) => Outcome | null; drives: Drive[] }) {
  if (apps.items.length === 0) return <div className="px-4"><EmptyState title="No applications yet" /></div>;
  return (
    <div className="bg-white border-t border-b border-[#D3D8E0]">
      {apps.items.map((a: Stored<PlacementApp>, i) => {
        const o = outcomeOf(a);
        const st = statusOf(a, o);
        const d = drives.find(x => x.id === a.driveId);
        const canWithdraw = st === 'applied' && d && d.deadline >= today();
        return (
          <div key={a.id} className={`px-4 py-4 ${i < apps.items.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-[14px] font-bold text-[#16264A]">{a.company}</p><p className="text-[12px] text-[#5A6577]">{a.role} · applied {day(a.appliedAt)}</p></div>
              <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS_TONE[st]}`}>{STATUS_LABEL[st]}</span>
            </div>
            {o?.history?.length ? <ol className="mt-2 border-l-2 border-[#D3D8E0] ml-1 space-y-1">{o.history.map((h, j) => <li key={j} className="pl-3 text-[12px] text-[#16264A]">{STATUS_LABEL[h.status]}{h.round ? ` — ${h.round}` : ''} · {day(h.at)}{h.note ? <span className="text-[#5A6577]"> · {h.note}</span> : null}</li>)}</ol> : null}
            {canWithdraw && <button onClick={() => { if (window.confirm('Withdraw this application?')) { apps.update(a.id, { withdrawn: true }); toast.success('Application withdrawn'); } }} className="mt-2 text-[12px] text-[#5A6577] hover:text-[#A8242C] cursor-pointer">Withdraw</button>}
          </div>
        );
      })}
    </div>
  );
}

function Offers({ offers, outcomeOf, apps }: { offers: PlacementApp[]; outcomeOf: (a: PlacementApp) => Outcome | null; apps: ReturnType<typeof useCollection<PlacementApp>> }) {
  if (offers.length === 0) return <div className="px-4"><EmptyState title="No offers yet" description="Offers recorded by the placement cell appear here for you to accept or decline." /></div>;
  const acceptedFull = offers.some(a => a.offerResponse === 'accepted' && a.kind === 'placement');
  return (
    <div className="space-y-3 px-4">
      {acceptedFull && <InlineAlert type="info">You have accepted a full-time offer. Under the placement policy you may not accept another.</InlineAlert>}
      {offers.map(a => {
        const o = outcomeOf(a)!;
        return (
          <div key={a.id} className="bg-white border border-[#D3D8E0] rounded-[4px] p-4">
            <p className="text-[15px] font-bold text-[#16264A]">{a.company}</p>
            <p className="text-[12px] text-[#5A6577]">{a.role}</p>
            <p className="text-[14px] font-semibold text-[#0E7A5F] mt-1">{o.package != null ? pkg({ kind: a.kind, package: o.package }) : ''}{o.joiningDate ? ` · joining ${day(o.joiningDate)}` : ''}</p>
            {o.note && <p className="text-[12px] text-[#5A6577] mt-1">{o.note}</p>}
            {a.offerResponse ? (
              <p className={`text-[13px] font-semibold mt-3 ${a.offerResponse === 'accepted' ? 'text-[#0E7A5F]' : 'text-[#5A6577]'}`}>You {a.offerResponse} this offer on {day(a.respondedAt)}.</p>
            ) : (
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="secondary" onClick={() => { if (window.confirm(`Decline the offer from ${a.company}?`)) { apps.update(a.id, { offerResponse: 'declined', respondedAt: new Date().toISOString() }); toast.success('Offer declined'); } }}>Decline</Button>
                <Button size="sm" disabled={acceptedFull && a.kind === 'placement'} onClick={() => { if (window.confirm(`Accept the offer from ${a.company}? The placement cell will be told.`)) { apps.update(a.id, { offerResponse: 'accepted', respondedAt: new Date().toISOString() }); toast.success('Offer accepted — congratulations!'); } }}>Accept offer</Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
