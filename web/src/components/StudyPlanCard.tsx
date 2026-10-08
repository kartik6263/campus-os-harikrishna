import { toast } from './ui';
import { openMaterial } from '../lib/records';
import { sourceLabel, useStudyPlan } from '../lib/ai';

/**
 * A personalised study plan, week by week, built by Gemini (or the built-in
 * rules) from the student's own learning plan. Every linked resource is one
 * already in that plan; a task with no resource has no link.
 *
 * `studentId` is for staff choosing a student; a student or parent omits it.
 */
export default function StudyPlanCard({ studentId, theme = 'dark', done, onToggle }: {
  studentId?: string | null;
  theme?: 'dark' | 'light';
  done?: Set<string>;
  onToggle?: (resourceId: string) => void;
}) {
  const plan = useStudyPlan(studentId);
  const d = plan.data;
  const dark = theme === 'dark';
  const c = dark
    ? { box: 'border-[#7C3AED]/50 bg-gradient-to-br from-[#1E1050]/60 to-[#0D1B35]', head: 'text-purple-200', text: 'text-gray-200', muted: 'text-gray-400', week: 'bg-[#0A1428] border-[#1E3A5F]', btn: 'bg-[#7C3AED] hover:bg-[#6D28D9] text-white', link: 'text-purple-300 hover:text-white' }
    : { box: 'border-[#D3D8E0] bg-white', head: 'text-[#16264A]', text: 'text-[#16264A]', muted: 'text-[#5A6577]', week: 'bg-[#F7F8FA] border-[#D3D8E0]', btn: 'bg-[#E0952A] hover:bg-[#C47E1E] text-white', link: 'text-[#E0952A] hover:underline' };
  const run = (refresh: boolean) => plan.mutate(refresh, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not build the plan') });
  const total = d ? d.data.weeks.reduce((t, w) => t + w.tasks.reduce((x, k) => x + k.minutes, 0), 0) : 0;

  return (
    <div className={`rounded-xl border p-4 ${c.box}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className={`text-[13px] font-semibold ${c.head}`}>✦ {studentId ? 'AI study plan' : 'My AI study plan'}</p>
        {d && <span className={`text-[10px] ${c.muted}`}>{sourceLabel(d)}</span>}
      </div>
      {!d && !plan.isPending && (
        <>
          <p className={`text-[12px] mb-3 ${c.muted}`}>A week-by-week plan for the subjects that need work, using the material {studentId ? 'in this plan' : 'your teachers and the college recommend'}.</p>
          <button onClick={() => run(false)} className={`w-full py-2 rounded-lg text-[13px] font-medium cursor-pointer ${c.btn}`}>Build the study plan</button>
        </>
      )}
      {plan.isPending && <p className={`text-[13px] py-2 ${c.muted}`}>Planning the weeks…</p>}
      {plan.isError && !plan.isPending && <p className="text-[12px] text-red-400 mt-2">{plan.error instanceof Error ? plan.error.message : 'Failed'}</p>}
      {d && !plan.isPending && (
        <div className="flex flex-col gap-3">
          {d.notice && <p className="text-[11px] text-amber-500">{d.notice}</p>}
          <p className={`text-[13px] ${c.text}`}>{d.data.message}</p>
          <p className={`text-[11px] ${c.muted}`}>{d.data.weeks.length} week{d.data.weeks.length > 1 ? 's' : ''} · about {Math.round(total / 60)} hours in all</p>
          {d.data.weeks.map((w) => (
            <div key={w.week} className={`border rounded-lg p-3 ${c.week}`}>
              <p className={`text-[12px] font-semibold mb-2 ${c.text}`}>Week {w.week} · {w.focus}</p>
              <div className="flex flex-col gap-2">
                {w.tasks.map((t, i) => {
                  const isDone = !!t.resource && !!done?.has(t.resource.id);
                  return (
                    <div key={i} className="flex items-start gap-2 text-[12px]">
                      <span className={`font-mono shrink-0 ${c.muted}`}>{t.subjectCode}</span>
                      <div className="flex-1 min-w-0">
                        <p className={`${c.text} ${isDone ? 'line-through opacity-60' : ''}`}>{t.task} <span className={c.muted}>· {t.minutes} min</span></p>
                        {t.resource && (
                          <div className="flex gap-3 mt-0.5">
                            {t.resource.url && <button onClick={() => void openMaterial(t.resource!.url, t.resource!.title)} className={`cursor-pointer ${c.link}`}>Open {t.resource.kind.toLowerCase()} ↗</button>}
                            {onToggle && <button onClick={() => onToggle(t.resource!.id)} className={`cursor-pointer ${c.link}`}>{isDone ? 'Undo' : 'Mark done'}</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {d.data.habits.length > 0 && (
            <ul className={`text-[12px] flex flex-col gap-1 ${c.muted}`}>{d.data.habits.map((h, i) => <li key={i}>• {h}</li>)}</ul>
          )}
          <button onClick={() => run(true)} className={`self-start text-[11px] cursor-pointer ${c.link}`}>↻ Plan again</button>
        </div>
      )}
    </div>
  );
}
