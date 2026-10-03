import { useState } from 'react';
import { Button, InlineAlert, toast } from '../../components/ui';
import { useAddCollege, useAddProgramme, useProvisioningOptions } from '../../lib/itqueries';

const input = 'h-9 px-3 border border-[#D3D8E0] rounded-[4px] text-[13px] outline-none focus:border-[#E0952A] bg-white';

/**
 * The campuses and programmes (courses, or classes at a school) that student
 * and staff records belong to. A new institute starts with one campus and no
 * programmes; the IT Cell adds its own before creating students.
 */
export default function AcademicStructure() {
  const { data, isPending } = useProvisioningOptions();
  const addCollege = useAddCollege();
  const addProgramme = useAddProgramme();
  const [college, setCollege] = useState({ code: '', name: '' });
  const [programme, setProgramme] = useState({ code: '', name: '', years: '3', collegeId: '' });

  const colleges = data?.colleges ?? [];
  const programmes = data?.programmes ?? [];
  const campusName = (id: string | null) => colleges.find(c => c.id === id)?.name ?? 'All campuses';

  async function saveCollege(e: React.FormEvent) {
    e.preventDefault();
    try {
      const c = await addCollege.mutateAsync({ code: college.code, name: college.name });
      toast.success(`${c.name} added.`);
      setCollege({ code: '', name: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that campus.');
    }
  }

  async function saveProgramme(e: React.FormEvent) {
    e.preventDefault();
    try {
      const p = await addProgramme.mutateAsync({
        code: programme.code,
        name: programme.name,
        years: Number(programme.years),
        ...(programme.collegeId ? { collegeId: programme.collegeId } : {}),
      });
      toast.success(`${p.name} added.`);
      setProgramme(prev => ({ ...prev, code: '', name: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not add that programme.');
    }
  }

  return (
    <fieldset className="border border-[#D3D8E0] rounded-[4px] bg-white p-4 flex flex-col gap-4">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#5A6577]">Academic structure</legend>
      <p className="text-[12px] text-[#5A6577] -mt-1">
        Students and staff are created under a campus, and students join a programme — a degree course,
        or a class/grade at a school. Add these before creating students.
      </p>

      {!isPending && programmes.length === 0 && (
        <InlineAlert type="warning">No programmes yet. Add at least one before creating student accounts.</InlineAlert>
      )}

      <div>
        <p className="text-[13px] font-semibold text-[#16264A] mb-2">Campuses / colleges ({colleges.length})</p>
        <ul className="text-[13px] text-[#16264A] mb-2 flex flex-col gap-1">
          {colleges.map(c => <li key={c.id}><span className="font-mono text-[12px] text-[#5A6577]">{c.code}</span> · {c.name}</li>)}
        </ul>
        <form onSubmit={saveCollege} className="flex flex-wrap gap-2">
          <input className={`${input} w-32 font-mono`} placeholder="Code" value={college.code} onChange={e => setCollege(v => ({ ...v, code: e.target.value }))} required />
          <input className={`${input} flex-1 min-w-[180px]`} placeholder="Campus name" value={college.name} onChange={e => setCollege(v => ({ ...v, name: e.target.value }))} required />
          <Button size="sm" type="submit" loading={addCollege.isPending}>Add campus</Button>
        </form>
      </div>

      <div>
        <p className="text-[13px] font-semibold text-[#16264A] mb-2">Programmes / classes ({programmes.length})</p>
        <ul className="text-[13px] text-[#16264A] mb-2 flex flex-col gap-1">
          {programmes.map(p => (
            <li key={p.id}>
              <span className="font-mono text-[12px] text-[#5A6577]">{p.code}</span> · {p.name}
              <span className="text-[#5A6577]"> — {p.years} yr · {campusName(p.collegeId)}</span>
            </li>
          ))}
        </ul>
        <form onSubmit={saveProgramme} className="flex flex-wrap gap-2">
          <input className={`${input} w-28 font-mono`} placeholder="Code" value={programme.code} onChange={e => setProgramme(v => ({ ...v, code: e.target.value }))} required />
          <input className={`${input} flex-1 min-w-[180px]`} placeholder="e.g. B.Sc. Physics, or Class 10" value={programme.name} onChange={e => setProgramme(v => ({ ...v, name: e.target.value }))} required />
          <select className={`${input} w-24`} value={programme.years} onChange={e => setProgramme(v => ({ ...v, years: e.target.value }))} title="Duration in years">
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1} yr</option>)}
          </select>
          {colleges.length > 1 && (
            <select className={`${input} w-44`} value={programme.collegeId} onChange={e => setProgramme(v => ({ ...v, collegeId: e.target.value }))}>
              <option value="">All campuses</option>
              {colleges.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button size="sm" type="submit" loading={addProgramme.isPending}>Add programme</Button>
        </form>
      </div>
    </fieldset>
  );
}
