import WeekTimetable from '../../components/WeekTimetable';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface Props { onNavigate: (m: any) => void }

/**
 * The student's dated week: this term's classes with holidays,
 * cancellations, room changes, substitutes and extra classes as they
 * stand, week by week, with a PDF and a calendar file to keep.
 */
export default function TimetableModule(_props: Props) {
  return (
    <div className="bg-[#EDEFF3] min-h-screen p-3 md:p-4">
      <WeekTimetable scope={{ scope: 'me' }} />
      <p className="text-[11px] text-[#5A6577] mt-3 px-1">Changes made by your lecturers appear here at once and in your notifications. “Add to calendar” saves this week to your phone’s calendar.</p>
    </div>
  );
}
