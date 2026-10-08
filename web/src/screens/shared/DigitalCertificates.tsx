import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Checkbox, EmptyState, InlineAlert, Input, Modal, Select, Spinner, Tabs, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { copyText, downloadCSV, downloadTemplate, readCSV } from '../../lib/export';
import { pickFiles, useCollection, type Stored } from '../../lib/records';
import {
  downloadCertificate, standing, useIssue, useRegister, useRevoke, useRotateKey, useSigningKeys, useTemplates,
  type DigitalCertificate, type IssueResult, type Recipient,
} from '../../lib/certificates';
import type { ProgrammeCohorts, RegisterRow } from '../../lib/lifecycle';
import { STATUS_LABEL } from '../../lib/lifecycle';

/**
 * Digital certificates: the register of everything the institution has
 * signed, issuing directly (one or a whole batch — a convocation, a seminar),
 * revoking, the reports of suspected forgeries filed by the public verifier,
 * and the signing keys.
 *
 * The college office reads the register, downloads PDFs and works the
 * forgery reports; the registrar, principal and administrator issue and
 * revoke; only the administrator rotates the signing key.
 */

const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-left px-3 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider whitespace-nowrap">{children}</th>;
}

function Badge({ c }: { c: Pick<DigitalCertificate, 'status' | 'expired'> }) {
  const s = standing(c);
  const cls = s === 'Valid' ? 'bg-[#D1FAE5] text-[#0E7A5F]' : s === 'Revoked' ? 'bg-[#FEE2E2] text-[#A8242C]' : 'bg-[#FEF9EC] text-[#8A6D1F]';
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-[2px] ${cls}`}>{s}</span>;
}

export default function DigitalCertificates() {
  const { user } = useAuth();
  const role = user?.role;
  const canIssue = role === 'REGISTRAR' || role === 'ADMIN' || role === 'PRINCIPAL';
  const canKeys = role === 'REGISTRAR' || role === 'ADMIN';
  const [tab, setTab] = useState('register');
  const reports = useCollection<ForgeryReport>('acad:forgery-reports', []);
  const openReports = reports.items.filter((r) => r.status !== 'closed').length;

  const tabs = [
    { id: 'register', label: 'Register' },
    ...(canIssue ? [{ id: 'issue', label: 'Issue certificates' }] : []),
    { id: 'forgery', label: `Forgery reports${openReports ? ` (${openReports})` : ''}` },
    ...(canKeys ? [{ id: 'keys', label: 'Signing keys' }] : []),
  ];

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4">
        <h1 className="text-[18px] font-bold text-white">Digital Certificates</h1>
        <p className="text-[13px] text-white/60 mt-0.5">Issue, sign, revoke and verify — every certificate carries an Ed25519 signature and a registered PDF fingerprint</p>
      </div>
      <div className="bg-white border-b border-[#D3D8E0] px-6"><Tabs tabs={tabs} activeId={tab} onChange={setTab} /></div>
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'register' && <RegisterTab canRevoke={canKeys} />}
        {tab === 'issue' && canIssue && <IssueTab onDone={() => setTab('register')} />}
        {tab === 'forgery' && <ForgeryTab reports={reports} />}
        {tab === 'keys' && canKeys && <KeysTab canRotate={role === 'ADMIN'} />}
      </div>
    </div>
  );
}

// ─── Register ────────────────────────────────────────────────────────────────

function RegisterTab({ canRevoke }: { canRevoke: boolean }) {
  const templates = useTemplates();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [batch, setBatch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const reg = useRegister({ q: search.length >= 2 ? search : undefined, type: type || undefined, status: status || undefined, batch: batch || undefined });
  const [open, setOpen] = useState<DigitalCertificate | null>(null);
  const rows = reg.data?.certificates ?? [];

  async function pdf(c: DigitalCertificate) {
    try { await downloadCertificate(c); } catch (e) { toast.error(errText(e)); }
  }

  return (
    <div className="space-y-4">
      {reg.data && (
        <div className="grid grid-cols-3 gap-3 max-w-xl">
          {[['Valid', reg.data.counts.valid, 'text-[#0E7A5F]'], ['Revoked', reg.data.counts.revoked, 'text-[#A8242C]'], ['Expired', reg.data.counts.expired, 'text-[#8A6D1F]']].map(([l, n, c]) => (
            <div key={String(l)} className="bg-white border border-[#D3D8E0] rounded-[4px] px-3 py-2.5"><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className={`text-[22px] font-semibold tabular-nums ${c}`}>{n}</p></div>
          ))}
        </div>
      )}
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-[#D3D8E0]">
          <div className="w-64"><Input label="Search" placeholder="Number, name, reference or batch" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="w-52"><Select label="Type" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{(templates.data ?? []).map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}</Select></div>
          <div className="w-36"><Select label="Standing" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="VALID">Valid</option><option value="REVOKED">Revoked</option><option value="EXPIRED">Expired</option></Select></div>
          <div className="w-52"><Select label="Batch" value={batch} onChange={(e) => setBatch(e.target.value)}><option value="">All batches</option>{(reg.data?.batches ?? []).map((b) => <option key={b.batchRef} value={b.batchRef}>{b.batchRef} ({b.count})</option>)}</Select></div>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('certificate-register', rows.map((c) => ({ serialNo: c.serialNo, type: c.type, title: c.title, recipient: c.recipientName, reference: c.recipientRef ?? '', issued: c.issuedAt.slice(0, 10), validUntil: c.validUntil?.slice(0, 10) ?? '', standing: standing(c), signedBy: `${c.issuer.name}, ${c.issuer.title}`, batch: c.batchRef ?? '', keyId: c.keyId, pdfSha256: c.pdfHash ?? '', verifications: c.verifications })))}>Export CSV</Button>
        </div>
        {reg.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : reg.isError ? <div className="p-4"><InlineAlert type="error">{errText(reg.error)}</InlineAlert></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No certificates match" description="Certificates appear here when the office marks a request ready or when they are issued directly." /></div> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Certificate</Th><Th>Recipient</Th><Th>Issued</Th><Th>Signed by</Th><Th>Standing</Th><Th>Checks</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} className="border-b border-[#EDEFF3] hover:bg-[#FEF9EC] cursor-pointer" onClick={() => setOpen(c)}>
                      <td className="px-3 py-2.5"><p className="text-[#16264A] font-medium">{c.title}</p><p className="font-mono text-[11px] text-[#5A6577]">{c.serialNo}{c.batchRef ? ` · ${c.batchRef}` : ''}</p></td>
                      <td className="px-3 py-2.5"><p className="text-[#16264A]">{c.recipientName}</p><p className="font-mono text-[11px] text-[#5A6577]">{c.recipientRef ?? '—'}</p></td>
                      <td className="px-3 py-2.5 text-[12px] whitespace-nowrap">{day(c.issuedAt)}{c.validUntil ? <p className="text-[11px] text-[#5A6577]">until {day(c.validUntil)}</p> : null}</td>
                      <td className="px-3 py-2.5 text-[12px]">{c.issuer.name}<p className="text-[11px] text-[#5A6577]">{c.issuer.title}</p></td>
                      <td className="px-3 py-2.5"><Badge c={c} /></td>
                      <td className="px-3 py-2.5 tabular-nums text-[12px] text-[#5A6577]">{c.verifications}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {c.hasPdf && <Button size="sm" variant="ghost" onClick={() => void pdf(c)}>PDF</Button>}
                        <Button size="sm" variant="ghost" onClick={() => setOpen(c)}>Details</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-4 py-2 text-[12px] text-[#5A6577]">Showing {reg.data!.shown} of {reg.data!.total}{reg.data!.total > reg.data!.shown ? ' — narrow the search to see the rest' : ''}.</p>
          </>
        )}
      </div>
      {open && <DetailModal c={rows.find((r) => r.id === open.id) ?? open} canRevoke={canRevoke} onClose={() => setOpen(null)} onPdf={() => void pdf(open)} />}
    </div>
  );
}

function DetailModal({ c, canRevoke, onClose, onPdf }: { c: DigitalCertificate; canRevoke: boolean; onClose: () => void; onPdf: () => void }) {
  const [revoking, setRevoking] = useState(false);
  const [reason, setReason] = useState('');
  const revoke = useRevoke();

  async function doRevoke() {
    try {
      await revoke.mutateAsync({ id: c.id, reason: reason.trim() });
      toast.success(`${c.serialNo} revoked — verifiers will now see it as revoked`);
      setRevoking(false);
    } catch (e) { toast.error(errText(e)); }
  }

  return (
    <Modal open onClose={onClose} title={`${c.title} — ${c.serialNo}`} width="640px"
      footer={revoking ? <>
        <Button size="sm" variant="secondary" onClick={() => setRevoking(false)}>Back</Button>
        <Button size="sm" variant="destructive" loading={revoke.isPending} disabled={reason.trim().length < 10} onClick={() => void doRevoke()}>Revoke certificate</Button>
      </> : <>
        {canRevoke && c.status === 'VALID' && <Button size="sm" variant="ghost" onClick={() => setRevoking(true)}>Revoke…</Button>}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => void copyText(c.verifyUrl, 'Verification link')}>Copy verification link</Button>
        {c.hasPdf && <Button size="sm" onClick={onPdf}>Download PDF</Button>}
      </>}>
      {revoking ? (
        <div className="space-y-3">
          <InlineAlert type="warning">Revoking cannot be undone. Anyone who verifies this certificate — by number, QR code or PDF — will see it as revoked, with this reason. The holder is notified.</InlineAlert>
          <Input label="Reason (shown to verifiers)" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Issued in error; replaced by RDU/DEG/2026/000042" />
        </div>
      ) : (
        <div className="space-y-3 text-[13px]">
          <div className="flex items-center gap-2"><Badge c={c} />{c.status === 'REVOKED' && <span className="text-[12px] text-[#A8242C]">{day(c.revokedAt)} by {c.revokedBy}: {c.revokedReason}</span>}</div>
          <p className="text-[#16264A]"><b>{c.recipientName}</b>{c.recipientRef ? <span className="font-mono text-[12px] text-[#5A6577]"> · {c.recipientRef}</span> : null}{c.recipientEmail ? <span className="text-[12px] text-[#5A6577]"> · {c.recipientEmail}</span> : null}</p>
          <p className="text-[#16264A]">{c.statement}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            {[...c.fields, ['Issued', day(c.issuedAt)], ...(c.validUntil ? [['Valid until', day(c.validUntil)]] : []), ['Signed by', `${c.issuer.name}, ${c.issuer.title}`], ['Checked by verifiers', `${c.verifications}${c.lastVerifiedAt ? ` · last ${day(c.lastVerifiedAt)}` : ''}`]].map(([l, v]) => (
              <div key={l}><p className="text-[11px] text-[#5A6577] uppercase tracking-wide">{l}</p><p className="text-[#16264A]">{v}</p></div>
            ))}
          </div>
          <div className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-[4px] p-3 space-y-1 text-[12px]">
            <p><span className="text-[#5A6577]">Signature:</span> Ed25519, key <span className="font-mono">{c.keyId}</span>{c.keyRetired ? ' (retired — still verifies)' : ''}</p>
            <p className="break-all"><span className="text-[#5A6577]">Payload SHA-256:</span> <span className="font-mono">{c.payloadHash}</span></p>
            {c.pdfHash && <p className="break-all"><span className="text-[#5A6577]">PDF SHA-256:</span> <span className="font-mono">{c.pdfHash}</span></p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Issue ───────────────────────────────────────────────────────────────────

interface External { name: string; ref: string; email: string }

function IssueTab({ onDone }: { onDone: () => void }) {
  const templates = useTemplates();
  const issue = useIssue();
  const [type, setType] = useState('');
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [fields, setFields] = useState<Array<[string, string]>>([]);
  const [validUntil, setValidUntil] = useState('');
  const [batchRef, setBatchRef] = useState('');
  const [signName, setSignName] = useState('');
  const [signTitle, setSignTitle] = useState('');
  const [source, setSource] = useState<'students' | 'external'>('students');
  const [picked, setPicked] = useState<Map<string, RegisterRow>>(new Map());
  const [external, setExternal] = useState<External[]>([{ name: '', ref: '', email: '' }]);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<IssueResult | null>(null);

  function chooseType(t: string) {
    setType(t);
    const tpl = templates.data?.find((x) => x.type === t);
    if (tpl) { setTitle(tpl.title); setStatement(tpl.statement); }
  }

  const ext = external.filter((e) => e.name.trim().length >= 2);
  const recipients: Recipient[] = source === 'students'
    ? [...picked.keys()].map((studentId) => ({ studentId }))
    : ext.map((e) => ({ name: e.name.trim(), ...(e.ref.trim() ? { ref: e.ref.trim() } : {}), ...(e.email.trim() ? { email: e.email.trim() } : {}) }));
  const badEmail = source === 'external' && ext.some((e) => e.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email.trim()));
  const signerPartial = (signName.trim() === '') !== (signTitle.trim() === '');
  const ready = type && title.trim().length >= 3 && statement.trim().length >= 10 && recipients.length > 0 && recipients.length <= 500 && !badEmail && !signerPartial && fields.every(([l, v]) => (l.trim() && v.trim()) || (!l.trim() && !v.trim()));

  async function submit() {
    try {
      const r = await issue.mutateAsync({
        type, title: title.trim(), statement: statement.trim(),
        fields: fields.filter(([l, v]) => l.trim() && v.trim()),
        ...(validUntil ? { validUntil } : {}),
        ...(batchRef.trim() ? { batchRef: batchRef.trim() } : {}),
        ...(signName.trim() && signTitle.trim() ? { issuer: { name: signName.trim(), title: signTitle.trim() } } : {}),
        recipients,
      });
      setResult(r); setConfirm(false);
      toast.success(`${r.issued.length} certificate${r.issued.length === 1 ? '' : 's'} signed and issued${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
      setPicked(new Map()); setExternal([{ name: '', ref: '', email: '' }]);
    } catch (e) {
      setConfirm(false);
      const body = e instanceof ApiError ? (e.details as IssueResult | undefined) : undefined;
      if (body?.failed) setResult({ batchRef: null, issued: [], failed: body.failed });
      toast.error(errText(e));
    }
  }

  async function importCsv() {
    const [file] = await pickFiles('.csv,text/csv');
    if (!file) return;
    try {
      const rows = await readCSV(file);
      const got = rows.map((r) => ({ name: (r.name ?? r.Name ?? '').trim(), ref: (r.ref ?? r.reference ?? r.Reference ?? '').trim(), email: (r.email ?? r.Email ?? '').trim() })).filter((r) => r.name);
      if (!got.length) { toast.error('No rows with a "name" column were found'); return; }
      setExternal((x) => [...x.filter((e) => e.name.trim()), ...got].slice(0, 500));
      toast.success(`${got.length} recipient${got.length === 1 ? '' : 's'} imported`);
    } catch { toast.error('That file could not be read as CSV'); }
  }

  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 space-y-3 self-start">
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">1 · The certificate</p>
        {templates.isLoading ? <Spinner /> : (
          <Select label="Type" value={type} onChange={(e) => chooseType(e.target.value)}>
            <option value="">Choose…</option>
            {(templates.data ?? []).map((t) => <option key={t.type} value={t.type}>{t.type}</option>)}
          </Select>
        )}
        <Input label="Title printed on it" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-[#16264A]">Statement</span>
          <textarea rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} maxLength={600} className="px-3 py-2 text-[13px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />
          <span className="text-[11px] text-[#5A6577]">Printed after "This is to certify that [name]". Use {'{programme}'} for the student's programme; {'{name}'} repeats the name.</span>
        </label>
        <div>
          <div className="flex items-center justify-between mb-1"><span className="text-[13px] font-medium text-[#16264A]">Particulars printed on every copy</span>{fields.length < 6 && <button onClick={() => setFields((f) => [...f, ['', '']])} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">+ Add</button>}</div>
          {fields.length === 0 && <p className="text-[12px] text-[#5A6577]">None. Students' enrolment number and programme are added automatically.</p>}
          {fields.map(([l, v], i) => (
            <div key={i} className="flex gap-2 mb-1.5">
              <input value={l} onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))} placeholder="Label, e.g. Event" maxLength={40} className="w-40 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
              <input value={v} onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? [x[0], e.target.value] : x)))} placeholder="Value" maxLength={160} className="flex-1 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
              <button onClick={() => setFields((f) => f.filter((_, j) => j !== i))} className="text-[#A8242C] px-2 cursor-pointer" aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valid until (optional)" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} hint="Leave blank for no expiry" />
          <Input label="Batch reference (optional)" value={batchRef} onChange={(e) => setBatchRef(e.target.value)} placeholder="e.g. CONVOCATION/2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Signatory name (optional)" value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Defaults to you" />
          <Input label="Signatory title" value={signTitle} onChange={(e) => setSignTitle(e.target.value)} placeholder="e.g. Vice-Chancellor" error={signerPartial ? 'Give both name and title, or neither' : undefined} />
        </div>
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-4 space-y-3 self-start">
        <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">2 · Recipients</p>
        <div className="flex gap-2">
          {([['students', 'Students on the rolls'], ['external', 'Others (guests, participants)']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setSource(k)} className={`text-[12px] px-3 py-1.5 rounded-[4px] border cursor-pointer ${source === k ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{l}</button>
          ))}
        </div>
        {source === 'students' ? <StudentPicker picked={picked} setPicked={setPicked} /> : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => void importCsv()}>Import CSV</Button>
              <Button size="sm" variant="ghost" onClick={() => downloadTemplate('certificate-recipients', ['name', 'ref', 'email'], ['Dr. Meera Iyer', 'GUEST-014', 'meera@example.org'])}>CSV template</Button>
              <div className="flex-1" />
              <button onClick={() => setExternal((x) => [...x, { name: '', ref: '', email: '' }])} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">+ Add row</button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {external.map((e, i) => (
                <div key={i} className="flex gap-2">
                  <input value={e.name} onChange={(v) => setExternal((x) => x.map((r, j) => (j === i ? { ...r, name: v.target.value } : r)))} placeholder="Full name" maxLength={120} className="flex-1 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                  <input value={e.ref} onChange={(v) => setExternal((x) => x.map((r, j) => (j === i ? { ...r, ref: v.target.value } : r)))} placeholder="Reference" maxLength={60} className="w-28 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                  <input value={e.email} onChange={(v) => setExternal((x) => x.map((r, j) => (j === i ? { ...r, email: v.target.value } : r)))} placeholder="Email" className="w-44 h-8 px-2 text-[13px] border border-[#D3D8E0] rounded-[4px]" />
                  <button onClick={() => setExternal((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ name: '', ref: '', email: '' }]))} className="text-[#A8242C] px-2 cursor-pointer" aria-label="Remove">✕</button>
                </div>
              ))}
            </div>
            {badEmail && <p className="text-[12px] text-[#A8242C]">One of the email addresses is not valid.</p>}
          </div>
        )}
        <div className="border-t border-[#EDEFF3] pt-3 flex items-center gap-3">
          <p className="text-[13px] text-[#16264A] flex-1">{recipients.length} recipient{recipients.length === 1 ? '' : 's'}{recipients.length > 500 ? ' — at most 500 at a time' : ''}</p>
          <Button disabled={!ready} onClick={() => setConfirm(true)}>Review &amp; issue</Button>
        </div>
      </div>

      {result && (
        <div className="xl:col-span-2 bg-white border border-[#D3D8E0] rounded-[4px] p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[14px] font-semibold text-[#16264A]">{result.issued.length} issued{result.batchRef ? ` · batch ${result.batchRef}` : ''}{result.failed.length ? ` · ${result.failed.length} not issued` : ''}</p>
            <div className="flex gap-2">
              {result.issued.length > 0 && <Button size="sm" variant="secondary" onClick={() => downloadCSV('issued-certificates', result.issued.map((i) => ({ serialNo: i.serialNo, recipient: i.recipientName })))}>Export list</Button>}
              <Button size="sm" variant="ghost" onClick={onDone}>Open the register</Button>
            </div>
          </div>
          {result.failed.length > 0 && <InlineAlert type="warning">{result.failed.map((f) => `Row ${f.row} (${f.recipient}): ${f.reason}`).join(' · ')}</InlineAlert>}
          <div className="divide-y divide-[#EDEFF3] mt-2 max-h-72 overflow-y-auto">
            {result.issued.map((i) => (
              <div key={i.id} className="flex items-center justify-between py-1.5 text-[13px]">
                <span><span className="font-mono text-[12px] text-[#5A6577]">{i.serialNo}</span> · {i.recipientName}</span>
                <Button size="sm" variant="ghost" onClick={() => void downloadCertificate(i).catch((e) => toast.error(errText(e)))}>PDF</Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {confirm && (
        <Modal open onClose={() => setConfirm(false)} title={`Issue ${recipients.length} ${type}${recipients.length === 1 ? '' : 's'}?`} width="560px"
          footer={<><Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button><Button size="sm" loading={issue.isPending} onClick={() => void submit()}>Sign &amp; issue</Button></>}>
          <div className="space-y-3 text-[13px]">
            <div className="border border-[#D3D8E0] rounded-[4px] p-3 bg-[#FBFAF6]">
              <p className="text-center font-semibold text-[#B8862B] text-[16px]">{title}</p>
              <p className="text-center text-[#5A6577] text-[12px] mt-1">This is to certify that</p>
              <p className="text-center font-semibold text-[#16264A]">[recipient's name]</p>
              <p className="text-center text-[#16264A] mt-1">{statement}</p>
              {fields.filter(([l, v]) => l && v).length > 0 && <p className="text-center text-[12px] text-[#5A6577] mt-2">{fields.filter(([l, v]) => l && v).map(([l, v]) => `${l}: ${v}`).join(' · ')}</p>}
            </div>
            <p>Signed as <b>{signName.trim() && signTitle.trim() ? `${signName.trim()}, ${signTitle.trim()}` : 'you, with your designation'}</b>{validUntil ? `, valid until ${day(validUntil)}` : ', with no expiry'}.</p>
            <InlineAlert type="info">Each certificate is numbered, signed with the institution's Ed25519 key, rendered as a PDF whose fingerprint is filed, and — for students — notified to the holder. What is signed cannot be edited afterwards; a mistake is corrected by revoking and issuing again.</InlineAlert>
          </div>
        </Modal>
      )}
    </div>
  );
}

const STATUSES = ['ACTIVE', 'GRADUATED', 'ON_LEAVE', 'DETAINED', 'SUSPENDED', 'WITHDRAWN', 'TRANSFERRED'] as const;

function StudentPicker({ picked, setPicked }: { picked: Map<string, RegisterRow>; setPicked: (m: Map<string, RegisterRow>) => void }) {
  const overview = useQuery({ queryKey: ['lifecycle', 'overview'], queryFn: () => api<{ programmes: ProgrammeCohorts[] }>('/api/lifecycle/overview') });
  const [programmeId, setProgrammeId] = useState('');
  const [semester, setSemester] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const params = new URLSearchParams({ ...(programmeId ? { programmeId } : {}), ...(semester ? { semester } : {}), ...(status ? { status } : {}), ...(search.length >= 2 ? { q: search } : {}) });
  const list = useQuery({ queryKey: ['lifecycle', 'register', 'picker', params.toString()], queryFn: () => api<{ total: number; shown: number; students: RegisterRow[] }>(`/api/lifecycle/students?${params}`) });
  const programme = overview.data?.programmes.find((p) => p.id === programmeId);
  const rows = list.data?.students ?? [];
  const allPicked = rows.length > 0 && rows.every((r) => picked.has(r.id));
  const toggle = (r: RegisterRow, on: boolean) => { const m = new Map(picked); if (on) m.set(r.id, r); else m.delete(r.id); setPicked(m); };
  const selected = useMemo(() => [...picked.values()], [picked]);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Select label="Programme" value={programmeId} onChange={(e) => { setProgrammeId(e.target.value); setSemester(''); }}><option value="">All</option>{(overview.data?.programmes ?? []).map((p) => <option key={p.id} value={p.id}>{p.shortName}</option>)}</Select>
        <Select label="Semester" value={semester} onChange={(e) => setSemester(e.target.value)} disabled={!programme}><option value="">All</option>{programme && Array.from({ length: programme.finalSemester }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}</Select>
        <Select label="Standing" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</Select>
        <Input label="Search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or number" />
      </div>
      {list.isLoading ? <Spinner /> : list.isError ? <InlineAlert type="error">{errText(list.error)}</InlineAlert> : (
        <div className="border border-[#D3D8E0] rounded-[4px]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#EDEFF3] bg-[#F7F8FA]">
            <Checkbox label={`Select all ${rows.length} shown${list.data!.total > rows.length ? ` (of ${list.data!.total})` : ''}`} checked={allPicked} onChange={(v) => { const m = new Map(picked); rows.forEach((r) => (v ? m.set(r.id, r) : m.delete(r.id))); setPicked(m); }} />
            {picked.size > 0 && <button onClick={() => setPicked(new Map())} className="text-[12px] text-[#A8242C] hover:underline cursor-pointer">Clear {picked.size}</button>}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-[#EDEFF3]">
            {rows.length === 0 && <p className="p-3 text-[12px] text-[#5A6577]">No students match.</p>}
            {rows.map((r) => (
              <div key={r.id} className="px-3 py-1.5 flex items-center gap-2">
                <Checkbox checked={picked.has(r.id)} onChange={(v) => toggle(r, v)} />
                <div className="flex-1 min-w-0"><p className="text-[13px] text-[#16264A] truncate">{r.name}</p><p className="font-mono text-[11px] text-[#5A6577]">{r.enrolmentNo} · {r.programme} sem {r.semester} · {STATUS_LABEL[r.status]}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {selected.length > 0 && <p className="text-[12px] text-[#5A6577]">Selected: {selected.slice(0, 6).map((s) => s.name).join(', ')}{selected.length > 6 ? ` and ${selected.length - 6} more` : ''}</p>}
    </div>
  );
}

// ─── Forgery reports ─────────────────────────────────────────────────────────

interface ForgeryReport { id: string; certificate: string; verification: string; result: string; note: string; contact: string; reportedAt: string; status: 'open' | 'investigating' | 'closed'; finding?: string; handledBy?: string; handledAt?: string }

function ForgeryTab({ reports }: { reports: ReturnType<typeof useCollection<ForgeryReport>> }) {
  const { user } = useAuth();
  const [view, setView] = useState<'open' | 'all'>('open');
  const [open, setOpen] = useState<Stored<ForgeryReport> | null>(null);
  const [finding, setFinding] = useState('');
  const rows = reports.items.filter((r) => view === 'all' || r.status !== 'closed').sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));

  function move(status: ForgeryReport['status']) {
    if (!open) return;
    if (status === 'closed' && finding.trim().length < 10) { toast.error('Record what was found before closing'); return; }
    reports.update(open._rid ?? open.id, { status, ...(finding.trim() ? { finding: finding.trim() } : {}), handledBy: user?.office?.name ?? user?.email ?? 'Staff', handledAt: new Date().toISOString() });
    toast.success(status === 'closed' ? 'Report closed' : 'Marked as under investigation');
    setOpen(null); setFinding('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#D3D8E0]">
        {(['open', 'all'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === v ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577]'}`}>{v === 'open' ? 'Open' : 'All'}</button>)}
        <div className="flex-1" />
        <Button size="sm" variant="secondary" disabled={!rows.length} onClick={() => downloadCSV('forgery-reports', rows.map((r) => ({ report: r.id, certificate: r.certificate, result: r.result, reported: r.reportedAt.slice(0, 10), contact: r.contact, note: r.note, status: r.status, finding: r.finding ?? '' })))}>Export CSV</Button>
      </div>
      {reports.isLoading ? <div className="p-8 flex justify-center"><Spinner /></div> : rows.length === 0 ? <div className="p-6"><EmptyState title="No reports" description="When someone verifying a certificate finds it suspect, they can report it from the public verifier; reports land here." /></div> : (
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]"><Th>Report</Th><Th>Certificate</Th><Th>Result seen</Th><Th>Where presented</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._rid ?? r.id} className="border-b border-[#EDEFF3] align-top">
                <td className="px-3 py-2.5 font-mono text-[12px]">{r.id}<p className="font-sans text-[11px] text-[#5A6577]">{day(r.reportedAt)}</p></td>
                <td className="px-3 py-2.5 font-mono text-[12px]">{r.certificate}</td>
                <td className="px-3 py-2.5 text-[12px]">{r.result.replace('_', ' ')}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#5A6577] max-w-[260px]">{r.note || '—'}{r.contact ? <p>Contact: {r.contact}</p> : null}</td>
                <td className="px-3 py-2.5 text-[12px] capitalize">{r.status}{r.finding ? <p className="normal-case text-[#5A6577]">{r.finding}</p> : null}</td>
                <td className="px-3 py-2.5 text-right">{r.status !== 'closed' ? <Button size="sm" onClick={() => { setOpen(r); setFinding(r.finding ?? ''); }}>Handle</Button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open && (
        <Modal open onClose={() => setOpen(null)} title={`Report ${open.id}`} width="520px"
          footer={<>{open.status === 'open' && <Button size="sm" variant="secondary" onClick={() => move('investigating')}>Mark investigating</Button>}<Button size="sm" onClick={() => move('closed')}>Close with finding</Button></>}>
          <div className="space-y-2 text-[13px]">
            <p>Certificate <span className="font-mono">{open.certificate}</span> was checked (verification <span className="font-mono">{open.verification}</span>) and showed <b>{open.result.replace('_', ' ')}</b>.</p>
            {open.note && <p className="text-[#5A6577]">{open.note}</p>}
            {open.contact && <p>Reporter: {open.contact}</p>}
            <Input label="Finding" value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="e.g. Forged copy; referred to police, FIR 112/2026" />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Signing keys ────────────────────────────────────────────────────────────

function KeysTab({ canRotate }: { canRotate: boolean }) {
  const keys = useSigningKeys();
  const rotate = useRotateKey();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');

  async function doRotate() {
    try {
      const r = await rotate.mutateAsync(reason.trim());
      toast.success(`New signing key ${r.kid} in use; the old key still verifies what it signed`);
      setAsking(false); setReason('');
    } catch (e) { toast.error(errText(e)); }
  }

  if (keys.isLoading) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (keys.isError || !keys.data) return <InlineAlert type="error">{errText(keys.error)}</InlineAlert>;
  return (
    <div className="space-y-4">
      <InlineAlert type="info">Certificates are signed with Ed25519. The public keys below are published at <span className="font-mono">/api/verify/keys</span>, so anyone can check a signature without trusting this server. {keys.data.heldOutside ? 'The private key is held in the server environment (CERT_SIGNING_KEY), not in the database.' : 'The private key is kept in this institute\'s database; for stronger custody set CERT_SIGNING_KEY on the server.'}</InlineAlert>
      <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
          <p className="text-[13px] font-semibold text-[#16264A]">{keys.data.keys.length} key{keys.data.keys.length === 1 ? '' : 's'}</p>
          {canRotate && !keys.data.heldOutside && <Button size="sm" variant="secondary" onClick={() => setAsking(true)}>Rotate key…</Button>}
        </div>
        <div className="divide-y divide-[#EDEFF3]">
          {keys.data.keys.map((k) => (
            <div key={k.kid} className="px-4 py-3 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[#16264A]">{k.kid}</span>
                {k.signing ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[2px] bg-[#D1FAE5] text-[#0E7A5F]">Signing now</span> : <span className="text-[11px] px-2 py-0.5 rounded-[2px] bg-[#EDEFF3] text-[#5A6577]">Retired {day(k.retiredAt)} · verifies only</span>}
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => void copyText(k.publicKeyPem, 'Public key')}>Copy public key</Button>
              </div>
              <p className="text-[12px] text-[#5A6577] mt-1">{k.algorithm} · created {day(k.createdAt)} · {k.certificates} certificate{k.certificates === 1 ? '' : 's'} signed</p>
              <p className="font-mono text-[11px] text-[#5A6577] break-all mt-1">x = {k.x}</p>
            </div>
          ))}
        </div>
      </div>
      {asking && (
        <Modal open onClose={() => setAsking(false)} title="Rotate the signing key"
          footer={<><Button size="sm" variant="secondary" onClick={() => setAsking(false)}>Cancel</Button><Button size="sm" variant="destructive" loading={rotate.isPending} disabled={reason.trim().length < 10} onClick={() => void doRotate()}>Rotate</Button></>}>
          <div className="space-y-3">
            <InlineAlert type="warning">A new key is generated and signs from now on. The current key is retired: every certificate it signed still verifies. Do this on a schedule, or at once if the key may have been exposed.</InlineAlert>
            <Input label="Reason (written to the audit trail)" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
