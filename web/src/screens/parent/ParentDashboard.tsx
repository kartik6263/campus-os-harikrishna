import { Spinner } from '../../components/ui';
import { useAttendance, useFees, useNotifications, useProfile, useResults } from '../../lib/queries';
import { useMyHostel } from '../../lib/hostel';
import { useAuth } from '../../lib/auth';

interface Props {
  lang: 'hi' | 'en';
  navigate: (m: string) => void;
}

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const quickActions = [
  { icon: '📋', labelHi: 'उपस्थिति', labelEn: 'Attendance', screen: 'attendance' },
  { icon: '💳', labelHi: 'फीस', labelEn: 'Fee', screen: 'fee' },
  { icon: '📊', labelHi: 'परिणाम', labelEn: 'Results', screen: 'results' },
  { icon: '📢', labelHi: 'सूचनाएं', labelEn: 'Notices', screen: 'announcements' },
  { icon: '🚪', labelHi: 'अवकाश / गेट पास', labelEn: 'Leave & Gate Pass', screen: 'gate-pass' },
  { icon: '💬', labelHi: 'संदेश', labelEn: 'Message', screen: 'messaging' },
];

/** The parent's home: their own ward's figures, from the same records the college keeps. */
export default function ParentDashboard({ lang, navigate }: Props) {
  const { user } = useAuth();
  const profile = useProfile();
  const attendance = useAttendance();
  const fees = useFees();
  const results = useResults();
  const notifications = useNotifications();
  const hostel = useMyHostel();
  const consents = (hostel.data?.leaves ?? []).filter(r => r.status === 'AWAITING_PARENT').length;

  if (profile.isLoading) return <div className="flex justify-center py-16"><Spinner size={22} /></div>;
  if (profile.isError || !profile.data) {
    return <p className="p-6 text-center text-[14px] text-[#5A6577]">{t(lang, 'No student is linked to this account yet. Ask the college office to link your ward.', 'इस खाते से अभी कोई छात्र नहीं जुड़ा है। कॉलेज कार्यालय से संपर्क करें।')}</p>;
  }

  const s = profile.data;
  const att = attendance.data;
  const low = att?.subjects.filter(x => !x.meetsThreshold) ?? [];
  const due = fees.data?.summary.due ?? 0;
  const nextInstalment = fees.data?.instalments.find(i => !i.paid);
  const latest = results.data?.[results.data.length - 1];
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-6">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white/70 text-xs">{t(lang, 'Parent Portal', 'अभिभावक पोर्टल')}</p>
        <p className="text-white font-semibold text-base">{user?.email}</p>
      </div>

      <div className="mx-4 mt-4 rounded-2xl overflow-hidden shadow-md">
        <div className="bg-gradient-to-r from-[#E0952A] to-[#f5b84c] px-4 py-3 flex items-center gap-3">
          <div className="w-14 h-14 rounded-full bg-white/30 flex items-center justify-center text-white text-xl font-bold shrink-0">{s.name.split(' ').map(w => w[0]).slice(0, 2).join('')}</div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-base leading-tight">{lang === 'hi' && s.nameHi ? s.nameHi : s.name}</p>
            <p className="text-white/90 text-xs">{s.programme.name} · {t(lang, 'Semester', 'सेमेस्टर')} {s.semester}</p>
          </div>
        </div>
        <div className="bg-white px-4 py-2">
          <p className="text-[#16264A] text-xs">{s.college.name}</p>
          <p className="text-gray-400 text-xs font-mono">{s.enrolmentNo}</p>
        </div>
      </div>

      <div className="mx-4 mt-4 grid grid-cols-3 gap-3">
        <button onClick={() => navigate('attendance')} className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center gap-1 min-h-[80px] justify-center">
          <span className={`text-lg font-bold ${att && att.overall.percent < att.threshold ? 'text-red-500' : 'text-[#0E7A5F]'}`}>{att ? `${att.overall.percent}%` : '—'}</span>
          <p className="text-gray-500 text-[10px] text-center leading-tight">{t(lang, 'Attendance', 'उपस्थिति')}</p>
        </button>
        <button onClick={() => navigate('results')} className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center gap-1 min-h-[80px] justify-center">
          <span className="text-[#16264A] text-lg font-bold">{latest ? latest.cgpa.toFixed(2) : '—'}</span>
          <p className="text-gray-500 text-[10px] text-center">CGPA</p>
        </button>
        <button onClick={() => navigate('fee')} className="bg-white rounded-xl p-3 shadow-sm flex flex-col items-center gap-1 min-h-[80px] justify-center">
          <span className={`text-base font-bold ${due > 0 ? 'text-[#E0952A]' : 'text-[#0E7A5F]'}`}>{fees.data ? inr(due) : '—'}</span>
          <p className="text-gray-500 text-[10px] text-center leading-tight">{t(lang, 'Fee Due', 'बकाया')}</p>
        </button>
      </div>

      {(low.length > 0 || due > 0 || unread > 0 || consents > 0) && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Needs your attention', 'ध्यान दें')}</p>
          <div className="flex flex-col gap-2">
            {consents > 0 && (
              <Alert tone="purple" onClick={() => navigate('gate-pass')} label={t(lang, 'Respond', 'जवाब दें')}>
                🚪 {t(lang, `${consents} leave request${consents > 1 ? 's' : ''} waiting for your consent`, `${consents} अवकाश अनुरोध आपकी सहमति की प्रतीक्षा में`)}
              </Alert>
            )}
            {low.length > 0 && (
              <Alert tone="red" onClick={() => navigate('attendance')} label={t(lang, 'View', 'देखें')}>
                ⚠ {t(lang, `Attendance below ${att!.threshold}% in ${low.map(x => x.code).join(', ')}`, `${low.map(x => x.code).join(', ')} में उपस्थिति ${att!.threshold}% से कम`)}
              </Alert>
            )}
            {due > 0 && (
              <Alert tone="amber" onClick={() => navigate('fee')} label={t(lang, 'Pay', 'भुगतान करें')}>
                💳 {t(lang, `${inr(due)} due${nextInstalment ? ` — next instalment by ${new Date(nextInstalment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`, `${inr(due)} बकाया`)}
              </Alert>
            )}
            {unread > 0 && (
              <Alert tone="blue" onClick={() => navigate('announcements')} label={t(lang, 'Read', 'पढ़ें')}>
                📢 {t(lang, `${unread} unread update${unread > 1 ? 's' : ''}`, `${unread} नई सूचनाएं`)}
              </Alert>
            )}
          </div>
        </div>
      )}

      <div className="mx-4 mt-4">
        <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Quick Access', 'त्वरित पहुँच')}</p>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map(action => (
            <button key={action.screen} onClick={() => navigate(action.screen)} className="bg-white rounded-xl flex flex-col items-center justify-center gap-1 min-h-[72px] shadow-sm active:scale-95 transition-transform cursor-pointer">
              <span className="text-2xl">{action.icon}</span>
              <span className="text-[#16264A] text-xs font-medium text-center px-1">{lang === 'hi' ? action.labelHi : action.labelEn}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Alert({ tone, onClick, label, children }: { tone: 'red' | 'amber' | 'blue' | 'purple'; onClick: () => void; label: string; children: React.ReactNode }) {
  const styles = {
    red: ['bg-red-50 border-red-200 text-red-700', 'bg-red-500'],
    amber: ['bg-amber-50 border-amber-200 text-amber-800', 'bg-[#E0952A]'],
    blue: ['bg-blue-50 border-blue-200 text-blue-800', 'bg-blue-500'],
    purple: ['bg-purple-50 border-purple-200 text-purple-800', 'bg-purple-600'],
  }[tone];
  return (
    <div className={`border rounded-xl px-4 py-3 flex items-center justify-between gap-2 ${styles[0]}`}>
      <p className="text-sm flex-1 leading-snug">{children}</p>
      <button onClick={onClick} className={`shrink-0 text-white text-xs font-semibold px-3 py-2 rounded-lg min-h-[44px] min-w-[56px] cursor-pointer ${styles[1]}`}>{label}</button>
    </div>
  );
}
