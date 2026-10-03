import { useMemo, useRef, useState } from 'react';
import { Button, Modal, InlineAlert, Spinner, Timeline, toast } from '../../components/ui';
import { useAddCollege, useAddProgramme, useProvisioningOptions } from '../../lib/itqueries';
import { useOverview } from '../AdminConsole';
import { useCollection, type Stored } from '../../lib/records';
import { useAuth, displayName } from '../../lib/auth';
import { downloadCSV, downloadTemplate, readCSV } from '../../lib/export';
import { inst } from '../../lib/institution';

/**
 * The organisation tree. Colleges and programmes are the real records the
 * rest of the system hangs students and staff on; departments, study centres
 * and sections, plus every edit to any unit, live in the `it:org-units`
 * register with their change trail.
 */

type OrgUnitType = 'UNIVERSITY' | 'AFFILIATED_COLLEGE' | 'TEACHING_DEPARTMENT' | 'STUDY_CENTRE' | 'REGIONAL_CENTRE' | 'PROGRAMME' | 'SECTION';

const TYPE_LABELS: Record<OrgUnitType, string> = {
  UNIVERSITY: 'Institution',
  AFFILIATED_COLLEGE: 'College / campus',
  TEACHING_DEPARTMENT: 'Teaching department',
  STUDY_CENTRE: 'Study centre',
  REGIONAL_CENTRE: 'Regional centre',
  PROGRAMME: 'Programme',
  SECTION: 'Section',
};

const TYPE_ICON: Record<OrgUnitType, string> = { UNIVERSITY: '🏛', AFFILIATED_COLLEGE: '🏫', TEACHING_DEPARTMENT: '📚', STUDY_CENTRE: '📡', REGIONAL_CENTRE: '🗺', PROGRAMME: '🎓', SECTION: '📁' };

/** What the register holds: extra units, and edits to the real ones (keyed by their code). */
interface OrgUnitDoc {
  id: string;
  code: string;
  name?: string;
  type?: OrgUnitType;
  parentCode?: string;
  head?: string;
  district?: string;
  sanctioned?: number;
  status?: 'active' | 'inactive';
  trail?: Array<{ label: string; date: string; by: string; note?: string }>;
}

interface OrgNode { code: string; name: string; type: OrgUnitType; parentCode: string | null; head?: string; district?: string; sanctioned?: number; strength?: number; status: 'active' | 'inactive'; real: boolean; trail: NonNullable<OrgUnitDoc['trail']>; rid?: string }

const today = () => new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

function useOrgTree() {
  const options = useProvisioningOptions();
  const overview = useOverview();
  const register = useCollection<OrgUnitDoc>('it:org-units', []);
  const nodes = useMemo(() => {
    const docs = new Map(register.items.map(d => [d.code, d]));
    const counts = new Map((overview.data?.colleges ?? []).map(c => [c.code, c.students]));
    const root: OrgNode = { code: inst().shortCode, name: inst().name, type: 'UNIVERSITY', parentCode: null, status: 'active', real: true, trail: [], strength: overview.data?.counts.students };
    const list: OrgNode[] = [root];
    const merge = (n: OrgNode): OrgNode => {
      const d = docs.get(n.code);
      return d ? { ...n, name: d.name ?? n.name, head: d.head ?? n.head, district: d.district ?? n.district, sanctioned: d.sanctioned ?? n.sanctioned, status: d.status ?? n.status, trail: d.trail ?? [], rid: d._rid } : n;
    };
    for (const c of options.data?.colleges ?? []) list.push(merge({ code: c.code, name: c.name, type: 'AFFILIATED_COLLEGE', parentCode: root.code, status: 'active', real: true, trail: [], strength: counts.get(c.code) }));
    const collegeCode = new Map((options.data?.colleges ?? []).map(c => [c.id, c.code]));
    for (const p of options.data?.programmes ?? []) list.push(merge({ code: p.code, name: p.name, type: 'PROGRAMME', parentCode: (p.collegeId && collegeCode.get(p.collegeId)) || root.code, status: 'active', real: true, trail: [] }));
    const realCodes = new Set(list.map(n => n.code));
    for (const d of register.items) {
      if (realCodes.has(d.code) || !d.type || !d.name) continue;
      list.push({ code: d.code, name: d.name, type: d.type, parentCode: d.parentCode ?? root.code, head: d.head, district: d.district, sanctioned: d.sanctioned, status: d.status ?? 'active', real: false, trail: d.trail ?? [], rid: d._rid });
    }
    return list;
  }, [options.data, overview.data, register.items]);
  return { nodes, register, loading: options.isLoading || register.isLoading };
}

interface Props { subScreen: string; onSub: (s: string) => void; onOpenUsers?: () => void }

export default function OrgGroup({ subScreen, onSub, onOpenUsers }: Props) {
  const { nodes, register, loading } = useOrgTree();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = nodes.find(n => n.code === selectedCode) ?? null;

  if (subScreen === 'bulk-import') return <BulkImport nodes={nodes} onBack={() => onSub('tree')} />;

  const q = search.trim().toLowerCase();
  const matches = q ? nodes.filter(n => `${n.name} ${n.code}`.toLowerCase().includes(q)) : null;

  return (
    <div className="flex gap-0 min-h-0 flex-1">
      <div className="w-72 shrink-0 border-r border-[#D3D8E0] flex flex-col">
        <div className="p-3 border-b border-[#D3D8E0] flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 border border-[#D3D8E0] rounded-[4px] px-2.5 bg-[#EDEFF3]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search org units…" className="flex-1 py-1.5 text-[13px] bg-transparent outline-none text-[#16264A] placeholder-[#5A6577]" />
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)} title="Create org unit">+</Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {loading ? <div className="flex justify-center py-6"><Spinner /></div> : matches ? (
            matches.length ? matches.map(n => (
              <button key={n.code} onClick={() => setSelectedCode(n.code)} className={`w-full text-left px-3 py-1.5 text-[13px] cursor-pointer ${selectedCode === n.code ? 'bg-[#FEF9EC] text-[#E0952A]' : 'hover:bg-[#F5F6F8] text-[#16264A]'}`}>{TYPE_ICON[n.type]} {n.name} <span className="text-[11px] text-[#5A6577] font-mono">{n.code}</span></button>
            )) : <p className="px-3 py-4 text-[12px] text-[#5A6577]">No unit matches “{search}”.</p>
          ) : <TreeNode node={nodes[0]!} nodes={nodes} depth={0} selected={selectedCode} onSelect={setSelectedCode} />}
        </div>
        <div className="border-t border-[#D3D8E0] p-3">
          <button onClick={() => onSub('bulk-import')} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer flex items-center gap-1.5">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Bulk import org units (CSV)
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {selected ? <OrgRecord node={selected} register={register} onOpenUsers={onOpenUsers} onClose={() => setSelectedCode(null)} /> : (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center px-6">
            <p className="text-[14px] font-medium text-[#16264A]">Select an org unit</p>
            <p className="text-[12px] text-[#5A6577] mt-1">{nodes.length} units on record. Click any node to view and edit its record.</p>
          </div>
        )}
      </div>

      <CreateOrgUnit open={createOpen} nodes={nodes} register={register} onClose={() => setCreateOpen(false)} onCreated={code => setSelectedCode(code)} />
    </div>
  );
}

function TreeNode({ node, nodes, depth, selected, onSelect }: { node: OrgNode; nodes: OrgNode[]; depth: number; selected: string | null; onSelect: (c: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const children = nodes.filter(n => n.parentCode === node.code);
  return (
    <div>
      <div className={`flex items-center gap-1 pr-3 py-1 cursor-pointer group ${selected === node.code ? 'bg-[#FEF9EC]' : 'hover:bg-[#F5F6F8]'}`} style={{ paddingLeft: `${12 + depth * 16}px` }} onClick={() => onSelect(node.code)}>
        <button aria-label={expanded ? 'Collapse' : 'Expand'} className={`w-4 h-4 flex items-center justify-center shrink-0 text-[#5A6577] cursor-pointer ${!children.length ? 'invisible' : ''}`} onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${expanded ? 'rotate-90' : ''}`}><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <span className="shrink-0 text-[13px]">{TYPE_ICON[node.type]}</span>
        <span className={`flex-1 truncate text-[13px] ${selected === node.code ? 'text-[#E0952A] font-medium' : node.status === 'inactive' ? 'text-[#5A6577] line-through' : 'text-[#16264A]'}`}>{node.name}</span>
        {node.strength !== undefined && <span className="shrink-0 text-[10px] font-mono text-[#5A6577] bg-[#EDEFF3] px-1.5 py-0.5 rounded-full">{node.strength.toLocaleString('en-IN')}</span>}
      </div>
      {expanded && children.map(c => <TreeNode key={c.code} node={c} nodes={nodes} depth={depth + 1} selected={selected} onSelect={onSelect} />)}
    </div>
  );
}

type Register = ReturnType<typeof useCollection<OrgUnitDoc>>;

/** Writes an edit to a unit: into its own register row, or a new override row for a real college or programme. */
function saveUnit(register: Register, node: OrgNode, patch: Partial<OrgUnitDoc>, entry: { label: string; by: string; note?: string }) {
  const trail = [...node.trail, { ...entry, date: today() }];
  if (node.rid) register.update(node.rid, { ...patch, trail });
  else register.add({ id: node.code, code: node.code, ...patch, trail });
}

function OrgRecord({ node, register, onOpenUsers, onClose }: { node: OrgNode; register: Register; onOpenUsers?: () => void; onClose: () => void }) {
  const { user } = useAuth();
  const me = displayName(user) || 'IT Cell';
  const [editOpen, setEditOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [f, setF] = useState({ name: node.name, head: node.head ?? '', district: node.district ?? '', sanctioned: String(node.sanctioned ?? ''), note: '' });
  const fillPct = node.strength !== undefined && node.sanctioned ? Math.min(100, Math.round((node.strength / node.sanctioned) * 100)) : null;

  return (
    <div className="animate-fade-in">
      <div className="bg-[#16264A] text-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-[2px] bg-white/10 text-white/80">{TYPE_LABELS[node.type]}</span>
              <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-[2px] ${node.status === 'active' ? 'bg-[#0E7A5F]/20 text-[#34D399]' : 'bg-[#A8242C]/20 text-[#F87171]'}`}>{node.status}</span>
            </div>
            <h2 className="text-h2 font-semibold">{node.name}</h2>
            {node.head && <p className="text-[13px] text-white/60 mt-0.5">Head: {node.head}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-[12px] text-white/60">{node.code}</p>
            {node.district && <p className="text-[12px] text-white/50 mt-0.5">{node.district}</p>}
            <button onClick={onClose} className="text-[11px] text-white/50 hover:text-white mt-2 cursor-pointer">Close ✕</button>
          </div>
        </div>
        {fillPct !== null && (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between text-[11px] text-white/60 mb-1.5"><span>Current strength</span><span className="font-mono">{node.strength!.toLocaleString('en-IN')} / {node.sanctioned!.toLocaleString('en-IN')} sanctioned ({fillPct}%)</span></div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${fillPct}%`, background: fillPct > 90 ? '#A8242C' : fillPct > 70 ? '#E0952A' : '#0E7A5F' }} /></div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 px-6 py-3 border-b border-[#D3D8E0] bg-white">
        {node.type !== 'UNIVERSITY' && <Button size="sm" variant="secondary" onClick={() => { setF({ name: node.name, head: node.head ?? '', district: node.district ?? '', sanctioned: String(node.sanctioned ?? ''), note: '' }); setEditOpen(true); }}>Edit</Button>}
        {node.type !== 'UNIVERSITY' && node.status === 'active' && <Button size="sm" variant="destructive" onClick={() => setDeactivateOpen(true)}>Deactivate</Button>}
        {node.status === 'inactive' && <Button size="sm" onClick={() => { saveUnit(register, node, { status: 'active' }, { label: 'Reactivated', by: me }); toast.success(`${node.name} reactivated`); }}>Reactivate</Button>}
        {onOpenUsers && <Button size="sm" variant="ghost" onClick={onOpenUsers}>Open user directory →</Button>}
      </div>

      <div className="bg-white px-6 py-5">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 mb-6">
          {([['Code', node.code], ['Type', TYPE_LABELS[node.type]], ['Status', node.status], ['Head', node.head ?? '—'], ['District', node.district ?? '—'], ['Current strength', node.strength !== undefined ? node.strength.toLocaleString('en-IN') : '—'], ['Sanctioned strength', node.sanctioned ? node.sanctioned.toLocaleString('en-IN') : '—'], ['Source', node.real ? 'System record' : 'Org register']] as Array<[string, string]>).map(([label, value]) => (
            <div key={label} className="border-b border-[#D3D8E0] pb-3">
              <p className="text-[11px] uppercase tracking-wider text-[#5A6577]">{label}</p>
              <p className="text-[14px] text-[#16264A] font-medium mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <p className="text-[13px] font-semibold text-[#16264A] mb-3">Change trail</p>
        {node.trail.length === 0 ? <p className="text-[12px] text-[#5A6577]">No changes recorded since this unit was set up.</p> : (
          <Timeline items={node.trail.map(t => ({ label: t.label, date: t.date, by: t.by, note: t.note, status: 'done' as const }))} />
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit: ${node.name}`}
        footer={<><Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button><Button disabled={!f.name.trim() || !f.note.trim()} onClick={() => {
          const changed = [f.name !== node.name && 'name', f.head !== (node.head ?? '') && 'head', f.district !== (node.district ?? '') && 'district', f.sanctioned !== String(node.sanctioned ?? '') && 'sanctioned strength'].filter(Boolean).join(', ');
          saveUnit(register, node, { name: f.name.trim(), head: f.head.trim() || undefined, district: f.district.trim() || undefined, sanctioned: Number(f.sanctioned) || undefined }, { label: changed ? `Updated ${changed}` : 'Reviewed', by: me, note: f.note.trim() });
          toast.success('Saved to the org register');
          setEditOpen(false);
        }}>Save changes</Button></>}>
        <div className="flex flex-col gap-3 text-[13px]">
          {([['Name', 'name'], ['Head', 'head'], ['District', 'district'], ['Sanctioned strength', 'sanctioned']] as const).map(([label, key]) => (
            <label key={key} className="font-medium text-[#16264A]">{label}<input value={f[key]} type={key === 'sanctioned' ? 'number' : 'text'} onChange={e => setF({ ...f, [key]: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none focus:border-[#E0952A]" /></label>
          ))}
          <label className="font-medium text-[#16264A]">Reason for change<textarea value={f.note} onChange={e => setF({ ...f, note: e.target.value })} rows={2} placeholder="Required for the change trail" className="mt-1 w-full px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none resize-none focus:border-[#E0952A]" /></label>
        </div>
      </Modal>

      <Modal open={deactivateOpen} onClose={() => setDeactivateOpen(false)} title="Deactivate org unit"
        footer={<><Button variant="secondary" onClick={() => setDeactivateOpen(false)}>Cancel</Button><Button variant="destructive" disabled={!reason.trim()} onClick={() => { saveUnit(register, node, { status: 'inactive' }, { label: 'Deactivated', by: me, note: reason.trim() }); setDeactivateOpen(false); setReason(''); toast.warning(`${node.name} deactivated`); }}>Deactivate</Button></>}>
        <div className="flex flex-col gap-3">
          <InlineAlert type="warning">The unit is marked inactive in the organisation tree and the reason is kept in its change trail. Accounts under it are not touched — lock them from the user directory if needed.</InlineAlert>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Reason (required)" className="w-full px-3 py-2 border border-[#D3D8E0] rounded-[4px] text-[14px] outline-none resize-none focus:border-[#E0952A]" />
        </div>
      </Modal>
    </div>
  );
}

function CreateOrgUnit({ open, nodes, register, onClose, onCreated }: { open: boolean; nodes: OrgNode[]; register: Register; onClose: () => void; onCreated: (code: string) => void }) {
  const { user } = useAuth();
  const addCollege = useAddCollege();
  const addProgramme = useAddProgramme();
  const options = useProvisioningOptions();
  const [f, setF] = useState({ type: 'AFFILIATED_COLLEGE' as OrgUnitType, code: '', name: '', parentCode: '', head: '', district: '', sanctioned: '', years: '3' });
  const parents = nodes.filter(n => n.type === 'UNIVERSITY' || n.type === 'AFFILIATED_COLLEGE' || n.type === 'TEACHING_DEPARTMENT');
  const busy = addCollege.isPending || addProgramme.isPending;

  async function create() {
    const code = f.code.trim().toUpperCase();
    if (nodes.some(n => n.code === code)) { toast.error(`Code ${code} is already used`); return; }
    try {
      if (f.type === 'AFFILIATED_COLLEGE') {
        await addCollege.mutateAsync({ code, name: f.name.trim(), district: f.district.trim() || undefined });
      } else if (f.type === 'PROGRAMME') {
        const college = options.data?.colleges.find(c => c.code === f.parentCode);
        await addProgramme.mutateAsync({ code, name: f.name.trim(), years: Number(f.years) || 3, collegeId: college?.id });
      }
      const extra = f.head.trim() || f.sanctioned || f.type !== 'AFFILIATED_COLLEGE' && f.type !== 'PROGRAMME';
      if (extra) {
        register.add({ id: code, code, ...(f.type !== 'AFFILIATED_COLLEGE' && f.type !== 'PROGRAMME' ? { name: f.name.trim(), type: f.type, parentCode: f.parentCode || nodes[0]!.code } : {}), head: f.head.trim() || undefined, district: f.district.trim() || undefined, sanctioned: Number(f.sanctioned) || undefined, status: 'active', trail: [{ label: 'Unit created', date: today(), by: displayName(user) || 'IT Cell' }] });
      }
      toast.success(`${TYPE_LABELS[f.type]} ${f.name.trim()} created`);
      onCreated(code);
      setF({ ...f, code: '', name: '', head: '', sanctioned: '' });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create the unit');
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create org unit"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!f.name.trim() || f.code.trim().length < 2 || (f.type === 'PROGRAMME' && !f.parentCode)} onClick={() => void create()}>Create</Button></>}>
      <div className="flex flex-col gap-3 text-[13px]">
        <label className="font-medium text-[#16264A]">Type
          <select value={f.type} onChange={e => setF({ ...f, type: e.target.value as OrgUnitType })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
            {(Object.keys(TYPE_LABELS) as OrgUnitType[]).filter(t => t !== 'UNIVERSITY').map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="font-medium text-[#16264A]">Code<input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="RDU-AC-061" className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>
          <label className="font-medium text-[#16264A] col-span-2">Name<input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px]" /></label>
        </div>
        {f.type !== 'AFFILIATED_COLLEGE' && (
          <label className="font-medium text-[#16264A]">{f.type === 'PROGRAMME' ? 'College' : 'Parent unit'}
            <select value={f.parentCode} onChange={e => setF({ ...f, parentCode: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] bg-white cursor-pointer">
              <option value="">{f.type === 'PROGRAMME' ? 'Choose…' : `${inst().name} (top level)`}</option>
              {parents.filter(p => f.type !== 'PROGRAMME' || p.type === 'AFFILIATED_COLLEGE').map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
            </select>
          </label>
        )}
        <div className="grid grid-cols-3 gap-3">
          <label className="font-medium text-[#16264A]">Head<input value={f.head} onChange={e => setF({ ...f, head: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px]" /></label>
          <label className="font-medium text-[#16264A]">District<input value={f.district} onChange={e => setF({ ...f, district: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px]" /></label>
          {f.type === 'PROGRAMME'
            ? <label className="font-medium text-[#16264A]">Years<input type="number" min={1} max={12} value={f.years} onChange={e => setF({ ...f, years: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>
            : <label className="font-medium text-[#16264A]">Sanctioned<input type="number" value={f.sanctioned} onChange={e => setF({ ...f, sanctioned: e.target.value })} className="mt-1 w-full h-9 px-3 border border-[#D3D8E0] rounded-[4px] font-mono" /></label>}
        </div>
        {(f.type === 'AFFILIATED_COLLEGE' || f.type === 'PROGRAMME') && <p className="text-[12px] text-[#5A6577]">This creates the real {f.type === 'PROGRAMME' ? 'programme' : 'college'}: students and staff can be enrolled under it at once.</p>}
      </div>
    </Modal>
  );
}

const ORG_HEADERS = ['code', 'name', 'type', 'parent_code', 'head', 'district', 'sanctioned_strength'];
const TYPES = Object.keys(TYPE_LABELS).filter(t => t !== 'UNIVERSITY');

function BulkImport({ nodes, onBack }: { nodes: OrgNode[]; onBack: () => void }) {
  const { user } = useAuth();
  const register = useCollection<OrgUnitDoc>('it:org-units', []);
  const addCollege = useAddCollege();
  const addProgramme = useAddProgramme();
  const options = useProvisioningOptions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'upload' | 'preview' | 'committing' | 'done'>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Array<{ row: number; data: Record<string, string>; error: string | null }>>([]);
  const [done, setDone] = useState<Array<{ row: number; code: string; name: string; result: string }>>([]);
  const [progress, setProgress] = useState(0);

  async function onFile(file?: File) {
    if (!file) return;
    const parsed = await readCSV(file).catch(() => null);
    if (!parsed?.length) { toast.error('No rows found — is it a CSV with a header row?'); return; }
    const seen = new Set(nodes.map(n => n.code));
    setFileName(file.name);
    setRows(parsed.map((raw, i) => {
      const d = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]));
      const code = (d.code ?? '').toUpperCase();
      const type = (d.type ?? '').toUpperCase();
      let error: string | null = null;
      if (!d.name) error = 'name is required';
      else if (code.length < 2) error = 'code is required';
      else if (seen.has(code)) error = `code ${code} already exists`;
      else if (!TYPES.includes(type)) error = `type must be one of ${TYPES.join(', ')}`;
      else if (type === 'PROGRAMME' && !options.data?.colleges.some(c => c.code === (d.parent_code ?? '').toUpperCase())) error = 'a programme needs parent_code of a college';
      if (!error) seen.add(code);
      return { row: i + 2, data: { ...d, code, type }, error };
    }));
    setPhase('preview');
  }

  async function commit() {
    setPhase('committing');
    const ok = rows.filter(r => !r.error);
    const out: typeof done = [];
    for (const [i, r] of ok.entries()) {
      const d = r.data;
      try {
        if (d.type === 'AFFILIATED_COLLEGE') await addCollege.mutateAsync({ code: d.code!, name: d.name!, district: d.district || undefined });
        else if (d.type === 'PROGRAMME') await addProgramme.mutateAsync({ code: d.code!, name: d.name!, years: 3, collegeId: options.data?.colleges.find(c => c.code === d.parent_code!.toUpperCase())?.id });
        register.add({ id: d.code!, code: d.code!, ...(d.type !== 'AFFILIATED_COLLEGE' && d.type !== 'PROGRAMME' ? { name: d.name, type: d.type as OrgUnitType, parentCode: d.parent_code?.toUpperCase() || nodes[0]!.code } : {}), head: d.head || undefined, district: d.district || undefined, sanctioned: Number(d.sanctioned_strength) || undefined, status: 'active', trail: [{ label: `Imported from ${fileName}`, date: today(), by: displayName(user) || 'IT Cell' }] });
        out.push({ row: r.row, code: d.code!, name: d.name!, result: 'created' });
      } catch (err) {
        out.push({ row: r.row, code: d.code!, name: d.name!, result: err instanceof Error ? err.message : 'failed' });
      }
      setProgress(Math.round(((i + 1) / ok.length) * 100));
    }
    setDone(out);
    setPhase('done');
  }

  const errors = rows.filter(r => r.error);
  const okCount = rows.length - errors.length;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[#D3D8E0]">
        <button onClick={onBack} aria-label="Back" className="text-[#5A6577] hover:text-[#16264A] cursor-pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg></button>
        <h2 className="text-h3 font-semibold text-[#16264A]">Bulk import org units</h2>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        {phase === 'upload' && (
          <div className="max-w-lg">
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => void onFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="w-full border-2 border-dashed border-[#D3D8E0] rounded-[4px] p-10 text-center hover:border-[#E0952A] cursor-pointer">
              <p className="text-[14px] font-medium text-[#16264A]">Choose a CSV file</p>
              <p className="text-[12px] text-[#5A6577] mt-1">Columns: {ORG_HEADERS.join(', ')}</p>
            </button>
            <div className="mt-4 flex flex-wrap gap-3 items-center">
              <button onClick={() => downloadTemplate('org-units', ORG_HEADERS, ['RDU-AC-061', 'Govt. New College', 'AFFILIATED_COLLEGE', '', 'Dr. A. Sharma', 'Demo City', '800'])} className="text-[13px] text-[#E0952A] hover:underline cursor-pointer">Download template CSV</button>
            </div>
            <div className="mt-5 text-[12px] text-[#5A6577] space-y-1">
              <p><strong className="text-[#16264A]">type</strong> — one of {TYPES.join(', ')}. Colleges and programmes become real records; the others go into the org register.</p>
              <p><strong className="text-[#16264A]">parent_code</strong> — the code of the unit it sits under (a college's code for a programme). Blank means the top level.</p>
              <p><strong className="text-[#16264A]">code</strong> must be unique across the tree.</p>
            </div>
          </div>
        )}

        {phase === 'preview' && (
          <div className="max-w-3xl">
            <div className="flex items-center gap-4 mb-4 text-[13px]">
              <span className="text-[#5A6577]">{fileName}</span>
              <span className="text-[#0E7A5F] font-semibold">{okCount} valid</span>
              <span className="text-[#A8242C] font-semibold">{errors.length} errors</span>
              {errors.length > 0 && <button onClick={() => downloadCSV('org-import-errors', errors.map(e => ({ row: e.row, ...e.data, error: e.error })))} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer ml-auto">Download error report</button>}
            </div>
            <div className="border border-[#D3D8E0] rounded-[2px] overflow-x-auto">
              <table className="ruled-table">
                <thead><tr><th>Row</th><th>Code</th><th>Name</th><th>Type</th><th>Parent</th><th>Check</th></tr></thead>
                <tbody>{rows.map(r => (
                  <tr key={r.row} className={r.error ? 'bg-[#FEE2E2]/30' : ''}>
                    <td className="font-mono text-[12px]">{r.row}</td><td className="font-mono text-[12px]">{r.data.code}</td><td className="text-[13px]">{r.data.name || '(empty)'}</td><td className="font-mono text-[12px]">{r.data.type}</td><td className="font-mono text-[12px]">{r.data.parent_code || '—'}</td>
                    <td>{r.error ? <span className="text-[12px] text-[#A8242C]">✕ {r.error}</span> : <span className="text-[12px] text-[#0E7A5F] font-semibold">✓</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="flex gap-3 mt-4">
              <Button disabled={!okCount} onClick={() => void commit()}>Create {okCount} unit{okCount === 1 ? '' : 's'}</Button>
              <Button variant="secondary" onClick={() => setPhase('upload')}>Choose another file</Button>
            </div>
          </div>
        )}

        {phase === 'committing' && (
          <div className="max-w-sm flex flex-col items-center py-12 gap-4">
            <Spinner size={32} color="#E0952A" />
            <p className="text-[14px] font-medium text-[#16264A]">Creating org units… {progress}%</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="max-w-md flex flex-col items-center py-12 gap-4 animate-fade-in">
            <p className="text-[17px] font-semibold text-[#16264A]">Import complete</p>
            <p className="text-[13px] text-[#5A6577] text-center">{done.filter(d => d.result === 'created').length} created · {done.filter(d => d.result !== 'created').length + errors.length} not created</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={onBack}>Back to org tree</Button>
              <Button size="sm" variant="secondary" onClick={() => downloadCSV('org-import-summary', [...done, ...errors.map(e => ({ row: e.row, code: e.data.code ?? '', name: e.data.name ?? '', result: e.error ?? '' }))])}>Download summary</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
