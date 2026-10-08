import { useEffect, useState } from 'react';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';
import { downloadCSV } from '../../lib/export';
import { DAYS, post, put, rupees, useBillRuns, useHostelAction, useMenu, useOverview, when, type MenuDay } from '../../lib/hostel';
import { HostelPicker, Panel, Th, errText, useHostelRole } from './common';

const blank = (day: number): MenuDay => ({ day, breakfast: '', lunch: '', snacks: '', dinner: '' });

export function MessTab() {
  const overview = useOverview();
  const { canOps, canSetup } = useHostelRole();
  const hostels = overview.data?.hostels ?? [];
  const [hostelId, setHostelId] = useState('');
  useEffect(() => { if (!hostelId && hostels[0]) setHostelId(hostels[0].id); }, [hostels, hostelId]);
  const menu = useMenu(hostelId || null);
  const [draft, setDraft] = useState<MenuDay[] | null>(null);
  const save = useHostelAction((days: MenuDay[]) => put('/mess/menu', { hostelId, days: days.map(({ day, breakfast, lunch, snacks, dinner }) => ({ day, breakfast: breakfast.trim(), lunch: lunch.trim(), snacks: snacks.trim(), dinner: dinner.trim() })) }));
  const [billing, setBilling] = useState(false);
  const runs = useBillRuns();
  const hostel = hostels.find((h) => h.id === hostelId);
  const week = DAYS.map((_, i) => menu.data?.find((m) => m.day === i) ?? blank(i));
  const editing = draft !== null;
  const rows = editing ? draft : week;
  const incomplete = editing && draft.some((d) => d.breakfast.trim().length < 2 || d.lunch.trim().length < 2 || d.dinner.trim().length < 2);
  const today = new Date().getDay();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <HostelPicker hostels={hostels} value={hostelId} onChange={(v) => { setHostelId(v); setDraft(null); }} />
        {hostel && <p className="text-[13px] text-[#5A6577] pb-2">Mess charge {hostel.messRatePerMonth ? `${rupees(hostel.messRatePerMonth)} per resident per month` : 'not set'}{canSetup ? ' — change it under Overview → Edit' : ''}</p>}
        <div className="flex-1" />
        {canSetup && hostelId && <Button size="sm" onClick={() => setBilling(true)}>Run billing…</Button>}
      </div>
      <Panel title="This week's menu" action={canOps && hostelId ? (editing
        ? <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => setDraft(null)}>Cancel</Button><Button size="sm" loading={save.isPending} disabled={incomplete} onClick={() => save.mutate(draft, { onSuccess: () => { toast.success('Menu published — residents see it now'); setDraft(null); }, onError: (e) => toast.error(errText(e)) })}>Publish</Button></div>
        : <Button size="sm" variant="secondary" onClick={() => setDraft(week.map((d) => ({ ...d })))}>Edit menu</Button>) : undefined}>
        {!hostelId ? <div className="p-6"><EmptyState title="Add a hostel first" /></div> : menu.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : menu.isError ? <div className="p-4"><InlineAlert type="error">{errText(menu.error)}</InlineAlert></div> : (
          <>
            {!editing && (menu.data ?? []).length === 0 && <div className="px-4 pt-3"><InlineAlert type="info">No menu published yet. Residents see the menu once it is published.</InlineAlert></div>}
            {incomplete && <div className="px-4 pt-3"><InlineAlert type="warning">Every day needs breakfast, lunch and dinner before it can be published; snacks are optional.</InlineAlert></div>}
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Day</Th><Th>Breakfast</Th><Th>Lunch</Th><Th>Snacks</Th><Th>Dinner</Th></tr></thead>
                <tbody>{rows.map((d, i) => (
                  <tr key={d.day} className={`border-b border-[#EDEFF3] align-top ${d.day === today ? 'bg-[#FEF9EC]' : ''}`}>
                    <td className="px-3 py-2 font-medium text-[#16264A] whitespace-nowrap">{DAYS[d.day]}{d.day === today ? ' (today)' : ''}</td>
                    {(['breakfast', 'lunch', 'snacks', 'dinner'] as const).map((meal) => (
                      <td key={meal} className="px-3 py-2">
                        {editing
                          ? <input value={d[meal]} maxLength={300} onChange={(e) => setDraft(draft!.map((x, j) => (j === i ? { ...x, [meal]: e.target.value } : x)))} className="w-full min-w-[150px] h-8 px-2 text-[12px] border border-[#D3D8E0] rounded-[4px]" />
                          : <span className={d[meal] ? 'text-[#16264A]' : 'text-[#9AA3B2]'}>{d[meal] || '—'}</span>}
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
      <Panel title="Billing runs" action={(runs.data ?? []).length > 0 ? <Button size="sm" variant="secondary" onClick={() => downloadCSV('hostel-bill-runs', runs.data!.map((r) => ({ hostel: r.hostel.code, kind: r.kind, period: r.period, rate: r.rate ?? 'per room', charged: r.charged, skipped: r.skipped, total: r.total, by: r.runBy, at: r.createdAt.slice(0, 16) })))}>Export CSV</Button> : undefined}>
        {runs.isLoading ? <div className="p-6 flex justify-center"><Spinner /></div> : runs.isError ? <div className="p-4"><InlineAlert type="error">{errText(runs.error)}</InlineAlert></div> : (runs.data ?? []).length === 0 ? <div className="p-6"><EmptyState title="Nothing billed yet" description="Mess bills are run monthly and room rent once a term; each charge goes onto the resident's fee account." /></div> : (
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Hostel</Th><Th>For</Th><Th>Charged</Th><Th>Total</Th><Th>Run by</Th></tr></thead>
            <tbody>{runs.data!.map((r) => (
              <tr key={r.id} className="border-b border-[#EDEFF3]">
                <td className="px-3 py-2">{r.hostel.name}</td>
                <td className="px-3 py-2">{r.kind === 'MESS' ? 'Mess' : 'Room rent'} · {r.period}</td>
                <td className="px-3 py-2 tabular-nums">{r.charged}{r.skipped ? <span className="text-[#5A6577]"> ({r.skipped} skipped)</span> : null}</td>
                <td className="px-3 py-2 tabular-nums">{rupees(r.total)}</td>
                <td className="px-3 py-2 text-[12px]">{r.runBy}<p className="text-[11px] text-[#5A6577]">{when(r.createdAt)}</p></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Panel>
      {billing && hostel && <BillingRun hostelId={hostel.id} hostelName={hostel.name} messRate={hostel.messRatePerMonth} onClose={() => setBilling(false)} />}
    </div>
  );
}

function BillingRun({ hostelId, hostelName, messRate, onClose }: { hostelId: string; hostelName: string; messRate: number; onClose: () => void }) {
  const now = new Date();
  const [kind, setKind] = useState<'MESS' | 'RENT'>('MESS');
  const [month, setMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [dueDate, setDueDate] = useState(new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10));
  const run = useHostelAction(() => post<{ charged: number; skipped: number; total: number; period: string }>('/billing', { hostelId, kind, ...(kind === 'MESS' ? { month } : {}), dueDate }));
  const blocked = kind === 'MESS' && messRate <= 0;
  return (
    <Modal open onClose={onClose} title={`Billing — ${hostelName}`}
      footer={<><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={run.isPending} disabled={blocked || !dueDate || (kind === 'MESS' && !month)} onClick={() => run.mutate(undefined, { onSuccess: (r) => { toast.success(`${r.period}: ${r.charged} resident${r.charged === 1 ? '' : 's'} charged ${rupees(r.total)}${r.skipped ? `, ${r.skipped} skipped` : ''}`); onClose(); }, onError: (e) => toast.error(errText(e)) })}>Charge residents</Button></>}>
      <div className="space-y-3">
        <Select label="Charge" value={kind} onChange={(e) => setKind(e.target.value as 'MESS' | 'RENT')}><option value="MESS">Mess bill for a month</option><option value="RENT">Room rent for the current term</option></Select>
        {kind === 'MESS' && <Input label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />}
        <Input label="Due by" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        {blocked ? <InlineAlert type="warning">This hostel has no mess charge set. Set it under Overview → Edit first.</InlineAlert>
          : <InlineAlert type="info">{kind === 'MESS' ? `Every current resident is charged ${rupees(messRate)}` : "Every current resident is charged their room's rent per semester"}, as a head on their fee account with this due date, and notified. A period is billed once per hostel; anyone already carrying the charge is skipped.</InlineAlert>}
      </div>
    </Modal>
  );
}
