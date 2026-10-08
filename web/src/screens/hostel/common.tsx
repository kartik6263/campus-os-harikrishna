import { useEffect, useState } from 'react';
import { Select } from '../../components/ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import type { HostelSummary } from '../../lib/hostel';

export const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');

export function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th>;
}

export function Panel({ title, action, children }: { title?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-[#D3D8E0]">
          {title && <p className="text-[13px] font-semibold text-[#16264A]">{title}</p>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${className}`}>{children}</span>;
}

/** Who may do what here; the server enforces the same split. */
export function useHostelRole() {
  const { user } = useAuth();
  const role = user?.role;
  return { canSetup: role === 'REGISTRAR' || role === 'ADMIN', canOps: role === 'OFFICE' || role === 'REGISTRAR' || role === 'ADMIN' };
}

export function HostelPicker({ hostels, value, onChange, all, label = 'Hostel' }: { hostels: HostelSummary[]; value: string; onChange: (v: string) => void; all?: boolean; label?: string }) {
  return (
    <div className="w-60">
      <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {all && <option value="">All hostels</option>}
        {!all && !value && <option value="">Choose…</option>}
        {hostels.map((h) => <option key={h.id} value={h.id}>{h.name}{h.active ? '' : ' (closed)'}</option>)}
      </Select>
    </div>
  );
}

/** A search box that settles before it asks the server. */
export function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** A comma-separated list typed by a person, as clean items. */
export const listOf = (s: string) => s.split(',').map((x) => x.trim()).filter((x) => x.length >= 2);
