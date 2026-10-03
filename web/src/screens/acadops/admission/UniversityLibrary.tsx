import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Input, Modal, Select, Spinner, Tabs, toast } from '../../../components/ui';
import { api, ApiError } from '../../../lib/api';
import { instPlace } from '../../../lib/institution';
import { useCollection, type Stored } from '../../../lib/records';
import { downloadCSV } from '../../../lib/export';
import {
  FINE_PER_DAY, LOAN_DAYS, MAX_LOANS, MAX_RENEWALS, RENEW_DAYS, SAMPLE_BOOKS, SAMPLE_ERESOURCES,
  addDaysIso, availableCopies, fineDue, fmtIso, isoToday, overdueDays,
  type EResource, type LibBook, type LibRequest, type Loan,
} from '../../../lib/library';

/**
 * The library desk: the catalogue, issue and return against a student,
 * overdue loans and fines, students' renewal and reservation requests, and
 * the e-resources list. Everything here is the same register the student's
 * own Library screen reads.
 */

interface StudentHit { id: string; title: string; subtitle: string }

const LOANS = 'desk:library-loans';
const blankBook = { title: '', author: '', isbn: '', publisher: '', year: '', subject: '', type: 'Book', copies: '1', callNo: '', shelf: '' };

export default function UniversityLibrary() {
  const [tab, setTab] = useState('catalogue');
  const qc = useQueryClient();
  const books = useCollection<LibBook>('campus:library-books', SAMPLE_BOOKS);
  // Staff reading a student register with no studentId see every student's rows.
  const loans = useCollection<Loan>(LOANS, []);
  const requests = useCollection<LibRequest>('student:library-requests', []);
  const eres = useCollection<EResource>('campus:library-eresources', SAMPLE_ERESOURCES);

  const out = loans.items.filter(l => !l.returnedOn);
  const overdue = out.filter(l => overdueDays(l) > 0);
  const finesOwed = loans.items.reduce((s, l) => s + fineDue(l), 0);
  const pendingReqs = requests.items.filter(r => r.status === 'pending');

  const tabs = [
    { id: 'catalogue', label: 'Catalogue' },
    { id: 'issue', label: 'Issue / Return' },
    { id: 'loans', label: `Loans & Fines${overdue.length ? ` (${overdue.length} overdue)` : ''}` },
    { id: 'requests', label: `Requests${pendingReqs.length ? ` (${pendingReqs.length})` : ''}` },
    { id: 'eresources', label: 'E-Resources' },
  ];

  /** Files a loan row against a student; the hook cannot, as the desk serves many students. */
  async function fileLoan(studentId: string, loan: Loan) {
    await api(`/api/records/${LOANS}`, { method: 'POST', body: { data: loan, studentId } });
    await qc.invalidateQueries({ queryKey: ['records', LOANS] });
  }

  const loading = books.isLoading || loans.isLoading;

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      <div className="bg-[#16264A] px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[18px] font-bold text-white">University Library</h1>
          <p className="text-[13px] text-white/60 mt-0.5">Central Library — {instPlace()}</p>
        </div>
        <div className="flex gap-6 text-center">
          {[
            ['Titles', books.items.length],
            ['Copies', books.items.reduce((s, b) => s + b.copies, 0)],
            ['Out now', out.length],
            ['Overdue', overdue.length],
            ['Fines due', `₹${finesOwed.toLocaleString('en-IN')}`],
          ].map(([label, val]) => (
            <div key={label}>
              <p className="text-[#E0952A] text-[18px] font-bold tabular-nums">{val}</p>
              <p className="text-white/60 text-[11px]">{label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={tabs} activeId={tab} onChange={setTab} />
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? <div className="flex justify-center py-16"><Spinner size={22} /></div> : (
          <>
            {tab === 'catalogue' && <CatalogueTab books={books} loans={loans.items} />}
            {tab === 'issue' && <IssueReturnTab books={books.items} loans={loans} fileLoan={fileLoan} />}
            {tab === 'loans' && <LoansTab loans={loans} />}
            {tab === 'requests' && <RequestsTab requests={requests} loans={loans} books={books.items} />}
            {tab === 'eresources' && <EResourcesTab eres={eres} />}
          </>
        )}
      </div>
    </div>
  );
}

type Coll<T extends object> = ReturnType<typeof useCollection<T>>;

// ─── Catalogue ───────────────────────────────────────────────────────────────

function CatalogueTab({ books, loans }: { books: Coll<LibBook>; loans: Loan[] }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('All');
  const [subject, setSubject] = useState('All');
  const [editing, setEditing] = useState<Stored<LibBook> | 'new' | null>(null);
  const [form, setForm] = useState(blankBook);

  const subjects = ['All', ...Array.from(new Set(books.items.map(b => b.subject).filter(Boolean))).sort()];
  const query = q.trim().toLowerCase();
  const shown = books.items.filter(b =>
    (!query || [b.title, b.author, b.isbn, b.subject, b.callNo].some(s => s.toLowerCase().includes(query))) &&
    (type === 'All' || b.type === type) && (subject === 'All' || b.subject === subject));

  function open(b: Stored<LibBook> | 'new') {
    setEditing(b);
    setForm(b === 'new' ? blankBook : { ...b, year: String(b.year), copies: String(b.copies) });
  }

  function save() {
    const copies = Number(form.copies);
    const year = Number(form.year);
    if (!form.title.trim() || !form.author.trim()) { toast.error('Title and author are required'); return; }
    if (!Number.isInteger(copies) || copies < 1) { toast.error('Copies must be a whole number, at least 1'); return; }
    if (editing !== 'new' && editing) {
      const out = loans.filter(l => !l.returnedOn && l.bookId === editing.id).length;
      if (copies < out) { toast.error(`${out} copies are on loan; copies cannot go below that`); return; }
    }
    const doc = { ...form, title: form.title.trim(), author: form.author.trim(), year: Number.isFinite(year) ? year : 0, copies, type: form.type as LibBook['type'] };
    if (editing === 'new') {
      const id = `BK-${Date.now().toString(36).toUpperCase()}`;
      books.add({ id, ...doc });
      toast.success(`${doc.title} added to the catalogue`);
    } else if (editing) {
      books.update(editing.id, doc);
      toast.success('Catalogue entry updated');
    }
    setEditing(null);
  }

  function remove(b: Stored<LibBook>) {
    if (loans.some(l => !l.returnedOn && l.bookId === b.id)) { toast.error('Copies of this title are on loan; take them back first'); return; }
    if (!window.confirm(`Remove "${b.title}" from the catalogue?`)) return;
    books.remove(b.id);
    setEditing(null);
    toast.success('Removed from the catalogue');
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Input placeholder="Search by title, author, ISBN, subject, call no." value={q} onChange={e => setQ(e.target.value)} className="flex-1 min-w-[240px]" />
        <Select value={type} onChange={e => setType(e.target.value)} className="w-36">
          {['All', 'Book', 'Journal', 'Thesis'].map(t => <option key={t}>{t}</option>)}
        </Select>
        <Select value={subject} onChange={e => setSubject(e.target.value)} className="w-44">
          {subjects.map(s => <option key={s}>{s}</option>)}
        </Select>
        <Button variant="secondary" onClick={() => downloadCSV('library-catalogue', books.items.map(b => ({ ...b, available: availableCopies(b, loans) })))}>Export CSV</Button>
        <Button onClick={() => open('new')}>+ Add Title</Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState title={books.items.length ? 'No titles match your search' : 'The catalogue is empty'} description={books.items.length ? undefined : 'Add your first title to start issuing books.'} />
      ) : (
        <div className="bg-white border border-[#D3D8E0] rounded-[4px] overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead>
              <tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">
                {['Title', 'Subject', 'Call no. / Shelf', 'ISBN', 'Available', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map(b => {
                const avail = availableCopies(b, loans);
                return (
                  <tr key={b.id} className="border-b border-[#EDEFF3] hover:bg-[#F7F8FA]">
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{b.title}</p><p className="text-[12px] text-[#5A6577]">{b.author}{b.year ? ` · ${b.year}` : ''}{b.publisher ? ` · ${b.publisher}` : ''}</p></td>
                    <td className="px-4 py-3 text-[#5A6577]">{b.subject} <span className="text-[11px]">({b.type})</span></td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{b.callNo || '—'}<br />{b.shelf}</td>
                    <td className="px-4 py-3 font-mono text-[12px] text-[#5A6577]">{b.isbn || '—'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${avail > 0 ? 'bg-[#D1FAE5] text-[#0E7A5F]' : 'bg-[#FEE2E2] text-[#A8242C]'}`}>{avail}/{b.copies}</span></td>
                    <td className="px-4 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => open(b)}>Edit</Button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add Title' : 'Edit Title'} width="600px"
        footer={<>
          {editing && editing !== 'new' && <Button variant="destructive" onClick={() => remove(editing)} className="mr-auto">Remove</Button>}
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={save}>{editing === 'new' ? 'Add to Catalogue' : 'Save'}</Button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Input label="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="col-span-2"><Input label="Author(s) *" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} /></div>
          <Input label="ISBN" value={form.isbn} onChange={e => setForm({ ...form, isbn: e.target.value })} />
          <Input label="Publisher" value={form.publisher} onChange={e => setForm({ ...form, publisher: e.target.value })} />
          <Input label="Year" inputMode="numeric" value={form.year} onChange={e => setForm({ ...form, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} />
          <Input label="Subject" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
          <Select label="Type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            {['Book', 'Journal', 'Thesis'].map(t => <option key={t}>{t}</option>)}
          </Select>
          <Input label="Copies *" inputMode="numeric" value={form.copies} onChange={e => setForm({ ...form, copies: e.target.value.replace(/\D/g, '') })} />
          <Input label="Call number" value={form.callNo} onChange={e => setForm({ ...form, callNo: e.target.value })} />
          <Input label="Shelf / Row" value={form.shelf} onChange={e => setForm({ ...form, shelf: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}

// ─── Issue / Return ──────────────────────────────────────────────────────────

function StudentPicker({ value, onPick }: { value: StudentHit | null; onPick: (s: StudentHit | null) => void }) {
  const [q, setQ] = useState('');
  const search = useQuery({
    queryKey: ['library', 'student-search', q.trim()],
    enabled: q.trim().length >= 2,
    queryFn: () => api<{ hits: Array<StudentHit & { kind: string }> }>(`/api/insights/search?q=${encodeURIComponent(q.trim())}`),
  });
  const hits = (search.data?.hits ?? []).filter(h => h.kind === 'Student');

  if (value) {
    return (
      <div className="flex items-center justify-between bg-[#F7F8FA] border border-[#D3D8E0] rounded-[4px] px-3 py-2">
        <div><p className="text-[14px] font-medium text-[#16264A]">{value.title}</p><p className="text-[12px] text-[#5A6577]">{value.subtitle}</p></div>
        <button onClick={() => onPick(null)} className="text-[12px] text-[#5A6577] hover:text-[#16264A] cursor-pointer">Change</button>
      </div>
    );
  }
  return (
    <div>
      <Input label="Student" placeholder="Enrolment number or name" value={q} onChange={e => setQ(e.target.value)} />
      {q.trim().length >= 2 && (
        <div className="mt-1 border border-[#D3D8E0] rounded-[4px] bg-white max-h-56 overflow-y-auto">
          {search.isLoading && <p className="px-3 py-2 text-[12px] text-[#5A6577]">Searching…</p>}
          {!search.isLoading && hits.length === 0 && <p className="px-3 py-2 text-[12px] text-[#5A6577]">No student matches “{q.trim()}”.</p>}
          {hits.map(h => (
            <button key={h.id} onClick={() => { onPick(h); setQ(''); }} className="w-full text-left px-3 py-2 hover:bg-[#FEF9EC] border-b border-[#EDEFF3] last:border-0 cursor-pointer">
              <p className="text-[13px] font-medium text-[#16264A]">{h.title}</p>
              <p className="text-[11px] text-[#5A6577]">{h.subtitle}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IssueReturnTab({ books, loans, fileLoan }: { books: LibBook[]; loans: Coll<Loan>; fileLoan: (studentId: string, loan: Loan) => Promise<void> }) {
  const [student, setStudent] = useState<StudentHit | null>(null);
  const [bookId, setBookId] = useState('');
  const [busy, setBusy] = useState(false);

  const theirs = useMemo(() => (student ? loans.items.filter(l => l._studentId === student.id) : []), [student, loans.items]);
  const theirOut = theirs.filter(l => !l.returnedOn);
  const theirFines = theirs.reduce((s, l) => s + fineDue(l), 0);
  const book = books.find(b => b.id === bookId);
  const avail = book ? availableCopies(book, loans.items) : 0;
  const blocked = !student ? 'Pick a student' : theirOut.length >= MAX_LOANS ? `Already has ${MAX_LOANS} books out` : theirOut.some(l => overdueDays(l) > 0) ? 'Has an overdue book — take it back first' : !book ? 'Pick a title' : avail <= 0 ? 'No copy on the shelf' : theirOut.some(l => l.bookId === bookId) ? 'Already has a copy of this title' : null;

  async function issue() {
    if (!student || !book || blocked) return;
    setBusy(true);
    try {
      const today = isoToday();
      await fileLoan(student.id, { id: `LN-${Date.now().toString(36).toUpperCase()}`, bookId: book.id, title: book.title, author: book.author, issuedOn: today, dueDate: addDaysIso(today, LOAN_DAYS), renewals: 0 });
      toast.success(`Issued "${book.title}" to ${student.title}, due ${fmtIso(addDaysIso(today, LOAN_DAYS))}`);
      setBookId('');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Could not issue the book');
    } finally {
      setBusy(false);
    }
  }

  function giveBack(l: Stored<Loan>) {
    const days = overdueDays(l);
    const fine = days * FINE_PER_DAY;
    loans.update(l._rid ?? l.id, { returnedOn: isoToday(), fine });
    toast.success(fine ? `Returned ${days} day(s) late — fine ₹${fine} assessed` : 'Returned on time');
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5 space-y-4">
        <h2 className="text-[15px] font-semibold text-[#16264A]">Issue a book</h2>
        <StudentPicker value={student} onPick={setStudent} />
        <Select label="Title" value={bookId} onChange={e => setBookId(e.target.value)}>
          <option value="">Choose a title…</option>
          {books.map(b => { const a = availableCopies(b, loans.items); return <option key={b.id} value={b.id} disabled={a <= 0}>{b.title} — {a} on shelf</option>; })}
        </Select>
        <p className="text-[12px] text-[#5A6577]">Loan period {LOAN_DAYS} days · up to {MAX_LOANS} books · ₹{FINE_PER_DAY}/day late fine.</p>
        {blocked && student && <p className="text-[12px] text-[#A8242C]">{blocked}</p>}
        <Button className="w-full" loading={busy} disabled={!!blocked} onClick={() => void issue()}>Issue Book</Button>
      </div>

      <div className="bg-white border border-[#D3D8E0] rounded-[4px] p-5">
        <h2 className="text-[15px] font-semibold text-[#16264A] mb-3">{student ? `${student.title}'s books` : 'Return a book'}</h2>
        {!student ? <p className="text-[13px] text-[#5A6577]">Pick the student on the left to see and take back what they have out.</p> : (
          <>
            {theirFines > 0 && <p className="text-[13px] text-[#A8242C] font-medium mb-3">Fines due: ₹{theirFines} — collect at the fee counter and record the receipt under Loans & Fines.</p>}
            {theirOut.length === 0 ? <p className="text-[13px] text-[#5A6577]">No books out.</p> : (
              <div className="divide-y divide-[#EDEFF3]">
                {theirOut.map(l => {
                  const d = overdueDays(l);
                  return (
                    <div key={l._rid ?? l.id} className="py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#16264A] truncate">{l.title}</p>
                        <p className="text-[12px] text-[#5A6577]">Due {fmtIso(l.dueDate)}{d > 0 && <span className="text-[#A8242C] font-semibold"> · {d}d late, ₹{d * FINE_PER_DAY}</span>}</p>
                      </div>
                      <Button size="sm" onClick={() => giveBack(l)}>Take back</Button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Loans & fines ───────────────────────────────────────────────────────────

function LoansTab({ loans }: { loans: Coll<Loan> }) {
  const [view, setView] = useState<'overdue' | 'out' | 'fines' | 'all'>('overdue');
  const [settling, setSettling] = useState<Stored<Loan> | null>(null);
  const [receipt, setReceipt] = useState('');
  const [waive, setWaive] = useState('');

  const rows = loans.items.filter(l =>
    view === 'overdue' ? !l.returnedOn && overdueDays(l) > 0
      : view === 'out' ? !l.returnedOn
        : view === 'fines' ? fineDue(l) > 0 && !!l.returnedOn
          : true);

  function settle() {
    if (!settling) return;
    if (receipt.trim()) loans.update(settling._rid ?? settling.id, { fineReceipt: receipt.trim() });
    else if (waive.trim()) loans.update(settling._rid ?? settling.id, { fineWaived: waive.trim() });
    else { toast.error('Enter the counter receipt number, or a reason to waive'); return; }
    toast.success(receipt.trim() ? 'Fine recorded as paid' : 'Fine waived');
    setSettling(null); setReceipt(''); setWaive('');
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#D3D8E0]">
        {([['overdue', 'Overdue'], ['out', 'All out'], ['fines', 'Fines to collect'], ['all', 'Everything']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} className={`text-[12px] px-3 py-1 rounded-[4px] border cursor-pointer ${view === id ? 'border-[#16264A] bg-[#16264A] text-white' : 'border-[#D3D8E0] text-[#5A6577] hover:border-[#16264A]'}`}>{label}</button>
        ))}
        <Button size="sm" variant="secondary" className="ml-auto" onClick={() => downloadCSV(`library-loans-${view}`, rows.map(l => ({ student: l._student?.name ?? '', enrolmentNo: l._student?.enrolmentNo ?? '', title: l.title, issuedOn: l.issuedOn, dueDate: l.dueDate, returnedOn: l.returnedOn ?? '', overdueDays: overdueDays(l), fineDue: fineDue(l), receipt: l.fineReceipt ?? '', waived: l.fineWaived ?? '' })))}>Export CSV</Button>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="Nothing here" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] min-w-[760px]">
            <thead><tr className="border-b border-[#D3D8E0] bg-[#EDEFF3]">{['Student', 'Title', 'Issued', 'Due', 'Returned', 'Fine', ''].map(h => <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(l => {
                const due = fineDue(l);
                return (
                  <tr key={l._rid ?? l.id} className="border-b border-[#EDEFF3]">
                    <td className="px-4 py-3"><p className="font-medium text-[#16264A]">{l._student?.name ?? '—'}</p><p className="font-mono text-[11px] text-[#5A6577]">{l._student?.enrolmentNo}</p></td>
                    <td className="px-4 py-3 text-[#16264A]">{l.title}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{fmtIso(l.issuedOn)}</td>
                    <td className={`px-4 py-3 ${!l.returnedOn && overdueDays(l) > 0 ? 'text-[#A8242C] font-semibold' : 'text-[#5A6577]'}`}>{fmtIso(l.dueDate)}</td>
                    <td className="px-4 py-3 text-[#5A6577]">{fmtIso(l.returnedOn)}</td>
                    <td className="px-4 py-3">{due ? <span className="text-[#A8242C] font-semibold">₹{due}{!l.returnedOn && ' (running)'}</span> : l.fine ? <span className="text-[#0E7A5F]">₹{l.fine} {l.fineReceipt ? `· ${l.fineReceipt}` : 'waived'}</span> : '—'}</td>
                    <td className="px-4 py-3 text-right">{due > 0 && l.returnedOn && <Button size="sm" onClick={() => setSettling(l)}>Settle</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!settling} onClose={() => setSettling(null)} title="Settle fine"
        footer={<><Button variant="secondary" onClick={() => setSettling(null)}>Cancel</Button><Button onClick={settle}>Save</Button></>}>
        {settling && (
          <div className="space-y-4">
            <p className="text-[13px] text-[#5A6577]">{settling._student?.name} · {settling.title} · <b className="text-[#A8242C]">₹{fineDue(settling)}</b></p>
            <Input label="Fee-counter receipt number" value={receipt} onChange={e => { setReceipt(e.target.value); setWaive(''); }} placeholder="e.g. RCT/2026/004512" />
            <p className="text-[12px] text-[#5A6577] text-center">— or —</p>
            <Input label="Waive, with reason" value={waive} onChange={e => { setWaive(e.target.value); setReceipt(''); }} placeholder="e.g. Medical leave, certificate on file" />
          </div>
        )}
      </Modal>
    </div>
  );
}

// ─── Requests ────────────────────────────────────────────────────────────────

function RequestsTab({ requests, loans, books }: { requests: Coll<LibRequest>; loans: Coll<Loan>; books: LibBook[] }) {
  const [showAll, setShowAll] = useState(false);
  const rows = requests.items.filter(r => showAll || ['pending', 'approved', 'ready'].includes(r.status));

  function decide(r: Stored<LibRequest>, approve: boolean) {
    const id = r._rid ?? r.id;
    if (r.kind === 'renew') {
      const loan = loans.items.find(l => l.id === r.loanId && l._studentId === r._studentId);
      if (approve) {
        if (!loan || loan.returnedOn) { requests.update(id, { status: 'declined', deskNote: 'The book has already been returned' }); toast.info('Book already returned — request closed'); return; }
        if (loan.renewals >= MAX_RENEWALS) { requests.update(id, { status: 'declined', deskNote: `Renewed ${MAX_RENEWALS} times already` }); toast.info('Renewal limit reached — declined'); return; }
        if (overdueDays(loan) > 0) { requests.update(id, { status: 'declined', deskNote: 'Overdue — please return the book' }); toast.info('Loan is overdue — declined'); return; }
        const due = addDaysIso(loan.dueDate, RENEW_DAYS);
        loans.update(loan._rid ?? loan.id, { dueDate: due, renewals: loan.renewals + 1 });
        requests.update(id, { status: 'approved', deskNote: `New due date ${fmtIso(due)}` });
        toast.success(`Renewed until ${fmtIso(due)}`);
      } else {
        requests.update(id, { status: 'declined', deskNote: 'Declined by the desk' });
      }
      return;
    }
    // Reservations: ready once a copy is on the shelf, then fulfilled when issued.
    if (approve) {
      const b = books.find(x => x.id === r.bookId);
      if (b && availableCopies(b, loans.items) <= 0) { toast.error('No copy on the shelf yet — keep it pending'); return; }
      requests.update(id, { status: 'ready', deskNote: 'Copy held at the desk for 3 days' });
      toast.success('Student told a copy is ready');
    } else {
      requests.update(id, { status: 'declined', deskNote: 'Reservation cancelled by the desk' });
    }
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Renewal & reservation requests</p>
        <label className="text-[12px] text-[#5A6577] flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show closed</label>
      </div>
      {rows.length === 0 ? <div className="p-6"><EmptyState title="No open requests" /></div> : (
        <div className="divide-y divide-[#EDEFF3]">
          {rows.map(r => (
            <div key={r._rid ?? r.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[220px]">
                <p className="text-[13px] font-medium text-[#16264A]">{r.kind === 'renew' ? 'Renewal' : 'Reservation'} · {r.title}</p>
                <p className="text-[12px] text-[#5A6577]">{r._student?.name} ({r._student?.enrolmentNo}) · {new Date(r.createdAt).toLocaleDateString('en-IN')}{r.deskNote ? ` · ${r.deskNote}` : ''}</p>
              </div>
              <span className="text-[11px] font-semibold uppercase text-[#5A6577]">{r.status}</span>
              {r.status === 'pending' && <>
                <Button size="sm" variant="secondary" onClick={() => decide(r, false)}>Decline</Button>
                <Button size="sm" onClick={() => decide(r, true)}>{r.kind === 'renew' ? 'Renew' : 'Mark ready'}</Button>
              </>}
              {r.status === 'ready' && <Button size="sm" variant="secondary" onClick={() => requests.update(r._rid ?? r.id, { status: 'fulfilled' })}>Collected</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── E-resources ─────────────────────────────────────────────────────────────

function EResourcesTab({ eres }: { eres: Coll<EResource> }) {
  const [editing, setEditing] = useState<Stored<EResource> | 'new' | null>(null);
  const [form, setForm] = useState<Omit<EResource, 'id'>>({ name: '', desc: '', url: '', access: 'Open Access' });

  function open(r: Stored<EResource> | 'new') {
    setEditing(r);
    setForm(r === 'new' ? { name: '', desc: '', url: '', access: 'Open Access' } : { name: r.name, desc: r.desc, url: r.url, access: r.access });
  }
  function save() {
    if (!form.name.trim() || !/^https?:\/\/\S+$/.test(form.url.trim())) { toast.error('Enter a name and a full http(s) link'); return; }
    const doc = { ...form, name: form.name.trim(), url: form.url.trim() };
    if (editing === 'new') eres.add({ id: `ER-${Date.now().toString(36).toUpperCase()}`, ...doc });
    else if (editing) eres.update(editing.id, doc);
    toast.success('E-resource saved');
    setEditing(null);
  }

  return (
    <div className="bg-white border border-[#D3D8E0] rounded-[4px]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#D3D8E0]">
        <p className="text-[14px] font-semibold text-[#16264A]">Subscribed & open e-resources</p>
        <Button size="sm" onClick={() => open('new')}>+ Add</Button>
      </div>
      {eres.items.length === 0 ? <div className="p-6"><EmptyState title="No e-resources yet" /></div> : (
        <div className="divide-y divide-[#EDEFF3]">
          {eres.items.map(r => (
            <div key={r.id} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0"><p className="text-[13px] font-medium text-[#16264A]">{r.name}</p><p className="text-[12px] text-[#5A6577] truncate">{r.desc} · {r.access}</p></div>
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#E0952A] hover:underline">Open</a>
              <Button size="sm" variant="ghost" onClick={() => open(r)}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(`Remove ${r.name}?`)) eres.remove(r.id); }}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add e-resource' : 'Edit e-resource'}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Description" value={form.desc} onChange={e => setForm({ ...form, desc: e.target.value })} />
          <Input label="Link" placeholder="https://" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
          <Select label="Access" value={form.access} onChange={e => setForm({ ...form, access: e.target.value as EResource['access'] })}>
            {['Open Access', 'Campus IP', 'Institutional login'].map(a => <option key={a}>{a}</option>)}
          </Select>
        </div>
      </Modal>
    </div>
  );
}
