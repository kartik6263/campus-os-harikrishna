import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, InlineAlert, Modal, Spinner, toast } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { copyText, downloadPdf } from '../../lib/export';
import { inst } from '../../lib/institution';
import { useProfile } from '../../lib/queries';

interface Props { onNavigate: (m: any) => void }

interface CertType { type: string; slaDays: number; fee: number }
interface CertRequest {
  id: string; requestNo: string; type: string; purpose: string; priority: 'NORMAL' | 'URGENT';
  stage: 'REQUESTED' | 'COLLEGE_OFFICE' | 'READY' | 'DISPATCHED' | 'REJECTED';
  fee: number; feePaid: boolean; requestedOn: string; slaDeadline: string; daysLeft: number | null; overdue: boolean;
  notes: string | null; issuedBy: string | null; issuedAt: string | null; rejectReason: string | null; signature: string | null;
}

const STAGES: Array<[CertRequest['stage'], string]> = [['REQUESTED', 'Requested'], ['COLLEGE_OFFICE', 'Being prepared'], ['READY', 'Ready'], ['DISPATCHED', 'Collected / dispatched']];
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Could not reach the server.');
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const verifyLink = (c: CertRequest) => `${window.location.origin}/?verify=${encodeURIComponent(c.requestNo)}${c.signature ? `&sig=${encodeURIComponent(c.signature)}` : ''}`;

/**
 * The student's certificates: request one from the college office, follow
 * it through to collection, and — once issued — download a copy carrying a
 * QR code anyone can scan to confirm it is genuine.
 */
export default function Certificates(_props: Props) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['student', 'certificates'], queryFn: () => api<{ types: CertType[]; requests: CertRequest[] }>('/api/student/certificates') });
  const profile = useProfile();
  const [asking, setAsking] = useState<CertType | null>(null);
  const [purpose, setPurpose] = useState('');
  const [urgent, setUrgent] = useState(false);

  const request = useMutation({
    mutationFn: () => api<CertRequest>('/api/student/certificates', { method: 'POST', body: { type: asking!.type, purpose: purpose.trim(), priority: urgent ? 'URGENT' : 'NORMAL' } }),
    onSuccess: r => { toast.success(`Request ${r.requestNo} sent to the college office`); setAsking(null); setPurpose(''); setUrgent(false); void qc.invalidateQueries({ queryKey: ['student', 'certificates'] }); },
  });

  async function download(c: CertRequest) {
    const p = profile.data;
    await downloadPdf({
      title: c.type, subtitle: inst().name, reference: c.requestNo, fileName: `${c.type.replace(/\s+/g, '-').toLowerCase()}-${c.requestNo.replace(/\//g, '-')}`,
      sections: [
        { fields: [['Name', p?.name ?? ''], ['Enrolment number', p?.enrolmentNo ?? ''], ['Programme', p?.programme.name ?? ''], ['College', p?.college.name ?? ''], ['Purpose', c.purpose], ['Issued on', day(c.issuedAt)], ['Issued by', c.issuedBy ?? '']] },
        { text: ['This is a copy of the certificate on record. Scan the QR code, or open the link printed with it, to confirm with the institution that it is genuine and unaltered.'] },
      ],
      qr: verifyLink(c), signatory: 'Principal / Registrar',
    });
  }

  if (q.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (q.isError) return <div className="p-4"><InlineAlert type="error">{errText(q.error)}</InlineAlert></div>;
  const { types, requests } = q.data!;
  const openTypes = new Set(requests.filter(r => r.stage !== 'DISPATCHED' && r.stage !== 'REJECTED').map(r => r.type));

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Certificates</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">Request, track and verify your certificates</p>
      </div>

      <div className="bg-[#EDEFF3] px-4 py-2 mt-3 flex justify-between"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">My requests</span><span className="text-[12px] text-[#5A6577]">{requests.length}</span></div>
      {requests.length === 0 ? <div className="px-4"><EmptyState title="No requests yet" description="Choose a certificate below to request it." /></div> : (
        <div className="bg-white border-t border-b border-[#D3D8E0]">
          {requests.map((c, i) => {
            const at = STAGES.findIndex(s => s[0] === c.stage);
            const issued = c.stage === 'READY' || c.stage === 'DISPATCHED';
            return (
              <div key={c.id} className={`px-4 py-4 ${i < requests.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-[14px] font-bold text-[#16264A]">{c.type}</p><p className="font-mono text-[11px] text-[#5A6577]">{c.requestNo} · {day(c.requestedOn)}{c.priority === 'URGENT' ? ' · urgent' : ''}</p></div>
                  {c.stage === 'REJECTED' ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[3px] bg-[#FEE2E2] text-[#A8242C]">Declined</span>
                    : c.overdue ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-[3px] bg-[#FEE2E2] text-[#A8242C]">Past promised date</span>
                      : !issued && c.daysLeft != null ? <span className="text-[11px] text-[#5A6577]">Promised by {day(c.slaDeadline)}</span> : null}
                </div>
                {c.stage !== 'REJECTED' && (
                  <div className="flex items-center gap-1 mt-3">
                    {STAGES.map(([k, label], si) => (
                      <div key={k} className="flex-1">
                        <div className={`h-1.5 rounded-full ${si <= at ? 'bg-[#E0952A]' : 'bg-[#EDEFF3]'}`} />
                        <p className={`text-[10px] mt-1 ${si === at ? 'text-[#16264A] font-semibold' : 'text-[#5A6577]'}`}>{label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {c.stage === 'REJECTED' && c.rejectReason && <p className="text-[12px] text-[#A8242C] mt-2">{c.rejectReason}</p>}
                {c.fee > 0 && !c.feePaid && c.stage !== 'REJECTED' && <p className="text-[12px] text-[#9A5B00] mt-2">Fee ₹{c.fee} unpaid — pay at the college fee counter; the certificate is issued once it is received.</p>}
                {c.stage === 'READY' && <p className="text-[12px] text-[#0E7A5F] mt-2">Ready to collect from the college office.</p>}
                {issued && (
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={() => void download(c)}>Download copy</Button>
                    <Button size="sm" variant="secondary" onClick={() => void copyText(verifyLink(c), 'Verification link')}>Copy verification link</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-[#EDEFF3] px-4 py-2 mt-3"><span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">Request a certificate</span></div>
      <div className="bg-white border-t border-b border-[#D3D8E0]">
        {types.map((t, i) => (
          <button key={t.type} onClick={() => !openTypes.has(t.type) && setAsking(t)} disabled={openTypes.has(t.type)}
            className={`w-full flex items-center justify-between px-4 py-3.5 text-left enabled:hover:bg-[#EDEFF3] cursor-pointer disabled:cursor-default ${i < types.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div><p className="text-[14px] font-medium text-[#16264A]">{t.type}</p><p className="text-[12px] text-[#5A6577]">{t.fee ? `₹${t.fee}` : 'Free'} · within {t.slaDays} days</p></div>
            <span className="text-[12px] text-[#5A6577]">{openTypes.has(t.type) ? 'Requested' : '›'}</span>
          </button>
        ))}
      </div>

      <Modal open={!!asking} onClose={() => setAsking(null)} title={asking ? `Request ${asking.type}` : ''}
        footer={<><Button size="sm" variant="secondary" onClick={() => setAsking(null)}>Cancel</Button><Button size="sm" loading={request.isPending} disabled={purpose.trim().length < 5} onClick={() => request.mutate()}>Send request</Button></>}>
        {asking && (
          <div className="space-y-3">
            {request.isError && <InlineAlert type="error">{errText(request.error)}</InlineAlert>}
            <p className="text-[13px] text-[#5A6577]">{asking.fee ? `Fee ₹${asking.fee}, paid at the college counter.` : 'No fee.'} The office promises it within {asking.slaDays} days{urgent ? ` (urgent: ${Math.ceil(asking.slaDays / 2)} days)` : ''}.</p>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[#16264A]">Purpose</span>
              <textarea rows={3} value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={300} placeholder="e.g. Opening a bank account" className="px-3 py-2 text-[14px] border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#16264A]" />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#16264A] cursor-pointer"><input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} /> Urgent (half the time)</label>
          </div>
        )}
      </Modal>
    </div>
  );
}
