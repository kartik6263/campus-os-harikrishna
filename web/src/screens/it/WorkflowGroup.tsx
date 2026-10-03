import { useState } from 'react';
import { Button, Modal, InlineAlert, StatusPill, Toggle, Spinner, toast } from '../../components/ui';
import { WORKFLOWS, type Workflow, type WorkflowStep } from '../../lib/itdata';
import { useCollection, type Stored } from '../../lib/records';
import { useProvisioningOptions } from '../../lib/itqueries';
import { useAuth, displayName } from '../../lib/auth';

/** A workflow as the register keeps it: the live chain plus every earlier version. */
type StoredWorkflow = Workflow & { appliesTo?: string; history?: Array<{ version: number; steps: WorkflowStep[]; trigger: string; savedAt: string; by: string }> };

const TRIGGER_LABELS: Record<string, string> = {
  certificate_request: 'Certificate Request Submitted',
  hostel_application: 'Hostel Application Submitted',
  fee_waiver_request: 'Fee Waiver Request',
  affiliation_renewal: 'Affiliation Renewal Filed',
  exam_form_correction: 'Exam Form Correction Requested',
  leave_application: 'Leave Application Submitted',
  result_publication: 'Result Publication Initiated',
};

const STEP_COLORS = {
  approver: { bg: '#EFF6FF', border: '#93C5FD', dot: '#3B82F6', label: 'Approver' },
  condition: { bg: '#FEF9EC', border: '#FDE68A', dot: '#E0952A', label: 'Condition' },
  notification: { bg: '#D1FAE5', border: '#6EE7B7', dot: '#0E7A5F', label: 'Notification' },
};

const ROLE_OPTIONS = ['College Admin', 'Faculty', 'HOD', 'Principal', 'Accounts Clerk', 'Hostel Warden', 'Exam Controller', 'Registrar', 'IT Cell Admin'];
const SCOPE_OPTIONS = ['SELF', 'OWN_DEPARTMENT', 'OWN_COLLEGE', 'COLLEGE_GROUP', 'UNIVERSITY_WIDE'];

interface Props {
  subScreen: string;
  onSub: (s: string) => void;
}

export default function WorkflowGroup(_props: Props) {
  const { user } = useAuth();
  const me = displayName(user) || 'IT Cell';
  const register = useCollection<StoredWorkflow>('it:workflows', WORKFLOWS);
  const options = useProvisioningOptions();
  const workflows = register.items;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = (workflows.find(w => w.id === selectedId) ?? workflows[0]) as Stored<StoredWorkflow> | undefined;
  const [editMode, setEditMode] = useState(false);
  const [editSteps, setEditSteps] = useState<WorkflowStep[]>([]);
  const [editTrigger, setEditTrigger] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [addStepOpen, setAddStepOpen] = useState(false);
  const [newStepType, setNewStepType] = useState<WorkflowStep['type']>('approver');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ name: '', trigger: 'certificate_request' });
  const stamp = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

  if (register.isLoading || !selected) {
    return <div className="flex-1 flex items-center justify-center py-16">{register.isLoading ? <Spinner /> : <Button onClick={() => setCreateOpen(true)}>Create the first workflow</Button>}</div>;
  }

  function selectWorkflow(wf: StoredWorkflow) {
    setSelectedId(wf.id);
    setEditSteps(wf.steps);
    setEditMode(false);
  }

  function toggleEnabled() {
    register.update(selected!.id, { enabled: !selected!.enabled });
    toast.success(`${selected!.name} ${selected!.enabled ? 'disabled' : 'enabled'}`);
  }

  function startEdit() {
    setEditSteps(selected!.steps);
    setEditTrigger(selected!.trigger);
    setEditMode(true);
  }

  function addStep(type: WorkflowStep['type']) {
    const newStep: WorkflowStep = type === 'approver'
      ? { id: `s${Date.now()}`, type: 'approver', role: 'Principal', scope: 'OWN_COLLEGE', sla: 3, escalateTo: 'Registrar', notifyOn: ['approve', 'reject'], label: 'New Approver Step' }
      : type === 'condition'
      ? { id: `s${Date.now()}`, type: 'condition', condition: 'Enter condition expression', label: 'New Condition' }
      : { id: `s${Date.now()}`, type: 'notification', notifyOn: ['sms', 'portal'], label: 'Notify' };

    setEditSteps(prev => [...prev.slice(0, -1), newStep, prev[prev.length - 1]]);
    setAddStepOpen(false);
  }

  function removeStep(id: string) {
    setEditSteps(prev => prev.filter(s => s.id !== id));
  }

  function updateStep(id: string, patch: Partial<WorkflowStep>) {
    setEditSteps(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function saveWorkflow() {
    const s = selected!;
    register.update(s.id, {
      steps: editSteps,
      trigger: editTrigger as Workflow['trigger'],
      version: s.version + 1,
      updatedAt: stamp(),
      createdBy: me,
      history: [...(s.history ?? []), { version: s.version, steps: s.steps, trigger: s.trigger, savedAt: s.updatedAt, by: s.createdBy }],
    });
    toast.success(`${s.name} saved as version ${s.version + 1}`);
    setEditMode(false);
  }

  function restore(version: number) {
    const s = selected!;
    const old = s.history?.find(h => h.version === version);
    if (!old) return;
    register.update(s.id, {
      steps: old.steps,
      trigger: old.trigger as Workflow['trigger'],
      version: s.version + 1,
      updatedAt: stamp(),
      createdBy: me,
      history: [...(s.history ?? []), { version: s.version, steps: s.steps, trigger: s.trigger, savedAt: s.updatedAt, by: s.createdBy }],
    });
    toast.success(`Version ${version} restored as version ${s.version + 1}`);
    setHistoryOpen(false);
  }

  function createWorkflow() {
    const id = `WF-${Date.now().toString(36).toUpperCase()}`;
    register.add({
      id, name: draft.name.trim(), trigger: draft.trigger as Workflow['trigger'], enabled: false, version: 1, updatedAt: stamp(), createdBy: me,
      steps: [
        { id: `s${Date.now()}`, type: 'approver', role: 'Principal', scope: 'OWN_COLLEGE', sla: 3, escalateTo: 'Registrar', notifyOn: ['approve', 'reject'], label: 'Principal approval' },
        { id: `n${Date.now()}`, type: 'notification', notifyOn: ['portal', 'email'], label: 'Notify the applicant' },
      ],
    } as StoredWorkflow);
    setSelectedId(id);
    setCreateOpen(false);
    setDraft({ name: '', trigger: 'certificate_request' });
    toast.success('Workflow created as a draft — edit its chain, then enable it');
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Workflow list */}
      <div className="w-64 shrink-0 border-r border-[#D3D8E0] flex flex-col">
        <div className="px-4 py-3 border-b border-[#D3D8E0] flex items-center justify-between">
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Workflows</p>
          <Button size="sm" variant="ghost" title="New workflow" onClick={() => setCreateOpen(true)}>+</Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {workflows.map(wf => (
            <button
              key={wf.id}
              onClick={() => selectWorkflow(wf)}
              className={`w-full text-left px-4 py-3 border-b border-[#D3D8E0] last:border-b-0 transition-colors cursor-pointer ${selected.id === wf.id ? 'bg-[#FEF9EC]' : 'hover:bg-[#F5F6F8]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={`text-[13px] font-medium leading-tight ${selected.id === wf.id ? 'text-[#E0952A]' : 'text-[#16264A]'}`}>{wf.name}</p>
                <span className={`shrink-0 w-2 h-2 rounded-full mt-0.5 ${wf.enabled ? 'bg-[#0E7A5F]' : 'bg-[#D3D8E0]'}`} />
              </div>
              <p className="text-[11px] text-[#5A6577] mt-1">{TRIGGER_LABELS[wf.trigger]?.slice(0, 30)}…</p>
              <p className="text-[10px] text-[#5A6577] font-mono mt-0.5">v{wf.version} · {wf.updatedAt}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Builder */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-[#D3D8E0] bg-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-[15px] font-semibold text-[#16264A]">{selected.name}</p>
              <span className="font-mono text-[11px] text-[#5A6577] bg-[#EDEFF3] px-1.5 py-0.5 rounded-[2px]">v{selected.version}</span>
              <StatusPill status={selected.enabled ? 'approved' : 'draft'} compact />
            </div>
            <p className="text-[12px] text-[#5A6577] mt-0.5">Trigger: {TRIGGER_LABELS[selected.trigger]}</p>
          </div>
          <div className="flex items-center gap-3">
            <Toggle on={selected.enabled} onChange={toggleEnabled} label={selected.enabled ? 'Enabled' : 'Disabled'} />
            <Button size="sm" variant="ghost" onClick={() => setHistoryOpen(true)}>History</Button>
            {editMode
              ? <><Button size="sm" variant="secondary" onClick={() => { setEditMode(false); setEditSteps(selected.steps); }}>Discard</Button><Button size="sm" onClick={saveWorkflow}>Save v{selected.version + 1}</Button></>
              : <Button size="sm" onClick={startEdit}>Edit Chain</Button>}
          </div>
        </div>

        {/* Chain builder */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Org unit scope */}
          <div className="mb-5 flex items-center gap-3">
            <p className="text-[12px] font-semibold text-[#5A6577]">Active for:</p>
            <select value={selected.appliesTo ?? ''} onChange={e => { register.update(selected.id, { appliesTo: e.target.value || undefined }); toast.success('Scope updated'); }} className="h-8 px-2.5 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none bg-white cursor-pointer">
              <option value="">The whole institution</option>
              {(options.data?.colleges ?? []).map(c => <option key={c.code} value={c.code}>{c.name} only</option>)}
            </select>
          </div>

          {/* Trigger node */}
          <ChainNode type="trigger">
            <p className="text-[12px] font-semibold text-[#16264A]">Trigger</p>
            {editMode
              ? <select value={editTrigger} onChange={e => setEditTrigger(e.target.value)} className="mt-1 h-8 px-2 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none bg-white w-full">
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              : <p className="text-[13px] text-[#16264A] mt-0.5 font-medium">{TRIGGER_LABELS[selected.trigger]}</p>}
          </ChainNode>

          {/* Step nodes */}
          {(editMode ? editSteps : selected.steps).map((step, i) => (
            <div key={step.id}>
              <Connector />
              <ChainNode type={step.type} canDelete={editMode && step.type !== 'notification'} onDelete={() => removeStep(step.id)}>
                {editMode ? (
                  <EditableStep step={step} onChange={patch => updateStep(step.id, patch)} />
                ) : (
                  <ReadonlyStep step={step} index={i} />
                )}
              </ChainNode>
            </div>
          ))}

          {/* Add step button */}
          {editMode && (
            <div className="flex flex-col items-center mt-2">
              <div className="w-px h-6 bg-[#D3D8E0]" />
              <Button size="sm" variant="secondary" onClick={() => setAddStepOpen(true)}>+ Add Step</Button>
            </div>
          )}
        </div>
      </div>

      {/* Version history modal */}
      <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title={`Version history — ${selected.name}`}>
        <div className="flex flex-col divide-y divide-[#D3D8E0]">
          <div className="py-3 flex items-center justify-between">
            <div><p className="text-[13px] font-medium text-[#16264A]">Version {selected.version}</p><p className="text-[11px] text-[#5A6577]">Current · {selected.updatedAt} · {selected.createdBy} · {selected.steps.length} steps</p></div>
            <span className="text-[11px] font-semibold text-[#0E7A5F]">Active</span>
          </div>
          {[...(selected.history ?? [])].reverse().map(h => (
            <div key={h.version} className="py-3 flex items-center justify-between">
              <div><p className="text-[13px] font-medium text-[#16264A]">Version {h.version}</p><p className="text-[11px] text-[#5A6577]">{h.savedAt} · {h.by} · {h.steps.length} steps · {TRIGGER_LABELS[h.trigger] ?? h.trigger}</p></div>
              <Button size="sm" variant="ghost" onClick={() => restore(h.version)}>Restore</Button>
            </div>
          ))}
          {(selected.history ?? []).length === 0 && <p className="py-3 text-[12px] text-[#5A6577]">No earlier versions — saving an edited chain keeps the previous one here.</p>}
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New workflow"
        footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button disabled={draft.name.trim().length < 3} onClick={createWorkflow}>Create draft</Button></>}>
        <div className="flex flex-col gap-3 text-[13px]">
          <label className="font-medium text-[#16264A]">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Bonafide certificate approval" className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px]" /></label>
          <label className="font-medium text-[#16264A]">Trigger
            <select value={draft.trigger} onChange={e => setDraft({ ...draft, trigger: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
              {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <p className="text-[12px] text-[#5A6577]">It starts disabled with a principal-approval step and a notification; shape the chain, then switch it on.</p>
        </div>
      </Modal>

      {/* Add step modal */}
      <Modal open={addStepOpen} onClose={() => setAddStepOpen(false)} title="Add Step"
        footer={<><Button variant="secondary" onClick={() => setAddStepOpen(false)}>Cancel</Button><Button onClick={() => addStep(newStepType)}>Add</Button></>}>
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-[#5A6577]">Choose the type of step to insert before the notification node.</p>
          <div className="flex flex-col gap-2">
            {(['approver', 'condition', 'notification'] as const).map(type => (
              <button key={type} onClick={() => setNewStepType(type)}
                className={`text-left p-3 border rounded-[4px] cursor-pointer transition-colors ${newStepType === type ? 'border-[#E0952A] bg-[#FEF9EC]' : 'border-[#D3D8E0] hover:border-[#E0952A]'}`}>
                <p className="text-[13px] font-medium text-[#16264A] capitalize">{type}</p>
                <p className="text-[11px] text-[#5A6577]">{type === 'approver' ? 'A human must approve or reject before the chain continues' : type === 'condition' ? 'Route the chain based on a field value or rule' : 'Send SMS, email, portal, or WhatsApp notification'}</p>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Chain Node ───────────────────────────────────────────────────────────────

function ChainNode({ type, children, canDelete, onDelete }: { type: string; children: React.ReactNode; canDelete?: boolean; onDelete?: () => void }) {
  const cfg = type === 'trigger'
    ? { bg: '#16264A', border: '#16264A', labelColor: '#94A3B8' }
    : type === 'approver'
    ? { bg: STEP_COLORS.approver.bg, border: STEP_COLORS.approver.border, labelColor: '#3B82F6' }
    : type === 'condition'
    ? { bg: STEP_COLORS.condition.bg, border: STEP_COLORS.condition.border, labelColor: '#E0952A' }
    : { bg: STEP_COLORS.notification.bg, border: STEP_COLORS.notification.border, labelColor: '#0E7A5F' };

  return (
    <div className="flex justify-center">
      <div
        className="relative border rounded-[4px] p-4 w-full max-w-xl"
        style={{ background: type === 'trigger' ? cfg.bg : cfg.bg, borderColor: cfg.border }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">{children}</div>
          {canDelete && (
            <button onClick={onDelete} className="text-[#5A6577] hover:text-[#A8242C] cursor-pointer shrink-0 mt-0.5">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div className="flex flex-col items-center py-1">
      <div className="w-px h-6 bg-[#D3D8E0]" />
      <svg width="10" height="6" viewBox="0 0 10 6" fill="#D3D8E0"><path d="M0 0l5 6 5-6z"/></svg>
    </div>
  );
}

function ReadonlyStep({ step, index }: { step: WorkflowStep; index: number }) {
  const cfg = STEP_COLORS[step.type];
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.dot }}>{cfg.label}</span>
        <span className="text-[10px] text-[#5A6577]">Step {index + 1}</span>
      </div>
      <p className="text-[14px] font-semibold text-[#16264A]">{step.label}</p>
      {step.type === 'approver' && (
        <div className="mt-2 flex flex-wrap gap-3 text-[12px]">
          <span className="text-[#5A6577]">Role: <span className="text-[#16264A] font-medium">{step.role}</span></span>
          <span className="text-[#5A6577]">Scope: <span className="text-[#16264A] font-medium">{step.scope}</span></span>
          <span className="text-[#5A6577]">SLA: <span className="text-[#16264A] font-medium">{step.sla} day{step.sla !== 1 ? 's' : ''}</span></span>
          <span className="text-[#5A6577]">Escalate to: <span className="text-[#16264A] font-medium">{step.escalateTo}</span></span>
        </div>
      )}
      {step.type === 'condition' && (
        <p className="mt-1 text-[12px] text-[#8A6D1F] font-mono">{step.condition}</p>
      )}
      {step.type === 'notification' && (
        <div className="mt-1 flex gap-2">
          {step.notifyOn?.map(n => <span key={n} className="text-[11px] bg-[#D1FAE5] text-[#0E7A5F] px-2 py-0.5 rounded-full font-medium">{n}</span>)}
        </div>
      )}
    </div>
  );
}

function EditableStep({ step, onChange }: { step: WorkflowStep; onChange: (p: Partial<WorkflowStep>) => void }) {
  const cfg = STEP_COLORS[step.type];
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: cfg.dot }}>{cfg.label}</span>
      </div>
      <input value={step.label} onChange={e => onChange({ label: e.target.value })}
        className="w-full h-8 px-2.5 border border-[#D3D8E0] rounded-[4px] text-[13px] font-semibold outline-none focus:border-[#E0952A] mb-2" />

      {step.type === 'approver' && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-[10px] text-[#5A6577] block mb-0.5">Role</label>
            <select value={step.role} onChange={e => onChange({ role: e.target.value })} className="w-full h-7 px-2 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none">
              {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
            </select></div>
          <div><label className="text-[10px] text-[#5A6577] block mb-0.5">Scope</label>
            <select value={step.scope} onChange={e => onChange({ scope: e.target.value })} className="w-full h-7 px-2 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none">
              {SCOPE_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select></div>
          <div><label className="text-[10px] text-[#5A6577] block mb-0.5">SLA (days)</label>
            <input type="number" min={1} value={step.sla} onChange={e => onChange({ sla: Number(e.target.value) })} className="w-full h-7 px-2 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none font-mono" /></div>
          <div><label className="text-[10px] text-[#5A6577] block mb-0.5">Escalate to</label>
            <select value={step.escalateTo} onChange={e => onChange({ escalateTo: e.target.value })} className="w-full h-7 px-2 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none">
              {ROLE_OPTIONS.map(r => <option key={r}>{r}</option>)}
            </select></div>
        </div>
      )}

      {step.type === 'condition' && (
        <input value={step.condition} onChange={e => onChange({ condition: e.target.value })}
          className="w-full h-8 px-2.5 border border-[#D3D8E0] rounded-[4px] text-[12px] outline-none font-mono focus:border-[#E0952A]" />
      )}

      {step.type === 'notification' && (
        <div className="flex flex-wrap gap-2">
          {['sms', 'email', 'portal', 'whatsapp'].map(ch => (
            <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={step.notifyOn?.includes(ch)} onChange={e => {
                const current = step.notifyOn ?? [];
                onChange({ notifyOn: e.target.checked ? [...current, ch] : current.filter(x => x !== ch) });
              }} className="accent-[#E0952A]" />
              <span className="text-[12px] text-[#16264A] capitalize">{ch}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
