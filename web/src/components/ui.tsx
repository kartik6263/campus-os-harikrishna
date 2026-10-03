import { useState, useEffect, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';

// ─── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none';
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#E0952A] text-white hover:bg-[#C47E1E] active:bg-[#B07019]',
  secondary: 'bg-[#FFFFFF] text-[#16264A] border border-[#D3D8E0] hover:bg-[#EDEFF3] active:bg-[#E0E4EA]',
  ghost: 'bg-transparent text-[#16264A] hover:bg-[#EDEFF3] active:bg-[#E0E4EA]',
  destructive: 'bg-[#A8242C] text-white hover:bg-[#8A1D24] active:bg-[#6E1720]',
};
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[13px] rounded-[4px]',
  md: 'h-9 px-4 text-[15px] rounded-[4px]',
  lg: 'h-11 px-5 text-[15px] rounded-[4px]',
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin" style={{ color }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="50 14" />
    </svg>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  labelHi?: string;
  error?: string;
  hint?: string;
  lang?: 'en' | 'hi';
  prefix?: ReactNode;
  suffix?: ReactNode;
}

export function Input({ label, labelHi, error, hint, lang = 'en', prefix, suffix, className = '', ...props }: InputProps) {
  const displayLabel = lang === 'hi' && labelHi ? labelHi : label;
  return (
    <div className="flex flex-col gap-1">
      {displayLabel && <label className="text-[13px] font-medium text-[#16264A]">{displayLabel}</label>}
      <div className={`flex items-center border rounded-[4px] bg-white transition-colors ${error ? 'border-[#A8242C]' : 'border-[#D3D8E0] focus-within:border-[#E0952A]'}`}>
        {prefix && <span className="pl-3 text-[#5A6577]">{prefix}</span>}
        <input
          className={`flex-1 px-3 py-2 text-[15px] text-[#16264A] placeholder-[#5A6577] bg-transparent outline-none min-w-0 ${className}`}
          {...props}
        />
        {suffix && <span className="pr-3 text-[#5A6577]">{suffix}</span>}
      </div>
      {error && <span className="text-[12px] text-[#A8242C]">{error}</span>}
      {hint && !error && <span className="text-[12px] text-[#5A6577]">{hint}</span>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: ReactNode;
}

export function Select({ label, error, children, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-[13px] font-medium text-[#16264A]">{label}</label>}
      <select
        className={`h-9 px-3 text-[15px] text-[#16264A] bg-white border rounded-[4px] outline-none appearance-none cursor-pointer transition-colors ${error ? 'border-[#A8242C]' : 'border-[#D3D8E0] focus:border-[#E0952A]'} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-[12px] text-[#A8242C]">{error}</span>}
    </div>
  );
}

// ─── Status Pill ──────────────────────────────────────────────────────────────

type StatusType = 'approved' | 'pending' | 'rejected' | 'draft' | 'under-review' | 'paid' | 'overdue' | 'valid' | 'revoked' | 'tampered';

const STATUS_CONFIG: Record<StatusType, { bg: string; text: string; dot: string; label: string; labelHi: string }> = {
  approved: { bg: '#D1FAE5', text: '#0E7A5F', dot: '#0E7A5F', label: 'Approved', labelHi: 'स्वीकृत' },
  pending: { bg: '#FEF9EC', text: '#8A6D1F', dot: '#E0952A', label: 'Pending', labelHi: 'लंबित' },
  rejected: { bg: '#FEE2E2', text: '#A8242C', dot: '#A8242C', label: 'Rejected', labelHi: 'अस्वीकृत' },
  draft: { bg: '#F1F5F9', text: '#5A6577', dot: '#94A3B8', label: 'Draft', labelHi: 'मसौदा' },
  'under-review': { bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6', label: 'Under Review', labelHi: 'समीक्षाधीन' },
  paid: { bg: '#D1FAE5', text: '#0E7A5F', dot: '#0E7A5F', label: 'Paid', labelHi: 'भुगतान हो गया' },
  overdue: { bg: '#FEE2E2', text: '#A8242C', dot: '#A8242C', label: 'Overdue', labelHi: 'अतिदेय' },
  valid: { bg: '#D1FAE5', text: '#0E7A5F', dot: '#0E7A5F', label: 'Valid', labelHi: 'वैध' },
  revoked: { bg: '#FEE2E2', text: '#A8242C', dot: '#A8242C', label: 'Revoked', labelHi: 'रद्द' },
  tampered: { bg: '#FEE2E2', text: '#A8242C', dot: '#A8242C', label: 'Tampered', labelHi: 'छेड़छाड़' },
};

export function StatusPill({ status, lang = 'en', compact }: { status: StatusType; lang?: string; compact?: boolean }) {
  // A status from the server this table does not know is shown as itself, never a crash.
  const raw = String(status ?? '');
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG[raw.toLowerCase().replace(/[_\s]+/g, '-') as StatusType] ?? {
    bg: '#F1F5F9', text: '#5A6577', dot: '#94A3B8',
    label: raw.replace(/[_-]+/g, ' ').replace(/^\w/, c => c.toUpperCase()) || '—', labelHi: raw || '—',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 font-medium rounded-full ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'}`}
      style={{ background: cfg.bg, color: cfg.text }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
      {lang === 'hi' ? cfg.labelHi : cfg.label}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

interface Tab { id: string; label: string; labelHi?: string; }
interface TabsProps { tabs: Tab[]; activeId: string; onChange: (id: string) => void; lang?: string; }

export function Tabs({ tabs, activeId, onChange, lang }: TabsProps) {
  return (
    <div className="flex border-b border-[#D3D8E0]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2.5 text-[14px] font-medium transition-colors relative cursor-pointer ${
            activeId === tab.id
              ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px'
              : 'text-[#5A6577] hover:text-[#16264A]'
          }`}
        >
          {lang === 'hi' && tab.labelHi ? tab.labelHi : tab.label}
        </button>
      ))}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────

interface BreadcrumbItem { label: string; onClick?: () => void; }
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-[13px] text-[#5A6577]">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-[#D3D8E0]">/</span>}
          {item.onClick
            ? <button onClick={item.onClick} className="hover:text-[#16264A] cursor-pointer">{item.label}</button>
            : <span className={i === items.length - 1 ? 'text-[#16264A] font-medium' : ''}>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; width?: string; }

export function Modal({ open, onClose, title, children, footer, width = '480px' }: ModalProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-[#16264A]/40" />
      <div
        className="relative bg-white rounded-[2px] shadow-lg w-full animate-fade-in"
        style={{ maxWidth: width }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#D3D8E0]">
          <h2 className="text-h3 font-semibold text-[#16264A]">{title}</h2>
          <button onClick={onClose} className="text-[#5A6577] hover:text-[#16264A] cursor-pointer p-1">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#D3D8E0]">{footer}</div>}
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

interface DrawerProps { open: boolean; onClose: () => void; title: string; children: ReactNode; }
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className={`fixed inset-0 z-50 transition-all duration-300 ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}>
      <div className={`absolute inset-0 bg-[#16264A]/40 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <div className={`absolute right-0 top-0 bottom-0 w-full max-w-sm bg-white transition-transform duration-300 flex flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#D3D8E0]">
          <h3 className="text-h3 font-semibold text-[#16264A]">{title}</h3>
          <button onClick={onClose} className="text-[#5A6577] hover:text-[#16264A] cursor-pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info' | 'warning';
interface ToastMsg { id: number; type: ToastType; message: string; }

let toastListeners: Array<(t: ToastMsg) => void> = [];
let toastId = 0;
export const toast = {
  success: (m: string) => toastListeners.forEach(l => l({ id: ++toastId, type: 'success', message: m })),
  error: (m: string) => toastListeners.forEach(l => l({ id: ++toastId, type: 'error', message: m })),
  info: (m: string) => toastListeners.forEach(l => l({ id: ++toastId, type: 'info', message: m })),
  warning: (m: string) => toastListeners.forEach(l => l({ id: ++toastId, type: 'warning', message: m })),
};

const TOAST_STYLES: Record<ToastType, string> = {
  success: 'border-l-4 border-[#0E7A5F]',
  error: 'border-l-4 border-[#A8242C]',
  info: 'border-l-4 border-[#E0952A]',
  warning: 'border-l-4 border-[#8A6D1F]',
};
const TOAST_ICONS: Record<ToastType, string> = {
  success: '✓', error: '✕', info: 'ℹ', warning: '⚠',
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const listener = (t: ToastMsg) => {
      setToasts(prev => [...prev, t]);
      setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 4000);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter(l => l !== listener); };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      {toasts.map(t => (
        <div key={t.id} className={`bg-white shadow-lg rounded-[4px] px-4 py-3 flex items-center gap-3 text-[14px] min-w-[260px] animate-fade-in ${TOAST_STYLES[t.type]}`}>
          <span className="font-bold">{TOAST_ICONS[t.type]}</span>
          <span className="text-[#16264A]">{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Inline Alert ─────────────────────────────────────────────────────────────

interface AlertProps { type: 'info' | 'success' | 'warning' | 'error'; children: ReactNode; }
const ALERT_STYLES = {
  info: 'bg-[#EFF6FF] border-[#93C5FD] text-[#1D4ED8]',
  success: 'bg-[#D1FAE5] border-[#6EE7B7] text-[#0E7A5F]',
  warning: 'bg-[#FEF9EC] border-[#FDE68A] text-[#8A6D1F]',
  error: 'bg-[#FEE2E2] border-[#FCA5A5] text-[#A8242C]',
};

export function InlineAlert({ type, children }: AlertProps) {
  return (
    <div className={`border rounded-[4px] px-4 py-3 text-[13px] ${ALERT_STYLES[type]}`}>{children}</div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

export function Skeleton({ className = '', height = 16 }: { className?: string; height?: number }) {
  return <div className={`skeleton ${className}`} style={{ height }} />;
}

export function SkeletonRow() {
  return (
    <div className="flex gap-4 p-3 border-b border-[#D3D8E0]">
      <Skeleton className="w-32" height={14} />
      <Skeleton className="w-48" height={14} />
      <Skeleton className="w-24" height={14} />
      <Skeleton className="w-20" height={14} />
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-[#EDEFF3] flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
      </div>
      <p className="text-[15px] font-medium text-[#16264A]">{title}</p>
      {description && <p className="text-[13px] text-[#5A6577] mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Permission Denied ────────────────────────────────────────────────────────

export function PermissionDenied({ role }: { role?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="w-12 h-12 rounded-full bg-[#FEE2E2] flex items-center justify-center mb-4">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8242C" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
      </div>
      <p className="text-[15px] font-semibold text-[#16264A]">Access Denied</p>
      <p className="text-[13px] text-[#5A6577] mt-1">Your role {role ? `(${role})` : ''} does not have permission to view this section.</p>
      <p className="text-[12px] text-[#5A6577] mt-3">Contact your system administrator to request access.</p>
    </div>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

interface Step { label: string; description?: string; }
export function Stepper({ steps, current }: { steps: Step[]; current: number }) {
  return (
    <div className="flex items-start gap-0">
      {steps.map((step, i) => (
        <div key={i} className="flex-1 flex flex-col items-center">
          <div className="flex items-center w-full">
            <div className={`flex-1 h-px ${i === 0 ? 'invisible' : i <= current ? 'bg-[#E0952A]' : 'bg-[#D3D8E0]'}`} />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 ${
              i < current ? 'bg-[#E0952A] text-white' : i === current ? 'bg-[#E0952A] text-white ring-4 ring-[#FEF3C7]' : 'bg-[#D3D8E0] text-[#5A6577]'}`}>
              {i < current ? '✓' : i + 1}
            </div>
            <div className={`flex-1 h-px ${i === steps.length - 1 ? 'invisible' : i < current ? 'bg-[#E0952A]' : 'bg-[#D3D8E0]'}`} />
          </div>
          <p className={`mt-2 text-[11px] text-center ${i === current ? 'text-[#E0952A] font-semibold' : 'text-[#5A6577]'}`}>{step.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineItem { label: string; date: string; by: string; status: 'done' | 'current' | 'pending'; note?: string; }
export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3 pb-4 relative">
          <div className="flex flex-col items-center">
            <div className={`w-3 h-3 rounded-full mt-1 shrink-0 ${item.status === 'done' ? 'bg-[#0E7A5F]' : item.status === 'current' ? 'bg-[#E0952A]' : 'bg-[#D3D8E0]'}`} />
            {i < items.length - 1 && <div className="w-px flex-1 bg-[#D3D8E0] mt-1" />}
          </div>
          <div className="pb-2">
            <p className={`text-[14px] font-medium ${item.status === 'pending' ? 'text-[#5A6577]' : 'text-[#16264A]'}`}>{item.label}</p>
            <p className="text-[12px] text-[#5A6577]">{item.date} · {item.by}</p>
            {item.note && <p className="text-[12px] text-[#5A6577] mt-1">{item.note}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Verified Seal ────────────────────────────────────────────────────────────

export function VerifiedSeal({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <polygon points="32,2 40,10 50,8 54,18 64,22 62,32 64,42 54,46 50,56 40,54 32,62 24,54 14,56 10,46 0,42 2,32 0,22 10,18 14,8 24,10" fill="#E0952A" />
      <polygon points="32,8 38.5,15 47,13 50.5,21.5 59,25 57,32 59,39 50.5,42.5 47,51 38.5,49 32,56 25.5,49 17,51 13.5,42.5 5,39 7,32 5,25 13.5,21.5 17,13 25.5,15" fill="#C47E1E" opacity="0.3" />
      <path d="M20 32l8 8 16-16" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="32" y="47" textAnchor="middle" fill="white" fontSize="7" fontWeight="600" fontFamily="IBM Plex Sans, sans-serif"></text>
    </svg>
  );
}

// ─── Data Table ───────────────────────────────────────────────────────────────

interface Column<T> { key: keyof T | string; label: string; render?: (row: T) => ReactNode; sortable?: boolean; mono?: boolean; align?: 'left' | 'right' | 'center'; width?: string; }
interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  onRowClick?: (row: T) => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  pageSize?: number;
}

export function DataTable<T extends { id: string }>({ columns, data, loading, onRowClick, searchPlaceholder = 'Search...', emptyTitle = 'No records found', pageSize = 10 }: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = data.filter(row =>
    Object.values(row).some(v => String(v).toLowerCase().includes(search.toLowerCase()))
  );
  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[sortKey] ?? '');
        const bv = String((b as Record<string, unknown>)[sortKey] ?? '');
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      })
    : filtered;

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  function toggleAll() {
    if (selected.size === paged.length) setSelected(new Set());
    else setSelected(new Set(paged.map(r => r.id)));
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 p-3 border-b border-[#D3D8E0]">
        <div className="flex items-center gap-2 flex-1 max-w-sm border border-[#D3D8E0] rounded-[4px] px-3 bg-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder={searchPlaceholder} className="flex-1 py-2 text-[14px] outline-none bg-transparent text-[#16264A] placeholder-[#5A6577]" />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-[13px] text-[#5A6577]">{selected.size} selected</span>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" variant="destructive" onClick={() => { toast.info(`${selected.size} records action triggered`); setSelected(new Set()); }}>Bulk Action</Button>
          </div>
        )}
        <span className="text-[13px] text-[#5A6577] ml-auto">{filtered.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="ruled-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input type="checkbox" checked={selected.size === paged.length && paged.length > 0} onChange={toggleAll} className="cursor-pointer" />
              </th>
              {columns.map(col => (
                <th key={String(col.key)} style={{ width: col.width }} className={col.align === 'right' ? 'text-right' : ''}>
                  {col.sortable !== false ? (
                    <button onClick={() => toggleSort(String(col.key))} className="flex items-center gap-1 cursor-pointer text-[#5A6577] hover:text-[#16264A]">
                      {col.label}
                      {sortKey === String(col.key) ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
                    </button>
                  ) : col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}><td colSpan={columns.length + 1}><SkeletonRow /></td></tr>
              ))
            ) : paged.length === 0 ? (
              <tr><td colSpan={columns.length + 1}><EmptyState title={emptyTitle} description="Try adjusting your search or filters." /></td></tr>
            ) : paged.map(row => (
              <tr key={row.id} onClick={() => onRowClick?.(row)} className={onRowClick ? 'cursor-pointer' : ''}>
                <td onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(row.id)} onChange={() => {
                    const next = new Set(selected);
                    next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                    setSelected(next);
                  }} className="cursor-pointer" />
                </td>
                {columns.map(col => (
                  <td key={String(col.key)} className={`${col.mono ? 'font-mono text-[13px]' : ''} ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[String(col.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#D3D8E0]">
          <span className="text-[13px] text-[#5A6577]">Page {page} of {totalPages}</span>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(1)}>«</Button>
            <Button size="sm" variant="ghost" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return <Button key={p} size="sm" variant={p === page ? 'primary' : 'ghost'} onClick={() => setPage(p)}>{p}</Button>;
            })}
            <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</Button>
            <Button size="sm" variant="ghost" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#16264A] text-white text-[11px] rounded-[2px] whitespace-nowrap z-50">
          {text}
        </span>
      )}
    </span>
  );
}

// ─── Notification Item ────────────────────────────────────────────────────────

export function NotificationItem({ title, time, read, onClick }: { title: string; time: string; read?: boolean; onClick?: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left px-4 py-3 border-b border-[#D3D8E0] hover:bg-[#EDEFF3] transition-colors cursor-pointer ${read ? '' : 'bg-[#FEF9EC]'}`}>
      <div className="flex items-start gap-2">
        {!read && <span className="w-1.5 h-1.5 rounded-full bg-[#E0952A] mt-1.5 shrink-0" />}
        <div className={!read ? '' : 'pl-3.5'}>
          <p className="text-[13px] text-[#16264A] font-medium">{title}</p>
          <p className="text-[11px] text-[#5A6577]">{time}</p>
        </div>
      </div>
    </button>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

export function Avatar({ name, size = 32, src }: { name: string; size?: number; src?: string }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const hue = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return src ? (
    <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="rounded-full flex items-center justify-center text-white font-medium shrink-0"
      style={{ width: size, height: size, background: `hsl(${hue}, 45%, 40%)`, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

// ─── Checkbox ─────────────────────────────────────────────────────────────────

export function Checkbox({ label, checked, onChange, disabled }: { label?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`flex items-center gap-2 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} disabled={disabled} className="w-4 h-4 rounded-[2px] accent-[#E0952A] cursor-pointer" />
      {label && <span className="text-[14px] text-[#16264A]">{label}</span>}
    </label>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative shrink-0 w-9 h-5 p-0 rounded-full transition-colors ${on ? 'bg-[#E0952A]' : 'bg-[#D3D8E0]'}`}
      >
        <span className={`absolute left-0 top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
      {label && <span className="text-[14px] text-[#16264A]">{label}</span>}
    </label>
  );
}

// ─── OTP Input ────────────────────────────────────────────────────────────────

export function OtpInput({ value, onChange, length = 6 }: { value: string; onChange: (v: string) => void; length?: number }) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.split('').concat(Array(length).fill('')).slice(0, length);

  function handleChange(i: number, v: string) {
    if (!/^\d?$/.test(v)) return;
    const next = [...chars];
    next[i] = v;
    onChange(next.join(''));
    if (v && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !chars[i] && i > 0) refs.current[i - 1]?.focus();
  }

  return (
    <div className="flex gap-2">
      {chars.map((ch, i) => (
        <input
          key={i}
          ref={el => { refs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={ch}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          className="w-10 h-12 text-center text-[20px] font-mono border border-[#D3D8E0] rounded-[4px] bg-white outline-none focus:border-[#E0952A] text-[#16264A]"
        />
      ))}
    </div>
  );
}

// ─── Record Sheet Header Band ─────────────────────────────────────────────────

export function RecordBand({ title, subtitle, id, meta }: { title: string; subtitle?: string; id?: string; meta?: Array<{ label: string; value: string }> }) {
  return (
    <div className="bg-[#16264A] text-white px-6 py-4 rounded-t-[2px]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-h2 font-semibold">{title}</h2>
          {subtitle && <p className="text-[13px] text-[#94A3B8] mt-0.5">{subtitle}</p>}
        </div>
        {id && <span className="font-mono text-[13px] text-[#94A3B8] mt-1">{id}</span>}
      </div>
      {meta && meta.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-white/10">
          {meta.map(m => (
            <div key={m.label}>
              <p className="text-[10px] uppercase tracking-wider text-[#94A3B8]">{m.label}</p>
              <p className="text-[13px] font-medium">{m.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
