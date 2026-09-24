# Resolion Campus OS — Backend API

Express 5 · TypeScript · Prisma 7 · PostgreSQL · JWT with refresh-token rotation.

One API serving both clients: `../web` (React) and `../mobile` (React Native).

## Run it

You need three terminals the first time.

```bash
# 1. Database — real Postgres, downloaded into node_modules. No install needed.
npm install
npm run db:start          # leave running; listens on 5433

# 2. Schema + demo data (once)
npm run db:migrate
npm run db:seed

# 3. API
npm run dev               # http://localhost:4000
```

Check it: `curl http://localhost:4000/api/health`

| Script | What it does |
| --- | --- |
| `npm run db:start` | Starts the bundled Postgres (data in `.pgdata/`) |
| `npm run db:stop` | Stops it |
| `npm run db:migrate` | Applies migrations (`prisma migrate dev`) |
| `npm run db:seed` | Resets and reloads the demo data |
| `npm run db:studio` | Prisma Studio, a GUI over the tables |
| `npm run dev` | API with reload on change |
| `npm run build` / `start` | Compile to `dist/` and run |
| `npm run test:smoke` | Reseeds, then runs the end-to-end suite |

## Demo accounts

All use the password **`campus123`**.

| Role | Email |
| --- | --- |
| Student | `priya.sharma.2021@demo.resolion.edu` |
| Parent | `parent.sharma@example.in` |
| Faculty | `rk.mishra@demo.resolion.edu` |
| Head of department | `ml.gupta@demo.resolion.edu` |
| College office | `pushpa.sharma@demo.resolion.edu` |
| Principal | `principal@demo.resolion.edu` |
| Registrar | `registrar@demo.resolion.edu` |
| Admin | `admin@demo.resolion.edu` |

The other three lecturers on the timetable — `sunita.yadav@`, `anil.sharma@`
and `kavita.jain@demo.resolion.edu` — also sign in, which is how the suite proves
one lecturer cannot reach another's class.

The seed recreates the same record both clients previously mocked — Priya
Sharma, BCA V Sem, Model College Demo City — so the API is a drop-in replacement
for the old `studentdata.ts`, not a different dataset. Phase 2 adds her twelve
classmates, because a roster, a marks sheet and a mentee list with one student
in them demonstrate nothing.

## Endpoints (Phase 1)

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness |
| `POST` | `/api/auth/login` | Returns access token + refresh token (also as a httpOnly cookie) |
| `POST` | `/api/auth/refresh` | Rotates the refresh token |
| `POST` | `/api/auth/logout` | Revokes the supplied token |
| `POST` | `/api/auth/logout-all` | Revokes every session for the user |
| `GET` | `/api/auth/me` | The caller, with student record or wards |
| `GET` | `/api/student/profile` | Identity, programme, college, APAAR/ABC |
| `GET` | `/api/student/attendance` | Per-subject percentages, threshold, classes still needed |
| `GET` | `/api/student/timetable` | Grouped by weekday; `?day=MON` for one |
| `GET` | `/api/student/fees` | Heads, instalments, payments, scholarships, totals |
| `POST` | `/api/student/fees/pay` | Settles an instalment and applies it across heads |
| `GET` | `/api/student/results` | Semester results with subject marks |
| `GET` | `/api/student/transport` | Route, stops, live stop index, bus pass |
| `GET` | `/api/student/notifications` | `?unreadOnly=true`, `?limit=` |
| `POST` | `/api/student/notifications/:id/read` | Mark one read |
| `POST` | `/api/student/notifications/read-all` | Mark all read |
| `GET` | `/api/announcements` | `?scope=UNIVERSITY\|COLLEGE\|DEPARTMENT\|BATCH` |
| `GET` | `/api/attendance/session/active` | The class currently open for QR marking |
| `POST` | `/api/attendance/mark` | Marks the caller present from a scanned token |
| `POST` | `/api/attendance/session/:id/qr` | Faculty rotates the projected code |
| `GET` | `/api/attendance/corrections` | The student's own correction requests |
| `POST` | `/api/attendance/corrections` | Disputes one day's attendance |

## Endpoints (Phase 2 — faculty)

Everything below is gated to `FACULTY` and `ADMIN`, and scoped to the calling
lecturer. An `ADMIN` may act for one by passing `?facultyId=`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/faculty/profile` | Identity, plus weekly load and mentee count, both derived |
| `GET` | `/api/faculty/subjects` | The teaching load this term, with roster sizes |
| `GET` | `/api/faculty/timetable` | The week, grouped by day |
| `GET` | `/api/faculty/classes/today` | Today's classes and whether each is marked; `?date=` for another day |
| `POST` | `/api/faculty/classes/:slotId/session` | Opens the roll call for a slot. Idempotent |
| `GET` | `/api/faculty/subjects/:id/roster` | The class list with running attendance |
| `GET` | `/api/faculty/subjects/:id/sessions` | The register: every class held, who marked it, which sheets are locked |
| `GET` | `/api/faculty/subjects/:id/sheet` | The roll call for one subject on one day; `?date=`. Read-only |
| `POST` | `/api/faculty/subjects/:id/sheet` | Saves it, opening the session on first save |
| `POST` | `/api/faculty/slots/:id/cancel` | Cancels a class and notifies the enrolled students |
| `POST` | `/api/faculty/slots/:id/restore` | Puts it back |
| `GET` | `/api/faculty/sessions/:id/attendance` | The roll call sheet |
| `POST` | `/api/faculty/sessions/:id/attendance` | Saves it; `draft: true` leaves the lock clock stopped |
| `GET` | `/api/faculty/corrections` | Requests raised against this lecturer's classes |
| `POST` | `/api/faculty/corrections/:id/decide` | `APPROVE` rewrites the record and notifies the student |
| `GET` | `/api/faculty/marks/:assignmentId` | The marks sheet; components are created on first open |
| `PUT` | `/api/faculty/marks/:assignmentId/entries` | Saves marks. Partial by design; `null` clears a cell |
| `POST` | `/api/faculty/marks/:assignmentId/submit` | Sends it up. Incomplete sheets are refused, and named |
| `POST` | `/api/faculty/marks/:assignmentId/decide` | HOD only: `APPROVE` or `RETURN` with a reason |
| `GET` | `/api/faculty/marks-pending` | HOD only: the approval queue, department-scoped |
| `GET` | `/api/faculty/mentees` | Mentees, with at-risk flags derived on read |
| `GET` | `/api/faculty/mentees/:studentId` | One mentee: subject attendance, internal marks, notes |
| `POST` | `/api/faculty/mentees/:studentId/notes` | Logs an interaction, and dates the pairing |
| `GET` | `/api/faculty/leaves` | Own applications, with approved days totalled |
| `POST` | `/api/faculty/leaves` | Applies. Overlapping a live application is a 409 |
| `POST` | `/api/faculty/leaves/:id/cancel` | Withdraws one, while still pending |
| `GET` | `/api/faculty/leaves-pending` | HOD only: the approval queue |
| `POST` | `/api/faculty/leaves/:id/decide` | HOD only. A rejection needs a reason |
| `GET` | `/api/faculty/materials` | Study material; `?code=` to filter |
| `POST` | `/api/faculty/materials` | Files one. Metadata only — the bytes live at `url` |
| `PATCH` | `/api/faculty/materials/:id` | Renames it or pulls it back from students |
| `DELETE` | `/api/faculty/materials/:id` | Removes it |

## Endpoints (Phase 3 — the college office)

Gated to `OFFICE`, `REGISTRAR` and `ADMIN`. Everything here is signed, so each
write records which clerk did it.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/office/admissions` | The queue; `?status=`, `?q=` |
| `GET` | `/api/office/admissions/:id` | One application and its checklist |
| `POST` | `/api/office/admissions` | Opens an application and writes its checklist |
| `PATCH` | `/api/office/admissions/:id/documents/:docId` | Received, verified, or queried |
| `POST` | `/api/office/admissions/:id/enrol` | Turns a verified candidate into a student |
| `POST` | `/api/office/admissions/:id/reject` | With a reason |
| `GET` | `/api/office/counter` | The day book; `?date=` |
| `GET` | `/api/office/counter/student` | `?q=` by enrolment no, roll no or name |
| `POST` | `/api/office/counter` | Takes money and writes the ledger entry |
| `POST` | `/api/office/counter/:id/settle` | Clears or bounces a cheque or draft |
| `GET` | `/api/office/certificates` | The queue; `?stage=`, `?open=true` |
| `POST` | `/api/office/certificates/:id/advance` | Moves a stage, or rejects with a reason |
| `POST` | `/api/office/certificates/:id/fee` | Marks the fee received |
| `GET` | `/api/office/exam-forms` | Scrutiny list; `?eligibility=`, `?semester=` |
| `POST` | `/api/office/exam-forms/:id/decide` | `CLEAR` or `HOLD` |
| `GET` | `/api/student/certificates` | The student's own requests |
| `POST` | `/api/student/certificates` | Asks for one |

## Endpoints (Phase 4 — the examination back-office)

Gated to `REGISTRAR` and `ADMIN`. What a student sees of this — their result,
their revaluation — comes through the student routes, and only after the
sitting is published.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/exam/sessions` | Every sitting, with where each has got to |
| `GET` | `/api/exam/sessions/:id` | One sitting, its papers, and evaluation progress |
| `POST` | `/api/exam/sessions/:id/status` | Moves it on; each step is gated on the work it needs |
| `POST` | `/api/exam/sessions/:id/papers` | Schedules a subject's paper |
| `POST` | `/api/exam/papers/:id/dispatch` | Question papers out to centres |
| `GET` | `/api/exam/centres` | Halls and how full each is; `?sessionId=` |
| `PATCH` | `/api/exam/centres/:code` | Adjusts capacity; never below what is seated |
| `POST` | `/api/exam/sessions/:id/allocate` | Seats cleared candidates at a centre |
| `GET` | `/api/exam/sessions/:id/allocations` | The seating list; `?centreCode=` |
| `POST` | `/api/exam/papers/:id/bundles` | Makes up a bundle for one examiner |
| `GET` | `/api/exam/bundles/:id` | The foil, with every reading so far |
| `POST` | `/api/exam/bundles/:id/marks` | Enters that examiner's readings |
| `GET` | `/api/exam/sessions/:id/flagged` | Scripts waiting on a moderator |
| `POST` | `/api/exam/scripts/:id/moderate` | A moderator's reading, which settles it |
| `POST` | `/api/exam/sessions/:id/process` | Computes the results, under embargo |
| `GET` | `/api/exam/sessions/:id/results` | The provisional list |
| `GET` | `/api/exam/revaluations` | The queue; `?status=` |
| `POST` | `/api/exam/revaluations/:id/fee` | Records the fee, which starts the reading |
| `POST` | `/api/exam/revaluations/:id/complete` | Records the re-reading |
| `POST` | `/api/student/revaluations` | A student challenges a published mark |

## Endpoints (Phase 5 — governance)

Gated to `PRINCIPAL`, `REGISTRAR` and `ADMIN`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/governance/dashboard` | The college at a glance, every figure counted live |
| `GET` | `/api/governance/workload` | Teaching load against what each post is sanctioned |
| `GET` | `/api/governance/approvals` | One inbox over leave, marks and governance requests |
| `POST` | `/api/governance/approvals/:type/:id/decide` | Routed to the module that owns the record |
| `POST` | `/api/governance/requests` | Raises a budget, event, building or policy item |
| `GET` | `/api/governance/compliance` | The affiliation file |
| `PATCH` | `/api/governance/compliance/:code` | Records a review of one requirement |

## Endpoints (Phase 6 — accreditation)

Gated to `PRINCIPAL`, `REGISTRAR` and `ADMIN`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/accreditation/frameworks` | NAAC, NIRF, AISHE, UGC, with readiness and gaps |
| `GET` | `/api/accreditation/:code/metrics` | The register; derived answers computed now |
| `PATCH` | `/api/accreditation/metrics/:id` | Enters an answer, or attaches evidence |
| `GET` | `/api/accreditation/derivations` | Every computation, its value and what uses it |
| `GET` | `/api/accreditation/returns` | The statutory calendar |
| `POST` | `/api/accreditation/returns/:code/submit` | Files one against its acknowledgement |

## Endpoints (Phase 7 — procurement)

Gated to `PRINCIPAL`, `REGISTRAR` and `ADMIN`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/procurement/vendors` | The register; `?status=`, `?category=` |
| `POST` | `/api/procurement/vendors` | Registers a supplier |
| `POST` | `/api/procurement/vendors/:id/status` | Empanels, suspends or blacklists |
| `GET` | `/api/procurement/tenders` | Tenders and their bids, under the two-envelope rule |
| `POST` | `/api/procurement/tenders` | Drafts one |
| `POST` | `/api/procurement/tenders/:id/publish` | Floats it, against the sanction behind it |
| `POST` | `/api/procurement/tenders/:id/corrigendum` | Amends it; may extend the deadline, not shorten it |
| `POST` | `/api/procurement/tenders/:id/bids` | Lodges a sealed bid |
| `POST` | `/api/procurement/bids/:id/technical` | Scores the technical envelope |
| `POST` | `/api/procurement/tenders/:id/open-financials` | Closes the technical stage and discloses the quotes |
| `POST` | `/api/procurement/tenders/:id/award` | Awards it and raises the purchase order |
| `GET` | `/api/procurement/orders` | Orders, with what is outstanding on each |
| `POST` | `/api/procurement/orders/:id/advance` | Moves an order along one stage |

## Endpoints (Phase 8 — right to information)

Gated to `PRINCIPAL`, `REGISTRAR` and `ADMIN`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/rti/exemptions` | The clauses of Section 8, and the statutory periods |
| `GET` | `/api/rti/applications` | The register against the clock; `?status=`, `?overdue=true` |
| `POST` | `/api/rti/applications` | Registers one; needs the fee or the exemption |
| `POST` | `/api/rti/applications/:id/assign` | Names the public information officer |
| `POST` | `/api/rti/applications/:id/reply` | Supplies the information |
| `POST` | `/api/rti/applications/:id/reject` | Refuses it, on a cited clause of Section 8 |
| `POST` | `/api/rti/applications/:id/transfer` | Section 6(3), inside five days |
| `POST` | `/api/rti/applications/:id/appeals` | Files a first or Commission appeal |
| `POST` | `/api/rti/appeals/:id/decide` | Decides one |

## Endpoints (Phase 9 — the IT console)

Gated to `ADMIN` and `REGISTRAR`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/it/users` | Every account, its status and failed attempts |
| `POST` | `/api/it/users/:id/lock` | Locks or unlocks; a lock revokes live sessions |
| `POST` | `/api/it/users/:id/reset-password` | Issues a temporary password |
| `GET` | `/api/it/permissions` | The matrix, and the modules it can speak about |
| `PUT` | `/api/it/permissions` | Sets one line of it |
| `GET` | `/api/it/audit` | The log; `?module=`, `?outcome=`, `?limit=` |
| `GET` | `/api/it/audit/verify` | Walks the chain and reports the first break |

### Three rules worth knowing about the console

**A lock is a lock.** The sign-in path checks it, and locking revokes every
live session at the same moment — an account that can keep working until its
token happens to expire has not been locked. Locking needs a reason on file,
and an administrator cannot lock the account they are signed in with.

**The matrix withholds; it does not grant.** A role with no rule for a module
is allowed, so the matrix is somewhere to take a module *away* rather than a
list that must be complete before anything works — and adding a module cannot
accidentally lock everyone out of it. The route guards read it on every
request, so revoking `Examinations` from `REGISTRAR` refuses the very next
call. An administrator cannot be denied `System Config`, because a console
that can lock itself out is a console that can brick itself.

**The audit log is chained and written by the modules.** Every entry carries
the hash of the one before it, over its own fields, so altering or removing
any entry breaks every hash after it — and `verify` walks the chain to say
exactly where. Nothing is written by hand: publishing results, taking money at
the counter, awarding a tender above L1, refusing an RTI request and being
refused by the permission matrix all record themselves as they happen. The
audit writer never throws, because a lost line is bad but a refused fee
receipt because the log hiccuped is worse.

### Three rules the Act sets, not the office

**Silence is a decision.** Thirty days from receipt is statutory, computed from
the date on every read rather than stored. When the period lapses with nothing
sent, the register reports a **deemed refusal** — because that is what the Act
calls it, and an appeal lies against it. An applicant is never left without a
remedy because nobody answered.

**A refusal must cite its clause.** Information may be withheld only on a
ground in Section 8(1), and only on one the Act actually contains — a refusal
resting on nothing is not a refusal the applicant can appeal. The clause is
stored and read back with the text it stands for.

**The appeal tiers run in order.** A first appeal lies against a decision *or*
against silence; a Commission appeal only once the first has been decided. An
appeal that succeeds puts the application back on the officer rather than
closing it, and one that fails closes it.

Two smaller ones: a below-poverty-line applicant is charged nothing, for the
application or per page, and Section 6(3) allows five days to pass an
application to the authority that actually holds it — after that the register
refuses, because a transfer made late is the applicant's time spent for
nothing.

### Three rules worth knowing about procurement

**A tender needs its sanction.** Publishing requires an *approved* governance
request from Phase 5, and the estimate may not exceed the amount sanctioned —
a tender floated against nothing is how a commitment outruns the decision to
make it.

**The financial envelope stays sealed.** A quote is stored when the bid is
lodged but is disclosed by **no read** until the technical stage closes — not
hidden in the client, withheld by the server, and not even echoed back to the
call that lodged it. Whoever scores the technical bid must not know what it
would cost. Opening the envelopes is refused while any bid is unscored, and
the lowest qualified quote is then computed rather than nominated. Awarding
above it is allowed, but demands a written justification.

**Only an empanelled supplier may bid,** and empanelment that has lapsed is as
good as none. Empanelment itself is refused until the documents are verified,
and striking a supplier off needs a reason on file.

### Two rules worth knowing about the register

**A metric says where its answer came from.** Each one is `DERIVED` (computed
from the college's own rows on every read), `ENTERED` (typed in, because the
system does not hold what the framework asks), or `UNAVAILABLE` (nothing
answers it yet). A derived answer carries the *basis* it was computed from —
"13 students against 6 teaching posts" — because the first question an
assessor asks is never the number, it is where the number came from. Several
questions lean on the same figure, so each computation runs once per request.

**A derived figure cannot be typed over.** Hand-entering a number the system
computes is exactly how a file stops matching the records behind it, so it is
refused and the error names the computation. Evidence and remarks can still be
attached, because a computation cannot supply those. Filling a gap by hand
moves the framework's readiness, and a framework that asks no metrics at all
reports `readiness: null` rather than nought.

### Two rules worth knowing here

**Governance stores almost nothing.** The dashboard and the approval inbox are
computed on read from the phases below — attendance from marked sessions,
money from the one fee ledger, results from published sittings, pending work
from the faculty domain. A leave approved in the principal's inbox is approved
through the same code path the head of department uses, so it is one record
and not a copy. Only the compliance file and the requests that are neither
leave nor marks are tables of their own.

**A tick has to point at something.** Marking a requirement compliant is
refused unless it carries the evidence that makes it so, and the dashboard's
affiliation summary reads that file rather than a stored status.

### Three rules worth knowing, again

**Two examiners who disagree are not averaged.** A script read twice is settled
at the mean only while the two readings sit within tolerance — 15% of the
paper. Beyond that, averaging would invent a mark neither examiner gave, so
the script is flagged and waits for a moderator, whose reading then stands
alone. Evaluation cannot close while any script is unsettled.

**A result is computed before it is released.** Processing writes
`SemesterResult` rows with `published: false`; the student portal filters on
that, so the embargo is real rather than a convention. Publishing the sitting
lifts it for everyone at once and notifies them. Processing is re-runnable —
it replaces the sitting's results — because a late moderation should change
the answer.

**This is where the phases meet.** A result's internal marks come from the
sheet a lecturer filled and a head of department *approved* in Phase 2 — a
draft is nobody's signed number, so it does not count. Its external marks come
from settled scripts. Only candidates whose examination form the college
office cleared in Phase 3 are ever seated. And the row it writes is the one
the student portal has been reading since Phase 1.

### Three more rules worth knowing

**There is one fee ledger.** A payment taken at the counter writes a `Payment`
in the same transaction as the receipt, so it lands on the student's own fee
screen immediately. A cheque or demand draft is recorded as *pending
clearance* and moves no balance until it settles — the money is not in the
account yet — and a bounced one notifies the student.

**Enrolling is a deliberate step.** An application becomes a `Student` only
when every required document is verified, and that step creates the sign-in,
the record and the first-semester enrolments in one transaction. Which papers
a candidate owes is written at intake, so editing the standard list later
cannot change what was asked of someone already admitted.

**Scrutiny reads the record, it does not copy it.** Exam-form eligibility is
recomputed from live attendance and the live ledger on every read. The stored
value is what a clerk *decided*; when the two disagree the row is flagged
`stale`. Clearing a form the record says is short is allowed — a medical
exemption is a real thing — but it demands a written remark.

### Three rules worth knowing

**Attendance locks after 24 hours.** A saved roll call stays editable for a
day; after that the only thing that can move a record is an approved
correction, which is what makes the audit trail worth keeping. Approval
rewrites the record and closes the request in one transaction, so the
percentage the student sees and the decision the lecturer made cannot
disagree — and the lecturer's roster and the student's own portal are computed
by the same rule, from the same rows.

**Marks need a second signature.** `NOT_STARTED → DRAFT → SUBMITTED →
APPROVED`, or back to `RETURNED` with a reason that reopens it. A sheet
missing any mark cannot be submitted, and the error names who is missing. A
lecturer cannot approve their own sheet even if they hold the HOD flag.

**The teaching assignment is the unit, not the subject.** Rosters, registers
and marks sheets all hang off `SubjectAssignment` (lecturer × subject × term ×
section), so two sections of the same paper never share a sheet.

## Endpoints (Phase 10 — the intelligence layer)

Gated to `FACULTY`, `PRINCIPAL`, `REGISTRAR` and `ADMIN`. A lecturer is
scoped to their own mentees; everyone above sees the college.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/intelligence/risk` | The cohort scored, worst first; `?band=` |
| `GET` | `/api/intelligence/risk/:studentId` | One student: factors, movement, history, interventions |
| `POST` | `/api/intelligence/risk/snapshot` | Records today's scores; principal and above |
| `GET` | `/api/intelligence/projection` | The term projected from approved internals |
| `GET` | `/api/intelligence/cohort` | Bands, the attendance histogram, subject pass rates |
| `POST` | `/api/intelligence/interventions` | Raises one against a student in your cohort |
| `POST` | `/api/intelligence/interventions/:id/close` | Closes it with an outcome |

### What the model is, stated plainly

**It is a weighted score, not a prediction, and not machine learning.**
Attendance carries 0.4, results 0.25, backlogs 0.2 and fee arrears 0.15, and
every factor comes back with the weight it carried and the number it
contributed — which sum to the score exactly. A score nobody can argue with is
a score nobody should trust, so the response publishes the weights next to the
answer and the screen shows the working.

**It reports how much record it had, not a confidence percentage.** A score
resting on twelve marked classes says twelve; it does not convert that into a
number that looks like statistics and is not. Attendance runs linearly from
the 75% threshold down to the debarment line, so a student a little short is
not treated as one who has stopped coming.

**It reads the same rows everyone else does.** A student the model calls at
risk on attendance sees that same figure in their own app — the suite asserts
it, because a console that disagrees with the portal is worse than no console.

**A projection says how much of the term it rests on.** It extrapolates
internal marks a head of department has *approved* — a draft sheet is nobody's
signed number — and every row states the share of the student's subjects that
has a sheet behind it, so a projection from one paper is visibly weaker than
one from a full set.

**Snapshots are what make movement real.** Scores are computed live, so
without a snapshot there is no way to say later whether anything helped. An
intervention keeps the score it was raised at; closing it reports what the
score has done since, so the claim in the outcome note can be checked against
the record rather than taken on trust.

## Authentication

Access tokens are JWTs, valid 15 minutes. Refresh tokens are opaque random
strings, stored only as SHA-256 hashes, valid 30 days.

Rotation is enforced: every refresh consumes the old token and issues a new
one. Presenting an already-rotated token revokes the **entire token family** —
either it leaked or a client is replaying, and in both cases the chain should
die rather than continue. The web client keeps its refresh token in a httpOnly
cookie; React Native has no cookie jar, so it receives the same token in the
JSON body and stores it in `expo-secure-store`.

### Who can read whose record

`resolveStudentId` decides this, and it is the important security boundary:

- A **student** always resolves to themselves. The id is never read from the
  URL, so passing someone else's `studentId` returns your own record, not
  theirs.
- A **parent** must pass `?studentId=` and is checked against guardianship —
  reading a student who is not their ward is a 403.
- **Staff** roles may pass any `studentId`.

`resolveFacultyId` is the same boundary on the staff side: a lecturer always
resolves to themselves, so no faculty route can be pointed at a colleague by
editing a URL. Only `ADMIN` may pass `?facultyId=`.

Role guards (`requireRole`) sit on top for staff-only routes such as rotating
a QR code, and `requireHod` gates the two approval steps — marks and leave —
which are additionally checked against the approver's own department.

## Testing

```bash
npm run test:smoke
```

702 assertions over the Phase 1 to 10 surface, including the paths that must
fail: bad credentials, missing and malformed tokens, cross-student
access, replayed refresh tokens, double-marked attendance, double-paid
instalments, a lecturer reaching into a colleague's roster, register, marks
sheet or mentee, editing a locked attendance sheet, submitting an incomplete
marks sheet, approving one's own marks or leave, overlapping leave, verifying
a document nobody produced, enrolling a candidate whose papers are not
verified, taking a cheque without its number, issuing a certificate unpaid,
skipping a stage in the certificate queue, clearing a short exam form
without a written reason, over-filling an examination hall, marking a
candidate who was never seated, closing evaluation with a script still
disputed, reading an embargoed result from the student portal, deciding the
same application twice from two different portals, ticking a compliance
requirement with no evidence behind it, typing over a metric the system
computes, scoring above a framework's maximum, filing the same statutory
return twice, bidding while blacklisted or with lapsed empanelment, opening
financial envelopes before every bid is scored, awarding above the lowest
quote without a justification, calling a short delivery complete, passing
a bill on goods nobody inspected, refusing information without citing a clause
of Section 8, appealing an application still within time, transferring one
after the five days the Act allows, signing in to a locked account, renewing a
session after the account was locked, an administrator locking themselves out,
reaching a module the permission matrix withholds, a lecturer opening a
student they do not mentor or raising an intervention against one, raising a
second intervention of a kind while the first is still open, closing the same
intervention twice, and a lecturer taking a snapshot of the cohort.

The intelligence assertions check the arithmetic rather than the shape: that
the factor contributions sum to the score, that the attendance the model
scored is the attendance the student's own portal shows, that the model scores
everyone the principal's dashboard counts, and that a snapshot taken a moment
ago reports the score as unchanged rather than improved.

The suite **mutates data** (it pays an instalment and marks attendance), which
is why `test:smoke` reseeds first. Running `node scripts/smoke.mjs` twice
without reseeding will fail on the second pass — that is the suite being
honest, not a regression.

## Switching database

Nothing in the code names a host. Change `DATABASE_URL` in `.env` and run the
migrations again.

```bash
# Neon
DATABASE_URL="postgresql://USER:PASSWORD@ep-xxx.region.aws.neon.tech/campusos?sslmode=require"

# Supabase
DATABASE_URL="postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres"
```

Then `npm run db:migrate && npm run db:seed`. You no longer need `db:start` —
that script only exists to provide a local Postgres on a machine without one.

> **Encoding matters.** The database must be UTF8. The app ships Hindi copy,
> and a WIN1252 database (which is what `initdb` produces by default on a
> Windows host) rejects Devanagari with *"no equivalent in encoding"*.
> `db:start` creates the database explicitly as UTF8 from `template0`; hosted
> providers are UTF8 already.

## Layout

```
prisma/
  schema.prisma       Phase 1: auth + the student domain; Phase 2: faculty
  migrations/         Applied migrations
  seed.ts             Demo data, idempotent
scripts/
  pg.ts               The bundled local Postgres
  smoke.mjs           End-to-end test suite
src/
  index.ts            Bootstrap; fails fast if the DB is unreachable
  app.ts              Middleware and route mounting
  env.ts              Environment parsed and validated with zod
  db.ts               Prisma client over the pg driver adapter
  lib/http.ts         ApiError, asyncHandler, validate, error handler
  auth/
    tokens.ts         Signing, rotation, family revocation
    middleware.ts     requireAuth, requireRole, requireHod,
                      resolveStudentId, resolveFacultyId
    routes.ts         login / refresh / logout / me
  modules/
    intelligence/
      index.ts        Risk, projection, cohort shape, interventions, snapshots
      scoring.ts      The weights, the factors, and what a projection rests on
    student.ts        Profile, attendance, timetable, results, transport, notifications
    fees.ts           Fee ledger and payment
    attendance.ts     QR sessions, marking, student-raised corrections
    announcements.ts  Notice board
    itconsole/
      index.ts        Accounts, the permission matrix and the audit log
      audit.ts        The hash chain, the writer, and chain verification
      permissions.ts  The matrix and the guard the routers consult
    rti/
      index.ts        The register, the statutory clock, exemptions and appeals
    procurement/
      index.ts        Vendors, two-envelope tendering, award, purchase orders
    accreditation/
      index.ts        The register, the readiness figures and the calendar
      derivations.ts  What each metric can be computed from, and its basis
    governance/
      index.ts        The dashboard, workload, inbox and compliance file
    exam/
      index.ts        Mounts the four below behind one role gate
      shared.ts       Grading, grace, the moderation tolerance, script settling
      sessions.ts     The sitting's lifecycle and its papers
      centres.ts      Halls, capacity and seating
      evaluation.ts   Bundles, readings, flagging and moderation
      results.ts      Processing under embargo, and revaluation
    office/
      index.ts        Mounts the four below behind one role gate
      shared.ts       resolveStaffId, the document list, certificate standards
      admissions.ts   The checklist, verification, and enrolling a candidate
      counter.ts      Taking money, and clearing what has not settled
      certificates.ts The queue and its stages, plus the student's own side
      examforms.ts    Eligibility recomputed from attendance and dues
    faculty/
      index.ts        Mounts the six below behind one role gate
      shared.ts       Ownership checks, the lock clock, attendance derivation
      profile.ts      Identity, teaching load, timetable, opening a roll call
      attendance.ts   The sheet, the register, deciding corrections
      marks.ts        Components, entries, and the approval chain
      mentoring.ts    Mentees, derived risk flags, interaction notes
      leave.ts        Applying, cancelling, approving
      materials.ts    Study material metadata
```

## Phases

**Phase 1 (done)** — authentication and the student domain: everything the
mobile app needs, and the student portal on web.

**Phase 2 (done)** — the faculty domain: teaching load and timetable,
attendance marking with a 24-hour lock, the correction workflow that is the
only way past it, internal marks with an HOD approval chain, mentoring with
derived risk flags, leave, and study material. Wired to the web faculty
portal; `src/lib/facultydata.ts` is gone.

**Phase 3 (done)** — the college office: admissions with a per-candidate
document checklist and enrolment, the fee counter writing to the one ledger,
the certificate queue with its service standards, and examination-form
scrutiny computed from live attendance and dues. Wired to the four web office screens;
`officedata.ts` now serves only the governance portal.

**Phase 4 (done)** — the examination back-office: sittings and their
lifecycle, centres and seating, double valuation with moderation, result
processing under embargo, and revaluation that rewrites the marksheet it
changes. Backend only; the web back-office screens still read
`src/lib/examdata.ts` for the parts with no endpoint.

**Phase 5 (done)** — governance: the principal's dashboard and a single
approval inbox, both aggregated from the phases below rather than stored
again, plus teaching workload and the affiliation compliance file. Backend
only; the four web principal screens still read `src/lib/officedata.ts`.

**Phase 6 (done)** — accreditation: the NAAC, NIRF, AISHE and UGC register,
where every metric declares whether its answer is computed from the records or
typed in, plus the statutory returns calendar. Backend only.

**Phase 7 (done)** — procurement: vendor empanelment, two-envelope tendering
against a sanctioned request, award, and the purchase order through delivery,
inspection, bill and payment. Backend only.

**Phase 8 (done)** — right to information: applications against the statutory
thirty-day clock, Section 8 exemptions that a refusal must cite, deemed
refusal when the period lapses, and the two-tier appeal. Backend only.

**Phase 9 (done)** — the IT console: account administration where a lock
really stops a sign-in, a permission matrix the route guards consult on every
request, and a hash-chained audit log the modules write as they act. Backend
only.

**Phase 10 (done)** — the intelligence layer: a transparent weighted risk
score with its factors and weights returned beside it, a term projection from
approved internals that states the share it rests on, the cohort's shape, and
the intervention loop that gives the score somewhere to go. Reporting over
every phase above, which is why it came last. Wired to the at-risk and term
projection screens on the web.

All ten phases are built. What remains is not a phase: a handful of web
screens still read `src/lib/*.ts` fixtures for parts with no endpoint behind
them — hall tickets and confidential dispatch, degree and convocation, the
`acadops` duplicates, the console's organisation and workflow groups, and the
intelligence layer's reading list and chat assistant. Each says so on screen or
at its import site rather than pretending the data is live.
