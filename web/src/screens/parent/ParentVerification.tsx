import IdentityVerification, { StatusBadge } from '../../components/IdentityVerification';
import { InlineAlert, SkeletonRow } from '../../components/ui';
import { useWardVerification } from '../../lib/verification';

/** The parent's own verification, and whether their ward's profile and ABC ID are verified. */
export default function ParentVerification({ lang }: { lang: 'hi' | 'en' }) {
  const t = (en: string, hi: string) => (lang === 'hi' ? hi : en);
  const wards = useWardVerification();

  return (
    <div className="pb-4">
      <div className="px-4 pt-4 pb-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{t('Your child', 'आपका बच्चा')}</div>
      <div className="bg-white border-y border-[#D3D8E0]">
        {wards.isPending && <div className="p-4"><SkeletonRow /></div>}
        {wards.error && <div className="p-4"><InlineAlert type="error">{(wards.error as Error).message}</InlineAlert></div>}
        {wards.data?.wards.length === 0 && <p className="p-4 text-[13px] text-[#5A6577]">{t('No ward is linked to your account.', 'आपके खाते से कोई छात्र जुड़ा नहीं है।')}</p>}
        {wards.data?.wards.map(w => (
          <div key={w.enrolmentNo} className="px-4 py-3 border-b border-[#EDEFF3] last:border-b-0">
            <div className="text-[14px] font-semibold text-[#16264A]">{w.name}</div>
            <div className="font-mono text-[11px] text-[#5A6577]">{w.enrolmentNo}</div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[12px] text-[#5A6577]">{t('Profile identity', 'प्रोफ़ाइल पहचान')}</span>
              <StatusBadge status={w.identityStatus} />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[12px] text-[#5A6577]">ABC ID {w.abcId && <span className="font-mono text-[#16264A]">{w.abcId}</span>}</span>
              <StatusBadge status={w.abcStatus} />
            </div>
            {(w.identityStatus !== 'VERIFIED' || w.abcStatus !== 'VERIFIED') && (
              <p className="text-[11px] text-[#5A6577] mt-2">
                {t('Your child verifies from Profile in the student portal, with their own DigiLocker.', 'आपका बच्चा छात्र पोर्टल की प्रोफ़ाइल से अपने DigiLocker द्वारा सत्यापन करता है।')}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 pt-4 pb-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{t('Your identity', 'आपकी पहचान')}</div>
      <div className="border-y border-[#D3D8E0]"><IdentityVerification /></div>
    </div>
  );
}
