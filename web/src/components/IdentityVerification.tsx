import { useState } from 'react';
import { ApiError } from '../lib/api';
import { Button, InlineAlert, Modal, SkeletonRow, toast } from './ui';
import { pickAndUpload, type StoredFileInfo } from '../lib/records';
import {
  ID_DOCUMENTS, STATUS_LABEL, STATUS_TONE, showDlDate, startDigilocker, useMyVerification, useSubmitAbc, useSubmitIdentityProof,
  type VerificationStatus,
} from '../lib/verification';

const errorText = (err: unknown, fallback: string) => (err instanceof ApiError || err instanceof Error ? err.message : fallback);

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[2px] whitespace-nowrap ${STATUS_TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[12px] text-[#5A6577] shrink-0">{label}</span>
      <span className={`text-[13px] text-[#16264A] font-medium text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}

function Match({ ok }: { ok: boolean | null }) {
  if (ok === null) return null;
  return ok
    ? <span className="ml-1 text-[11px] text-[#0E7A5F]">✓ matches record</span>
    : <span className="ml-1 text-[11px] text-[#A8242C]">✗ differs from record</span>;
}

/** The DigiLocker mark, drawn rather than fetched: a padlock on the brand blue. */
function DigiLockerButton({ label, onError }: { label: string; onError?: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await startDigilocker();
    } catch (err) {
      const m = errorText(err, 'Could not open DigiLocker');
      toast.error(m);
      onError?.(m);
      setBusy(false);
    }
  }
  return (
    <button
      onClick={go}
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-[4px] bg-[#1F3B8F] text-white text-[14px] font-medium hover:bg-[#182F73] disabled:opacity-60 cursor-pointer disabled:cursor-wait"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      {busy ? 'Opening DigiLocker…' : label}
    </button>
  );
}

/**
 * Proving who one is, the same in every portal: DigiLocker where the
 * institute has connected it, an ID proof for the office otherwise — and,
 * for a student, the ABC ID.
 */
export default function IdentityVerification({ allowDocuments = true }: { allowDocuments?: boolean }) {
  const q = useMyVerification();
  const proofMut = useSubmitIdentityProof();
  const abcMut = useSubmitAbc();
  const [docMode, setDocMode] = useState(false);
  const [docType, setDocType] = useState<string>(ID_DOCUMENTS[0]);
  const [docFile, setDocFile] = useState<StoredFileInfo | null>(null);
  const [abcMode, setAbcMode] = useState(false);
  const [abcInput, setAbcInput] = useState('');
  const [abcFile, setAbcFile] = useState<StoredFileInfo | null>(null);
  const [showDocs, setShowDocs] = useState(false);

  if (q.isPending) return <div className="bg-white p-4"><SkeletonRow /><SkeletonRow /></div>;
  if (q.error || !q.data) return <div className="p-4"><InlineAlert type="error">Could not load your verification: {errorText(q.error, 'unknown error')}</InlineAlert></div>;
  const v = q.data;

  const canStartIdentity = v.identityStatus === 'UNVERIFIED' || v.identityStatus === 'REJECTED';
  const abcDigits = abcInput.replace(/[\s-]/g, '');
  const abcOpen = v.abcStatus === 'UNVERIFIED' || v.abcStatus === 'REJECTED';

  async function submitProof() {
    if (!docFile) { toast.error('Attach the ID proof first'); return; }
    try {
      await proofMut.mutateAsync({ docType, proofFileId: docFile.id });
      toast.success('Sent to the office for verification');
      setDocMode(false); setDocFile(null);
    } catch (err) { toast.error(errorText(err, 'Could not submit')); }
  }

  async function submitAbc() {
    if (!/^\d{12}$/.test(abcDigits)) { toast.error('An ABC ID is 12 digits'); return; }
    if (!abcFile) { toast.error('Attach your ABC / APAAR card'); return; }
    try {
      await abcMut.mutateAsync({ abcId: abcDigits, proofFileId: abcFile.id });
      toast.success('ABC ID sent to the office for verification');
      setAbcMode(false); setAbcFile(null); setAbcInput('');
    } catch (err) { toast.error(errorText(err, 'Could not submit')); }
  }

  return (
    <div className="bg-white">
      {/* ── Identity ── */}
      <div className="px-4 py-3 border-b border-[#D3D8E0]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[14px] font-semibold text-[#16264A]">Identity</div>
            <div className="text-[12px] text-[#5A6577]">
              {v.identitySource === 'DIGILOCKER' ? 'Through DigiLocker' : v.identitySource === 'DOCUMENT' ? `${v.identityDocType} checked by the office` : 'Checked against your institutional record'}
            </div>
          </div>
          <StatusBadge status={v.identityStatus} />
        </div>

        {v.identitySource === 'DIGILOCKER' && (
          <div className="mt-2 border border-[#D3D8E0] rounded-[4px] px-3 py-1.5">
            <Row label="Name in DigiLocker" value={<>{v.dlName ?? '—'}<Match ok={v.nameMatch} /></>} />
            <Row label="Date of birth" value={<>{showDlDate(v.dlDob)}<Match ok={v.dobMatch} /></>} />
            {v.dlGender && <Row label="Gender" value={v.dlGender} />}
            <Row label="Aadhaar" value={v.eaadhaar ? (v.aadhaarLast4 ? `XXXX XXXX ${v.aadhaarLast4}` : 'Linked') : 'Not linked in DigiLocker'} mono={Boolean(v.aadhaarLast4)} />
            {v.verifiedAt && <Row label="Verified on" value={new Date(v.verifiedAt).toLocaleString('en-IN')} />}
          </div>
        )}
        {v.identityStatus === 'VERIFIED' && v.identitySource === 'DOCUMENT' && v.verifiedAt && (
          <div className="text-[12px] text-[#0E7A5F] mt-2">Verified on {new Date(v.verifiedAt).toLocaleDateString('en-IN')}</div>
        )}
        {v.identityNote && (
          <div className="mt-2"><InlineAlert type={v.identityStatus === 'REJECTED' ? 'error' : 'warning'}>{v.identityNote}</InlineAlert></div>
        )}
        {v.identityStatus === 'PENDING_REVIEW' && (
          <p className="text-[12px] text-[#5A6577] mt-2">The records section will check this and decide. You will see the outcome here.</p>
        )}

        <div className="flex flex-wrap gap-2 mt-3">
          {v.digilockerEnabled && (canStartIdentity || v.identitySource === 'DIGILOCKER' || v.identitySource === null) && (
            <DigiLockerButton label={v.linked ? 'Fetch again from DigiLocker' : 'Verify with DigiLocker'} />
          )}
          {allowDocuments && canStartIdentity && !docMode && (
            <Button variant="secondary" onClick={() => setDocMode(true)}>Upload an ID proof instead</Button>
          )}
        </div>
        {!v.digilockerEnabled && canStartIdentity && (
          <p className="text-[12px] text-[#5A6577] mt-2">
            {allowDocuments
              ? 'DigiLocker is not yet connected for your institute (the IT Cell sets it up). Until then, upload an ID proof and the office will verify it.'
              : 'DigiLocker is not yet connected for your institute (the IT Cell sets it up). Your firm’s papers are verified by the procurement office at empanelment.'}
          </p>
        )}

        {docMode && (
          <div className="mt-3 border border-[#D3D8E0] rounded-[4px] p-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Document</span>
              <select value={docType} onChange={e => setDocType(e.target.value)} className="h-9 px-3 text-[14px] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] cursor-pointer">
                {ID_DOCUMENTS.map(d => <option key={d}>{d}</option>)}
              </select>
            </label>
            {docType === 'Masked Aadhaar' && <p className="text-[12px] text-[#5A6577]">Download a masked Aadhaar (only the last 4 digits showing) from myaadhaar.uidai.gov.in. Do not upload the full number.</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('verification:identity', 'image/*,application/pdf'); if (f) setDocFile(f); }}>
                {docFile ? 'Replace file' : 'Choose file (PDF or image)'}
              </Button>
              {docFile && <span className="text-[12px] text-[#0E7A5F]">✓ {docFile.name}</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitProof} loading={proofMut.isPending} disabled={!docFile}>Send for verification</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDocMode(false); setDocFile(null); }}>Cancel</Button>
            </div>
          </div>
        )}

        {v.documents.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowDocs(s => !s)} className="text-[12px] text-[#E0952A] font-medium cursor-pointer">
              {showDocs ? 'Hide' : 'Show'} the {v.documents.length} document{v.documents.length === 1 ? '' : 's'} issued to your DigiLocker
            </button>
            {showDocs && (
              <ul className="mt-2 flex flex-col gap-1">
                {v.documents.map((d, i) => (
                  <li key={i} className="text-[12px] text-[#16264A] flex justify-between gap-2 border-b border-[#EDEFF3] pb-1">
                    <span>{d.name}<span className="text-[#5A6577]"> · {d.issuer}</span></span>
                    <span className="text-[#5A6577] shrink-0">{d.date}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── ABC ID ── */}
      {v.abcApplies && (
        <div className="px-4 py-3 border-b border-[#D3D8E0]">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[14px] font-semibold text-[#16264A]">ABC ID (Academic Bank of Credits)</div>
              <div className="font-mono text-[13px] text-[#16264A] mt-0.5">{v.abcId ?? v.record.abcId ?? 'Not on record'}</div>
              {v.abcSource && <div className="text-[12px] text-[#5A6577]">{v.abcSource === 'DIGILOCKER' ? 'Read from the ABC card in your DigiLocker' : 'Entered by you, with your card attached'}</div>}
            </div>
            <StatusBadge status={v.abcStatus} />
          </div>
          {v.abcNote && <div className="mt-2"><InlineAlert type={v.abcStatus === 'REJECTED' ? 'error' : 'warning'}>{v.abcNote}</InlineAlert></div>}
          {v.abcStatus === 'VERIFIED' && v.abcVerifiedAt && <div className="text-[12px] text-[#0E7A5F] mt-1">Verified on {new Date(v.abcVerifiedAt).toLocaleDateString('en-IN')} — your credits are recorded against this ID.</div>}

          {abcOpen && (
            <>
              <p className="text-[12px] text-[#5A6577] mt-2">
                {v.digilockerEnabled
                  ? 'Verifying with DigiLocker reads your ABC ID straight from the card ABC issued to your DigiLocker.'
                  : 'Enter the 12-digit ABC ID from your ABC / APAAR card and attach the card; the office verifies it.'}
              </p>
              <div className="flex flex-wrap gap-2 mt-2">
                {v.digilockerEnabled && v.identityStatus !== 'PENDING_REVIEW' && <DigiLockerButton label="Fetch ABC ID from DigiLocker" />}
                {!abcMode && <Button variant="secondary" onClick={() => setAbcMode(true)}>Enter ABC ID manually</Button>}
              </div>
              {abcMode && (
                <div className="mt-3 border border-[#D3D8E0] rounded-[4px] p-3 flex flex-col gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[13px] font-medium text-[#16264A]">ABC ID</span>
                    <input value={abcInput} onChange={e => setAbcInput(e.target.value)} inputMode="numeric" maxLength={16} placeholder="12 digits, e.g. 1234 5678 9012"
                      className="h-9 px-3 text-[14px] font-mono bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]" />
                    {abcInput && !/^\d{12}$/.test(abcDigits) && <span className="text-[11px] text-[#A8242C]">{abcDigits.length}/12 digits</span>}
                  </label>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" onClick={async () => { const f = await pickAndUpload('verification:abc', 'image/*,application/pdf'); if (f) setAbcFile(f); }}>
                      {abcFile ? 'Replace card' : 'Attach ABC / APAAR card'}
                    </Button>
                    {abcFile && <span className="text-[12px] text-[#0E7A5F]">✓ {abcFile.name}</span>}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={submitAbc} loading={abcMut.isPending} disabled={!abcFile || !/^\d{12}$/.test(abcDigits)}>Send for verification</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAbcMode(false); setAbcFile(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
              <a href="https://www.abc.gov.in" target="_blank" rel="noopener noreferrer" className="inline-block mt-2 text-[12px] text-[#E0952A] font-medium">
                No ABC ID yet? Create one at abc.gov.in ↗
              </a>
            </>
          )}
        </div>
      )}

      <p className="px-4 py-2 text-[11px] text-[#5A6577]">
        Only your name, date of birth, gender, the last four digits of Aadhaar and the list of issued documents are kept. Your DigiLocker password and access are never stored.
      </p>
    </div>
  );
}

/**
 * A menu entry for the staff workspaces' user menu; the dialog below sits
 * outside the menu, which closes as it opens.
 */
export function VerificationMenuItem({ onClick }: { onClick: () => void }) {
  const q = useMyVerification();
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-2.5 text-[13px] text-[#16264A] hover:bg-[#EDEFF3] cursor-pointer flex items-center justify-between gap-2">
      <span>Identity verification</span>
      {q.data && <StatusBadge status={q.data.identityStatus} />}
    </button>
  );
}

export function VerificationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Identity verification" width="560px">
      <div className="-m-6 max-h-[70vh] overflow-y-auto"><IdentityVerification /></div>
    </Modal>
  );
}
