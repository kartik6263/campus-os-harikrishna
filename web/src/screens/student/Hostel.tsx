import { useEffect, useState } from 'react';
import type { Module } from '../StudentPortal';
import { Button, Modal, InlineAlert, StatusPill, Timeline, toast, Spinner } from '../../components/ui';
import { HOSTEL, MESS_MENU } from '../../lib/studentdata';
import { useCollection, useDocument } from '../../lib/records';
import { useStudentRecord } from '../../lib/queries';
import { downloadPdf, qrDataUrl } from '../../lib/export';
import { DEMO_REQUESTS, REQUEST_LABEL, fmtDate, refNo, requestPill, type Allotment, type HostelComplaint, type HostelRequest, type MessMenu } from '../../lib/hostel';

interface Props { onNavigate: (m: Module | null) => void }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TABS = ['Room & Allotment', 'Mess', 'Leave / Gate Pass', 'Complaints'];
const COMP_CATEGORIES = ['Maintenance', 'Cleanliness', 'Water/Electricity', 'Mess Quality', 'Security', 'Ragging (serious)', 'Other'];
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const todayIso = () => new Date().toISOString().slice(0, 10);

const SEED_COMPLAINTS: HostelComplaint[] = [
  { id: 'HC/2024/000317', category: 'Maintenance', description: 'Water leakage near the window of the room. Wall is getting damp.', raisedOn: '2024-09-15', status: 'in_progress', response: 'Plumber inspection scheduled; tank overflow pipe to be replaced.' },
];

function SectionHeader({ label }: { label: string }) {
  return <div className="bg-[#EDEFF3] px-4 py-2"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{label}</span></div>;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between px-4 py-3 border-b border-[#D3D8E0] last:border-0">
      <span className="text-[13px] text-[#5A6577] shrink-0 w-36">{label}</span>
      <span className={`text-[14px] text-[#16264A] font-medium text-right flex-1 ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function TabRoomAllotment({ allotment, onFees }: { allotment: Allotment; onFees: () => void }) {
  return (
    <div>
      <SectionHeader label="Room Details" />
      <div className="bg-white border-b border-[#D3D8E0]">
        <InfoRow label="Block" value={allotment.block} />
        <InfoRow label="Room No." value={allotment.room} mono />
        <InfoRow label="Type" value={allotment.type} />
        <InfoRow label="Roommates" value={allotment.roommates.join(' · ') || '—'} />
        <InfoRow label="Allotment Date" value={allotment.allotmentDate} />
        <InfoRow label="Valid Till" value={allotment.validTill} />
      </div>

      <SectionHeader label="Hostel & Mess Fees" />
      <div className="bg-white px-4 py-4 border-b border-[#D3D8E0]">
        <p className="text-[13px] text-[#5A6577]">Hostel rent and mess charges are billed to your fee account, alongside your other fees. Pay them online or at the college counter, and download receipts from there.</p>
        <Button variant="primary" size="lg" className="w-full mt-3" onClick={onFees}>Open my fee account</Button>
      </div>
    </div>
  );
}

function TabMess() {
  const menuDoc = useDocument<MessMenu>('campus:mess-menu', MESS_MENU as MessMenu, MESS_MENU as MessMenu);
  const todayShort = new Date().toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
  const today = DAYS.includes(todayShort) ? todayShort : 'Mon';
  const [messDay, setMessDay] = useState(today);
  const menu = menuDoc.value[messDay] ?? { breakfast: '—', lunch: '—', dinner: '—' };
  const mealConfig = [
    { key: 'breakfast' as const, label: 'Breakfast', time: '7:30–9:00 AM', icon: '☕' },
    { key: 'lunch' as const, label: 'Lunch', time: '12:30–2:30 PM', icon: '🍱' },
    { key: 'dinner' as const, label: 'Dinner', time: '7:30–9:30 PM', icon: '🍽' },
  ];
  return (
    <div>
      <SectionHeader label="Select Day" />
      <div className="bg-white border-b border-[#D3D8E0]">
        <div className="flex overflow-x-auto px-4 py-3 gap-2">
          {DAYS.map(d => (
            <button key={d} onClick={() => setMessDay(d)} className={`shrink-0 min-w-[44px] px-3 py-2 rounded-[4px] text-[13px] font-medium cursor-pointer text-center ${messDay === d ? 'bg-[#16264A] text-white' : d === today ? 'bg-[#FEF9EC] text-[#E0952A] border border-[#E0952A]' : 'bg-[#EDEFF3] text-[#5A6577] hover:bg-[#D3D8E0]'}`}>
              {d}{d === today && <span className="block text-[9px] leading-none mt-0.5 opacity-80">Today</span>}
            </button>
          ))}
        </div>
      </div>
      <SectionHeader label={`${messDay === today ? 'Today — ' : ''}${messDay} Mess Menu`} />
      <div className="bg-white">
        {mealConfig.map((meal, i) => (
          <div key={meal.key} className={`px-4 py-4 ${i < mealConfig.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-[4px] bg-[#EDEFF3] flex items-center justify-center shrink-0 text-[18px]">{meal.icon}</div>
              <div className="flex-1">
                <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{meal.label} · {meal.time}</p>
                <p className="text-[15px] text-[#16264A] mt-1">{menu[meal.key]}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="px-4 py-3 text-[12px] text-[#5A6577]">The menu is published by the hostel office and updates here as soon as they change it.</p>
    </div>
  );
}

function GatePassCard({ r, student }: { r: HostelRequest; student: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { void qrDataUrl(`${r.id}|${student}|${r.from}`, 180).then(setQr); }, [r.id, r.from, student]);
  return (
    <div className="mt-3 border-2 border-dashed border-[#0E7A5F] rounded-[6px] p-3 flex items-center gap-3 bg-[#F0FDF7]">
      {qr && <img src={qr} alt={`QR code for ${r.id}`} className="w-24 h-24" />}
      <div className="text-[12px] text-[#16264A]">
        <p className="font-semibold text-[#0E7A5F] uppercase tracking-wide text-[11px]">{r.kind === 'leave' ? 'Leave pass' : 'Gate pass'} · approved</p>
        <p className="font-mono">{r.id}</p>
        <p>{student}</p>
        <p>{r.kind === 'leave' ? `${fmtDate(r.from)} – ${fmtDate(r.to)}` : `${fmtDate(r.from)}, ${r.outTime}–${r.returnTime}`}</p>
        <p className="text-[#5A6577]">Show this at the hostel gate</p>
      </div>
    </div>
  );
}

function TabLeave({ student }: { student: string }) {
  const requests = useCollection<HostelRequest>('student:hostel-requests', DEMO_REQUESTS);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [gatepassOpen, setGatepassOpen] = useState(false);
  const [f, setF] = useState({ from: '', to: '', reason: '', date: '', out: '', back: '', gpReason: '' });

  function submitLeave() {
    if (f.to < f.from) { toast.error('The return date is before the leave starts'); return; }
    const id = refNo('LV');
    requests.add({ id, kind: 'leave', from: f.from, to: f.to, reason: f.reason.trim(), status: 'awaiting_parent', parentConsent: 'pending', appliedAt: new Date().toISOString() });
    setLeaveOpen(false);
    setF({ ...f, from: '', to: '', reason: '' });
    toast.success(`Leave ${id} sent to your parent for consent, then to the warden`);
  }

  function submitGatePass() {
    if (f.back <= f.out) { toast.error('Return time must be after out time'); return; }
    const id = refNo('GP');
    requests.add({ id, kind: 'gatepass', from: f.date, outTime: f.out, returnTime: f.back, reason: f.gpReason.trim(), status: 'pending', appliedAt: new Date().toISOString() });
    setGatepassOpen(false);
    setF({ ...f, date: '', out: '', back: '', gpReason: '' });
    toast.success(`Gate pass ${id} sent to the warden`);
  }

  return (
    <div>
      <SectionHeader label="Apply" />
      <div className="bg-white border-b border-[#D3D8E0]">
        {[{ key: 'leave', title: 'Apply Leave', sub: 'Overnight / multi-day — needs parent consent', open: () => setLeaveOpen(true) }, { key: 'gp', title: 'Apply Gate Pass', sub: 'Same-day exit and return', open: () => setGatepassOpen(true) }].map((a, i) => (
          <button key={a.key} onClick={a.open} className={`w-full flex items-center justify-between px-4 py-4 hover:bg-[#EDEFF3] cursor-pointer min-h-[64px] ${i === 0 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div className="text-left"><p className="text-[15px] font-semibold text-[#16264A]">{a.title}</p><p className="text-[12px] text-[#5A6577]">{a.sub}</p></div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        ))}
      </div>

      <SectionHeader label="My Requests" />
      <div className="bg-white">
        {requests.isLoading && <div className="flex justify-center py-6"><Spinner /></div>}
        {!requests.isLoading && requests.items.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-[#5A6577]">No leave or gate-pass requests yet.</p>}
        {requests.items.map(r => (
          <div key={r._rid ?? r.id} className="px-4 py-4 border-b border-[#D3D8E0] last:border-0">
            <div className="flex items-start justify-between mb-3 gap-2">
              <div>
                <p className="text-[14px] font-semibold text-[#16264A]">{r.kind === 'leave' ? `Leave · ${fmtDate(r.from)} – ${fmtDate(r.to)}` : `Gate pass · ${fmtDate(r.from)}, ${r.outTime}–${r.returnTime}`}</p>
                <p className="text-[12px] text-[#5A6577]">{r.reason} · <span className="font-mono">{r.id}</span></p>
              </div>
              <span className="shrink-0 flex flex-col items-end gap-1"><StatusPill status={requestPill(r.status)} compact /><span className="text-[10px] text-[#5A6577]">{REQUEST_LABEL[r.status]}</span></span>
            </div>
            <Timeline items={[
              { label: 'Applied', date: fmtDate(r.appliedAt), by: student, status: 'done' as const },
              ...(r.kind === 'leave' ? [{ label: r.parentConsent === 'given' ? 'Parent consented' : r.parentConsent === 'refused' ? 'Parent refused' : 'Parent consent', date: r.parentConsent === 'pending' ? 'Awaiting' : '', by: 'Parent', status: (r.parentConsent === 'pending' ? 'current' : 'done') as 'current' | 'done', note: r.parentNote }] : []),
              { label: r.status === 'approved' || r.status === 'returned' ? 'Approved by warden' : r.status === 'rejected' ? 'Rejected by warden' : 'Warden review', date: r.decidedAt ? fmtDate(r.decidedAt) : r.status === 'pending' ? 'Awaiting' : '—', by: r.decidedBy ?? 'Hostel Warden', status: (['approved', 'rejected', 'returned'].includes(r.status) ? 'done' : r.status === 'pending' ? 'current' : 'pending') as 'done' | 'current' | 'pending', note: r.wardenNote },
            ]} />
            {(r.status === 'approved') && <GatePassCard r={r} student={student} />}
            {(r.status === 'awaiting_parent' || r.status === 'pending') && (
              <button onClick={() => { requests.update(r.id, { status: 'cancelled' }); toast.info(`${r.id} cancelled`); }} className="mt-2 text-[12px] text-[#A8242C] hover:underline cursor-pointer">Cancel request</button>
            )}
          </div>
        ))}
      </div>

      <Modal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Apply Leave"
        footer={<><Button variant="secondary" onClick={() => setLeaveOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitLeave} disabled={!f.from || !f.to || !f.reason.trim()}>Submit Application</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="flex gap-3">
            {(['from', 'to'] as const).map(k => (
              <div key={k} className="flex-1 flex flex-col gap-1">
                <label className="text-[13px] font-medium text-[#16264A]">{k === 'from' ? 'From Date' : 'To Date'}</label>
                <input type="date" min={todayIso()} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="h-11 px-3 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] bg-white" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Reason</label>
            <textarea rows={3} value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} placeholder="State the reason for leave..." className="px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none bg-white" />
          </div>
          <InlineAlert type="info">Your parent is asked to consent in the parent portal; the warden then decides. You can follow each step here.</InlineAlert>
        </div>
      </Modal>

      <Modal open={gatepassOpen} onClose={() => setGatepassOpen(false)} title="Apply Gate Pass"
        footer={<><Button variant="secondary" onClick={() => setGatepassOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitGatePass} disabled={!f.date || !f.out || !f.back || !f.gpReason.trim()}>Submit Gate Pass</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Date</label>
            <input type="date" min={todayIso()} value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="h-11 px-3 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] bg-white" />
          </div>
          <div className="flex gap-3">
            {(['out', 'back'] as const).map(k => (
              <div key={k} className="flex-1 flex flex-col gap-1">
                <label className="text-[13px] font-medium text-[#16264A]">{k === 'out' ? 'Out Time' : 'Expected Return'}</label>
                <input type="time" value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="h-11 px-3 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] bg-white" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Reason / Purpose</label>
            <textarea rows={3} value={f.gpReason} onChange={e => setF({ ...f, gpReason: e.target.value })} placeholder="Purpose of gate pass..." className="px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none bg-white" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

function TabComplaints() {
  const complaints = useCollection<HostelComplaint>('student:hostel-complaints', SEED_COMPLAINTS);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [desc, setDesc] = useState('');

  function submit() {
    const id = refNo('HC');
    complaints.add({ id, category, description: desc.trim(), raisedOn: todayIso(), status: 'open', priority: category === 'Ragging (serious)' ? 'critical' : 'normal' });
    setOpen(false); setCategory(''); setDesc('');
    toast.success(`Complaint ${id} registered with the hostel office`);
  }

  const statusStyle = { open: 'bg-[#FEF9EC] text-[#8A6D1F]', in_progress: 'bg-[#EFF6FF] text-[#1D4ED8]', resolved: 'bg-[#D1FAE5] text-[#0E7A5F]' } as const;

  return (
    <div>
      <div className="px-4 py-4 bg-white border-b border-[#D3D8E0]">
        <Button variant="primary" size="lg" className="w-full" onClick={() => setOpen(true)}>Raise Complaint</Button>
      </div>
      <SectionHeader label="My Complaints" />
      <div className="bg-white">
        {!complaints.isLoading && complaints.items.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-[#5A6577]">No complaints raised.</p>}
        {complaints.items.map(c => (
          <div key={c._rid ?? c.id} className="px-4 py-4 border-b border-[#D3D8E0] last:border-0">
            <div className="flex items-start justify-between mb-1 gap-2">
              <div className="flex-1">
                <p className="text-[14px] font-semibold text-[#16264A]">{c.category}{c.priority === 'critical' && <span className="ml-2 text-[11px] text-[#A8242C] font-bold">CRITICAL</span>}</p>
                <p className="text-[12px] text-[#5A6577] mt-0.5"><span className="font-mono">{c.id}</span> · Raised {fmtDate(c.raisedOn)}</p>
              </div>
              <span className={`shrink-0 text-[11px] font-medium px-2 py-1 rounded-full ${statusStyle[c.status]}`}>{c.status === 'in_progress' ? 'In Progress' : c.status === 'resolved' ? 'Resolved' : 'Open'}</span>
            </div>
            <p className="text-[13px] text-[#16264A] mt-2">{c.description}</p>
            {c.response && <p className="text-[13px] text-[#16264A] mt-2 bg-[#EFF6FF] border-l-2 border-[#1D4ED8] px-3 py-2"><span className="text-[11px] text-[#1D4ED8] font-semibold block">Hostel office</span>{c.response}</p>}
          </div>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Raise Complaint"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!category || !desc.trim()}>Submit Complaint</Button></>}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="h-11 px-3 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] bg-white cursor-pointer">
              <option value="">Select category…</option>
              {COMP_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {category === 'Ragging (serious)' && <InlineAlert type="error">Ragging complaints go straight to the Anti-Ragging Committee as critical. In an emergency call the National Anti-Ragging Helpline 1800-180-5522.</InlineAlert>}
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Description</label>
            <textarea rows={4} value={desc} onChange={e => setDesc(e.target.value)} placeholder="Describe the issue — room number, date of occurrence, etc." className="px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[15px] text-[#16264A] outline-none focus:border-[#E0952A] resize-none bg-white" />
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function Hostel({ onNavigate }: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const { data: me } = useStudentRecord();
  const student = me?.name ?? 'Student';
  const allotmentDoc = useDocument<Allotment>('desk:hostel-allotment', { ...HOSTEL, id: 'doc' } as Allotment, { id: 'doc', block: '', room: '', type: '', roommates: [], allotmentDate: '', validTill: '', messBalance: 0, messBill: 0 });
  const allotment = allotmentDoc.value;

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-4 pt-4 pb-0">
        <button onClick={() => onNavigate(null)} className="flex items-center gap-2 text-white/60 hover:text-white mb-3 cursor-pointer">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          <span className="text-[13px]">Back</span>
        </button>
        <h1 className="text-[20px] font-semibold text-white">Hostel</h1>
        <p className="text-[13px] text-white/60 mt-0.5 font-mono">{allotmentDoc.exists ? `${allotment.block} · Room ${allotment.room}` : 'No allotment on record'}</p>
        <div className="flex overflow-x-auto mt-4">
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setActiveTab(i)} className={`shrink-0 px-4 py-3 text-[13px] font-medium whitespace-nowrap cursor-pointer ${activeTab === i ? 'text-[#E0952A] border-b-2 border-[#E0952A]' : 'text-white/60 hover:text-white'}`}>{t}</button>
          ))}
        </div>
      </div>

      {activeTab === 0 && (allotmentDoc.isLoading ? <div className="flex justify-center py-10"><Spinner /></div>
        : allotmentDoc.exists ? <TabRoomAllotment allotment={allotment} onFees={() => onNavigate('fee')} />
        : <div className="p-4"><InlineAlert type="info">You have no hostel room allotted. Allotments are made by the hostel office; once yours is made it appears here.</InlineAlert></div>)}
      {activeTab === 1 && <TabMess />}
      {activeTab === 2 && <TabLeave student={student} />}
      {activeTab === 3 && <TabComplaints />}
      <div className="h-8" />
    </div>
  );
}
