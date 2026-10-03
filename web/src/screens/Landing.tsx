import { useState, useEffect } from 'react';
import { useLang } from '../lib/language';
import { HERO_TASKS } from '../lib/data';
import type { Screen } from '../lib/data';
import { PRODUCT_NAME, useInstitution } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void; }

export default function Landing({ onNavigate }: Props) {
  const { lang, toggle, t } = useLang();
  const inst = useInstitution();
  const instName = inst.displayName(lang);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [showCampus, setShowCampus] = useState(false);
  const [certInput, setCertInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const task = HERO_TASKS.find(t => t.id === selectedTask);

  function selectTask(id: string) {
    if (selectedTask === id) {
      setSelectedTask(null); setCollapsed(false); setShowCampus(false);
    } else {
      setSelectedTask(id); setCollapsed(false); setShowCampus(false);
      setTimeout(() => setCollapsed(true), 900);
      setTimeout(() => setShowCampus(true), 1400);
    }
  }

  return (
    <div className="min-h-screen bg-[#EDEFF3] flex flex-col">
      {/* Nav */}
      <header className="bg-white border-b border-[#D3D8E0] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[13px]">{inst.shortCode}</div>
            <div>
              <span className="font-semibold text-[#16264A] text-[14px]">{PRODUCT_NAME}</span>
              <span className="hidden sm:inline text-[#5A6577] text-[12px] ml-2">· {instName}</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-[13px] text-[#5A6577]">
            <a href="#modules" className="hover:text-[#16264A]">{t('Modules', 'मॉड्यूल')}</a>
            <a href="#compliance" className="hover:text-[#16264A]">{t('Compliance', 'अनुपालन')}</a>
            <a href="#verify" className="hover:text-[#16264A]">{t('Verify Certificate', 'प्रमाण-पत्र जाँचें')}</a>
            <button onClick={() => onNavigate('it-console')} className="hover:text-[#16264A] cursor-pointer">IT Cell</button>
            <button onClick={toggle} className="text-[12px] font-semibold text-[#5A6577] hover:text-[#16264A] cursor-pointer border border-[#D3D8E0] rounded-[4px] px-2 py-1">{lang === 'en' ? 'हिं' : 'EN'}</button>
          </nav>
          <div className="flex items-center gap-2">
            <button onClick={() => onNavigate('login')} className="hidden sm:block text-[13px] text-[#5A6577] hover:text-[#16264A] cursor-pointer px-3 py-1.5">{t('Sign In', 'साइन इन')}</button>
            <button onClick={() => onNavigate('login')} className="bg-[#E0952A] text-white text-[13px] font-medium px-4 py-2 rounded-[4px] hover:bg-[#C47E1E] cursor-pointer">{t('Get Started', 'शुरू करें')}</button>
            <button className="md:hidden text-[#16264A] cursor-pointer" onClick={() => setMenuOpen(o => !o)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-[#D3D8E0] bg-white px-4 py-3 flex flex-col gap-3 animate-slide-down">
            <a href="#modules" onClick={() => setMenuOpen(false)} className="text-[14px] text-[#16264A]">{t('Modules', 'मॉड्यूल')}</a>
            <a href="#compliance" onClick={() => setMenuOpen(false)} className="text-[14px] text-[#16264A]">{t('Compliance', 'अनुपालन')}</a>
            <a href="#verify" onClick={() => setMenuOpen(false)} className="text-[14px] text-[#16264A]">{t('Verify Certificate', 'प्रमाण-पत्र जाँचें')}</a>
            <button onClick={toggle} className="text-left text-[14px] text-[#5A6577] cursor-pointer">{lang === 'en' ? 'हिंदी में देखें' : 'View in English'}</button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="bg-white border-b border-[#D3D8E0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 md:py-16">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold text-[#E0952A] uppercase tracking-widest mb-4">{inst.city ? `${instName} · ${inst.city}` : instName}</p>
            <h1 className="text-display font-semibold text-[#16264A] mb-4">
              {t('One platform. No more running between offices.', 'एक प्लेटफ़ॉर्म। दफ़्तरों के चक्कर नहीं।')}
            </h1>
            <p className="text-[17px] text-[#5A6577] mb-8 max-w-2xl">
              {t('Pick a task and see what it takes today — then see how Resolion Campus OS does it in one step.', 'एक काम चुनें और देखें कि आज उसमें कितने दफ़्तर लगते हैं — फिर देखें Resolion Campus OS उसे एक कदम में कैसे करता है।')}
            </p>
          </div>

          {/* Task Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mb-8">
            {HERO_TASKS.map(task => (
              <button
                key={task.id}
                onClick={() => selectTask(task.id)}
                className={`text-left px-4 py-3.5 border rounded-[4px] transition-all cursor-pointer ${
                  selectedTask === task.id
                    ? 'border-[#E0952A] bg-[#FEF9EC] text-[#16264A]'
                    : 'border-[#D3D8E0] bg-white text-[#16264A] hover:border-[#E0952A] hover:bg-[#FEF9EC]'
                }`}
              >
                <span className="text-[14px] font-medium">{lang === 'hi' ? task.labelHi : task.label}</span>
              </button>
            ))}
          </div>

          {/* Queue Visualization */}
          {task && (
            <div className="max-w-2xl animate-fade-in">
              {/* Old Way */}
              <div className={`transition-all duration-500 overflow-hidden ${collapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'}`}>
                <div className="bg-[#EDEFF3] border border-[#D3D8E0] rounded-t-[2px] px-4 py-3">
                  <p className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">
                    {t('The queue today', 'आज का रास्ता')} · <span className="text-[#A8242C]">{task.totalDays} {t('working days', 'कार्यदिवस')}</span>
                  </p>
                </div>
                {task.offices.map((office, i) => (
                  <div key={i} className="bg-white border-x border-b border-[#D3D8E0] px-4 py-3 flex items-start gap-4">
                    <div className="flex flex-col items-center pt-1">
                      <div className="w-5 h-5 rounded-full bg-[#EDEFF3] border border-[#D3D8E0] flex items-center justify-center text-[10px] font-semibold text-[#5A6577]">{i + 1}</div>
                      {i < task.offices.length - 1 && <div className="w-px h-6 bg-[#D3D8E0] mt-1" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#16264A]">{lang === 'hi' ? office.nameHi : office.name}</p>
                      <p className="text-[12px] text-[#5A6577]">{office.action}</p>
                    </div>
                    <span className="text-[11px] text-[#5A6577] shrink-0">{office.days}d</span>
                  </div>
                ))}
              </div>

              {/* Resolion Campus OS Way */}
              {showCampus && (
                <div className="animate-fade-in">
                  <div className="bg-[#16264A] border border-[#16264A] rounded-[2px] px-4 py-4 flex items-center gap-4">
                    <div className="w-8 h-8 bg-[#E0952A] rounded-[4px] flex items-center justify-center shrink-0">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-0.5">
                        {t('Resolion Campus OS · ', 'Resolion Campus OS · ')}<span className="text-[#E0952A]">{task.campusDays === 0 ? t('Instant', 'तुरंत') : `${task.campusDays} ${t('days', 'दिन')}`}</span>
                      </p>
                      <p className="text-[14px] text-white font-medium">
                        {lang === 'hi' ? task.campusActionHi : task.campusAction}
                      </p>
                    </div>
                    <button onClick={() => onNavigate('login')} className="shrink-0 bg-[#E0952A] text-white text-[12px] font-medium px-3 py-2 rounded-[4px] hover:bg-[#C47E1E] cursor-pointer">
                      {t('Start →', 'शुरू करें →')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Scale Line */}
      <section className="bg-[#16264A] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-white">
            {[
              { n: '520', label: t('Affiliated Colleges', 'संबद्ध महाविद्यालय') },
              { n: '95+', label: t('Teaching Departments', 'शिक्षण विभाग') },
              { n: '5,00,000', label: t('Students', 'छात्र') },
              { n: '1', label: t('Platform', 'एकीकृत प्लेटफ़ॉर्म') },
            ].map(s => (
              <div key={s.label} className="border-l-2 border-[#E0952A] pl-4">
                <p className="text-h1 font-bold">{s.n}</p>
                <p className="text-[13px] text-white/60">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Modules */}
      <section id="modules" className="py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-h1 font-semibold text-[#16264A] mb-2">{t('Built for everyone on campus', 'परिसर के हर किसी के लिए')}</h2>
          <p className="text-[15px] text-[#5A6577] mb-8 max-w-2xl">{t('Each user type sees only what they need. Data isolation is enforced at the row level.', 'प्रत्येक उपयोगकर्ता केवल वही देखता है जो उन्हें चाहिए। डेटा अलगाव पंक्ति स्तर पर लागू होता है।')}</p>

          {[
            {
              role: t('Students & Parents', 'छात्र एवं अभिभावक'),
              action: () => onNavigate('login-student'),
              modules: [
                { name: t('Results & Marksheets', 'परिणाम एवं अंकसूची'), desc: t('Semester results, CGPA, DigiLocker push', 'सेमेस्टर परिणाम, CGPA, DigiLocker') },
                { name: t('Fee Payment', 'शुल्क भुगतान'), desc: t('UPI, net banking, auto-receipt', 'UPI, नेट बैंकिंग, स्वतः रसीद') },
                { name: t('Certificates', 'प्रमाण-पत्र'), desc: t('Migration, character, degree download', 'माइग्रेशन, चरित्र, डिग्री डाउनलोड') },
                { name: t('APAAR ID', 'APAAR ID'), desc: t('Academic Bank of Credits linkage', 'अकादमिक क्रेडिट बैंक लिंकेज') },
              ],
            },
            {
              role: t('Faculty & Staff', 'शिक्षक एवं कर्मचारी'),
              action: () => onNavigate('login-staff'),
              modules: [
                { name: t('Attendance & Marks', 'उपस्थिति एवं अंक'), desc: t('Internal marks, attendance entry', 'आंतरिक अंक, उपस्थिति प्रविष्टि') },
                { name: t('Leave Management', 'अवकाश प्रबंधन'), desc: t('Apply, approve, track leave', 'अवकाश आवेदन, अनुमोदन, ट्रैकिंग') },
                { name: t('Payroll', 'वेतन पत्रक'), desc: t('Salary slips, GPF, income tax', 'वेतन पर्ची, GPF, आयकर') },
                { name: t('NAAC / NIRF Reports', 'NAAC / NIRF रिपोर्ट'), desc: t('Generated from live data', 'सजीव डेटा से उत्पन्न') },
              ],
            },
            {
              role: t('College Offices', 'महाविद्यालय कार्यालय'),
              action: () => onNavigate('login-staff'),
              modules: [
                { name: t('Student Registry', 'छात्र रजिस्ट्री'), desc: t('Enrolment, updates, verification', 'नामांकन, अद्यतन, सत्यापन') },
                { name: t('Admission', 'प्रवेश'), desc: t('Counselling, seat matrix, allotment', 'परामर्श, सीट मैट्रिक्स, आवंटन') },
                { name: t('Exam Forms', 'परीक्षा फ़ॉर्म'), desc: t('Online form fill, fee collection', 'ऑनलाइन फ़ॉर्म, शुल्क संग्रह') },
                { name: t('AISHE Reporting', 'AISHE रिपोर्टिंग'), desc: t('Auto-populated from registry', 'रजिस्ट्री से स्वतः भरी') },
              ],
            },
            {
              role: t('University Administration', 'विश्वविद्यालय प्रशासन'),
              action: () => onNavigate('login-admin'),
              modules: [
                { name: t('College Management', 'महाविद्यालय प्रबंधन'), desc: t('Affiliation, inspection, NOC', 'संबद्धता, निरीक्षण, NOC') },
                { name: t('Exam Controller', 'परीक्षा नियंत्रक'), desc: t('Schedule, results, certificates', 'कार्यक्रम, परिणाम, प्रमाण-पत्र') },
                { name: t('Finance Office', 'वित्त कार्यालय'), desc: t('Budget, audit, reconciliation', 'बजट, ऑडिट, मिलान') },
                { name: t('Access Control', 'पहुँच नियंत्रण'), desc: t('Roles, scopes, audit log', 'भूमिकाएं, स्कोप, ऑडिट लॉग') },
              ],
            },
          ].map(section => (
            <div key={section.role} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-h3 font-semibold text-[#16264A]">{section.role}</h3>
                <button onClick={section.action} className="text-[12px] text-[#E0952A] hover:underline cursor-pointer">{t('Sign in →', 'साइन इन →')}</button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {section.modules.map(m => (
                  <div key={m.name} className="bg-white border border-[#D3D8E0] rounded-[2px] p-4">
                    <p className="text-[14px] font-semibold text-[#16264A] mb-1">{m.name}</p>
                    <p className="text-[12px] text-[#5A6577]">{m.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Intelligence Layer pitch */}
      <section className="bg-[#0D1B35] py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10">
            <div>
              <span className="text-[11px] font-bold text-[#A78BFA] uppercase tracking-widest">AI-Powered Intelligence</span>
              <h2 className="text-h1 font-semibold text-white mt-2 mb-3">{t('The system that thinks alongside you.', 'एक प्रणाली जो आपके साथ सोचती है।')}</h2>
              <p className="text-[15px] text-white/60 max-w-xl">
                {t('Grounded in your own data — not generic AI. A student gets their actual attendance number, not a policy quote. A mentor sees which students to call today, not a report to print.', 'आपके अपने डेटा में आधारित — सामान्य AI नहीं। छात्र को उनकी वास्तविक उपस्थिति मिलती है, नीति उद्धरण नहीं। मेंटर देखता है कि आज किसे कॉल करना है।')}
              </p>
            </div>
            <button
              onClick={() => onNavigate('intelligence')}
              className="shrink-0 bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-[13px] font-semibold px-5 py-2.5 rounded-[4px] cursor-pointer transition-colors"
            >
              {t('Explore Intelligence Layer →', 'इंटेलिजेंस लेयर देखें →')}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              {
                id: 'chat' as const,
                icon: '💬',
                tag: 'LIVE',
                tagColor: 'bg-green-500',
                title: t('AI Chat Assistant', 'AI चैट सहायक'),
                desc: t('Ask in Hindi or English. Get your actual numbers — attendance, fee due, result — not a generic answer.', 'हिंदी या English में पूछें। अपने वास्तविक नंबर पाएं — उपस्थिति, शुल्क, परिणाम।'),
              },
              {
                id: 'voice' as const,
                icon: '🎤',
                tag: 'BETA',
                tagColor: 'bg-amber-500',
                title: t('Voice Assistant', 'वॉइस सहायक'),
                desc: t('Speak in Hindi. Works on slow networks. Built for parents and first-time app users.', 'हिंदी में बोलें। धीमे नेटवर्क पर काम करता है। अभिभावकों के लिए।'),
              },
              {
                id: 'dropout' as const,
                icon: '📉',
                tag: 'AI',
                tagColor: 'bg-purple-600',
                title: t('Dropout Risk Board', 'ड्रॉपआउट जोखिम बोर्ड'),
                desc: t('Students ranked by dropout risk — attendance, fees, results, hostel exit. A signal, not a verdict.', 'ड्रॉपआउट जोखिम से छात्र रैंकिंग। संकेत है, निर्णय नहीं।'),
              },
              {
                id: 'performance' as const,
                icon: '📈',
                tag: 'AI',
                tagColor: 'bg-purple-600',
                title: t('Predictive Performance', 'प्रदर्शन पूर्वानुमान'),
                desc: t('Per-student projected result band + subject weak areas + class cohort view for faculty.', 'प्रति-छात्र परिणाम बैंड पूर्वानुमान + कमजोर विषय + कक्षा दृश्य।'),
              },
              {
                id: 'learning' as const,
                icon: '📚',
                tag: 'AI',
                tagColor: 'bg-purple-600',
                title: t('Learning Recommendations', 'सीखने की सिफ़ारिशें'),
                desc: t('Recommended resources per weak topic, drawn from the approved syllabus module.', 'अनुमोदित पाठ्यक्रम से प्रति कमजोर विषय संसाधन सुझाव।'),
              },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate('intelligence')}
                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#7C3AED]/50 rounded-[4px] p-5 text-left transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[20px]">{item.icon}</span>
                  <span className={`text-[9px] font-bold text-white px-2 py-0.5 rounded ${item.tagColor}`}>{item.tag}</span>
                </div>
                <p className="text-[14px] font-semibold text-white mb-1.5 group-hover:text-[#A78BFA] transition-colors">{item.title}</p>
                <p className="text-[12px] text-white/50 leading-relaxed">{item.desc}</p>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Parent Portal + Mobile App pitch */}
      <section className="bg-white border-y border-[#D3D8E0] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

            {/* Parent Portal */}
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-[11px] font-bold text-[#E0952A] uppercase tracking-widest">{t('For Parents', 'अभिभावकों के लिए')}</span>
                <h2 className="text-h2 font-semibold text-[#16264A] mt-2 mb-2">{t('Know what is happening — in Hindi, on your phone.', 'जानें क्या हो रहा है — हिंदी में, फ़ोन पर।')}</h2>
                <p className="text-[14px] text-[#5A6577] leading-relaxed">
                  {t('Attendance, fees, results, leave requests, and a message channel to the college — all in one screen. Designed for parents who may be opening an app for the first time.', 'उपस्थिति, शुल्क, परिणाम, अवकाश अनुरोध और महाविद्यालय से संदेश — सब एक स्क्रीन पर। पहली बार ऐप खोलने वाले अभिभावकों के लिए।')}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: '📋', label: t('Attendance alerts', 'उपस्थिति चेतावनी') },
                  { icon: '₹',  label: t('Fee payment', 'शुल्क भुगतान') },
                  { icon: '📊', label: t('Semester results', 'सेमेस्टर परिणाम') },
                  { icon: '🚪', label: t('Gate pass approval', 'गेट पास स्वीकृति') },
                  { icon: '📢', label: t('College notices', 'महाविद्यालय सूचनाएं') },
                  { icon: '💬', label: t('Teacher messaging', 'अध्यापक संदेश') },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-2 bg-[#F7F8FA] rounded-[4px] px-3 py-2">
                    <span className="text-[14px]">{f.icon}</span>
                    <span className="text-[12px] text-[#5A6577]">{f.label}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => onNavigate('login-parent')}
                  className="bg-[#16264A] text-white text-[13px] font-semibold px-5 py-2.5 rounded-[4px] hover:bg-[#1E3A6A] cursor-pointer transition-colors"
                >
                  {t('Parent Login →', 'अभिभावक लॉगिन →')}
                </button>
                <button
                  onClick={() => onNavigate('parent-portal')}
                  className="border border-[#D3D8E0] text-[#5A6577] text-[13px] px-5 py-2.5 rounded-[4px] hover:border-[#16264A] hover:text-[#16264A] cursor-pointer transition-colors"
                >
                  {t('Preview demo →', 'डेमो देखें →')}
                </button>
              </div>
            </div>

            {/* Mobile App */}
            <div className="flex flex-col gap-4">
              <div>
                <span className="text-[11px] font-bold text-[#0E7A5F] uppercase tracking-widest">{t('Mobile App', 'मोबाइल ऐप')}</span>
                <h2 className="text-h2 font-semibold text-[#16264A] mt-2 mb-2">{t('Native screens for student and parent.', 'छात्र और अभिभावक के लिए नेटिव स्क्रीन।')}</h2>
                <p className="text-[14px] text-[#5A6577] leading-relaxed">
                  {t('QR attendance scan, bus tracking, digital ID, offline mode, and push notifications — all in a pocket-sized experience. View the full screen-by-screen showcase.', 'QR उपस्थिति स्कैन, बस ट्रैकिंग, डिजिटल ID, ऑफ़लाइन मोड, और पुश सूचनाएं — सब पॉकेट साइज़ अनुभव में।')}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { icon: '📱', label: 'Splash & Onboarding' },
                  { icon: '🏠', label: 'Dashboard' },
                  { icon: '📋', label: 'Attendance' },
                  { icon: '📅', label: 'Timetable' },
                  { icon: '💳', label: 'Fee Payment' },
                  { icon: '📊', label: 'Results' },
                  { icon: '🔲', label: 'QR Scan' },
                  { icon: '🚌', label: 'Bus Tracking' },
                  { icon: '🪪', label: 'Digital ID' },
                ].map(f => (
                  <div key={f.label} className="flex items-center gap-1.5 bg-[#F7F8FA] rounded-[4px] px-2 py-2">
                    <span className="text-[13px]">{f.icon}</span>
                    <span className="text-[11px] text-[#5A6577] leading-tight">{f.label}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => onNavigate('mobile-app')}
                className="self-start bg-[#0E7A5F] text-white text-[13px] font-semibold px-5 py-2.5 rounded-[4px] hover:bg-[#0A5C47] cursor-pointer transition-colors"
              >
                {t('View all 12 screens →', 'सभी 12 स्क्रीन देखें →')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Affiliation Diagram */}
      <section className="bg-white border-y border-[#D3D8E0] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-h2 font-semibold text-[#16264A] mb-2">{t('How affiliation works', 'संबद्धता कैसे काम करती है')}</h2>
          <p className="text-[14px] text-[#5A6577] mb-8">{t('Data isolation is enforced at every level. A college sees only its own students.', 'प्रत्येक स्तर पर डेटा अलगाव लागू होता है। एक महाविद्यालय केवल अपने छात्रों को देखता है।')}</p>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            {[
              { label: instName, sub: t('All data, all colleges', 'सभी डेटा, सभी महाविद्यालय'), color: '#16264A' },
              { label: t('Affiliated College', 'संबद्ध महाविद्यालय'), sub: t('Own students & staff only', 'केवल अपने छात्र एवं कर्मचारी'), color: '#E0952A' },
              { label: t('Department', 'विभाग'), sub: t('Own courses & marks only', 'केवल अपने पाठ्यक्रम एवं अंक'), color: '#0E7A5F' },
            ].map((node, i) => (
              <div key={i} className="flex items-center gap-3">
                {i > 0 && <div className="hidden md:block text-[#D3D8E0] text-[20px]">→</div>}
                <div className="border-2 rounded-[4px] px-5 py-4 min-w-[160px]" style={{ borderColor: node.color }}>
                  <p className="text-[14px] font-semibold" style={{ color: node.color }}>{node.label}</p>
                  <p className="text-[12px] text-[#5A6577] mt-1">{node.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section id="compliance" className="py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <h2 className="text-h2 font-semibold text-[#16264A] mb-6">{t('Compliance, built in', 'अनुपालन, अंतर्निहित')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            {[
              { badge: 'NEP 2020', title: t('Academic Bank of Credits', 'अकादमिक क्रेडिट बैंक'), desc: t('APAAR ID issue, credit transfer, DigiLocker degree push.', 'APAAR ID जारी, क्रेडिट ट्रांसफर, DigiLocker डिग्री पुश।') },
              { badge: 'NAAC', title: t('SSR from Live Data', 'सजीव डेटा से SSR'), desc: t('NAAC Self-Study Report generated automatically from the registry.', 'NAAC स्व-अध्ययन रिपोर्ट रजिस्ट्री से स्वचालित रूप से उत्पन्न।') },
              { badge: 'NIRF / AISHE', title: t('Ranking Inputs', 'रैंकिंग डेटा'), desc: t('NIRF and AISHE reports populated from live enrolment and outcome data.', 'NIRF और AISHE रिपोर्ट सजीव नामांकन और परिणाम डेटा से भरी।') },
            ].map(item => (
              <div key={item.badge} className="bg-white border border-[#D3D8E0] rounded-[2px] p-5">
                <span className="inline-block bg-[#EDEFF3] text-[#16264A] text-[11px] font-semibold px-2.5 py-1 rounded-[2px] mb-3">{item.badge}</span>
                <h3 className="text-[15px] font-semibold text-[#16264A] mb-2">{item.title}</h3>
                <p className="text-[13px] text-[#5A6577]">{item.desc}</p>
              </div>
            ))}
          </div>
          <div className="bg-white border border-[#D3D8E0] rounded-[2px] p-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <p className="text-[13px] font-semibold text-[#16264A] mb-1">{t('Row-level Isolation', 'पंक्ति-स्तर अलगाव')}</p>
              <p className="text-[12px] text-[#5A6577]">{t('Every query is scoped to college + academic year. No cross-tenant data leaks.', 'प्रत्येक क्वेरी महाविद्यालय + शैक्षणिक वर्ष तक सीमित। कोई क्रॉस-टेनेंट डेटा लीक नहीं।')}</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#16264A] mb-1">{t('Hash-chained Audit Trail', 'हैश-चेन ऑडिट ट्रेल')}</p>
              <p className="text-[12px] text-[#5A6577]">{t('Every record change is logged, signed, and chained. Tampering is detectable.', 'प्रत्येक रिकॉर्ड परिवर्तन लॉग, हस्ताक्षरित और चेन किया जाता है।')}</p>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#16264A] mb-1">{t('Role + Scope Permissions', 'भूमिका + स्कोप अनुमतियां')}</p>
              <p className="text-[12px] text-[#5A6577]">{t('Permissions are the intersection of role and organisational scope.', 'अनुमतियां भूमिका और संगठनात्मक स्कोप का प्रतिच्छेदन हैं।')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Certificate Verification CTA */}
      <section id="verify" className="bg-[#16264A] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="max-w-xl">
            <h2 className="text-h2 font-semibold text-white mb-2">{t('Verify a certificate', 'प्रमाण-पत्र सत्यापित करें')}</h2>
            <p className="text-[14px] text-white/60 mb-6">{t(`Employers, institutions, and verifiers — check any ${inst.name} certificate instantly. No login required.`, `नियोक्ता, संस्थान, और सत्यापनकर्ता — किसी भी ${instName} प्रमाण-पत्र को तुरंत जाँचें। लॉगिन आवश्यक नहीं।`)}</p>
            <div className="flex gap-2">
              <input
                value={certInput}
                onChange={e => setCertInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && certInput && onNavigate('cert-verify')}
                placeholder={t('Enter certificate number or scan QR', 'प्रमाण-पत्र संख्या दर्ज करें या QR स्कैन करें')}
                className="flex-1 px-4 py-2.5 rounded-[4px] text-[14px] text-[#16264A] bg-white outline-none placeholder-[#5A6577]"
              />
              <button onClick={() => onNavigate('cert-verify')} className="bg-[#E0952A] text-white px-4 py-2.5 rounded-[4px] text-[14px] font-medium hover:bg-[#C47E1E] cursor-pointer whitespace-nowrap">
                {t('Verify →', 'जाँचें →')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-[#D3D8E0] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-6 text-[13px]">
            <div>
              <p className="font-semibold text-[#16264A] mb-3">{instName}</p>
              {(inst.address || inst.city) && (
                <p className="text-[#5A6577]">{[inst.address, inst.city, inst.state].filter(Boolean).join(', ')}{inst.pincode ? ` — ${inst.pincode}` : ''}</p>
              )}
              {inst.phone && <p className="text-[#5A6577]">{inst.phone}</p>}
              {inst.email && <p className="text-[#5A6577]">{inst.email}</p>}
            </div>
            <div>
              <p className="font-semibold text-[#16264A] mb-3">{t('Quick Links', 'त्वरित लिंक')}</p>
              <div className="flex flex-col gap-1.5 text-[#5A6577]">
                <button onClick={() => onNavigate('login-student')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Student Portal', 'छात्र पोर्टल')}</button>
                <button onClick={() => onNavigate('cert-verify')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Certificate Verification', 'प्रमाण-पत्र सत्यापन')}</button>
                <a href="#" className="hover:text-[#16264A]">{t('RTI', 'आरटीआई')}</a>
                <a href="#" className="hover:text-[#16264A]">{t('Grievance', 'शिकायत')}</a>
              </div>
            </div>
            <div>
              <p className="font-semibold text-[#16264A] mb-3">{t('Portals', 'पोर्टल')}</p>
              <div className="flex flex-col gap-1.5 text-[#5A6577]">
                <button onClick={() => onNavigate('login-staff')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Staff Portal', 'स्टाफ पोर्टल')}</button>
                <button onClick={() => onNavigate('login-admin')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Admin Console', 'एडमिन कंसोल')}</button>
                <button onClick={() => onNavigate('login-parent')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Parent Portal', 'अभिभावक पोर्टल')}</button>
                <button onClick={() => onNavigate('intelligence')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Intelligence Layer', 'इंटेलिजेंस लेयर')}</button>
                <button onClick={() => onNavigate('mobile-app')} className="text-left hover:text-[#16264A] cursor-pointer">{t('Mobile App', 'मोबाइल ऐप')}</button>
              </div>
            </div>
            <div>
              <p className="font-semibold text-[#16264A] mb-3">{PRODUCT_NAME}</p>
              <div className="flex flex-col gap-1.5 text-[#5A6577]">
                {inst.website && <a href={/^https?:/.test(inst.website) ? inst.website : `https://${inst.website}`} target="_blank" rel="noreferrer" className="hover:text-[#16264A]">{t('Institution website', 'संस्थान वेबसाइट')}</a>}
                <a href="#" className="hover:text-[#16264A]">{t('Privacy Policy', 'गोपनीयता नीति')}</a>
                <a href="#" className="hover:text-[#16264A]">{t('Accessibility Statement', 'सुलभता वक्तव्य')}</a>
              </div>
            </div>
          </div>
          <div className="border-t border-[#D3D8E0] pt-4 flex flex-wrap items-center justify-between gap-3 text-[11px] text-[#5A6577]">
            <span>© {new Date().getFullYear()} {inst.place} · Powered by {PRODUCT_NAME}</span>
            <span>{t(`Content owned by ${inst.name}`, `सामग्री ${instName} की है`)}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
