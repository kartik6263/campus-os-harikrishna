import { useState, useEffect } from 'react';
import type { Screen } from '../lib/data';
import { inst, instPlace } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void }

type ScreenName = 'splash' | 'onboarding' | 'dashboard' | 'attendance' | 'timetable' | 'fee' | 'results' | 'notifications' | 'qr-scan' | 'bus-track' | 'digital-id' | 'offline';

const SCREENS: Array<{ id: ScreenName; label: string; portal: 'student' | 'parent' | 'both' }> = [
  { id: 'splash', label: 'Splash', portal: 'both' },
  { id: 'onboarding', label: 'Onboarding', portal: 'both' },
  { id: 'dashboard', label: 'Dashboard', portal: 'student' },
  { id: 'attendance', label: 'Attendance', portal: 'student' },
  { id: 'timetable', label: 'Timetable', portal: 'student' },
  { id: 'fee', label: 'Fee Payment', portal: 'both' },
  { id: 'results', label: 'Results', portal: 'student' },
  { id: 'notifications', label: 'Notifications', portal: 'both' },
  { id: 'qr-scan', label: 'QR Attendance', portal: 'student' },
  { id: 'bus-track', label: 'Bus Tracking', portal: 'both' },
  { id: 'digital-id', label: 'Digital ID', portal: 'student' },
  { id: 'offline', label: 'Offline State', portal: 'both' },
];

// Push notification types shown in the overlay demo
const PUSH_NOTIFICATIONS = [
  {
    id: 'pn1',
    type: 'attendance',
    icon: '⚠️',
    app: 'Resolion Campus OS',
    title: 'उपस्थिति चेतावनी',
    body: 'BCA503 — आपकी उपस्थिति 53.8% है। परीक्षा के लिए 75% आवश्यक है।',
    time: 'अभी',
    color: '#E0952A',
    action: 'उपस्थिति देखें',
  },
  {
    id: 'pn2',
    type: 'fee',
    icon: '₹',
    app: 'Resolion Campus OS',
    title: 'शुल्क अनुस्मारक',
    body: '₹3,300 की अंतिम तिथि 15 अक्टूबर है। अभी भुगतान करें।',
    time: '2 घंटे',
    color: '#EF4444',
    action: 'भुगतान करें',
  },
  {
    id: 'pn3',
    type: 'result',
    icon: '🎓',
    app: 'Resolion Campus OS',
    title: 'परिणाम जारी',
    body: 'Semester IV का परिणाम घोषित हो गया है। SGPA: 7.80',
    time: 'कल',
    color: '#10B981',
    action: 'परिणाम देखें',
  },
  {
    id: 'pn4',
    type: 'parent',
    icon: '👨‍👩‍👧',
    app: 'Resolion Campus OS (Parent)',
    title: 'अभिभावक-शिक्षक बैठक',
    body: '28 September — subah 10 baje college mein milein. Semester V progress.',
    time: '3 दिन',
    color: '#7C3AED',
    action: 'देखें',
  },
];

// Lock-screen style notification card
function PushNotifCard({ notif, onDismiss }: { notif: typeof PUSH_NOTIFICATIONS[0]; onDismiss: () => void }) {
  return (
    <div
      className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-xl mx-2 overflow-hidden border border-white/50"
      style={{ animation: 'slideDown 0.3s ease-out' }}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: notif.color }}>
            {notif.icon}
          </div>
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{notif.app}</span>
          <span className="text-[9px] text-gray-400 ml-auto">{notif.time}</span>
        </div>
        <div className="text-[12px] font-bold text-gray-900 leading-tight">{notif.title}</div>
        <div className="text-[11px] text-gray-600 mt-0.5 leading-relaxed">{notif.body}</div>
        <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={onDismiss}
            className="flex-1 text-[10px] font-semibold text-gray-400 py-1 rounded-lg cursor-pointer"
          >
            बंद करें
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 text-[11px] font-bold py-1 rounded-lg cursor-pointer"
            style={{ color: notif.color, background: `${notif.color}15` }}
          >
            {notif.action}
          </button>
        </div>
      </div>
    </div>
  );
}

// Banner-style notification (slides from top)
function BannerNotif({ notif, onDismiss }: { notif: typeof PUSH_NOTIFICATIONS[0]; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="absolute top-6 left-2 right-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl z-30 overflow-hidden"
      style={{ animation: 'slideDown 0.25s ease-out' }}
    >
      <div className="px-3 py-2.5 flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[14px]" style={{ background: notif.color }}>
          {notif.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] font-bold text-gray-900 truncate">{notif.title}</span>
            <span className="text-[9px] text-gray-400 shrink-0">{notif.time}</span>
          </div>
          <div className="text-[10px] text-gray-600 leading-tight mt-0.5 line-clamp-2">{notif.body}</div>
        </div>
        <button onClick={onDismiss} className="text-gray-300 hover:text-gray-500 cursor-pointer shrink-0 text-[14px] mt-0.5">✕</button>
      </div>
    </div>
  );
}

function PhoneFrame({ children, overlay }: { children: React.ReactNode; overlay?: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 320, height: 640 }}>
      <div className="absolute inset-0 bg-[#1A1A2E] rounded-[32px] shadow-2xl border-4 border-[#2A2A4A]" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-[#2A2A4A] rounded-b-2xl z-10" />
      <div className="absolute inset-1 rounded-[28px] overflow-hidden bg-white relative">
        {children}
        {overlay}
      </div>
      <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ background: '#16264A' }}>
      <div className="w-20 h-20 bg-[#E0952A] rounded-2xl flex items-center justify-center mb-6 shadow-lg">
        <span className="text-white font-bold text-3xl">{inst().shortCode}</span>
      </div>
      <h1 className="text-white text-2xl font-bold tracking-tight">Resolion Campus OS</h1>
      <p className="text-white/60 text-sm mt-1">{instPlace()}</p>
      <p className="text-white/40 text-xs mt-12">जिवाजी विश्वविद्यालय</p>
      <div className="mt-6 flex gap-1">
        {[0,1,2].map(i => <div key={i} className={`w-2 h-2 rounded-full ${i===0 ? 'bg-[#E0952A]' : 'bg-white/20'}`} />)}
      </div>
    </div>
  );
}

function OnboardingScreen() {
  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="w-32 h-32 bg-[#EDEFF3] rounded-full flex items-center justify-center mb-6 text-5xl">📱</div>
        <h2 className="text-[#16264A] font-bold text-xl leading-tight">अपना पोर्टल चुनें</h2>
        <p className="text-[#5A6577] text-sm mt-2 leading-relaxed">छात्र या अभिभावक — दोनों के लिए अलग लॉगिन</p>
      </div>
      <div className="px-5 pb-8 space-y-3">
        <button className="w-full bg-[#16264A] text-white py-3 rounded-xl text-[15px] font-semibold cursor-pointer">👤 छात्र लॉगिन / Student Login</button>
        <button className="w-full border-2 border-[#16264A] text-[#16264A] py-3 rounded-xl text-[15px] font-semibold cursor-pointer">👨‍👩‍👧 अभिभावक लॉगिन / Parent Login</button>
        <p className="text-center text-[11px] text-[#5A6577]">नामांकन संख्या + OTP से लॉगिन करें</p>
      </div>
    </div>
  );
}

function DashboardScreen() {
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-6">
        <p className="text-white/60 text-[11px]">नमस्ते 👋</p>
        <p className="text-white font-bold text-[17px] mt-0.5">प्रिया शर्मा</p>
        <p className="text-white/50 text-[11px]">BCA V • Model College • JU2022BCA0145</p>
        <div className="flex gap-2 mt-3">
          <div className="flex-1 bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-[#E0952A] font-bold text-lg">68.4%</p>
            <p className="text-white/60 text-[10px]">उपस्थिति</p>
          </div>
          <div className="flex-1 bg-white/10 rounded-xl p-2.5 text-center">
            <p className="text-white font-bold text-lg">7.98</p>
            <p className="text-white/60 text-[10px]">CGPA</p>
          </div>
          <div className="flex-1 bg-red-500/20 rounded-xl p-2.5 text-center">
            <p className="text-red-300 font-bold text-lg">₹3,300</p>
            <p className="text-white/60 text-[10px]">बकाया</p>
          </div>
        </div>
      </div>
      <div className="flex-1 px-3 py-3 overflow-hidden">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3 flex items-start gap-2">
          <span className="text-amber-600 text-sm">⚠️</span>
          <div>
            <p className="text-[12px] font-semibold text-amber-800">उपस्थिति कम है</p>
            <p className="text-[11px] text-amber-700">BCA503 में 53.8% — परीक्षा पात्रता खतरे में</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[['📋','उपस्थिति'],['📅','समय-सारणी'],['📝','परीक्षा'],['₹','शुल्क'],['🏅','छात्रवृत्ति'],['📚','पुस्तकालय']].map(([icon, label]) => (
            <div key={label} className="bg-white rounded-xl p-3 flex flex-col items-center gap-1.5 cursor-pointer">
              <span className="text-xl">{icon}</span>
              <p className="text-[10px] font-medium text-[#16264A] text-center leading-tight">{label}</p>
            </div>
          ))}
        </div>
      </div>
      <nav className="h-14 bg-white border-t border-[#D3D8E0] flex items-stretch">
        {[['🏠','होम'],['📋','उपस्थित'],['₹','शुल्क'],['📝','परीक्षा'],['☰','और']].map(([icon, label]) => (
          <button key={label} className={`flex-1 flex flex-col items-center justify-center text-[9px] gap-0.5 cursor-pointer ${label === 'होम' ? 'text-[#16264A] font-bold' : 'text-[#5A6577]'}`}>
            <span className="text-base">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function AttendanceScreen() {
  const subjects = [
    { code: 'BCA501', name: 'Software Engg.', attended: 40, total: 52, pct: 76.9 },
    { code: 'BCA502', name: 'Operating Systems', attended: 38, total: 52, pct: 73.1 },
    { code: 'BCA503', name: 'Computer Networks', attended: 28, total: 52, pct: 53.8 },
    { code: 'BCA504', name: 'Python Programming', attended: 44, total: 52, pct: 84.6 },
    { code: 'BCA505', name: 'Web Technologies', attended: 46, total: 52, pct: 88.5 },
  ];
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">उपस्थिति</p>
      </div>
      <div className="bg-white mx-3 mt-3 rounded-xl p-3 flex items-center gap-4 border border-[#D3D8E0]">
        <div className="flex-1 text-center">
          <p className="text-[24px] font-bold" style={{ color: '#E0952A' }}>68.4%</p>
          <p className="text-[10px] text-[#5A6577]">कुल उपस्थिति</p>
        </div>
        <div className="w-px h-10 bg-[#D3D8E0]" />
        <div className="flex-1 text-center">
          <p className="text-[18px] font-bold text-red-500">6.6%</p>
          <p className="text-[10px] text-[#5A6577]">75% से कम</p>
        </div>
      </div>
      <div className="flex-1 px-3 py-2 space-y-2 overflow-auto">
        {subjects.map(s => (
          <div key={s.code} className="bg-white rounded-xl px-3 py-2.5 border border-[#D3D8E0]">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <p className="text-[12px] font-semibold text-[#16264A]">{s.name}</p>
                <p className="text-[10px] text-[#5A6577]">{s.attended}/{s.total} कक्षाएं</p>
              </div>
              <p className={`text-[15px] font-bold ${s.pct < 75 ? 'text-red-500' : 'text-green-600'}`}>{s.pct}%</p>
            </div>
            <div className="h-1.5 bg-[#EDEFF3] rounded-full">
              <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.pct < 75 ? '#EF4444' : '#16A34A' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeeScreen() {
  const [step, setStep] = useState(0);
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">शुल्क भुगतान</p>
      </div>
      {step === 0 && (
        <div className="flex-1 px-3 py-3 space-y-3">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-[12px] font-bold text-red-700">बकाया शुल्क</p>
            <p className="text-[28px] font-bold text-red-600 mt-1">₹3,300</p>
            <p className="text-[11px] text-red-600">अंतिम तिथि: 15 अक्टूबर 2024</p>
          </div>
          <div className="bg-white rounded-xl p-3 border border-[#D3D8E0] space-y-2">
            <p className="text-[12px] font-semibold text-[#16264A]">किस्त विवरण</p>
            {[{ n: 1, amt: '₹6,200', paid: true, date: '12-Jul' }, { n: 2, amt: '₹3,000', paid: true, date: '14-Sep' }, { n: 3, amt: '₹3,300', paid: false, date: '15-Oct' }].map(ins => (
              <div key={ins.n} className="flex items-center justify-between py-1.5 border-t border-[#EDEFF3]">
                <p className="text-[11px] text-[#5A6577]">किस्त {ins.n} • {ins.date}</p>
                <div className="flex items-center gap-2">
                  <p className="text-[12px] font-semibold text-[#16264A]">{ins.amt}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${ins.paid ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{ins.paid ? 'भुगतान' : 'बकाया'}</span>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => setStep(1)} className="w-full bg-[#16264A] text-white py-3 rounded-xl text-[15px] font-semibold cursor-pointer">अभी भुगतान करें — ₹3,300</button>
        </div>
      )}
      {step === 1 && (
        <div className="flex-1 px-3 py-3 space-y-3">
          <p className="text-[14px] font-semibold text-[#16264A] px-1">भुगतान का तरीका चुनें</p>
          {[['UPI','📱 UPI (PhonePe / GPay / Paytm)'],['NEFT','🏦 Net Banking'],['CARD','💳 Debit / Credit Card']].map(([id, label]) => (
            <button key={id} onClick={() => setStep(2)} className="w-full flex items-center gap-3 bg-white border border-[#D3D8E0] rounded-xl p-3.5 cursor-pointer">
              <span className="text-[13px] font-medium text-[#16264A]">{label}</span>
              <span className="ml-auto text-[#5A6577]">›</span>
            </button>
          ))}
        </div>
      )}
      {step === 2 && (
        <div className="flex-1 flex flex-col items-center justify-center px-5">
          <div className="w-40 h-40 bg-[#F0F0F0] flex items-center justify-center mb-4 rounded">
            <div className="grid grid-cols-5 gap-0.5">
              {Array.from({ length: 25 }).map((_, i) => (
                <div key={i} className="w-3 h-3 rounded-sm" style={{ background: Math.random() > 0.5 ? '#16264A' : '#fff' }} />
              ))}
            </div>
          </div>
          <p className="text-[13px] font-semibold text-[#16264A]">UPI से स्कैन करें</p>
          <p className="text-[11px] text-[#5A6577] mt-1">ju-fees@sbi • ₹3,300</p>
          <div className="mt-3 flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
            <p className="text-[11px] text-green-600">QR 4:52 में समाप्त होगा</p>
          </div>
          <button onClick={() => setStep(0)} className="mt-6 text-[12px] text-[#5A6577] underline cursor-pointer">वापस जाएं</button>
        </div>
      )}
    </div>
  );
}

function NotificationsScreen() {
  const notifs = [
    { icon: '⚠️', title: 'उपस्थिति चेतावनी', body: 'BCA503 में उपस्थिति 53.8% — परीक्षा के लिए 75% चाहिए', time: 'अभी', color: 'bg-amber-50 border-amber-200', unread: true },
    { icon: '₹', title: 'शुल्क अनुस्मारक', body: '₹3,300 की अंतिम तिथि 15 अक्टूबर है', time: '2 घंटे', color: 'bg-red-50 border-red-200', unread: true },
    { icon: '📋', title: 'परीक्षा फॉर्म', body: 'Nov 2024 परीक्षा फॉर्म अंतिम तिथि 25 सितम्बर तक बढ़ी', time: 'कल', color: 'bg-white border-[#D3D8E0]', unread: false },
    { icon: '🏅', title: 'छात्रवृत्ति स्वीकृत', body: 'MP OBC छात्रवृत्ति ₹9,000 आपके खाते में भेजी गई', time: '3 दिन', color: 'bg-green-50 border-green-200', unread: false },
  ];
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">सूचनाएं</p>
        <div className="ml-auto w-5 h-5 bg-[#E0952A] rounded-full flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">2</span>
        </div>
      </div>
      <div className="flex-1 px-3 py-2 space-y-2 overflow-auto">
        {notifs.map((n, i) => (
          <div key={i} className={`border rounded-xl px-3 py-2.5 flex gap-2.5 items-start ${n.color}`}>
            {n.unread && <div className="w-2 h-2 bg-[#E0952A] rounded-full mt-1 shrink-0" />}
            {!n.unread && <div className="w-2 h-2 shrink-0" />}
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <p className="text-[12px] font-semibold text-[#16264A]">{n.icon} {n.title}</p>
                <p className="text-[10px] text-[#5A6577]">{n.time}</p>
              </div>
              <p className="text-[11px] text-[#5A6577] mt-0.5 leading-relaxed">{n.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QRScanScreen() {
  const [scanned, setScanned] = useState(false);
  return (
    <div className="flex flex-col h-full" style={{ background: '#0D1B35' }}>
      <div className="px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">QR उपस्थिति</p>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {!scanned ? (
          <>
            <div className="w-52 h-52 border-4 border-[#E0952A] rounded-2xl flex items-center justify-center relative mb-6">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-48 h-0.5 bg-[#E0952A] opacity-70 animate-pulse" />
              </div>
              <div className="absolute top-2 left-2 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl" />
              <div className="absolute top-2 right-2 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr" />
              <div className="absolute bottom-2 left-2 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl" />
              <div className="absolute bottom-2 right-2 w-8 h-8 border-b-4 border-r-4 border-white rounded-br" />
              <p className="text-white/40 text-[11px] text-center">QR कोड यहाँ दिखाएं</p>
            </div>
            <p className="text-white font-semibold text-[14px]">अध्यापक का QR स्कैन करें</p>
            <p className="text-white/50 text-[11px] mt-1 text-center">कक्षा शुरू होने पर अध्यापक QR दिखाएंगे</p>
            <button onClick={() => setScanned(true)} className="mt-6 bg-[#E0952A] text-white px-6 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer">Demo: स्कैन करें</button>
          </>
        ) : (
          <div className="text-center">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mb-4 mx-auto">
              <span className="text-white text-4xl">✓</span>
            </div>
            <p className="text-white font-bold text-[18px]">उपस्थिति दर्ज!</p>
            <p className="text-white/60 text-[12px] mt-2">BCA503 • Computer Networks</p>
            <p className="text-white/40 text-[11px] mt-1">10:05 AM • 19 Sep 2024</p>
            <button onClick={() => setScanned(false)} className="mt-6 text-white/50 text-[12px] underline cursor-pointer">वापस जाएं</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DigitalIDScreen() {
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">डिजिटल पहचान पत्र</p>
      </div>
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-xs rounded-2xl overflow-hidden shadow-xl" style={{ background: 'linear-gradient(135deg, #16264A, #1E3A5F)' }}>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
            <div className="w-8 h-8 bg-[#E0952A] rounded flex items-center justify-center text-white font-bold text-sm">{inst().shortCode}</div>
            <div>
              <p className="text-white font-bold text-[12px]">{inst().name}</p>
              <p className="text-white/50 text-[10px]">Demo City, M.P.</p>
            </div>
            <div className="ml-auto">
              <p className="text-[9px] text-white/40 uppercase tracking-widest">Student ID</p>
            </div>
          </div>
          <div className="flex gap-3 px-4 py-4">
            <div className="w-16 h-20 bg-white/10 rounded-lg flex items-center justify-center">
              <span className="text-3xl">👩‍🎓</span>
            </div>
            <div className="flex-1">
              <p className="text-white font-bold text-[15px]">Priya Sharma</p>
              <p className="text-white/60 text-[10px] mt-0.5">प्रिया शर्मा</p>
              <p className="text-white/50 text-[10px] mt-2">BCA — Semester V</p>
              <p className="text-white/50 text-[10px]">Govt. Model College, Demo City</p>
              <p className="text-[#E0952A] text-[10px] font-mono mt-2">JU2022BCA0145</p>
            </div>
          </div>
          <div className="bg-white/5 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-[9px] text-white/40">Valid upto</p>
              <p className="text-white text-[11px] font-medium">30-Jun-2025</p>
            </div>
            <div className="w-12 h-12 bg-white/10 rounded flex items-center justify-center">
              <div className="grid grid-cols-4 gap-px">
                {Array.from({ length: 16 }).map((_, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-sm" style={{ background: Math.random() > 0.5 ? '#fff' : 'transparent' }} />
                ))}
              </div>
            </div>
          </div>
          <div className="px-4 py-2 flex items-center gap-1.5 bg-green-900/30 border-t border-green-500/20">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <p className="text-[10px] text-green-400">Verified • Resolion Campus OS</p>
          </div>
        </div>
      </div>
      <div className="px-4 py-3 space-y-2">
        <button className="w-full bg-[#16264A] text-white py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer">DigiLocker में सहेजें</button>
        <button className="w-full bg-white border border-[#D3D8E0] text-[#16264A] py-2.5 rounded-xl text-[13px] cursor-pointer">PDF डाउनलोड</button>
      </div>
    </div>
  );
}

function BusTrackScreen() {
  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      <div className="bg-[#16264A] px-4 pt-8 pb-4 flex items-center gap-3">
        <button className="text-white text-lg cursor-pointer">←</button>
        <p className="text-white font-semibold text-[15px]">बस ट्रैकिंग</p>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-white/60 text-[10px]">LIVE</p>
        </div>
      </div>
      <div className="bg-white mx-3 mt-3 rounded-xl border border-[#D3D8E0] p-3">
        <p className="text-[11px] font-bold text-[#5A6577] uppercase tracking-wider mb-2">RDU-01 मार्ग — आपकी बस</p>
        <div className="space-y-0">
          {[
            { stop: 'विश्वविद्यालय गेट', time: 'शुरू', done: true },
            { stop: 'City Centre', time: '07:25', done: true },
            { stop: 'Phool Bagh', time: '07:40', done: false, current: true },
            { stop: 'Old Town', time: '07:52', done: false },
            { stop: 'Sipri Bazar ← आपका स्टॉप', time: '08:05', done: false, yours: true },
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full border-2 mt-0.5 ${s.current ? 'border-[#E0952A] bg-[#E0952A] animate-pulse' : s.done ? 'border-green-500 bg-green-500' : s.yours ? 'border-[#16264A] bg-white' : 'border-[#D3D8E0] bg-white'}`} />
                {i < 4 && <div className={`w-0.5 h-6 mt-0.5 ${s.done ? 'bg-green-500' : 'bg-[#D3D8E0]'}`} />}
              </div>
              <div className="flex-1 flex items-center justify-between">
                <p className={`text-[12px] font-medium ${s.yours ? 'text-[#16264A] font-bold' : s.done ? 'text-[#5A6577]' : 'text-[#16264A]'}`}>{s.stop}</p>
                <p className={`text-[11px] ${s.current ? 'text-[#E0952A] font-bold' : 'text-[#5A6577]'}`}>{s.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mx-3 mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
        <p className="text-[12px] font-bold text-amber-800">🚌 आपकी बस Phool Bagh पर है</p>
        <p className="text-[11px] text-amber-700 mt-0.5">Sipri Bazar पर ETA: ~25 मिनट • MP09-AB-4521</p>
      </div>
    </div>
  );
}

function TimetableScreen() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const [activeDay, setActiveDay] = useState(1); // Tuesday

  const schedule: Record<number, Array<{ time: string; subject: string; code: string; room: string; faculty: string; type: 'lecture' | 'lab' | 'free' }>> = {
    0: [
      { time: '09:00–10:00', subject: 'Software Engineering', code: 'BCA501', room: 'Room 204', faculty: 'Dr. S.K. Pandey', type: 'lecture' },
      { time: '10:00–11:00', subject: 'Database Management', code: 'BCA502', room: 'Room 204', faculty: 'Dr. P. Mishra', type: 'lecture' },
      { time: '11:00–12:00', subject: 'Computer Networks', code: 'BCA503', room: 'Room 106', faculty: 'Sh. R. Tiwari', type: 'lecture' },
      { time: '12:00–13:00', subject: 'Lunch Break', code: '', room: '', faculty: '', type: 'free' },
      { time: '13:00–15:00', subject: 'Database Lab', code: 'BCA502L', room: 'Lab 3', faculty: 'Dr. P. Mishra', type: 'lab' },
    ],
    1: [
      { time: '09:00–10:00', subject: 'Operating Systems', code: 'BCA504', room: 'Room 204', faculty: 'Dr. A. Singh', type: 'lecture' },
      { time: '10:00–11:00', subject: 'Software Engineering', code: 'BCA501', room: 'Room 204', faculty: 'Dr. S.K. Pandey', type: 'lecture' },
      { time: '11:00–13:00', subject: 'Network Lab', code: 'BCA503L', room: 'Lab 2', faculty: 'Sh. R. Tiwari', type: 'lab' },
      { time: '13:00–14:00', subject: 'Lunch Break', code: '', room: '', faculty: '', type: 'free' },
      { time: '14:00–15:00', subject: 'Computer Networks', code: 'BCA503', room: 'Room 106', faculty: 'Sh. R. Tiwari', type: 'lecture' },
    ],
    2: [
      { time: '09:00–10:00', subject: 'Database Management', code: 'BCA502', room: 'Room 204', faculty: 'Dr. P. Mishra', type: 'lecture' },
      { time: '10:00–12:00', subject: 'SE Lab', code: 'BCA501L', room: 'Lab 1', faculty: 'Dr. S.K. Pandey', type: 'lab' },
      { time: '12:00–13:00', subject: 'Lunch Break', code: '', room: '', faculty: '', type: 'free' },
      { time: '13:00–14:00', subject: 'Operating Systems', code: 'BCA504', room: 'Room 204', faculty: 'Dr. A. Singh', type: 'lecture' },
    ],
    3: [
      { time: '09:00–10:00', subject: 'Software Engineering', code: 'BCA501', room: 'Room 204', faculty: 'Dr. S.K. Pandey', type: 'lecture' },
      { time: '10:00–11:00', subject: 'Operating Systems', code: 'BCA504', room: 'Room 204', faculty: 'Dr. A. Singh', type: 'lecture' },
      { time: '11:00–12:00', subject: 'Computer Networks', code: 'BCA503', room: 'Room 106', faculty: 'Sh. R. Tiwari', type: 'lecture' },
      { time: '12:00–13:00', subject: 'Lunch Break', code: '', room: '', faculty: '', type: 'free' },
    ],
    4: [
      { time: '09:00–11:00', subject: 'OS Lab', code: 'BCA504L', room: 'Lab 1', faculty: 'Dr. A. Singh', type: 'lab' },
      { time: '11:00–12:00', subject: 'Database Management', code: 'BCA502', room: 'Room 204', faculty: 'Dr. P. Mishra', type: 'lecture' },
      { time: '12:00–13:00', subject: 'Lunch Break', code: '', room: '', faculty: '', type: 'free' },
      { time: '13:00–14:00', subject: 'Software Engineering', code: 'BCA501', room: 'Room 204', faculty: 'Dr. S.K. Pandey', type: 'lecture' },
    ],
    5: [
      { time: '09:00–10:00', subject: 'Computer Networks', code: 'BCA503', room: 'Room 106', faculty: 'Sh. R. Tiwari', type: 'lecture' },
      { time: '10:00–11:00', subject: 'Tutorial / Doubt Session', code: '', room: 'Room 204', faculty: 'All Faculty', type: 'free' },
    ],
  };

  const slots = schedule[activeDay] ?? [];

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* Top bar */}
      <div className="bg-[#16264A] px-4 py-3 shrink-0">
        <p className="text-white font-semibold text-[14px]">समय-सारणी</p>
        <p className="text-white/60 text-[11px]">BCA Sem V — Nov–Dec 2024</p>
      </div>

      {/* Day selector */}
      <div className="bg-white border-b border-[#D3D8E0] px-2 py-2 flex gap-1 shrink-0">
        {days.map((d, i) => (
          <button key={d} onClick={() => setActiveDay(i)}
            className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
              activeDay === i ? 'bg-[#16264A] text-white' : 'text-[#5A6577] hover:bg-gray-100'
            }`}>
            {d}
          </button>
        ))}
      </div>

      {/* Slots */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {slots.map((slot, i) => (
          <div key={i} className={`rounded-xl p-3 border ${
            slot.type === 'free' ? 'bg-gray-50 border-gray-200' :
            slot.type === 'lab' ? 'bg-purple-50 border-purple-200' :
            'bg-white border-[#D3D8E0]'
          }`}>
            <div className="flex items-start gap-2">
              <div className="shrink-0 mt-0.5">
                <span className="text-[10px] font-mono text-[#5A6577]">{slot.time}</span>
              </div>
              <div className="flex-1 min-w-0">
                {slot.type === 'free' ? (
                  <p className="text-[#5A6577] text-[12px]">{slot.subject}</p>
                ) : (
                  <>
                    <div className="flex items-center gap-1.5">
                      <p className="text-[#16264A] font-semibold text-[13px] leading-tight">{slot.subject}</p>
                      {slot.type === 'lab' && (
                        <span className="text-[9px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">LAB</span>
                      )}
                    </div>
                    <p className="text-[#5A6577] text-[11px] mt-0.5">{slot.code} · {slot.room}</p>
                    <p className="text-[#5A6577] text-[10px]">{slot.faculty}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        {slots.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <p className="text-4xl mb-2">🎉</p>
            <p className="text-[#16264A] font-semibold text-[14px]">आज कोई कक्षा नहीं</p>
            <p className="text-[#5A6577] text-[12px] mt-1">Holiday</p>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="h-14 bg-white border-t border-[#D3D8E0] flex items-stretch shrink-0">
        {[['🏠','होम'],['📋','समय'],['💳','फीस'],['📊','परिणाम'],['☰','अधिक']].map(([icon, label], i) => (
          <button key={i} className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] cursor-pointer ${i === 1 ? 'text-[#16264A] font-bold' : 'text-[#5A6577]'}`}>
            <span className="text-[16px]">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultsScreen() {
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');

  const currentResults = [
    { code: 'BCA401', name: 'Software Engineering', internal: 24, external: 52, total: 76, max: 100, grade: 'B+', status: 'pass' as const },
    { code: 'BCA402', name: 'Database Management', internal: 22, external: 48, total: 70, max: 100, grade: 'B', status: 'pass' as const },
    { code: 'BCA403', name: 'Computer Networks', internal: 20, external: 44, total: 64, max: 100, grade: 'B', status: 'pass' as const },
    { code: 'BCA404', name: 'Operating Systems', internal: 25, external: 55, total: 80, max: 100, grade: 'A', status: 'pass' as const },
    { code: 'BCA405', name: 'Web Technologies', internal: 18, external: 38, total: 56, max: 100, grade: 'C', status: 'pass' as const },
  ];

  const semesters = [
    { sem: 'Sem IV', sgpa: 7.80, result: 'First Class' },
    { sem: 'Sem III', sgpa: 7.60, result: 'First Class' },
    { sem: 'Sem II', sgpa: 7.20, result: 'First Class' },
    { sem: 'Sem I', sgpa: 6.90, result: 'First Class' },
  ];

  const gradeColor = (g: string) => {
    if (g === 'A+' || g === 'A') return 'text-green-700 bg-green-100';
    if (g === 'B+' || g === 'B') return 'text-blue-700 bg-blue-100';
    if (g === 'C') return 'text-amber-700 bg-amber-100';
    return 'text-red-700 bg-red-100';
  };

  return (
    <div className="flex flex-col h-full bg-[#F7F8FA]">
      {/* Top bar */}
      <div className="bg-[#16264A] px-4 py-3 shrink-0">
        <p className="text-white font-semibold text-[14px]">परिणाम</p>
        <p className="text-white/60 text-[11px]">Priya Sharma — BCA Sem V</p>
      </div>

      {/* SGPA card */}
      <div className="mx-3 mt-3 bg-gradient-to-r from-[#16264A] to-[#1e3a6a] rounded-2xl p-4 flex items-center gap-4 shrink-0">
        <div className="text-center">
          <p className="text-white/60 text-[10px]">SGPA</p>
          <p className="text-white font-bold text-[28px] leading-tight">7.80</p>
          <p className="text-white/60 text-[10px]">Sem IV</p>
        </div>
        <div className="w-px h-12 bg-white/20" />
        <div className="text-center">
          <p className="text-white/60 text-[10px]">CGPA</p>
          <p className="text-white font-bold text-[28px] leading-tight">7.38</p>
          <p className="text-white/60 text-[10px]">Overall</p>
        </div>
        <div className="ml-auto text-right">
          <span className="text-[10px] font-bold text-[#E0952A] bg-[#E0952A]/20 px-2 py-1 rounded-full">First Class</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-[#D3D8E0] bg-white mx-0 mt-3 shrink-0">
        {(['current', 'history'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-[12px] font-semibold cursor-pointer border-b-2 -mb-px transition-colors ${
              activeTab === t ? 'border-[#16264A] text-[#16264A]' : 'border-transparent text-[#5A6577]'
            }`}>
            {t === 'current' ? 'Sem IV Marksheet' : 'Semester History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'current' && (
          <div className="px-3 py-3 space-y-2">
            {currentResults.map(r => (
              <div key={r.code} className="bg-white rounded-xl p-3 border border-[#D3D8E0]">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[#16264A] font-semibold text-[12px] leading-tight">{r.name}</p>
                    <p className="text-[#5A6577] text-[10px] mt-0.5 font-mono">{r.code}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${gradeColor(r.grade)}`}>{r.grade}</span>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#16264A]" style={{ width: `${(r.total / r.max) * 100}%` }} />
                  </div>
                  <span className="text-[11px] font-bold text-[#16264A] shrink-0">{r.total}/{r.max}</span>
                </div>
                <div className="flex gap-3 mt-1.5 text-[10px] text-[#5A6577]">
                  <span>Internal: <strong>{r.internal}</strong></span>
                  <span>External: <strong>{r.external}</strong></span>
                </div>
              </div>
            ))}
            <div className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-xl p-3 flex justify-center gap-8 mt-2">
              <div className="text-center">
                <p className="text-[10px] text-[#5A6577]">Total Marks</p>
                <p className="font-bold text-[#16264A] text-[16px]">346/500</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#5A6577]">Percentage</p>
                <p className="font-bold text-[#16264A] text-[16px]">69.2%</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#5A6577]">Result</p>
                <p className="font-bold text-green-700 text-[14px]">PASS</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="px-3 py-3 space-y-2">
            {semesters.map(s => (
              <div key={s.sem} className="bg-white rounded-xl p-4 border border-[#D3D8E0] flex items-center justify-between">
                <div>
                  <p className="font-semibold text-[#16264A] text-[13px]">{s.sem}</p>
                  <p className="text-[#5A6577] text-[11px]">{s.result}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-[#16264A] text-[20px]">{s.sgpa}</p>
                  <p className="text-[#5A6577] text-[10px]">SGPA</p>
                </div>
              </div>
            ))}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center mt-2">
              <p className="text-blue-800 text-[12px] font-semibold">Download Marksheet (PDF)</p>
              <p className="text-blue-600 text-[10px] mt-0.5">Digitally signed — valid without attestation</p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="h-14 bg-white border-t border-[#D3D8E0] flex items-stretch shrink-0">
        {[['🏠','होम'],['📋','समय'],['💳','फीस'],['📊','परिणाम'],['☰','अधिक']].map(([icon, label], i) => (
          <button key={i} className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[9px] cursor-pointer ${i === 3 ? 'text-[#16264A] font-bold' : 'text-[#5A6577]'}`}>
            <span className="text-[16px]">{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function OfflineScreen() {
  return (
    <div className="flex flex-col h-full bg-white items-center justify-center px-6 text-center">
      <div className="w-24 h-24 bg-[#EDEFF3] rounded-full flex items-center justify-center mb-5">
        <span className="text-5xl opacity-50">📶</span>
      </div>
      <h2 className="text-[#16264A] font-bold text-[18px]">इंटरनेट नहीं है</h2>
      <p className="text-[#5A6577] text-[13px] mt-2 leading-relaxed">नेटवर्क कनेक्शन नहीं मिल रहा। पिछली बार सहेजी गई जानकारी दिखाई जा रही है।</p>
      <div className="mt-6 w-full space-y-2">
        <div className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-xl p-3 flex items-center gap-3">
          <span className="text-xl">📋</span>
          <div className="text-left">
            <p className="text-[12px] font-semibold text-[#16264A]">समय-सारणी</p>
            <p className="text-[10px] text-[#5A6577]">उपलब्ध (ऑफलाइन)</p>
          </div>
          <span className="ml-auto text-green-500 text-[11px] font-medium">✓ cached</span>
        </div>
        <div className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-xl p-3 flex items-center gap-3">
          <span className="text-xl">📊</span>
          <div className="text-left">
            <p className="text-[12px] font-semibold text-[#16264A]">परिणाम</p>
            <p className="text-[10px] text-[#5A6577]">उपलब्ध (ऑफलाइन)</p>
          </div>
          <span className="ml-auto text-green-500 text-[11px] font-medium">✓ cached</span>
        </div>
        <div className="bg-[#F7F8FA] border border-[#D3D8E0] rounded-xl p-3 flex items-center gap-3">
          <span className="text-xl">💳</span>
          <div className="text-left">
            <p className="text-[12px] font-semibold text-[#16264A]">शुल्क भुगतान</p>
            <p className="text-[10px] text-[#5A6577]">इंटरनेट की आवश्यकता है</p>
          </div>
          <span className="ml-auto text-[#5A6577] text-[11px]">unavailable</span>
        </div>
      </div>
      <button className="mt-6 bg-[#16264A] text-white px-8 py-2.5 rounded-xl text-[13px] font-semibold cursor-pointer">पुनः प्रयास करें</button>
    </div>
  );
}

const SCREEN_COMPONENTS: Record<ScreenName, React.FC> = {
  splash: SplashScreen,
  onboarding: OnboardingScreen,
  dashboard: DashboardScreen,
  attendance: AttendanceScreen,
  timetable: TimetableScreen,
  fee: FeeScreen,
  results: ResultsScreen,
  notifications: NotificationsScreen,
  'qr-scan': QRScanScreen,
  'bus-track': BusTrackScreen,
  'digital-id': DigitalIDScreen,
  offline: OfflineScreen,
};

type PushMode = 'none' | 'banner' | 'lockscreen';

export default function MobileAppShowcase({ onNavigate }: Props) {
  const [selected, setSelected] = useState<ScreenName>('dashboard');
  const [portalFilter, setPortalFilter] = useState<'all' | 'student' | 'parent'>('all');
  const [pushMode, setPushMode] = useState<PushMode>('none');
  const [pushIndex, setPushIndex] = useState(0);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [lockNotifs, setLockNotifs] = useState([0, 1, 2]);

  const filtered = SCREENS.filter(s => portalFilter === 'all' || s.portal === portalFilter || s.portal === 'both');
  const SelectedComponent = SCREEN_COMPONENTS[selected];

  const triggerBanner = () => {
    setPushMode('banner');
    setBannerVisible(true);
    const nextIdx = (pushIndex + 1) % PUSH_NOTIFICATIONS.length;
    setPushIndex(nextIdx);
  };

  const dismissBanner = () => setBannerVisible(false);

  // Lock screen overlay
  const LockScreenOverlay = () => (
    <div className="absolute inset-0 z-20 flex flex-col" style={{ background: 'linear-gradient(180deg, #1A2744 0%, #0D1B35 100%)' }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-8 pb-2">
        <span className="text-white/80 text-[11px] font-semibold">09:24</span>
        <div className="flex items-center gap-1.5">
          <div className="flex gap-px items-end h-3">
            {[2,3,4,4].map((h,i) => <div key={i} className="w-px bg-white/60 rounded-sm" style={{height:`${h*3}px`}} />)}
          </div>
          <span className="text-white/60 text-[10px]">●●●</span>
          <span className="text-white/60 text-[10px]">█▌</span>
        </div>
      </div>

      {/* Time + date */}
      <div className="text-center py-4">
        <div className="text-white text-[52px] font-thin leading-none">09:24</div>
        <div className="text-white/60 text-[13px] mt-1">शुक्रवार, 20 सितम्बर 2024</div>
      </div>

      {/* Notifications */}
      <div className="flex-1 px-2 py-2 flex flex-col gap-2 overflow-y-auto">
        <div className="text-white/40 text-[10px] text-center mb-1 uppercase tracking-widest">सूचनाएं</div>
        {lockNotifs.map(idx => (
          <PushNotifCard
            key={PUSH_NOTIFICATIONS[idx].id}
            notif={PUSH_NOTIFICATIONS[idx]}
            onDismiss={() => setLockNotifs(prev => prev.filter(i => i !== idx))}
          />
        ))}
        {lockNotifs.length === 0 && (
          <div className="text-center text-white/30 text-[12px] py-4">कोई नई सूचना नहीं</div>
        )}
      </div>

      {/* Swipe hint */}
      <div className="text-center pb-4">
        <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mb-2" />
        <span className="text-white/30 text-[10px]">ऊपर स्वाइप करें — अनलॉक</span>
      </div>

      {/* Exit */}
      <button
        onClick={() => { setPushMode('none'); setLockNotifs([0,1,2]); }}
        className="absolute top-8 right-3 text-white/40 text-[11px] cursor-pointer"
      >
        ✕
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0D1B35] flex flex-col">
      <header className="h-14 bg-[#0A1428] border-b border-white/10 flex items-center px-6 gap-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-[#E0952A] rounded flex items-center justify-center text-white font-bold text-[10px]">{inst().shortCode}</div>
          <p className="text-white font-semibold text-[13px]">Mobile App — Native Screen Showcase</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {(['all', 'student', 'parent'] as const).map(f => (
            <button key={f} onClick={() => setPortalFilter(f)} className={`text-[11px] px-3 py-1.5 rounded cursor-pointer font-medium capitalize ${portalFilter === f ? 'bg-white/20 text-white' : 'text-white/50 hover:text-white'}`}>
              {f === 'all' ? 'All Screens' : f === 'student' ? 'Student' : 'Parent'}
            </button>
          ))}
          <button onClick={() => onNavigate('landing')} className="text-[11px] text-white/50 hover:text-white cursor-pointer ml-2">← Back</button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-56 bg-[#0A1428] border-r border-white/10 overflow-y-auto shrink-0 p-3">
          <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-2 mb-2">Screens</p>
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelected(s.id); setPushMode('none'); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium mb-1 cursor-pointer transition-colors ${
                selected === s.id && pushMode === 'none' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              {s.label}
              <span className={`ml-2 text-[9px] font-bold ${s.portal === 'student' ? 'text-blue-400' : s.portal === 'parent' ? 'text-amber-400' : 'text-white/40'}`}>
                {s.portal}
              </span>
            </button>
          ))}

          {/* Push notification section */}
          <div className="mt-4 pt-3 border-t border-white/10">
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-widest px-2 mb-2">Push Notifications</p>
            <button
              onClick={triggerBanner}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium mb-1 cursor-pointer transition-colors ${pushMode === 'banner' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Banner alert
              <span className="ml-2 text-[9px] font-bold text-orange-400">live</span>
            </button>
            <button
              onClick={() => { setPushMode('lockscreen'); setLockNotifs([0,1,2]); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-[12px] font-medium mb-1 cursor-pointer transition-colors ${pushMode === 'lockscreen' ? 'bg-white/15 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
            >
              Lock screen
              <span className="ml-2 text-[9px] font-bold text-purple-400">3 notifs</span>
            </button>
          </div>
        </aside>

        <main className="flex-1 flex flex-col items-center justify-center py-8 overflow-y-auto">
          <p className="text-white/30 text-[11px] mb-6 uppercase tracking-widest">
            {pushMode === 'lockscreen' ? '360 × 640 · Lock Screen' : pushMode === 'banner' ? `360 × 640 · Banner — ${PUSH_NOTIFICATIONS[pushIndex].type}` : `360 × 640 · Android — ${selected}`}
          </p>

          <PhoneFrame overlay={
            pushMode === 'lockscreen' ? <LockScreenOverlay /> :
            (pushMode === 'banner' && bannerVisible) ? (
              <BannerNotif
                notif={PUSH_NOTIFICATIONS[pushIndex]}
                onDismiss={dismissBanner}
              />
            ) : undefined
          }>
            <SelectedComponent />
          </PhoneFrame>

          {/* Push notification type descriptions */}
          {pushMode !== 'none' && (
            <div className="mt-5 max-w-xs text-center">
              <div className="text-[11px] text-white/40 leading-relaxed">
                {pushMode === 'banner' && 'Banner notifications appear for 4 seconds then auto-dismiss. Users can tap to open the relevant screen or dismiss.'}
                {pushMode === 'lockscreen' && 'Lock-screen notifications show grouped by recency. Parents see child\'s fee and attendance alerts even without unlocking.'}
              </div>
              <div className="flex gap-3 justify-center mt-3">
                {PUSH_NOTIFICATIONS.map((n, i) => (
                  <button
                    key={n.id}
                    onClick={() => { setPushIndex(i); if (pushMode === 'banner') { setBannerVisible(true); } }}
                    className="w-2 h-2 rounded-full transition-all cursor-pointer"
                    style={{ background: i === pushIndex ? n.color : '#334155' }}
                  />
                ))}
              </div>
            </div>
          )}

          {pushMode === 'none' && (
            <div className="mt-6 flex gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <p className="text-white/40 text-[10px]">Student</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <p className="text-white/40 text-[10px]">Parent</p>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-white/30" />
                <p className="text-white/40 text-[10px]">Both</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
