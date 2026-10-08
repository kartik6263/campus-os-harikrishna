import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, InlineAlert, Modal, Spinner, toast } from './ui';
import { api, ApiError } from '../lib/api';

/**
 * The roll call for a class taken as a substitute: the colleague's subject
 * is not on this lecturer's own teaching load, so the sheet is opened by
 * the class itself (its slot and date) rather than by subject.
 */

type Status = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
interface Sheet { sessionId: string; code: string; subject: string; time: string; room: string; markedAt: string | null; locked: boolean; students: Array<{ id: string; rollNo: string; name: string; status: Status | null }> }
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const MARKS: Array<[Status, string, string]> = [['PRESENT', 'P', '#0E7A5F'], ['ABSENT', 'A', '#A8242C'], ['LATE', 'L', '#8A6D1F']];

export default function CoverRollCall({ slotId, date, onClose }: { slotId: string | null; date: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [marks, setMarks] = useState<Record<string, Status>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slotId) return;
    setSheet(null); setError(null); setMarks({});
    (async () => {
      try {
        const s = await api<{ sessionId: string }>(`/api/faculty/classes/${slotId}/session`, { method: 'POST', body: { date } });
        const full = await api<Sheet>(`/api/faculty/sessions/${s.sessionId}/attendance`);
        setSheet(full);
        setMarks(Object.fromEntries(full.students.map((x) => [x.id, x.status ?? 'PRESENT'])));
      } catch (e) { setError(errText(e)); }
    })();
  }, [slotId, date]);

  async function save() {
    if (!sheet) return;
    setSaving(true);
    try {
      await api(`/api/faculty/sessions/${sheet.sessionId}/attendance`, { method: 'POST', body: { records: sheet.students.map((s) => ({ studentId: s.id, status: marks[s.id] ?? 'PRESENT' })) } });
      toast.success('Roll call submitted');
      void qc.invalidateQueries();
      onClose();
    } catch (e) { setError(errText(e)); } finally { setSaving(false); }
  }

  const absent = Object.values(marks).filter((m) => m === 'ABSENT').length;
  return (
    <Modal open={!!slotId} onClose={onClose} title={sheet ? `Roll call — ${sheet.code} (covering)` : 'Roll call'} width="560px"
      footer={<><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" loading={saving} disabled={!sheet || sheet.locked || sheet.students.length === 0} onClick={save}>Submit roll call</Button></>}>
      {error && <InlineAlert type="error">{error}</InlineAlert>}
      {!sheet && !error && <div className="flex justify-center py-10"><Spinner /></div>}
      {sheet && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6577]">{sheet.subject} · {sheet.time} · {sheet.room} · {sheet.students.length} students, {absent} absent</p>
          {sheet.locked && <InlineAlert type="info">This register is locked; corrections go through the class’s own lecturer.</InlineAlert>}
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={sheet.locked} onClick={() => setMarks(Object.fromEntries(sheet.students.map((s) => [s.id, 'PRESENT'])))}>All present</Button>
          </div>
          <div className="max-h-[50vh] overflow-y-auto border border-[#EDEFF3] rounded-[4px]">
            {sheet.students.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#EDEFF3] last:border-0">
                <span className="text-[13px] text-[#16264A]"><span className="font-mono text-[11px] text-[#5A6577] mr-2">{s.rollNo}</span>{s.name}</span>
                <div className="flex gap-1">
                  {MARKS.map(([st, letter, color]) => (
                    <button key={st} disabled={sheet.locked} onClick={() => setMarks({ ...marks, [s.id]: st })}
                      className="w-8 h-8 rounded-[2px] text-[12px] font-bold border cursor-pointer disabled:cursor-not-allowed"
                      style={marks[s.id] === st ? { background: color, color: '#fff', borderColor: color } : { background: '#fff', color, borderColor: '#D3D8E0' }}>{letter}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
