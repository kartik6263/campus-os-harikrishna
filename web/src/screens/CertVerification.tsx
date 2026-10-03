import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/language';
import { Button, StatusPill, VerifiedSeal, InlineAlert, Modal } from '../components/ui';
import type { Screen } from '../lib/data';
import { api } from '../lib/api';
import { copyText, downloadPdf } from '../lib/export';
import { inst, instHi, instPlace, instPlaceHi } from '../lib/institution';

interface Props {
  onNavigate: (s: Screen) => void;
  /** Opened from a certificate's QR code: the number and its signature. */
  initial?: { no: string; sig?: string } | null;
}

type Status = 'valid' | 'not_found' | 'not_issued' | 'revoked' | 'tampered';

interface Verification {
  status: Status;
  reference: string;
  checkedAt: string;
  signatureChecked: boolean;
  certificate: {
    number: string;
    type: string;
    purpose: string | null;
    issuedAt: string | null;
    issuedBy: string | null;
    holder: { name: string; enrolmentNo: string; programme: string; college: string; yearOfEnrolment: number };
  } | null;
}

const STATUS_TEXT: Record<Status, string> = {
  valid: 'Authentic',
  not_found: 'No such certificate',
  not_issued: 'Not yet issued',
  revoked: 'Revoked',
  tampered: 'Signature mismatch — possibly tampered',
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function CertVerification({ onNavigate, initial }: Props) {
  const { lang, toggle, t } = useLang();
  const [input, setInput] = useState(initial?.no ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Verification | null>(null);
  const [checked, setChecked] = useState<{ no: string; sig?: string } | null>(null);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const started = useRef(false);

  async function verify(no: string, sig?: string) {
    const number = no.trim().toUpperCase();
    if (!number) return;
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ no: number, ...(sig ? { sig } : {}) });
      const r = await api<Verification>(`/api/verify/certificate?${qs}`, { anonymous: true });
      setResult(r);
      setChecked({ no: number, sig });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'The verification service could not be reached');
    } finally {
      setLoading(false);
    }
  }

  // A QR scan lands here with the number filled in: check it straight away.
  useEffect(() => {
    if (initial?.no && !started.current) {
      started.current = true;
      void verify(initial.no, initial.sig);
    }
  }, [initial]);

  const shareLink = checked
    ? `${window.location.origin}/?verify=${encodeURIComponent(checked.no)}${checked.sig ? `&sig=${encodeURIComponent(checked.sig)}` : ''}`
    : '';

  async function downloadReceipt() {
    if (!result || !checked) return;
    const c = result.certificate;
    await downloadPdf({
      title: 'Certificate verification receipt',
      subtitle: `Checked against the records of ${inst().name} through the public verification service.`,
      reference: result.reference,
      fileName: `verification-${result.reference.replace(/\//g, '-')}`,
      qr: shareLink,
      sections: [
        {
          heading: 'Result',
          fields: [
            ['Certificate number', checked.no],
            ['Result', STATUS_TEXT[result.status]],
            ['Digital signature', result.signatureChecked ? (result.status === 'tampered' ? 'Did not match' : 'Matched') : 'Not presented (number checked only)'],
            ['Checked on', new Date(result.checkedAt).toLocaleString('en-IN')],
            ['Verification reference', result.reference],
          ],
        },
        ...(c
          ? [{
              heading: 'Certificate on record',
              fields: [
                ['Type', c.type],
                ['Holder', c.holder.name],
                ['Enrolment number', c.holder.enrolmentNo],
                ['Programme', c.holder.programme],
                ['College', c.holder.college],
                ['Date of issue', fmtDate(c.issuedAt)],
                ['Issued by', c.issuedBy ?? '—'],
              ] as Array<[string, string]>,
            }]
          : []),
        { text: ['Scan the QR code to repeat this check live. The reference above is logged by the institution and can be quoted in any enquiry.'] },
      ],
    });
  }

  const c = result?.certificate;
  const examEmail = inst().email ?? (inst().emailDomain ? `exam@${inst().emailDomain}` : null);

  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      <header className="h-14 bg-white border-b border-[#D3D8E0] flex items-center justify-between px-4 sm:px-6">
        <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 cursor-pointer">
          <div className="w-7 h-7 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[12px]">{inst().shortCode}</div>
          <span className="text-[14px] font-semibold text-[#16264A] hidden sm:block">Resolion Campus OS</span>
        </button>
        <div className="flex items-center gap-3">
          <button onClick={toggle} className="text-[12px] font-semibold text-[#5A6577] hover:text-[#16264A] cursor-pointer border border-[#D3D8E0] rounded-[4px] px-2 py-1">{lang === 'en' ? 'हिं' : 'EN'}</button>
          <button onClick={() => onNavigate('login')} className="text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">{t('Sign In', 'साइन इन')}</button>
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full px-4 sm:px-6 py-10">
        <div className="mb-8">
          <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-widest mb-2">{t('Public Service — No Login Required', 'सार्वजनिक सेवा — लॉगिन आवश्यक नहीं')}</p>
          <h1 className="text-h1 font-semibold text-[#16264A] mb-2">{t('Certificate Verification', 'प्रमाण-पत्र सत्यापन')}</h1>
          <p className="text-[14px] text-[#5A6577]">{t(`Verify the authenticity of any certificate issued by ${instPlace()}. Scanning the QR code on a certificate also checks its digital signature.`, `${instPlaceHi()} द्वारा जारी किसी भी प्रमाण-पत्र की प्रामाणिकता सत्यापित करें। प्रमाण-पत्र का QR कोड स्कैन करने पर डिजिटल हस्ताक्षर भी जाँचे जाते हैं।`)}</p>
        </div>

        <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-5 mb-6">
          <p className="text-[13px] font-semibold text-[#16264A] mb-3">{t('Enter certificate number', 'प्रमाण-पत्र संख्या दर्ज करें')}</p>
          <div className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void verify(input)}
              placeholder="CR/2024/00876"
              className="flex-1 min-w-0 px-3 py-2.5 border border-[#D3D8E0] rounded-[4px] text-[14px] font-mono text-[#16264A] outline-none focus:border-[#E0952A] bg-white placeholder-[#5A6577]"
            />
            <Button onClick={() => void verify(input)} loading={loading} disabled={!input.trim()}>
              {t('Verify', 'सत्यापित करें')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            <span className="text-[12px] text-[#5A6577]">{t('Examples from the demo records:', 'डेमो अभिलेखों से उदाहरण:')}</span>
            {[
              { no: 'CR/2024/00876', label: t('Issued', 'जारी') },
              { no: 'CR/2024/00901', label: t('In process', 'प्रक्रिया में') },
              { no: 'CR/2024/00876', sig: '0000000000badc0ffee0', label: t('Forged QR', 'नकली QR') },
              { no: 'CR/2019/00001', label: t('Unknown', 'अज्ञात') },
            ].map(ex => (
              <button key={ex.no + (ex.sig ?? '')} onClick={() => { setInput(ex.no); void verify(ex.no, ex.sig); }}
                className="font-mono text-[11px] text-[#E0952A] hover:underline cursor-pointer">
                {ex.no} <span className="font-sans text-[#5A6577]">({ex.label})</span>
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-8 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-[#E0952A] border-t-transparent rounded-full animate-spin" />
            <span className="text-[14px] text-[#5A6577]">{t('Verifying against university records…', 'विश्वविद्यालय अभिलेखों से सत्यापित किया जा रहा है…')}</span>
          </div>
        )}

        {!loading && error && (
          <InlineAlert type="error"><p>{error}</p></InlineAlert>
        )}

        {!loading && result && (
          <div className="animate-fade-in space-y-4">
            {result.status === 'not_found' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('Certificate not found', 'प्रमाण-पत्र नहीं मिला')}</p>
                <p className="mt-1">{t(`No certificate numbered ${checked?.no} exists in the records of ${inst().name}. Treat the document as suspect.`, `${checked?.no} संख्या का कोई प्रमाण-पत्र ${instHi()} के अभिलेखों में नहीं है। दस्तावेज़ संदिग्ध मानें।`)}</p>
              </InlineAlert>
            )}

            {result.status === 'not_issued' && (
              <InlineAlert type="warning">
                <p className="font-semibold">{t('Requested, not yet issued', 'अनुरोधित, अभी जारी नहीं')}</p>
                <p className="mt-1">{t('This number belongs to a certificate request that is still being processed. No certificate has been issued against it yet, so any paper bearing it is not valid.', 'यह संख्या एक प्रक्रियाधीन अनुरोध की है। इसके विरुद्ध अभी कोई प्रमाण-पत्र जारी नहीं हुआ है।')}</p>
              </InlineAlert>
            )}

            {result.status === 'tampered' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('⚠ Digital signature does not match', '⚠ डिजिटल हस्ताक्षर मेल नहीं खाता')}</p>
                <p className="mt-1">{t('The number exists, but the signature in this QR code was not issued by the university. The document or its QR code has been altered. Do not accept it.', 'संख्या मौजूद है, पर इस QR कोड का हस्ताक्षर विश्वविद्यालय द्वारा जारी नहीं किया गया। इसे स्वीकार न करें।')}</p>
              </InlineAlert>
            )}

            {result.status === 'revoked' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('Certificate has been revoked', 'प्रमाण-पत्र रद्द किया गया है')}</p>
                <p className="mt-1">{t('This certificate was withdrawn by the university and is no longer valid.', 'यह प्रमाण-पत्र विश्वविद्यालय द्वारा वापस ले लिया गया है और अब वैध नहीं है।')}</p>
              </InlineAlert>
            )}

            {c && (
              <div className="bg-white border border-[#D3D8E0] rounded-[2px]">
                <div className={`${result.status === 'valid' ? 'bg-[#16264A]' : 'bg-[#A8242C]'} text-white px-5 py-4 rounded-t-[2px] flex items-start justify-between gap-4`}>
                  <div>
                    {result.status === 'valid' && (
                      <div className="flex items-center gap-2 mb-1">
                        <VerifiedSeal size={28} />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E0952A]">{t(`Verified — ${inst().name}`, `सत्यापित — ${instHi()}`)}</p>
                      </div>
                    )}
                    <h2 className="text-h2 font-semibold">{c.type}</h2>
                    {c.purpose && <p className="text-[12px] text-white/60 mt-0.5">{t('Purpose', 'उद्देश्य')}: {c.purpose}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[12px] text-white/60">{c.number}</p>
                    <StatusPill status={result.status === 'valid' ? 'valid' : 'revoked'} lang={lang} />
                  </div>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    [t('Holder', 'धारक'), c.holder.name],
                    [t('Enrolment Number', 'नामांकन संख्या'), c.holder.enrolmentNo, true],
                    [t('Programme', 'कार्यक्रम'), c.holder.programme],
                    [t('College', 'महाविद्यालय'), c.holder.college],
                    [t('Year', 'वर्ष'), String(c.holder.yearOfEnrolment)],
                    [t('Date of Issue', 'जारी करने की तारीख'), fmtDate(c.issuedAt)],
                    [t('Issued By', 'जारीकर्ता'), c.issuedBy ?? '—'],
                    [t('Digital Signature', 'डिजिटल हस्ताक्षर'), result.signatureChecked ? t('Matched ✓', 'मेल खाता है ✓') : t('Not presented — scan the QR to check it', 'प्रस्तुत नहीं — जाँच हेतु QR स्कैन करें')],
                  ].map(([label, value, mono]) => (
                    <div key={String(label)} className="border-b border-[#D3D8E0] pb-2">
                      <p className="text-[11px] text-[#5A6577] uppercase tracking-wider">{label}</p>
                      <p className={`text-[14px] text-[#16264A] font-medium mt-0.5 ${mono ? 'font-mono' : ''}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <p className="px-5 pb-4 text-[11px] text-[#5A6577]">{t('The holder\'s surname is partly hidden. Match it against the paper presented to you.', 'धारक का उपनाम आंशिक रूप से छिपा है। प्रस्तुत दस्तावेज़ से मिलान करें।')}</p>
              </div>
            )}

            <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-[#16264A]">{t('Verification Receipt', 'सत्यापन रसीद')}</p>
                  <p className="text-[12px] text-[#5A6577]">
                    {t('Reference', 'संदर्भ')} <span className="font-mono text-[#E0952A] font-semibold">{result.reference}</span> · {new Date(result.checkedAt).toLocaleString('en-IN')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void downloadReceipt()}>{t('Download PDF', 'PDF डाउनलोड करें')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void copyText(shareLink, 'Verification link')}>{t('Copy Link', 'लिंक कॉपी करें')}</Button>
                  {result.status !== 'valid' && (
                    <Button size="sm" variant="destructive" onClick={() => setReportOpen(true)}>{t('Report to University', 'विश्वविद्यालय को सूचित करें')}</Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="border-t border-[#D3D8E0] bg-white px-4 sm:px-6 py-3 flex flex-wrap gap-3 items-center justify-between text-[11px] text-[#5A6577]">
        <span>{instPlace()} · Resolion Campus OS</span>
        <div className="flex gap-4">
          {examEmail && <a href={`mailto:${examEmail}?subject=${encodeURIComponent('Certificate verification enquiry')}`} className="hover:text-[#16264A]">{t('Contact Examination Office', 'परीक्षा कार्यालय से संपर्क')}</a>}
          <button onClick={() => onNavigate('login-student')} className="hover:text-[#16264A] cursor-pointer">{t('Grievance (students)', 'शिकायत (छात्र)')}</button>
          <button onClick={() => onNavigate('landing')} className="hover:text-[#16264A] cursor-pointer">{t('Back to Home', 'होम पर जाएं')}</button>
        </div>
      </footer>

      {result && checked && (
        <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} no={checked.no} reference={result.reference} status={result.status} t={t} />
      )}
    </div>
  );
}

function ReportModal({ open, onClose, no, reference, status, t }: { open: boolean; onClose: () => void; no: string; reference: string; status: Status; t: (a: string, b: string) => string }) {
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [sending, setSending] = useState(false);
  const [filed, setFiled] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setSending(true);
    setError('');
    try {
      const r = await api<{ report: string }>('/api/verify/report', { method: 'POST', anonymous: true, body: { no, reference, status, note: note.trim() || undefined, contact: contact.trim() || undefined } });
      setFiled(r.report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not file the report');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('Report a suspect certificate', 'संदिग्ध प्रमाण-पत्र की सूचना दें')}>
      {filed ? (
        <div className="space-y-3 py-2">
          <InlineAlert type="success">
            <p className="font-semibold">{t('Report filed', 'सूचना दर्ज')}: <span className="font-mono">{filed}</span></p>
            <p className="mt-1">{t('The examination office has been notified. Quote this number in any follow-up.', 'परीक्षा कार्यालय को सूचित कर दिया गया है। आगे के संपर्क में यह संख्या उद्धृत करें।')}</p>
          </InlineAlert>
          <div className="flex justify-end"><Button onClick={onClose}>{t('Close', 'बंद करें')}</Button></div>
        </div>
      ) : (
        <div className="space-y-3 py-2">
          <p className="text-[13px] text-[#5A6577]">{t(`Certificate ${no} — result: ${STATUS_TEXT[status]}. Verification ${reference} is attached automatically.`, `प्रमाण-पत्र ${no} — परिणाम: ${STATUS_TEXT[status]}। सत्यापन ${reference} स्वतः संलग्न है।`)}</p>
          <div>
            <label className="text-[12px] font-medium text-[#16264A]">{t('Where was it presented? (optional)', 'यह कहाँ प्रस्तुत किया गया? (वैकल्पिक)')}</label>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000} className="mt-1 w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#E0952A]" placeholder={t('e.g. Submitted with a job application at our firm on …', 'उदा. हमारी फर्म में नौकरी आवेदन के साथ …')} />
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#16264A]">{t('Your email or phone, for follow-up (optional)', 'संपर्क हेतु ईमेल या फ़ोन (वैकल्पिक)')}</label>
            <input value={contact} onChange={e => setContact(e.target.value)} maxLength={160} className="mt-1 w-full border border-[#D3D8E0] rounded-[4px] px-3 py-2 text-[13px] outline-none focus:border-[#E0952A]" />
          </div>
          {error && <InlineAlert type="error"><p>{error}</p></InlineAlert>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>{t('Cancel', 'रद्द करें')}</Button>
            <Button variant="destructive" loading={sending} onClick={() => void submit()}>{t('File report', 'सूचना दर्ज करें')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
