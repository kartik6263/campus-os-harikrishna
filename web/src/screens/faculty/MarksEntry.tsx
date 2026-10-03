import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Button, Modal, InlineAlert, Spinner, StatusPill, toast } from '../../components/ui';
import {
  useMarksData,
  useMySubjects,
  useSaveMarks,
  useSubmitMarks,
  type LegacyMarksComponent as MarksComponent,
  type LegacySubjectMarks,
} from '../../lib/facultyqueries';

interface Props {
  onNavigate: (s: any) => void;
  onModule: (m: string) => void;
}

type MarksDataType = Record<string, LegacySubjectMarks>;

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  not_started: { label: 'Not Started', bg: '#F1F5F9', color: '#5A6577' },
  draft:        { label: 'Draft',       bg: '#FEF9EC', color: '#8A6D1F' },
  submitted:    { label: 'Submitted',   bg: '#EFF6FF', color: '#1D4ED8' },
  approved:     { label: 'Approved ✓',  bg: '#D1FAE5', color: '#0E7A5F' },
  returned:     { label: 'Returned',    bg: '#FEE2E2', color: '#A8242C' },
};

export default function MarksEntry({ onNavigate, onModule }: Props) {
  const { data: MY_SUBJECTS } = useMySubjects();
  const { data: MARKS_DATA } = useMarksData(MY_SUBJECTS);
  const saveMarks = useSaveMarks();
  const submitMarks = useSubmitMarks();

  const [subject, setSubject] = useState<string | null>(null);
  const selectedSubject = subject ?? MY_SUBJECTS[0]?.code ?? '';
  const setSelectedSubject = setSubject;

  // The grid is edited locally and pushed on save, so typing stays responsive
  // and a half-filled column is never sent. It re-seeds whenever the server
  // copy changes — after a save, a submit, or an approval.
  const [marksState, setMarksState] = useState<MarksDataType>({});
  useEffect(() => {
    setMarksState(structuredClone(MARKS_DATA));
  }, [MARKS_DATA]);
  const [editCell, setEditCell] = useState<{ rollNo: string; component: string } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'submitting'>('idle');
  const [hodApprovalOpen, setHodApprovalOpen] = useState(false);
  const [submitAnywayOpen, setSubmitAnywayOpen] = useState(false);
  const [returnReason] = useState('');

  const subjectData = marksState[selectedSubject];
  const subjectInfo = MY_SUBJECTS.find(s => s.code === selectedSubject);
  // The components are whatever the sheet was opened with, not a template —
  // changing the template later must not rescale marks already entered.
  const components: MarksComponent[] = subjectData?.components ?? [];

  // Derived stats
  const stats = useMemo(() => {
    if (!subjectData || subjectData.students.length === 0) return null;
    const compStats = components.map(comp => {
      const vals = subjectData.students
        .map(s => s.marks[comp.id])
        .filter((v): v is number => v !== null && v !== undefined);
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const high = vals.length ? Math.max(...vals) : 0;
      const low = vals.length ? Math.min(...vals) : 0;
      return { id: comp.id, avg: avg.toFixed(1), high, low };
    });
    const incomplete = subjectData.students.filter(s =>
      components.some(c => s.marks[c.id] === null || s.marks[c.id] === undefined)
    ).length;
    return { compStats, incomplete };
  }, [subjectData, components]);

  const getTotal = (marks: Record<string, number | null>) =>
    components.reduce((sum, c) => sum + (marks[c.id] ?? 0), 0);

  const hasInvalid = useMemo(() => {
    if (!subjectData) return false;
    return subjectData.students.some(s =>
      components.some(c => {
        const v = s.marks[c.id];
        return v !== null && v !== undefined && v > c.maxMarks;
      })
    );
  }, [subjectData, components]);

  function updateMark(rollNo: string, compId: string, value: string) {
    const num = value === '' ? null : Number(value);
    setMarksState(prev => {
      const next = { ...prev };
      next[selectedSubject] = {
        ...next[selectedSubject],
        students: next[selectedSubject].students.map(s =>
          s.rollNo === rollNo
            ? { ...s, marks: { ...s.marks, [compId]: num } }
            : s
        ),
      };
      return next;
    });
  }

  async function saveDraft() {
    if (hasInvalid) { toast.error('Fix invalid marks before saving.'); return; }
    if (!subjectData) return;
    setSaveState('saving');
    try {
      const entries = subjectData.students.flatMap(s =>
        components.map(c => ({
          studentId: s.studentId,
          component: c.id,
          value: s.marks[c.id] ?? null,
        })),
      );
      await saveMarks.mutateAsync({ assignmentId: subjectData.assignmentId, entries });
      setSaveState('saved');
      toast.success('Draft saved successfully.');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch (err) {
      setSaveState('idle');
      toast.error(err instanceof Error ? err.message : 'Could not save the marks.');
    }
  }

  function handleSubmitIntent() {
    if (hasInvalid) { toast.error('Fix invalid marks before submitting.'); return; }
    if (stats && stats.incomplete > 0) {
      setSubmitAnywayOpen(true);
    } else {
      setHodApprovalOpen(true);
    }
  }

  async function doSubmit() {
    setHodApprovalOpen(false);
    setSubmitAnywayOpen(false);
    if (!subjectData) return;
    setSaveState('submitting');
    try {
      // Save first: the sheet the head of department sees must be the one on
      // screen, not the last draft that happened to be pushed.
      const entries = subjectData.students.flatMap(s =>
        components.map(c => ({
          studentId: s.studentId,
          component: c.id,
          value: s.marks[c.id] ?? null,
        })),
      );
      await saveMarks.mutateAsync({ assignmentId: subjectData.assignmentId, entries });
      await submitMarks.mutateAsync(subjectData.assignmentId);
      toast.success('Marks submitted to HOD for approval.');
    } catch (err) {
      // An incomplete sheet is refused by name, which is more useful than a
      // generic failure — the message lists who is missing a mark.
      toast.error(err instanceof Error ? err.message : 'Could not submit the marks.');
    } finally {
      setSaveState('idle');
    }
  }

  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleCellKeyDown = useCallback(
    (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const totalCols = components.length;
        const students = subjectData?.students ?? [];
        let nextCol = colIdx + (e.shiftKey ? -1 : 1);
        let nextRow = rowIdx;
        if (nextCol >= totalCols) { nextCol = 0; nextRow = rowIdx + 1; }
        if (nextCol < 0) { nextCol = totalCols - 1; nextRow = rowIdx - 1; }
        if (nextRow >= 0 && nextRow < students.length) {
          setEditCell({ rollNo: students[nextRow].rollNo, component: components[nextCol].id });
        }
      }
    },
    [components, subjectData]
  );

  const currentStatus = subjectData?.status ?? 'not_started';

  return (
    <div className="flex h-full min-h-0 bg-[#EDEFF3]">
      {/* Left: Subject List */}
      <div className="w-56 shrink-0 bg-white border-r border-[#D3D8E0] flex flex-col">
        <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">SUBJECTS</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {MY_SUBJECTS.map(sub => {
            const data = marksState[sub.code];
            const status = data?.status ?? 'not_started';
            const badge = STATUS_BADGE[status];
            const active = selectedSubject === sub.code;
            return (
              <button
                key={sub.code}
                onClick={() => setSelectedSubject(sub.code)}
                className={`w-full text-left px-4 py-3 border-b border-[#D3D8E0] transition-colors cursor-pointer ${active ? 'bg-[#FEF9EC] border-l-2 border-l-[#E0952A]' : 'hover:bg-[#EDEFF3]'}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-[#16264A] truncate">{sub.name}</p>
                    <p className="text-[11px] font-mono text-[#5A6577]">{sub.code}</p>
                    <p className="text-[11px] text-[#5A6577] mt-0.5">{sub.classLabel}</p>
                  </div>
                </div>
                <div className="mt-2">
                  <span
                    className="inline-block px-2 py-0.5 rounded-[2px] text-[10px] font-semibold"
                    style={{ background: badge.bg, color: badge.color }}
                  >
                    {badge.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Marks Entry */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="bg-white border-b border-[#D3D8E0] px-6 py-3 flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 className="text-[16px] font-semibold text-[#16264A]">
              {subjectInfo?.name ?? selectedSubject}
            </h2>
            <p className="text-[12px] text-[#5A6577] font-mono">{selectedSubject} · {subjectInfo?.classLabel} · {subjectInfo?.totalStudents} students</p>
          </div>
          {/* Status */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#5A6577]">Status:</span>
            <span
              className="px-2 py-0.5 rounded-[2px] text-[11px] font-semibold"
              style={{
                background: STATUS_BADGE[currentStatus].bg,
                color: STATUS_BADGE[currentStatus].color,
              }}
            >
              {STATUS_BADGE[currentStatus].label}
            </span>
          </div>
          {saveState === 'saving' && (
            <span className="flex items-center gap-1 text-[13px] text-[#5A6577]">
              <Spinner size={12} /> Saving…
            </span>
          )}
          {saveState === 'saved' && (
            <span className="text-[13px] text-[#0E7A5F] font-medium">Saved ✓</span>
          )}
          {currentStatus !== 'submitted' && currentStatus !== 'approved' && (
            <>
              <Button variant="secondary" size="sm" onClick={saveDraft} disabled={saveState !== 'idle'}>
                Save Draft
              </Button>
              {currentStatus !== 'returned' ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSubmitIntent}
                  loading={saveState === 'submitting'}
                >
                  Submit for HOD Approval
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleSubmitIntent} loading={saveState === 'submitting'}>
                  Resubmit
                </Button>
              )}
            </>
          )}
        </div>

        {/* Returned banner */}
        {currentStatus === 'returned' && subjectData?.returnReason && (
          <div className="mx-6 mt-4">
            <InlineAlert type="error">
              <strong>Returned by HOD:</strong> {subjectData.returnReason}
            </InlineAlert>
          </div>
        )}

        {/* Approved banner */}
        {currentStatus === 'approved' && (
          <div className="mx-6 mt-4">
            <InlineAlert type="success">
              Marks approved by {subjectData?.approvedBy ?? 'HOD'}. No further edits allowed.
            </InlineAlert>
          </div>
        )}

        {/* Submitted banner */}
        {currentStatus === 'submitted' && (
          <div className="mx-6 mt-4">
            <InlineAlert type="info">
              Marks submitted on {subjectData?.submittedOn}. Awaiting HOD approval.
            </InlineAlert>
          </div>
        )}

        {/* Not started empty */}
        {currentStatus === 'not_started' && (!subjectData || subjectData.students.length === 0) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-12 h-12 rounded-full bg-[#EDEFF3] flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            </div>
            <p className="text-[15px] font-medium text-[#16264A]">No marks data yet</p>
            <p className="text-[13px] text-[#5A6577] mt-1">Students will appear here once the roster is loaded.</p>
          </div>
        ) : (
          <>
            {/* Scrollable table */}
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-[13px] border-collapse">
                <thead className="sticky top-0 z-10 bg-[#EDEFF3]">
                  <tr>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#D3D8E0] w-20">Roll No.</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#D3D8E0]">Name</th>
                    {components.map(comp => (
                      <th key={comp.id} className="text-center px-2 py-2 border-b border-[#D3D8E0] min-w-[90px]">
                        <div className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{comp.label}</div>
                        <div className="text-[10px] text-[#5A6577] font-normal">/{comp.maxMarks}</div>
                      </th>
                    ))}
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#D3D8E0]">Total</th>
                    <th className="text-center px-3 py-3 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#D3D8E0] w-16">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {(subjectData?.students ?? []).map((student, rowIdx) => {
                    const total = getTotal(student.marks);
                    const maxTotal = components.reduce((s, c) => s + c.maxMarks, 0);
                    const hasNull = components.some(c => student.marks[c.id] === null || student.marks[c.id] === undefined);
                    const hasOver = components.some(c => {
                      const v = student.marks[c.id];
                      return v !== null && v !== undefined && v > c.maxMarks;
                    });
                    return (
                      <tr key={student.rollNo} className="border-b border-[#D3D8E0] hover:bg-[#EDEFF3]/50">
                        <td className="px-4 py-2 font-mono text-[12px] text-[#5A6577]">{student.rollNo}</td>
                        <td className="px-4 py-2 font-medium text-[#16264A]">{student.name}</td>
                        {components.map((comp, colIdx) => {
                          const val = student.marks[comp.id];
                          const isEditing = editCell?.rollNo === student.rollNo && editCell?.component === comp.id;
                          const isOver = val !== null && val !== undefined && val > comp.maxMarks;
                          const isEmpty = val === null || val === undefined;
                          const isLocked = currentStatus === 'submitted' || currentStatus === 'approved';
                          return (
                            <td key={comp.id} className="px-2 py-1 text-center">
                              {isLocked ? (
                                <span className={`inline-block px-2 py-1 rounded-[2px] font-mono text-[13px] ${isEmpty ? 'bg-amber-50 text-amber-700' : isOver ? 'bg-red-50 text-red-700' : 'text-[#16264A]'}`}>
                                  {val ?? '—'}
                                </span>
                              ) : (
                                <div className="relative flex justify-center">
                                  <input
                                    ref={isEditing ? inputRef : undefined}
                                    type="number"
                                    min={0}
                                    max={comp.maxMarks}
                                    value={val ?? ''}
                                    onFocus={() => setEditCell({ rollNo: student.rollNo, component: comp.id })}
                                    onBlur={() => setEditCell(null)}
                                    onChange={e => updateMark(student.rollNo, comp.id, e.target.value)}
                                    onKeyDown={e => handleCellKeyDown(e, rowIdx, colIdx)}
                                    className={`w-16 h-8 text-center font-mono text-[13px] border rounded-[4px] outline-none transition-colors
                                      ${isOver ? 'border-[#A8242C] bg-red-50 text-[#A8242C]' : isEmpty ? 'border-[#D3D8E0] bg-amber-50' : 'border-[#D3D8E0] bg-white text-[#16264A]'}
                                      focus:border-[#E0952A]`}
                                  />
                                  {isOver && (
                                    <span className="absolute -top-5 left-1/2 -translate-x-1/2 bg-[#A8242C] text-white text-[10px] px-1.5 py-0.5 rounded-[2px] whitespace-nowrap z-10">
                                      Max {comp.maxMarks}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-center">
                          <span className={`font-mono text-[13px] font-semibold ${hasOver ? 'text-[#A8242C]' : hasNull ? 'text-[#8A6D1F]' : 'text-[#16264A]'}`}>
                            {hasNull ? '—' : total}/{maxTotal}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {hasOver && (
                            <span title="Invalid marks" className="text-[#A8242C] text-[14px]">⚠</span>
                          )}
                          {!hasOver && hasNull && (
                            <span title="Incomplete" className="text-[#8A6D1F] text-[14px]">○</span>
                          )}
                          {!hasOver && !hasNull && (
                            <span className="text-[#0E7A5F] text-[14px]">✓</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Statistics footer */}
            {stats && (
              <div className="shrink-0 bg-[#EDEFF3] border-t border-[#D3D8E0]">
                <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">CLASS STATISTICS</span>
                  {stats.incomplete > 0 && (
                    <span className="text-[11px] text-[#8A6D1F] font-medium">
                      {stats.incomplete} student{stats.incomplete > 1 ? 's' : ''} with incomplete marks
                    </span>
                  )}
                </div>
                <div className="px-4 pb-3 overflow-x-auto">
                  <table className="text-[12px]">
                    <thead>
                      <tr>
                        <td className="pr-6 text-[#5A6577] font-medium w-28">Component</td>
                        {components.map(c => (
                          <td key={c.id} className="text-center px-4 font-semibold text-[#16264A] min-w-[90px]">{c.label}</td>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {['avg', 'high', 'low'].map(key => (
                        <tr key={key}>
                          <td className="pr-6 text-[#5A6577] capitalize">{key === 'avg' ? 'Average' : key === 'high' ? 'Highest' : 'Lowest'}</td>
                          {stats.compStats.map(cs => (
                            <td key={cs.id} className="text-center px-4 font-mono text-[#16264A]">
                              {key === 'avg' ? cs.avg : key === 'high' ? cs.high : cs.low}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* HOD Approval Modal */}
      <Modal
        open={hodApprovalOpen}
        onClose={() => setHodApprovalOpen(false)}
        title="Submit Marks for HOD Approval"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHodApprovalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={doSubmit}>Submit for Approval</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <InlineAlert type="warning">
            Once submitted, you cannot edit marks until the HOD returns them.
          </InlineAlert>
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-[#16264A]">You are submitting internal marks for:</p>
            <div className="bg-[#EDEFF3] rounded-[4px] px-4 py-3 flex flex-col gap-1">
              <p className="font-semibold text-[#16264A]">{subjectInfo?.name}</p>
              <p className="text-[13px] font-mono text-[#5A6577]">{selectedSubject} · {subjectInfo?.classLabel}</p>
              <p className="text-[13px] text-[#5A6577]">{subjectData?.students.length ?? 0} students · {components.length} components</p>
            </div>
          </div>
          <div className="bg-[#EDEFF3] rounded-[4px] px-4 py-3">
            <p className="text-[12px] text-[#5A6577]">Approval path</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[13px] font-medium text-[#16264A]">You</span>
              <span className="text-[#D3D8E0]">→</span>
              <span className="text-[13px] font-medium text-[#16264A]">Prof. M.L. Gupta (HOD)</span>
            </div>
          </div>
        </div>
      </Modal>

      {/* Submit anyway Modal */}
      <Modal
        open={submitAnywayOpen}
        onClose={() => setSubmitAnywayOpen(false)}
        title="Incomplete Marks"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSubmitAnywayOpen(false)}>Go Back</Button>
            <Button variant="primary" onClick={doSubmit}>Submit Anyway</Button>
          </>
        }
      >
        <InlineAlert type="warning">
          <strong>{stats?.incomplete} student{(stats?.incomplete ?? 0) > 1 ? 's' : ''}</strong> have incomplete marks. Submitting now will leave those cells blank.
          You can request the HOD to return the sheet for corrections later.
        </InlineAlert>
      </Modal>
    </div>
  );
}
