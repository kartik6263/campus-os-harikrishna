import { useState } from 'react';
import { Button, EmptyState, InlineAlert, Spinner, toast } from '../../components/ui';
import { useCollection } from '../../lib/records';
import {
  FINE_PER_DAY, MAX_LOANS, MAX_RENEWALS, SAMPLE_BOOKS, SAMPLE_ERESOURCES, SAMPLE_LOANS,
  activeLoans, availableCopies, fineDue, fmtIso, overdueDays,
  type EResource, type LibBook, type LibRequest, type Loan,
} from '../../lib/library';

interface Props { onNavigate: (m: any) => void }

const TABS = ['Issued Books', 'Search Catalogue', 'E-Resources', 'My Account'] as const;
type Tab = typeof TABS[number];

const REQUEST_TONE: Record<string, string> = {
  pending: 'bg-[#FEF3DC] text-[#9A5B00]',
  approved: 'bg-[#E7F4EF] text-[#0E7A5F]',
  ready: 'bg-[#E7F4EF] text-[#0E7A5F]',
  fulfilled: 'bg-[#EDEFF3] text-[#5A6577]',
  declined: 'bg-[#FDECEC] text-[#A8242C]',
  cancelled: 'bg-[#EDEFF3] text-[#5A6577]',
};

/**
 * The student's library: what they have out, the catalogue, e-resources and
 * their account. Loans are the desk's records and read-only here; renewals
 * and reservations go to the desk as requests.
 */
export default function Library(_props: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('Issued Books');
  const loans = useCollection<Loan>('desk:library-loans', SAMPLE_LOANS);
  const books = useCollection<LibBook>('campus:library-books', SAMPLE_BOOKS);
  const requests = useCollection<LibRequest>('student:library-requests', []);
  const eres = useCollection<EResource>('campus:library-eresources', SAMPLE_ERESOURCES);

  const out = activeLoans(loans.items);
  const loading = loans.isLoading || books.isLoading;

  function ask(kind: LibRequest['kind'], book: { bookId: string; title: string }, loanId?: string) {
    const open = requests.items.find(r => r.kind === kind && r.bookId === book.bookId && ['pending', 'approved', 'ready'].includes(r.status));
    if (open) { toast.info(kind === 'renew' ? 'A renewal request for this book is already with the desk' : 'You already have a reservation for this book'); return; }
    requests.add({ id: `LR-${Date.now()}`, kind, bookId: book.bookId, title: book.title, loanId, status: 'pending', createdAt: new Date().toISOString() });
    toast.success(kind === 'renew' ? 'Renewal requested — the library desk will confirm the new due date' : 'Reservation placed — you will be told when a copy is ready');
  }

  return (
    <div className="bg-[#EDEFF3] min-h-screen pb-10">
      <div className="bg-white border-b border-[#D3D8E0] px-4 py-4">
        <h1 className="text-[18px] font-bold text-[#16264A]">Library</h1>
        <p className="text-[13px] text-[#5A6577] mt-0.5">Books, catalogue, e-resources and your account</p>
      </div>

      <div className="bg-white border-b border-[#D3D8E0] overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ minHeight: 44 }}
              className={`px-4 py-3 text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer relative ${activeTab === tab ? 'text-[#E0952A] border-b-2 border-[#E0952A] -mb-px' : 'text-[#5A6577] hover:text-[#16264A]'}`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
        <div className="mt-3">
          {activeTab === 'Issued Books' && (
            <>
              <SectionLabel left="Currently Issued" right={`${out.length} of ${MAX_LOANS} books`} />
              {out.length === 0 ? (
                <div className="px-4"><EmptyState title="No books issued to you" description="Books you borrow at the library desk appear here with their due dates." /></div>
              ) : (
                <div className="bg-white border-t border-b border-[#D3D8E0]">
                  {out.map((l, idx) => {
                    const late = overdueDays(l);
                    const pendingRenew = requests.items.some(r => r.kind === 'renew' && r.loanId === l.id && r.status === 'pending');
                    return (
                      <div key={l.id} className={`px-4 py-4 ${idx < out.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-bold text-[#16264A] leading-snug">{l.title}</p>
                            <p className="text-[12px] text-[#5A6577]">{l.author}</p>
                          </div>
                          {late > 0 && <span className="shrink-0 text-[11px] font-semibold text-[#A8242C] bg-[#FEE2E2] px-2 py-0.5 rounded-[2px]">Overdue {late}d</span>}
                        </div>
                        <div className="flex items-center gap-4 text-[12px] text-[#5A6577] my-2">
                          <span>Issued: <strong className="text-[#16264A]">{fmtIso(l.issuedOn)}</strong></span>
                          <span>Due: <strong style={{ color: late ? '#A8242C' : '#16264A' }}>{fmtIso(l.dueDate)}</strong></span>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-3 text-[12px]">
                            {late > 0 && <span className="font-semibold text-[#A8242C]">Fine so far: ₹{fineDue(l)}</span>}
                            <span className="text-[#5A6577]">Renewed {l.renewals} of {MAX_RENEWALS}</span>
                          </div>
                          {pendingRenew ? <span className="text-[12px] text-[#9A5B00]">Renewal requested</span>
                            : <Button variant="primary" size="sm" disabled={l.renewals >= MAX_RENEWALS || late > 0} onClick={() => ask('renew', l, l.id)}>Request renewal</Button>}
                        </div>
                        {late > 0 && <p className="text-[11px] text-[#5A6577] mt-2">Overdue books cannot be renewed. Return it at the desk; the fine is ₹{FINE_PER_DAY} a day.</p>}
                      </div>
                    );
                  })}
                </div>
              )}
              <RequestList requests={requests.items} onCancel={r => requests.update(r.id, { status: 'cancelled' })} />
            </>
          )}

          {activeTab === 'Search Catalogue' && (
            <>
              <SectionLabel left="Search Catalogue" />
              <Catalogue books={books.items} loans={loans.items} requests={requests.items} onReserve={b => ask('reserve', { bookId: b.id, title: b.title })} />
            </>
          )}

          {activeTab === 'E-Resources' && (
            <>
              <SectionLabel left="Digital Resources" />
              {eres.items.length === 0 ? <div className="px-4"><EmptyState title="No e-resources listed yet" /></div> : (
                <div className="bg-white border-t border-b border-[#D3D8E0]">
                  {eres.items.map((r, idx) => (
                    <div key={r.id} className={`flex items-center gap-3 px-4 py-3.5 ${idx < eres.items.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
                      <div className="w-10 h-10 rounded-[4px] bg-[#EDEFF3] flex items-center justify-center text-[11px] font-bold text-[#5A6577] shrink-0">{r.name.slice(0, 2).toUpperCase()}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[#16264A]">{r.name}</p>
                        <p className="text-[12px] text-[#5A6577] truncate">{r.desc} · {r.access}</p>
                      </div>
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-[#16264A] border border-[#D3D8E0] rounded-[4px] px-3 py-1.5 hover:border-[#16264A]">Open →</a>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'My Account' && (
            <>
              <SectionLabel left="Library Account" />
              <Account loans={loans.items} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ left, right }: { left: string; right?: string }) {
  return (
    <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
      <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{left}</span>
      {right && <span className="text-[12px] text-[#5A6577]">{right}</span>}
    </div>
  );
}

function RequestList({ requests, onCancel }: { requests: LibRequest[]; onCancel: (r: LibRequest) => void }) {
  const shown = requests.filter(r => r.status !== 'cancelled').slice(0, 8);
  if (shown.length === 0) return null;
  return (
    <>
      <div className="mt-4"><SectionLabel left="My Requests" /></div>
      <div className="bg-white border-t border-b border-[#D3D8E0]">
        {shown.map((r, idx) => (
          <div key={r.id} className={`px-4 py-3 flex items-center gap-3 ${idx < shown.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#16264A] font-medium truncate">{r.kind === 'renew' ? 'Renewal' : 'Reservation'} · {r.title}</p>
              <p className="text-[11px] text-[#5A6577]">{new Date(r.createdAt).toLocaleDateString('en-IN')}{r.deskNote ? ` · ${r.deskNote}` : ''}</p>
            </div>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${REQUEST_TONE[r.status]}`}>{r.status === 'ready' ? 'Ready to collect' : r.status[0]!.toUpperCase() + r.status.slice(1)}</span>
            {r.status === 'pending' && <button onClick={() => onCancel(r)} className="text-[12px] text-[#5A6577] hover:text-[#A8242C] cursor-pointer">Cancel</button>}
          </div>
        ))}
      </div>
    </>
  );
}

function Catalogue({ books, loans, requests, onReserve }: { books: LibBook[]; loans: Loan[]; requests: LibRequest[]; onReserve: (b: LibBook) => void }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const results = q ? books.filter(b => [b.title, b.author, b.isbn, b.subject].some(s => s.toLowerCase().includes(q))) : books;

  return (
    <div className="flex flex-col gap-3 px-4 pt-3">
      <div className="flex items-center gap-2 bg-white border border-[#D3D8E0] rounded-[4px] px-3 h-10">
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth={2}><circle cx={11} cy={11} r={8} /><path d="m21 21-4.35-4.35" /></svg>
        <input className="flex-1 text-[14px] text-[#16264A] bg-transparent outline-none placeholder-[#5A6577]" placeholder="Search by title, author, ISBN or subject" value={query} onChange={e => setQuery(e.target.value)} />
        {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="text-[#5A6577] hover:text-[#16264A] cursor-pointer">✕</button>}
      </div>
      {results.length === 0 ? (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] px-4 py-8 text-center">
          <p className="text-[14px] text-[#5A6577]">{books.length === 0 ? 'The catalogue has not been set up yet.' : <>No books found matching '<strong>{query}</strong>'</>}</p>
        </div>
      ) : (
        <div className="bg-white border-t border-b border-[#D3D8E0] -mx-4">
          {results.map((b, idx) => {
            const avail = availableCopies(b, loans);
            const reserved = requests.some(r => r.kind === 'reserve' && r.bookId === b.id && ['pending', 'approved', 'ready'].includes(r.status));
            return (
              <div key={b.id} className={`px-4 py-3.5 flex items-center justify-between gap-3 ${idx < results.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#16264A]">{b.title}</p>
                  <p className="text-[12px] text-[#5A6577]">{b.author} · {b.callNo} · {b.shelf}</p>
                  <p className="text-[12px] mt-0.5 font-medium" style={{ color: avail > 0 ? '#0E7A5F' : '#A8242C' }}>
                    {avail > 0 ? `${avail} cop${avail > 1 ? 'ies' : 'y'} on the shelf` : 'All copies are out'}
                  </p>
                </div>
                {avail <= 0 && (reserved ? <span className="text-[12px] text-[#9A5B00]">Reserved</span> : <Button variant="secondary" size="sm" onClick={() => onReserve(b)}>Reserve</Button>)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Account({ loans }: { loans: Loan[] }) {
  const out = activeLoans(loans);
  const owed = loans.reduce((s, l) => s + fineDue(l), 0);
  const rows: Array<[string, React.ReactNode]> = [
    ['Books issued now', `${out.length} of ${MAX_LOANS}`],
    ['Books borrowed in all', String(loans.length)],
    ['Overdue now', String(out.filter(l => overdueDays(l) > 0).length)],
    ['Fines due', owed > 0 ? <span className="text-[#A8242C] font-semibold">₹{owed}</span> : <span className="text-[#0E7A5F] font-semibold">Nil</span>],
    ['Loan period', '14 days, renewable twice'],
    ['Late fine', `₹${FINE_PER_DAY} per day`],
  ];
  const history = loans.filter(l => l.returnedOn).slice(0, 10);
  return (
    <div className="flex flex-col gap-3 px-4">
      <div className="bg-white border-t border-b border-[#D3D8E0] -mx-4">
        {rows.map(([label, value], idx) => (
          <div key={label} className={`flex items-center justify-between px-4 py-3.5 ${idx < rows.length - 1 ? 'border-b border-[#D3D8E0]' : ''}`}>
            <span className="text-[13px] text-[#5A6577]">{label}</span>
            <span className="text-[13px] text-[#16264A] font-medium">{value}</span>
          </div>
        ))}
      </div>
      {owed > 0 && <InlineAlert type="info">Pay library fines at the fee counter or the library desk on any working day. The desk records your receipt and the fine clears here.</InlineAlert>}
      {history.length > 0 && (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
          <p className="px-4 py-2 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider border-b border-[#D3D8E0]">Returned</p>
          {history.map(l => (
            <div key={l.id} className="px-4 py-2.5 flex justify-between gap-3 text-[12px] border-b border-[#EDEFF3] last:border-0">
              <span className="text-[#16264A] truncate">{l.title}</span>
              <span className="text-[#5A6577] shrink-0">{fmtIso(l.returnedOn)}{l.fine ? ` · fine ₹${l.fine}${l.fineReceipt ? ' paid' : l.fineWaived ? ' waived' : ''}` : ''}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
