import { useState } from 'react';
import type { Module } from '../StudentPortal';
import { Button, EmptyState, InlineAlert, Input, Modal, Spinner, toast } from '../../components/ui';
import { useAttendance, useProfile, useResults } from '../../lib/queries';
import { formatBytes, useCollection, useFiles, type Stored } from '../../lib/records';
import {
  ACTIVE, SAMPLE_SCHEMES, STATUS_TEXT, STATUS_TONE, academicYearNow, checkRules, inr, statusOf,
  type Application, type Decision, type Facts, type Scheme,
} from '../../lib/scholarship';

interface Props { onNavigate: (m: Module) => void }

const TABS = ['My Applications', 'Apply'] as const;

function SectionHeader({ label, right }: { label: string; right?: React.ReactNode }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span>
      {right}
    </div>
  );
}

const fmtDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

/**
 * The student's scholarships: schemes they can apply for, checked against
 * their own CGPA, attendance and category; their applications with the
 * documents they uploaded; and where each stands with the desk.
 */
export default function Scholarship(_props: Props) {
  const [tab, setTab] = useState<typeof TABS[number]>('My Applications');
  const schemes = useCollection<Scheme>('campus:scholarship-schemes', SAMPLE_SCHEMES);
  const apps = useCollection<Application>('student:scholarship-applications', []);
  const decisions = useCollection<Decision>('desk:scholarship-decisions', []);
  const profile = useProfile();
  const attendance = useAttendance();
  const results = useResults();

  const latest = [...(results.data ?? [])].sort((a, b) => b.semester - a.semester)[0];
  const facts: Facts = { cgpa: latest?.cgpa, attendance: attendance.data?.overall.percent, category: profile.data?.category ?? null };
  const decisionFor = (a: Application) => decisions.items.find(d => d.id === a.id) ?? null;

  const loading = schemes.isLoading || apps.isLoading;

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Scholarships</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">Apply, upload documents and track every application</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] flex">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ minHeight: 44 }}
            className={`px-4 py-3 text-[13px] font-medium cursor-pointer ${tab === t ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>{t}</button>
        ))}
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : tab === 'My Applications' ? (
        <MyApplications apps={apps} decisionFor={decisionFor} onApply={() => setTab('Apply')} />
      ) : (
        <ApplyTab schemes={schemes.items} apps={apps} decisionFor={decisionFor} facts={facts} profileCategory={profile.data?.category ?? ''} onDone={() => setTab('My Applications')} />
      )}
    </div>
  );
}

type Apps = ReturnType<typeof useCollection<Application>>;

function MyApplications({ apps, decisionFor, onApply }: { apps: Apps; decisionFor: (a: Application) => Decision | null; onApply: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (apps.items.length === 0) {
    return <div className="px-4 pt-4"><EmptyState title="No applications yet" description="See the schemes you are eligible for and apply in a few minutes." action={<Button size="sm" onClick={onApply}>See schemes</Button>} /></div>;
  }
  return (
    <div className="mt-3 space-y-2">
      {apps.items.map(a => {
        const d = decisionFor(a);
        const st = statusOf(a, d);
        const isOpen = open === a.id;
        return (
          <div key={a.id} className="bg-white border-t border-b border-[#D3D8E0]">
            <button onClick={() => setOpen(isOpen ? null : a.id)} className="w-full text-left px-4 py-4 cursor-pointer hover:bg-[#FAFBFC]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#16264A]">{a.schemeName}</p>
                  <p className="text-[12px] text-[#5A6577]">{a.academicYear} · {inr(d?.amountSanctioned ?? a.amount)} · applied {fmtDate(a.appliedAt)}</p>
                  <p className="font-mono text-[11px] text-[#5A6577] mt-0.5">{a.id}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${STATUS_TONE[st]}`}>{st[0]!.toUpperCase() + st.slice(1)}</span>
              </div>
              <p className="text-[12px] text-[#16264A] mt-2">{STATUS_TEXT[st]}{d?.note && st !== 'submitted' ? ` — ${d.note}` : ''}</p>
            </button>
            {isOpen && <ApplicationDetail app={a} decision={d} apps={apps} />}
          </div>
        );
      })}
    </div>
  );
}

function ApplicationDetail({ app, decision, apps }: { app: Stored<Application>; decision: Decision | null; apps: Apps }) {
  const files = useFiles(`student:scholarship/${app.id}`);
  const st = statusOf(app, decision);
  const canEditDocs = st === 'submitted' || st === 'returned';
  return (
    <div className="px-4 pb-4 space-y-4">
      {decision?.history?.length ? (
        <div>
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">Progress</p>
          <ol className="border-l-2 border-[#D3D8E0] ml-1 space-y-2">
            <li className="pl-3 text-[12px] text-[#5A6577]">Submitted · {fmtDate(app.appliedAt)}</li>
            {decision.history.map((h, i) => (
              <li key={i} className="pl-3 text-[12px] text-[#16264A]">{STATUS_TEXT[h.status]} · {fmtDate(h.at)}{h.note ? <span className="text-[#5A6577]"> — {h.note}</span> : null}</li>
            ))}
          </ol>
          {decision.utr && <p className="text-[12px] text-[#0E7A5F] mt-2">Credited {fmtDate(decision.disbursedOn)} · UTR {decision.utr}</p>}
        </div>
      ) : null}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Documents</p>
          {canEditDocs && <Button size="sm" variant="secondary" onClick={() => void files.upload('image/*,application/pdf')}>Upload</Button>}
        </div>
        {files.isLoading ? <Spinner /> : files.files.length === 0 ? (
          <p className="text-[12px] text-[#A8242C]">No documents uploaded yet. The desk cannot verify the application without them.</p>
        ) : (
          <div className="border border-[#D3D8E0] rounded-[4px] divide-y divide-[#EDEFF3]">
            {files.files.map(f => (
              <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-[12px]">
                <span className="flex-1 truncate text-[#16264A]">{f.name}</span>
                <span className="text-[#5A6577]">{formatBytes(f.size)}</span>
                <button onClick={() => void files.download(f)} className="text-[#E0952A] hover:underline cursor-pointer">Open</button>
                {canEditDocs && <button onClick={() => void files.remove(f.id)} className="text-[#A8242C] hover:underline cursor-pointer">Remove</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {st === 'returned' && (
          <Button size="sm" onClick={() => { apps.update(app.id, { resubmittedAt: new Date().toISOString() }); toast.success('Sent back to the desk for verification'); }}>I have corrected it — resubmit</Button>
        )}
        {st === 'submitted' && (
          <Button size="sm" variant="secondary" onClick={() => { if (window.confirm('Withdraw this application?')) { apps.update(app.id, { withdrawn: true }); toast.success('Application withdrawn'); } }}>Withdraw</Button>
        )}
      </div>
    </div>
  );
}

function ApplyTab({ schemes, apps, decisionFor, facts, profileCategory, onDone }: {
  schemes: Scheme[]; apps: Apps; decisionFor: (a: Application) => Decision | null; facts: Facts; profileCategory: string; onDone: () => void;
}) {
  const [details, setDetails] = useState<Scheme | null>(null);
  const [applying, setApplying] = useState<Scheme | null>(null);
  const year = academicYearNow();

  if (schemes.length === 0) return <div className="px-4 pt-4"><EmptyState title="No scholarship schemes listed yet" description="The scholarship desk publishes schemes here when their windows open." /></div>;

  return (
    <div className="mt-3">
      <SectionHeader label="Schemes" right={<span className="text-[12px] text-[#5A6577]">Academic year {year}</span>} />
      {schemes.map((s, i) => {
        const checks = checkRules(s.rules, facts);
        const failing = checks.filter(c => c.met === false);
        const already = apps.items.find(a => a.schemeId === s.id && a.academicYear === year && ACTIVE.includes(statusOf(a, decisionFor(a))));
        return (
          <div key={s.id} className={`bg-white px-4 py-4 ${i < schemes.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <p className="text-[14px] font-bold text-[#16264A]">{s.name}</p>
            <p className="text-[12px] text-[#5A6577]">{s.provider} · {s.funding}</p>
            <p className="text-[15px] font-semibold text-[#16264A] mt-1">{inr(s.amount)}{s.perYear ? ' / year' : ''}</p>
            <p className={`text-[12px] mt-1 font-medium ${already ? 'text-[#1D4ED8]' : !s.windowOpen ? 'text-[#5A6577]' : failing.length ? 'text-[#A8242C]' : 'text-[#0E7A5F]'}`}>
              {already ? `Applied — ${STATUS_TEXT[statusOf(already, decisionFor(already))].toLowerCase()}`
                : !s.windowOpen ? 'Applications are closed'
                  : failing.length ? `Not eligible — ${failing.map(f => f.label.toLowerCase()).join(', ')}`
                    : `Eligible${s.closesOn ? ` · apply by ${fmtDate(s.closesOn)}` : ''}`}
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="secondary" onClick={() => setDetails(s)}>Eligibility & documents</Button>
              {!already && s.windowOpen && failing.length === 0 && <Button size="sm" onClick={() => setApplying(s)}>Apply</Button>}
            </div>
          </div>
        );
      })}

      <Modal open={!!details} onClose={() => setDetails(null)} title={details?.name ?? ''} footer={<Button size="sm" variant="secondary" onClick={() => setDetails(null)}>Close</Button>}>
        {details && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#5A6577]">{details.description}</p>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] text-[#5A6577] uppercase"><th className="py-1">Rule</th><th>Required</th><th>Yours</th><th /></tr></thead>
              <tbody>
                {checkRules(details.rules, facts).map(c => (
                  <tr key={c.label} className="border-t border-[#EDEFF3]">
                    <td className="py-2 text-[#16264A]">{c.label}</td><td className="text-[#5A6577]">{c.required}</td><td className="text-[#16264A]">{c.yours}</td>
                    <td className="text-right">{c.met === true ? <span className="text-[#0E7A5F]">✓</span> : c.met === false ? <span className="text-[#A8242C]">✗</span> : <span className="text-[#5A6577]">—</span>}</td>
                  </tr>
                ))}
                {checkRules(details.rules, facts).length === 0 && <tr><td colSpan={4} className="py-2 text-[#5A6577]">Open to all students.</td></tr>}
              </tbody>
            </table>
            <div>
              <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-1">Documents you will upload</p>
              <ul className="list-disc pl-5 text-[13px] text-[#16264A]">{details.docs.map(d => <li key={d}>{d}</li>)}</ul>
            </div>
          </div>
        )}
      </Modal>

      <ApplyModal scheme={applying} year={year} category={profileCategory} onClose={() => setApplying(null)} onSubmit={app => { apps.add(app); setApplying(null); toast.success('Application submitted — now upload your documents'); onDone(); }} facts={facts} />
    </div>
  );
}

function ApplyModal({ scheme, year, category, facts, onClose, onSubmit }: { scheme: Scheme | null; year: string; category: string; facts: Facts; onClose: () => void; onSubmit: (a: Application) => void }) {
  const [income, setIncome] = useState('');
  const [bankName, setBankName] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [agree, setAgree] = useState(false);

  const incomeN = Number(income.replace(/\D/g, ''));
  const overCap = scheme?.rules.incomeCap != null && income !== '' && incomeN >= scheme.rules.incomeCap;
  const ifscOk = /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  const ready = !!scheme && income !== '' && !overCap && bankName.trim().length > 1 && /^\d{9,18}$/.test(account) && ifscOk && agree;

  function submit() {
    if (!scheme || !ready) return;
    onSubmit({
      id: `SCH-${year.slice(0, 4)}-${Date.now().toString(36).toUpperCase()}`,
      schemeId: scheme.id, schemeName: scheme.name, amount: scheme.amount, academicYear: year,
      appliedAt: new Date().toISOString(), familyIncome: incomeN, category: category || 'GENERAL',
      bankName: bankName.trim(), accountLast4: account.slice(-4), ifsc,
    });
    setIncome(''); setBankName(''); setAccount(''); setIfsc(''); setAgree(false);
  }

  return (
    <Modal open={!!scheme} onClose={onClose} title={scheme ? `Apply — ${scheme.name}` : ''} width="520px"
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!ready} onClick={submit}>Submit application</Button></>}>
      {scheme && (
        <div className="space-y-4">
          <InlineAlert type="info">Your CGPA ({facts.cgpa?.toFixed(2) ?? '—'}), attendance and category ({category || 'not on record'}) are taken from your records. After submitting, upload the documents from My Applications.</InlineAlert>
          <Input label="Annual family income (₹)" inputMode="numeric" value={income} onChange={e => setIncome(e.target.value.replace(/[^\d]/g, ''))}
            error={overCap ? `This scheme is for family incomes below ${inr(scheme.rules.incomeCap!)}` : undefined} hint={incomeN ? inr(incomeN) : 'As on your income certificate'} />
          <Input label="Bank name" value={bankName} onChange={e => setBankName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Account number" inputMode="numeric" value={account} onChange={e => setAccount(e.target.value.replace(/\D/g, '').slice(0, 18))} hint="Only the last 4 digits are stored" />
            <Input label="IFSC" value={ifsc} onChange={e => setIfsc(e.target.value.toUpperCase().slice(0, 11))} error={ifsc.length === 11 && !ifscOk ? 'Not a valid IFSC' : undefined} />
          </div>
          <label className="flex items-start gap-2 text-[12px] text-[#5A6577] cursor-pointer">
            <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" />
            <span>I declare that the information is true. I understand a false declaration will cancel the scholarship and any amount paid will be recovered.</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
