import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkloadList } from '../../lib/governancequeries';
import { api, ApiError } from '../../lib/api';
import { downloadCSV } from '../../lib/export';
import { Button, EmptyState, InlineAlert, Input, Modal, Select, Spinner, toast } from '../../components/ui';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

const SectionLabel = ({ children, right }: { children: string; right?: React.ReactNode }) => (
  <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
    <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{children}</span>
    {right}
  </div>
);

const STATUS_CONFIG = {
  ok: { label: 'Normal', bg: 'bg-[#D1FAE5]', text: 'text-[#065F46]', bar: 'bg-[#0E7A5F]' },
  at_limit: { label: 'At Limit', bg: 'bg-[#FEF3C7]', text: 'text-[#8A6D1F]', bar: 'bg-[#E0952A]' },
  overloaded: { label: 'Overloaded', bg: 'bg-[#FEE2E2]', text: 'text-[#A8242C]', bar: 'bg-[#A8242C]' },
  underloaded: { label: 'Underloaded', bg: 'bg-[#FEF3C7]', text: 'text-[#8A6D1F]', bar: 'bg-[#8A6D1F]' },
};

interface ClassRow { id: string; code: string; name: string; classLabel: string; section: string; kind: string; hours: number }
interface Clash { kind: 'teacher' | 'room'; who: string; day: string; a: string; b: string }

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

/**
 * Teaching load across the college, counted off the timetable. Re-allotting a
 * class moves its allotment, timetable slots and marks sheet to the new teacher
 * in one step, and the clash check reads the live timetable for double bookings.
 */
export default function WorkloadAllocation(_props: Props) {
  const { data: faculty, term, isPending, error } = useWorkloadList();
  const qc = useQueryClient();
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [move, setMove] = useState<{ assignmentId: string; label: string; to: string; reason: string } | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);

  const adjustFaculty = faculty.find(f => f.facultyId === adjustId);
  const classes = useQuery({ queryKey: ['governance', 'workload-classes', adjustId], enabled: !!adjustId, queryFn: () => api<ClassRow[]>(`/api/governance/workload/${adjustId}/classes`) });
  const clashes = useQuery({ queryKey: ['governance', 'clashes'], enabled: checkOpen, queryFn: () => api<{ term: string; slots: number; clashes: Clash[] }>('/api/governance/timetable/clashes') });
  const reassign = useMutation({
    mutationFn: (b: { assignmentId: string; toFacultyId: string; reason: string }) => api<{ moved: number; from: string; to: string }>('/api/governance/workload/reassign', { method: 'POST', body: b }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['governance'] }),
  });

  const counts = {
    ok: faculty.filter(f => f.status === 'ok').length,
    at_limit: faculty.filter(f => f.status === 'at_limit').length,
    overloaded: faculty.filter(f => f.status === 'overloaded').length,
    underloaded: faculty.filter(f => f.status === 'underloaded').length,
  };

  async function doMove() {
    if (!move) return;
    if (!move.to) { toast.error('Choose who takes the class.'); return; }
    if (move.reason.trim().length < 3) { toast.error('Give a short reason for the record.'); return; }
    try {
      const r = await reassign.mutateAsync({ assignmentId: move.assignmentId, toFacultyId: move.to, reason: move.reason.trim() });
      toast.success(`${move.label} moved from ${r.from} to ${r.to} with ${r.moved} timetable slot(s).`);
      setMove(null);
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <div className="flex flex-col bg-[#EDEFF3] min-h-full">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[17px] font-semibold text-[#16264A]">Faculty Workload Allocation</h1>
          <p className="text-[12px] text-[#5A6577]">{term ? `Term ${term}` : ' '} · counted from the timetable</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!faculty.length} onClick={() => downloadCSV('faculty-workload', faculty.map(f => ({ employeeId: f.id, name: f.name, designation: f.designation, department: f.department, weeklyHours: f.weeklyLoad, sanctioned: f.maxLoad, status: STATUS_CONFIG[f.status].label })))}>Export CSV</Button>
          <Button onClick={() => setCheckOpen(true)}>Check timetable clashes</Button>
        </div>
      </div>

      <div className="p-6 flex flex-col gap-6">
        <section>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-[#D3D8E0] bg-white divide-x divide-[#D3D8E0]">
            {(Object.entries(counts) as [keyof typeof counts, number][]).map(([k, v]) => (
              <div key={k} className="p-4">
                <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider mb-2">{STATUS_CONFIG[k].label}</div>
                <div className={`text-[32px] font-bold leading-none ${STATUS_CONFIG[k].text}`}>{v}</div>
                <div className="text-[12px] text-[#5A6577] mt-1">faculty</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-[#D3D8E0]">
          <SectionLabel>Faculty Workload</SectionLabel>
          {isPending ? <div className="flex justify-center py-12"><Spinner size={22} /></div>
            : error ? <div className="p-4"><InlineAlert type="error">{errText(error)}</InlineAlert></div>
            : faculty.length === 0 ? <div className="p-6"><EmptyState title="No faculty on record" /></div> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
                    {['Name', 'Designation', 'Dept.', 'Classes', 'Load / Max', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D3D8E0]">
                  {faculty.map(f => {
                    const cfg = STATUS_CONFIG[f.status];
                    const pct = f.maxLoad ? Math.min(100, Math.round((f.weeklyLoad / f.maxLoad) * 100)) : 0;
                    return (
                      <tr key={f.id} className="hover:bg-[#F7F8FA]">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#16264A]">{f.name}</div>
                          <code className="text-[10px] text-[#9CA3AF] font-mono">{f.id}</code>
                          {f.status === 'overloaded' && <div className="text-[11px] text-[#A8242C] mt-1">{(f.weeklyLoad - f.maxLoad).toFixed(1)}h over the sanctioned load</div>}
                        </td>
                        <td className="px-4 py-3 text-[#5A6577]">{f.designation}</td>
                        <td className="px-4 py-3 text-[#5A6577]">{f.department}</td>
                        <td className="px-4 py-3 tabular-nums">{f.subjects.length}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2"><span className={`font-semibold ${f.status === 'overloaded' ? 'text-[#A8242C]' : 'text-[#16264A]'}`}>{f.weeklyLoad}h</span><span className="text-[#5A6577]">/ {f.maxLoad}h</span></div>
                          <div className="mt-1.5 h-1.5 bg-[#EDEFF3] rounded-[2px] overflow-hidden w-24"><div className={`h-full ${cfg.bar}`} style={{ width: `${pct}%` }} /></div>
                        </td>
                        <td className="px-4 py-3"><span className={`text-[11px] font-semibold px-2 py-1 rounded-[3px] ${cfg.bg} ${cfg.text}`}>{cfg.label}</span></td>
                        <td className="px-4 py-3"><Button size="sm" variant="secondary" onClick={() => setAdjustId(f.facultyId)}>Classes</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Modal open={!!adjustFaculty} onClose={() => setAdjustId(null)} title={adjustFaculty ? `Classes — ${adjustFaculty.name}` : ''} width="620px" footer={<Button variant="secondary" size="sm" onClick={() => setAdjustId(null)}>Close</Button>}>
        {adjustFaculty && (
          <div className="flex flex-col gap-3">
            <div className="p-3 bg-[#EDEFF3] rounded-[2px] text-[13px]"><span className="text-[#5A6577]">Load </span><strong className="text-[#16264A]">{adjustFaculty.weeklyLoad}h / {adjustFaculty.maxLoad}h</strong></div>
            {classes.isLoading ? <Spinner size={18} /> : classes.isError ? <InlineAlert type="error">{errText(classes.error)}</InlineAlert> : !classes.data?.length ? <p className="text-[13px] text-[#5A6577]">No classes allotted this term.</p> : (
              <div className="border border-[#D3D8E0] divide-y divide-[#EDEFF3]">
                {classes.data.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1"><p className="text-[13px] text-[#16264A]"><span className="font-mono text-[12px]">{c.code}</span> {c.name}</p><p className="text-[11px] text-[#5A6577]">{c.classLabel} · {c.kind.toLowerCase()} · {c.hours}h/week</p></div>
                    <Button size="sm" variant="secondary" onClick={() => setMove({ assignmentId: c.id, label: `${c.code} ${c.classLabel}`, to: '', reason: '' })}>Re-allot</Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!move} onClose={() => setMove(null)} title={`Re-allot ${move?.label ?? ''}`} footer={<><Button variant="secondary" size="sm" onClick={() => setMove(null)}>Cancel</Button><Button size="sm" loading={reassign.isPending} onClick={() => void doMove()}>Re-allot</Button></>}>
        <div className="flex flex-col gap-3">
          <Select label="To" value={move?.to ?? ''} onChange={e => move && setMove({ ...move, to: e.target.value })}>
            <option value="">Choose a teacher…</option>
            {faculty.filter(f => f.facultyId !== adjustId).map(f => <option key={f.facultyId} value={f.facultyId}>{f.name} — {f.weeklyLoad}h / {f.maxLoad}h</option>)}
          </Select>
          <Input label="Reason (for the record)" value={move?.reason ?? ''} onChange={e => move && setMove({ ...move, reason: e.target.value })} />
          <p className="text-[12px] text-[#5A6577]">The class's timetable slots and internal-marks sheet move with it. It is refused if the new teacher is already teaching at any of those hours.</p>
        </div>
      </Modal>

      <Modal open={checkOpen} onClose={() => setCheckOpen(false)} title="Timetable clash check" width="620px" footer={<><Button variant="secondary" size="sm" onClick={() => setCheckOpen(false)}>Close</Button><Button size="sm" loading={clashes.isFetching} onClick={() => void clashes.refetch()}>Re-check</Button></>}>
        {clashes.isLoading ? <div className="flex justify-center py-6"><Spinner size={22} /></div>
          : clashes.isError ? <InlineAlert type="error">{errText(clashes.error)}</InlineAlert>
          : clashes.data && (clashes.data.clashes.length === 0
            ? <InlineAlert type="success">No clashes in {clashes.data.slots} timetable slots for term {clashes.data.term}. No teacher or room is double-booked.</InlineAlert>
            : <div className="flex flex-col gap-2">
                <InlineAlert type="error">{clashes.data.clashes.length} clash(es) in term {clashes.data.term}. Re-allot a class or move a slot in the timetable to clear each one.</InlineAlert>
                <div className="border border-[#D3D8E0] divide-y divide-[#EDEFF3] max-h-[340px] overflow-y-auto">
                  {clashes.data.clashes.map((c, i) => <div key={i} className="px-3 py-2 text-[13px]"><span className="font-semibold text-[#16264A]">{c.kind === 'teacher' ? 'Teacher' : 'Room'} {c.who}</span><span className="text-[#5A6577]"> · {c.day} · {c.a} overlaps {c.b}</span></div>)}
                </div>
              </div>)}
      </Modal>
    </div>
  );
}
