import { useEffect, useRef, useState } from 'react';
import { useLang } from '../lib/language';
import { Button, StatusPill, VerifiedSeal, InlineAlert, Modal } from '../components/ui';
import type { Screen } from '../lib/data';
import { API_BASE, api } from '../lib/api';
import { copyText, downloadPdf } from '../lib/export';
import { inst, instHi, instPlace, instPlaceHi } from '../lib/institution';
import { sha256Hex, verifyDocument, verifyNumber, type Verification, type VerifyStatus } from '../lib/certificates';

interface Props {
  onNavigate: (s: Screen) => void;
  /** Opened from a certificate's QR code: the number and its signature. */
  initial?: { no: string; sig?: string } | null;
}

type Status = VerifyStatus;

const STATUS_TEXT: Record<Status, string> = {
  valid: 'Authentic',
  not_found: 'No such certificate',
  not_issued: 'Not yet issued',
  revoked: 'Revoked',
  expired: 'Expired',
  tampered: 'Signature mismatch — tampered',
  unmatched: 'Document does not match any certificate issued',
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export default function CertVerification({ onNavigate, initial }: Props) {
  const { lang, toggle, t } = useLang();
  const [mode, setMode] = useState<'number' | 'document'>('number');
  const [input, setInput] = useState(initial?.no ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Verification | null>(null);
  const [checked, setChecked] = useState<{ no: string; sig?: string } | null>(null);
  const [error, setError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [showCrypto, setShowCrypto] = useState(false);
  const started = useRef(false);

  async function verify(no: string, sig?: string) {
    const number = no.trim().toUpperCase();
    if (!number) return;
    setLoading(true); setError(''); setShowCrypto(false);
    try {
      setResult(await verifyNumber(number, sig));
      setChecked({ no: number, sig });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'The verification service could not be reached');
    } finally {
      setLoading(false);
    }
  }

  async function verifyFile(f: File) {
    setFile(f); setLoading(true); setError(''); setShowCrypto(false); setLocalHash(null);
    try {
      const [r, h] = await Promise.all([verifyDocument(f), sha256Hex(f)]);
      setResult(r); setLocalHash(h);
      setChecked({ no: r.certificate?.serialNo ?? r.claimsSerial ?? f.name });
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : 'The document could not be checked');
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

  const shareLink = checked && result?.certificate
    ? `${window.location.origin}${window.location.pathname}?verify=${encodeURIComponent(result.certificate.serialNo)}${checked.sig ? `&sig=${encodeURIComponent(checked.sig)}` : ''}`
    : '';

  async function downloadReceipt() {
    if (!result || !checked) return;
    const c = result.certificate;
    await downloadPdf({
      title: 'Certificate verification receipt',
      subtitle: `Checked against the records of ${inst().name} through the public verification service.`,
      reference: result.reference,
      fileName: `verification-${result.reference.replace(/\//g, '-')}`,
      ...(shareLink ? { qr: shareLink } : {}),
      sections: [
        {
          heading: 'Result',
          fields: [
            ['Checked', result.documentHash ? `The document itself (SHA-256 ${result.documentHash.slice(0, 16)}…)` : `Certificate number ${checked.no}`],
            ['Result', STATUS_TEXT[result.status]],
            ['Digital signature', c ? (c.cryptography.signatureValid ? `Valid — Ed25519, key ${c.cryptography.keyId}` : 'Invalid') : '—'],
            ['Checked on', new Date(result.checkedAt).toLocaleString('en-IN')],
            ['Verification reference', result.reference],
          ],
        },
        ...(c
          ? [{
              heading: 'Certificate on record',
              fields: [
                ['Certificate number', c.serialNo],
                ['Certificate', c.title],
                ['Holder', c.recipient.name],
                ...(c.recipient.ref ? [['Reference', c.recipient.ref]] : []),
                ...c.fields,
                ['Date of issue', fmtDate(c.issuedAt)],
                ...(c.validUntil ? [['Valid until', fmtDate(c.validUntil)]] : []),
                ['Issued by', c.issuer],
                ...(c.revokedAt ? [['Revoked', `${fmtDate(c.revokedAt)} — ${c.revokedReason ?? ''}`]] : []),
              ] as Array<[string, string]>,
            }]
          : []),
        { text: ['The reference above is logged by the institution and can be quoted in any enquiry.'] },
      ],
    });
  }

  const c = result?.certificate;
  const good = result?.status === 'valid';
  const examEmail = inst().email ?? (inst().emailDomain ? `exam@${inst().emailDomain}` : null);
  const masked = !!c?.recipient.name.includes('•');

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
          <p className="text-[14px] text-[#5A6577]">{t(`Check any certificate issued by ${instPlace()}. Every certificate is digitally signed (Ed25519); scanning its QR code or uploading its PDF checks the signature and that not a single character has been changed.`, `${instPlaceHi()} द्वारा जारी कोई भी प्रमाण-पत्र जाँचें। हर प्रमाण-पत्र डिजिटल रूप से हस्ताक्षरित है; QR कोड स्कैन करने या PDF अपलोड करने पर हस्ताक्षर और हर अक्षर की जाँच होती है।`)}</p>
        </div>

        <div className="bg-white border border-[#D3D8E0] rounded-[2px] mb-6">
          <div className="flex border-b border-[#D3D8E0]">
            {([['number', t('Certificate number', 'प्रमाण-पत्र संख्या')], ['document', t('Upload the PDF', 'PDF अपलोड करें')]] as const).map(([m, label]) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 px-4 py-3 text-[13px] font-medium cursor-pointer border-b-2 ${mode === m ? 'border-[#E0952A] text-[#16264A]' : 'border-transparent text-[#5A6577] hover:text-[#16264A]'}`}>{label}</button>
            ))}
          </div>
          <div className="p-5">
            {mode === 'number' ? (
              <>
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && void verify(input)}
                    placeholder={`${inst().shortCode}/DEG/2026/000001`}
                    className="flex-1 min-w-0 px-3 py-2.5 border border-[#D3D8E0] rounded-[4px] text-[14px] font-mono text-[#16264A] outline-none focus:border-[#E0952A] bg-white placeholder-[#9AA3B2]"
                  />
                  <Button onClick={() => void verify(input)} loading={loading} disabled={!input.trim()}>{t('Verify', 'सत्यापित करें')}</Button>
                </div>
                <p className="text-[12px] text-[#5A6577] mt-2">{t('The number is printed along the foot of the certificate. A number alone confirms the record; scanning the QR code also confirms the signature and shows the certificate in full.', 'संख्या प्रमाण-पत्र के नीचे छपी है। केवल संख्या से अभिलेख की पुष्टि होती है; QR स्कैन करने पर हस्ताक्षर की भी पुष्टि होती है।')}</p>
              </>
            ) : (
              <>
                <label className="block border-2 border-dashed border-[#D3D8E0] hover:border-[#E0952A] rounded-[4px] p-6 text-center cursor-pointer"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) void verifyFile(f); }}>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void verifyFile(f); e.target.value = ''; }} />
                  <p className="text-[14px] font-medium text-[#16264A]">{file ? file.name : t('Choose or drop the certificate PDF', 'प्रमाण-पत्र PDF चुनें या यहाँ छोड़ें')}</p>
                  <p className="text-[12px] text-[#5A6577] mt-1">{t('Its fingerprint (SHA-256) is compared with the one filed when it was issued. Any edit — a name, a grade, a date — makes it fail.', 'इसकी फ़िंगरप्रिंट (SHA-256) जारी करते समय दर्ज फ़िंगरप्रिंट से मिलाई जाती है। कोई भी बदलाव पकड़ा जाता है।')}</p>
                </label>
              </>
            )}
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-8 flex items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-[#E0952A] border-t-transparent rounded-full animate-spin" />
            <span className="text-[14px] text-[#5A6577]">{t('Checking the signature and the records…', 'हस्ताक्षर और अभिलेख जाँचे जा रहे हैं…')}</span>
          </div>
        )}

        {!loading && error && <InlineAlert type="error"><p>{error}</p></InlineAlert>}

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
                <p className="mt-1">{t('This number belongs to a certificate request still being processed, or one that was declined. No certificate has been issued against it, so any paper bearing it is not valid.', 'यह संख्या एक प्रक्रियाधीन या अस्वीकृत अनुरोध की है। इसके विरुद्ध कोई प्रमाण-पत्र जारी नहीं हुआ है।')}</p>
              </InlineAlert>
            )}
            {result.status === 'tampered' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('⚠ The digital signature does not match', '⚠ डिजिटल हस्ताक्षर मेल नहीं खाता')}</p>
                <p className="mt-1">{t('Either this QR code was not printed by the institution, or the certificate\'s contents have been altered since it was signed. Do not accept it.', 'या तो यह QR कोड संस्था द्वारा मुद्रित नहीं है, या हस्ताक्षर के बाद प्रमाण-पत्र बदला गया है। इसे स्वीकार न करें।')}</p>
              </InlineAlert>
            )}
            {result.status === 'unmatched' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('⚠ This document was not issued in this form', '⚠ यह दस्तावेज़ इस रूप में जारी नहीं किया गया')}</p>
                <p className="mt-1">{result.claimsSerial
                  ? t(`It claims to be certificate ${result.claimsSerial}, which exists — but this file differs from the one issued. It has been edited. Ask the holder for the original, or check the number instead.`, `यह प्रमाण-पत्र ${result.claimsSerial} होने का दावा करता है, जो मौजूद है — पर यह फ़ाइल जारी फ़ाइल से भिन्न है। इसे बदला गया है।`)
                  : t('Its fingerprint matches no certificate the institution has issued. It may be a forgery, a scan or a re-saved copy; check the number printed on it instead.', 'इसकी फ़िंगरप्रिंट किसी जारी प्रमाण-पत्र से मेल नहीं खाती। यह नकली, स्कैन या पुनः सहेजी गई प्रति हो सकती है; इस पर छपी संख्या से जाँचें।')}</p>
                {localHash && <p className="mt-2 font-mono text-[11px] break-all">SHA-256 {localHash}</p>}
              </InlineAlert>
            )}
            {result.status === 'revoked' && (
              <InlineAlert type="error">
                <p className="font-semibold">{t('Certificate has been revoked', 'प्रमाण-पत्र रद्द किया गया है')}</p>
                <p className="mt-1">{t('The institution withdrew this certificate. It is no longer valid.', 'संस्था ने यह प्रमाण-पत्र वापस ले लिया है। यह अब वैध नहीं है।')}{c?.revokedReason ? ` ${t('Reason', 'कारण')}: ${c.revokedReason}` : ''}{c?.revokedAt ? ` (${fmtDate(c.revokedAt)})` : ''}</p>
              </InlineAlert>
            )}
            {result.status === 'expired' && (
              <InlineAlert type="warning">
                <p className="font-semibold">{t('Certificate has expired', 'प्रमाण-पत्र की वैधता समाप्त')}</p>
                <p className="mt-1">{t(`It was genuinely issued, but was valid only until ${fmtDate(c?.validUntil ?? null)}.`, `यह वास्तव में जारी हुआ था, पर केवल ${fmtDate(c?.validUntil ?? null)} तक वैध था।`)}</p>
              </InlineAlert>
            )}

            {c && (
              <div className="bg-white border border-[#D3D8E0] rounded-[2px]">
                <div className={`${good ? 'bg-[#16264A]' : 'bg-[#A8242C]'} text-white px-5 py-4 rounded-t-[2px] flex items-start justify-between gap-4`}>
                  <div>
                    {good && (
                      <div className="flex items-center gap-2 mb-1">
                        <VerifiedSeal size={28} />
                        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#E0952A]">{t(`Verified — ${c.institution.name}`, `सत्यापित — ${c.institution.name}`)}</p>
                      </div>
                    )}
                    <h2 className="text-h2 font-semibold">{c.title}</h2>
                    <p className="text-[12px] text-white/70 mt-0.5">{c.type}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono text-[12px] text-white/70">{c.serialNo}</p>
                    <StatusPill status={good ? 'valid' : result.status === 'tampered' ? 'tampered' : 'revoked'} lang={lang} />
                  </div>
                </div>
                <div className="px-5 pt-4">
                  <p className="text-[13px] text-[#5A6577]">{t('This is to certify that', 'यह प्रमाणित किया जाता है कि')}</p>
                  <p className="text-[20px] font-semibold text-[#16264A]">{c.recipient.name}{c.recipient.ref ? <span className="text-[12px] font-mono text-[#5A6577] ml-2">{c.recipient.ref}</span> : null}</p>
                  <p className="text-[14px] text-[#16264A] mt-1">{c.statement}</p>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
                  {[
                    ...c.fields,
                    [t('Date of issue', 'जारी करने की तारीख'), fmtDate(c.issuedAt)],
                    ...(c.validUntil ? [[t('Valid until', 'वैधता'), fmtDate(c.validUntil)]] : []),
                    [t('Issued by', 'जारीकर्ता'), c.issuer],
                    [t('Digital signature', 'डिजिटल हस्ताक्षर'), c.cryptography.signatureValid ? t(`Valid ✓ — Ed25519, key ${c.cryptography.keyId}${c.cryptography.keyRetired ? ' (since retired)' : ''}`, `मान्य ✓ — Ed25519, कुंजी ${c.cryptography.keyId}`) : t('Invalid ✗', 'अमान्य ✗')],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="border-b border-[#D3D8E0] pb-2">
                      <p className="text-[11px] text-[#5A6577] uppercase tracking-wider">{label}</p>
                      <p className="text-[14px] text-[#16264A] font-medium mt-0.5 break-words">{value}</p>
                    </div>
                  ))}
                </div>
                {masked && <p className="px-5 pb-3 text-[11px] text-[#5A6577]">{t('Checked by number only, so the surname is partly hidden. Scan the QR code or upload the PDF to see the certificate in full.', 'केवल संख्या से जाँच — उपनाम आंशिक रूप से छिपा है। पूरा प्रमाण-पत्र देखने के लिए QR स्कैन करें या PDF अपलोड करें।')}</p>}
                <div className="px-5 pb-4">
                  <button onClick={() => setShowCrypto(s => !s)} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">{showCrypto ? t('Hide', 'छिपाएँ') : t('Verify it yourself, without trusting this page ›', 'स्वयं सत्यापित करें ›')}</button>
                  {showCrypto && (
                    <div className="mt-3 space-y-2 text-[12px] text-[#16264A]">
                      <p className="text-[#5A6577]">{t('The signature is Ed25519 over the payload below, serialised as JSON with keys sorted at every level and no spaces. The public key is published by the institution:', 'हस्ताक्षर नीचे दिए पेलोड पर Ed25519 है (कुंजियाँ क्रमबद्ध, कोई रिक्त स्थान नहीं)। सार्वजनिक कुंजी यहाँ प्रकाशित है:')} <a className="text-[#E0952A] hover:underline break-all" href={`${API_BASE}/api/verify/keys`} target="_blank" rel="noreferrer">/api/verify/keys</a></p>
                      <p><span className="text-[#5A6577]">{t('Key id', 'कुंजी')}:</span> <span className="font-mono">{c.cryptography.keyId}</span></p>
                      <p className="break-all"><span className="text-[#5A6577]">{t('Payload SHA-256', 'पेलोड SHA-256')}:</span> <span className="font-mono">{c.cryptography.payloadHash}</span></p>
                      {c.cryptography.pdfHash && <p className="break-all"><span className="text-[#5A6577]">{t('Official PDF SHA-256', 'मूल PDF SHA-256')}:</span> <span className="font-mono">{c.cryptography.pdfHash}</span></p>}
                      {c.cryptography.signature && <p className="break-all"><span className="text-[#5A6577]">{t('Signature', 'हस्ताक्षर')}:</span> <span className="font-mono">{c.cryptography.signature}</span></p>}
                      {c.cryptography.payload !== undefined
                        ? <pre className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-[4px] p-3 overflow-x-auto text-[11px]">{JSON.stringify(c.cryptography.payload, null, 2)}</pre>
                        : <p className="text-[#5A6577]">{t('The signed payload is shown when the certificate is checked by its QR code or its PDF.', 'हस्ताक्षरित पेलोड QR या PDF से जाँचने पर दिखता है।')}</p>}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-[#16264A]">{t('Verification Receipt', 'सत्यापन रसीद')}</p>
                  <p className="text-[12px] text-[#5A6577]">
                    {t('Reference', 'संदर्भ')} <span className="font-mono text-[#E0952A] font-semibold">{result.reference}</span> · {new Date(result.checkedAt).toLocaleString('en-IN')}
                    {c ? ` · ${t('checked', 'जाँचा गया')} ${c.verifications}×` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => void downloadReceipt()}>{t('Download PDF', 'PDF डाउनलोड करें')}</Button>
                  {shareLink && <Button size="sm" variant="ghost" onClick={() => void copyText(shareLink, 'Verification link')}>{t('Copy Link', 'लिंक कॉपी करें')}</Button>}
                  {!good && result.status !== 'not_issued' && (
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
        <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} no={c?.serialNo ?? checked.no} reference={result.reference} status={result.status} t={t} />
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
