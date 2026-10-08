import WeekTimetable from '../../components/WeekTimetable';

/** The ward's dated week of classes, as the student sees it. */
export default function ParentTimetable({ lang }: { lang: 'hi' | 'en' }) {
  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4">
        <p className="text-white font-semibold text-base">{lang === 'hi' ? 'समय-सारणी' : 'Timetable'}</p>
        <p className="text-white/60 text-xs">{lang === 'hi' ? 'कक्षाएं, रद्द कक्षाएं और अतिरिक्त कक्षाएं' : 'Classes, cancellations and extra classes, week by week'}</p>
      </div>
      <div className="p-3"><WeekTimetable scope={{ scope: 'me' }} /></div>
    </div>
  );
}
