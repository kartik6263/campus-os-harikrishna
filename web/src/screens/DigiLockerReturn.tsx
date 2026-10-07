import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, InlineAlert, Spinner } from '../components/ui';
import { StatusBadge } from '../components/IdentityVerification';
import { completeDigilocker, showDlDate, type CompleteResult, type DigilockerReturn } from '../lib/verification';

/** Where DigiLocker sends a person back: the server finishes, and they see what was verified. */
export default function DigiLockerReturnScreen({ data, onDone }: { data: DigilockerReturn; onDone: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeDigilocker(data)
      .then(r => { setResult(r); void qc.invalidateQueries(); })
      .catch(err => setError(err instanceof Error ? err.message : 'DigiLocker verification failed'));
  }, [data, qc]);

  return (
    <div className="min-h-screen bg-[#EDEFF3] flex items-center justify-center p-4">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] w-full max-w-md">
        <div className="px-5 py-4 border-b border-[#D3D8E0] flex items-center gap-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F3B8F" strokeWidth="2"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <h1 className="text-[16px] font-semibold text-[#16264A]">DigiLocker verification</h1>
        </div>
        <div className="p-5 flex flex-col gap-3">
          {!result && !error && (
            <div className="flex items-center gap-3 text-[14px] text-[#5A6577]"><Spinner size={18} /> Reading your details from DigiLocker…</div>
          )}
          {error && <InlineAlert type="error">{error}</InlineAlert>}
          {result && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[14px] font-semibold text-[#16264A]">Identity</span>
                <StatusBadge status={result.identityStatus} />
              </div>
              {result.identityStatus === 'VERIFIED'
                ? <InlineAlert type="success">Your name{result.dobMatch !== null ? ' and date of birth' : ''} in DigiLocker match the institution’s record. Your profile is now verified.</InlineAlert>
                : <InlineAlert type="warning">{result.identityNote ?? 'DigiLocker’s details differ from the record.'} The records section will review it; if the record is wrong, ask them to correct it.</InlineAlert>}
              <div className="text-[13px] text-[#16264A] border border-[#D3D8E0] rounded-[4px] px-3 py-2">
                <div>{result.dlName}</div>
                <div className="text-[#5A6577]">Born {showDlDate(result.dlDob)}{result.aadhaarLast4 ? ` · Aadhaar XXXX XXXX ${result.aadhaarLast4}` : ''}</div>
              </div>
              {result.abcApplies && (
                <>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[14px] font-semibold text-[#16264A]">ABC ID {result.abcId && <span className="font-mono font-normal">{result.abcId}</span>}</span>
                    <StatusBadge status={result.abcStatus} />
                  </div>
                  {!result.abcFound && (
                    <InlineAlert type="info">
                      No ABC / APAAR card was found in your DigiLocker. Create your ABC ID at{' '}
                      <a href="https://www.abc.gov.in" target="_blank" rel="noopener noreferrer" className="underline">abc.gov.in</a>{' '}
                      (it is issued straight into DigiLocker), then fetch again — or enter it manually on your profile.
                    </InlineAlert>
                  )}
                  {result.abcFound && result.abcNote && <InlineAlert type="warning">{result.abcNote}</InlineAlert>}
                </>
              )}
            </>
          )}
          {(result || error) && <Button onClick={onDone}>Continue to my portal</Button>}
        </div>
      </div>
    </div>
  );
}
