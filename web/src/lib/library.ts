/**
 * The library, shared by the university library desk (Academic Operations)
 * and the student's own Library screen.
 *
 * - `campus:library-books`      the catalogue; everyone reads, staff keep it.
 * - `desk:library-loans`        one row per issue, filed against the borrower;
 *                               the borrower reads it but only the desk writes.
 * - `student:library-requests`  renewals and reservations a student asks for,
 *                               which the desk approves or declines.
 * - `campus:library-eresources` subscribed databases and their links.
 *
 * Fines are assessed by the desk on return and collected at the fee counter;
 * the desk records the counter's receipt number against the loan.
 */

export const LOAN_DAYS = 14;
export const RENEW_DAYS = 14;
export const MAX_RENEWALS = 2;
export const MAX_LOANS = 4;
export const FINE_PER_DAY = 2;

export interface LibBook {
  id: string;
  title: string;
  author: string;
  isbn: string;
  publisher: string;
  year: number;
  subject: string;
  type: 'Book' | 'Journal' | 'Thesis';
  copies: number;
  callNo: string;
  shelf: string;
}

export interface Loan {
  id: string;
  bookId: string;
  title: string;
  author: string;
  /** ISO dates (yyyy-mm-dd). */
  issuedOn: string;
  dueDate: string;
  renewals: number;
  returnedOn?: string;
  /** Assessed on return (or running, while overdue and out). */
  fine?: number;
  fineReceipt?: string;
  fineWaived?: string;
}

export type RequestStatus = 'pending' | 'approved' | 'declined' | 'ready' | 'fulfilled' | 'cancelled';

export interface LibRequest {
  id: string;
  kind: 'renew' | 'reserve';
  bookId: string;
  title: string;
  loanId?: string;
  status: RequestStatus;
  createdAt: string;
  deskNote?: string;
}

export interface EResource {
  id: string;
  name: string;
  desc: string;
  url: string;
  access: 'Open Access' | 'Campus IP' | 'Institutional login';
}

const DAY = 86_400_000;
export const isoToday = () => new Date().toISOString().slice(0, 10);
export const addDaysIso = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / DAY);
export const fmtIso = (iso?: string) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';

/** Days a loan is (or was, when returned) past its due date. */
export const overdueDays = (l: Loan) => Math.max(0, daysBetween(l.dueDate, l.returnedOn ?? isoToday()));

/** What the borrower owes on a loan: the assessed fine once returned, the running one while out. */
export function fineDue(l: Loan): number {
  if (l.fineReceipt || l.fineWaived) return 0;
  return l.returnedOn ? (l.fine ?? 0) : overdueDays(l) * FINE_PER_DAY;
}

export const activeLoans = (loans: Loan[]) => loans.filter(l => !l.returnedOn);
export const availableCopies = (b: LibBook, loans: Loan[]) => b.copies - loans.filter(l => !l.returnedOn && l.bookId === b.id).length;

// ─── Samples, used only on the demo deployment ───────────────────────────────

export const SAMPLE_BOOKS: LibBook[] = [
  { id: 'BK-0001', title: 'Introduction to Algorithms', author: 'Cormen, Leiserson, Rivest, Stein', isbn: '978-0262046305', publisher: 'MIT Press', year: 2022, subject: 'Computer Science', type: 'Book', copies: 8, callNo: 'QA76.9.A43 C67', shelf: 'G-12 / R-3' },
  { id: 'BK-0002', title: 'Database System Concepts', author: 'Silberschatz, Korth, Sudarshan', isbn: '978-0073523323', publisher: 'McGraw Hill', year: 2020, subject: 'Computer Science', type: 'Book', copies: 6, callNo: 'QA76.9.D3 S55', shelf: 'G-12 / R-5' },
  { id: 'BK-0003', title: 'Operating System Concepts', author: 'Silberschatz, Galvin, Gagne', isbn: '978-1119800361', publisher: 'Wiley', year: 2021, subject: 'Computer Science', type: 'Book', copies: 5, callNo: 'QA76.76.O63 S55', shelf: 'G-12 / R-6' },
  { id: 'BK-0004', title: 'Computer Networks', author: 'Tanenbaum, Feamster, Wetherall', isbn: '978-9353949983', publisher: 'Pearson', year: 2021, subject: 'Computer Science', type: 'Book', copies: 4, callNo: 'TK5105.5 T36', shelf: 'G-13 / R-1' },
  { id: 'BK-0005', title: 'Software Engineering', author: 'Ian Sommerville', isbn: '978-9332582699', publisher: 'Pearson', year: 2019, subject: 'Computer Science', type: 'Book', copies: 1, callNo: 'QA76.758 S65', shelf: 'G-13 / R-2' },
  { id: 'BK-0006', title: 'Principles of Marketing', author: 'Philip Kotler, Gary Armstrong', isbn: '978-0135163443', publisher: 'Pearson', year: 2021, subject: 'Management', type: 'Book', copies: 10, callNo: 'HF5415 K62', shelf: 'F1-08 / R-2' },
  { id: 'BK-0007', title: 'Organic Chemistry', author: 'Morrison & Boyd', isbn: '978-8120322998', publisher: 'PHI Learning', year: 2019, subject: 'Chemistry', type: 'Book', copies: 5, callNo: 'QD251.2 M67', shelf: 'S2-04 / R-1' },
  { id: 'BK-0008', title: 'Indian Polity', author: 'M. Laxmikanth', isbn: '978-9354600357', publisher: 'McGraw Hill', year: 2023, subject: 'Political Science', type: 'Book', copies: 7, callNo: 'JQ231 L39', shelf: 'F1-15 / R-4' },
];

export const SAMPLE_LOANS: Loan[] = [
  { id: 'LN-SEED-1', bookId: 'BK-0003', title: 'Operating System Concepts', author: 'Silberschatz, Galvin, Gagne', issuedOn: '2024-09-08', dueDate: '2024-09-29', renewals: 1 },
  { id: 'LN-SEED-2', bookId: 'BK-0004', title: 'Computer Networks', author: 'Tanenbaum, Feamster, Wetherall', issuedOn: '2024-09-01', dueDate: '2024-09-15', renewals: 0 },
];

export const SAMPLE_ERESOURCES: EResource[] = [
  { id: 'ER-NLIST', name: 'INFLIBNET N-LIST', desc: 'E-journals and e-books for colleges', url: 'https://nlist.inflibnet.ac.in', access: 'Institutional login' },
  { id: 'ER-NDLI', name: 'National Digital Library of India', desc: 'Digital repository of educational content', url: 'https://ndl.iitkgp.ac.in', access: 'Open Access' },
  { id: 'ER-SG', name: 'Shodhganga', desc: 'Indian theses and dissertations', url: 'https://shodhganga.inflibnet.ac.in', access: 'Open Access' },
  { id: 'ER-NPTEL', name: 'NPTEL', desc: 'IIT/IISc course videos', url: 'https://nptel.ac.in', access: 'Open Access' },
  { id: 'ER-SWAYAM', name: 'SWAYAM', desc: 'Online courses with credit transfer', url: 'https://swayam.gov.in', access: 'Open Access' },
];
