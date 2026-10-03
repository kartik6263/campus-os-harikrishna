import { Spinner } from '../../components/ui';
import { useAnnouncements, useMarkAllNotificationsRead, useNotifications } from '../../lib/queries';

interface Props { lang: 'hi' | 'en' }

const t = (lang: 'hi' | 'en', en: string, hi: string) => (lang === 'hi' ? hi : en);

/** The ward's own notifications, then the institution's notices. */
export default function ParentAnnouncements({ lang }: Props) {
  const notifications = useNotifications();
  const announcements = useAnnouncements();
  const markAll = useMarkAllNotificationsRead();
  const items = notifications.data?.items ?? [];

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-8">
      <div className="bg-[#16264A] px-4 py-4 flex items-center justify-between">
        <p className="text-white font-semibold text-base">{t(lang, 'Notices & updates', 'सूचनाएं')}</p>
        {(notifications.data?.unreadCount ?? 0) > 0 && (
          <button onClick={() => markAll.mutate()} className="text-[11px] text-white/70 hover:text-white cursor-pointer">{t(lang, 'Mark all read', 'सभी पढ़ा')}</button>
        )}
      </div>

      {(notifications.isLoading || announcements.isLoading) && <div className="flex justify-center py-10"><Spinner /></div>}

      {items.length > 0 && (
        <div className="mx-4 mt-4">
          <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'About your ward', 'आपके बच्चे के बारे में')}</p>
          <div className="flex flex-col gap-2">
            {items.map(n => (
              <div key={n.id} className={`rounded-xl px-4 py-3 shadow-sm ${n.readAt ? 'bg-white' : 'bg-[#FEF9EC] border border-[#E0952A]/40'} ${n.urgent ? 'border-l-4 border-l-red-500' : ''}`}>
                <p className="text-sm font-semibold text-[#16264A]">{lang === 'hi' && n.titleHi ? n.titleHi : n.title}</p>
                <p className="text-xs text-gray-600 mt-0.5">{lang === 'hi' && n.bodyHi ? n.bodyHi : n.body}</p>
                <p className="text-[10px] text-gray-400 mt-1">{new Date(n.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mx-4 mt-5">
        <p className="text-[#16264A] font-semibold text-sm mb-2">{t(lang, 'Institution notices', 'संस्थान की सूचनाएं')}</p>
        <div className="flex flex-col gap-2">
          {(announcements.data ?? []).map(a => (
            <div key={a.id} className={`bg-white rounded-xl px-4 py-3 shadow-sm ${a.urgent ? 'border-l-4 border-l-[#E0952A]' : ''}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{a.scope.toLowerCase()}</span>
                {a.urgent && <span className="text-[10px] font-bold text-[#E0952A]">{t(lang, 'IMPORTANT', 'महत्वपूर्ण')}</span>}
              </div>
              <p className="text-sm font-semibold text-[#16264A]">{a.title}</p>
              <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{a.body}</p>
              <p className="text-[10px] text-gray-400 mt-1">{new Date(a.publishedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}</p>
            </div>
          ))}
          {!announcements.isLoading && (announcements.data ?? []).length === 0 && <p className="text-xs text-gray-500">{t(lang, 'No notices.', 'कोई सूचना नहीं।')}</p>}
        </div>
      </div>
    </div>
  );
}
