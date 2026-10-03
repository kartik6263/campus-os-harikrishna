import { useState } from 'react';
import { useLang } from '../lib/language';
import {
  Button, Input, Select, StatusPill, Tabs, Breadcrumb, Modal, Drawer,
  InlineAlert, Skeleton, SkeletonRow, EmptyState, PermissionDenied,
  Stepper, Timeline, VerifiedSeal, DataTable, Toggle, Checkbox, OtpInput,
  Avatar, Tooltip, NotificationItem, RecordBand, Spinner, ToastContainer, toast
} from '../components/ui';
import type { Screen } from '../lib/data';
import { inst } from '../lib/institution';

interface Props { onNavigate: (s: Screen) => void; }

const SECTIONS = ['Buttons', 'Inputs', 'Status', 'Tables', 'Feedback', 'Navigation', 'Overlays', 'Data Display', 'Forms'];

export default function ComponentIndex({ onNavigate }: Props) {
  const { lang, toggle, t } = useLang();
  const [activeSection, setActiveSection] = useState('Buttons');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabId, setTabId] = useState('tab1');
  const [toggleOn, setToggleOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [otp, setOtp] = useState('');
  const [inputVal, setInputVal] = useState('');
  const [inputErr, setInputErr] = useState('');

  const demoData = [
    { id: 'JU2021CS0234', name: 'Priya Sharma', college: 'Govt. Women’s College, Demo City', programme: 'B.Sc. CS', semester: 6, fee: '₹12,500', feeStatus: 'paid', result: 'Pass', cgpa: '8.4' },
    { id: 'JU2022BA0891', name: 'Rahul Verma', college: 'Govt. DC, Northfield', programme: 'B.A. Hindi', semester: 4, fee: '₹8,200', feeStatus: 'pending', result: 'Pass', cgpa: '7.1' },
    { id: 'JU2020CO0045', name: 'Sunita Patel', college: 'Govt. Girls College', programme: 'B.Com. Hons.', semester: 8, fee: '₹10,000', feeStatus: 'overdue', result: 'Distinction', cgpa: '9.1' },
  ];

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div className="mb-10" id={title}>
        <h2 className="text-h3 font-semibold text-[#16264A] mb-4 pb-2 border-b border-[#D3D8E0]">{title}</h2>
        {children}
      </div>
    );
  }

  function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-[12px] text-[#5A6577] w-28 shrink-0">{label}</span>
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EDEFF3]">
      <ToastContainer />
      {/* Header */}
      <header className="h-14 bg-white border-b border-[#D3D8E0] px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate('landing')} className="flex items-center gap-2 cursor-pointer text-[#5A6577] hover:text-[#16264A]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <div className="w-7 h-7 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[11px]">{inst().shortCode}</div>
          <span className="text-[14px] font-semibold text-[#16264A]">Resolion Campus OS — Component Index</span>
        </div>
        <button onClick={toggle} className="text-[12px] font-semibold text-[#5A6577] border border-[#D3D8E0] rounded-[4px] px-2 py-1 cursor-pointer">{lang === 'en' ? 'हिं' : 'EN'}</button>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-48 shrink-0 bg-white border-r border-[#D3D8E0] sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto py-3">
          {SECTIONS.map(s => (
            <a key={s} href={`#${s}`} onClick={() => setActiveSection(s)}
              className={`block px-4 py-2 text-[13px] cursor-pointer ${activeSection === s ? 'text-[#E0952A] font-semibold bg-[#FEF9EC]' : 'text-[#16264A] hover:bg-[#EDEFF3]'}`}>
              {s}
            </a>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 p-8 max-w-5xl">

          <Section title="Buttons">
            <Row label="Primary">
              <Button>Primary</Button>
              <Button loading>Loading</Button>
              <Button disabled>Disabled</Button>
            </Row>
            <Row label="Secondary">
              <Button variant="secondary">Secondary</Button>
              <Button variant="secondary" loading>Loading</Button>
              <Button variant="secondary" disabled>Disabled</Button>
            </Row>
            <Row label="Ghost">
              <Button variant="ghost">Ghost</Button>
              <Button variant="ghost" disabled>Disabled</Button>
            </Row>
            <Row label="Destructive">
              <Button variant="destructive">Delete Record</Button>
              <Button variant="destructive" loading>Deleting</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
          </Section>

          <Section title="Inputs">
            <div className="grid grid-cols-2 gap-4 max-w-2xl">
              <Input label="Default" labelHi="डिफ़ॉल्ट" placeholder="Enter value" value={inputVal} onChange={e => setInputVal(e.target.value)} lang={lang} />
              <Input label="With Error" error="This field is required" value="" onChange={() => {}} />
              <Input label="With Hint" hint="Format: JU2021CS0234" placeholder="Enrolment number" value="" onChange={() => {}} />
              <Input label="Disabled" disabled value="Read-only value" onChange={() => {}} />
              <Select label="Select Input">
                <option>B.Sc. Computer Science</option>
                <option>B.A. Hindi Literature</option>
                <option>B.Com. (Hons.)</option>
              </Select>
              <div>
                <label className="text-[13px] font-medium text-[#16264A] block mb-1">OTP Input</label>
                <OtpInput value={otp} onChange={setOtp} />
              </div>
            </div>
          </Section>

          <Section title="Status">
            <Row label="Status Pills">
              <StatusPill status="approved" lang={lang} />
              <StatusPill status="pending" lang={lang} />
              <StatusPill status="rejected" lang={lang} />
              <StatusPill status="draft" lang={lang} />
              <StatusPill status="under-review" lang={lang} />
            </Row>
            <Row label="Compact">
              <StatusPill status="approved" lang={lang} compact />
              <StatusPill status="pending" lang={lang} compact />
              <StatusPill status="rejected" lang={lang} compact />
              <StatusPill status="paid" lang={lang} compact />
              <StatusPill status="overdue" lang={lang} compact />
            </Row>
            <Row label="Document">
              <StatusPill status="valid" lang={lang} />
              <StatusPill status="revoked" lang={lang} />
              <StatusPill status="tampered" lang={lang} />
            </Row>
          </Section>

          <Section title="Tables">
            <div className="border border-[#D3D8E0] rounded-[2px] overflow-hidden">
              <DataTable
                columns={[
                  { key: 'id', label: 'Enrolment', mono: true, width: '140px' },
                  { key: 'name', label: 'Name' },
                  { key: 'programme', label: 'Programme' },
                  { key: 'cgpa', label: 'CGPA', align: 'right' },
                  { key: 'feeStatus', label: 'Fee', render: (row: { id: string; feeStatus: string }) => <StatusPill status={row.feeStatus as 'paid'|'pending'|'overdue'} lang={lang} compact /> },
                ]}
                data={demoData}
                searchPlaceholder="Search students…"
              />
            </div>
          </Section>

          <Section title="Feedback">
            <Row label="Alerts">
              <div className="w-full flex flex-col gap-2 max-w-xl">
                <InlineAlert type="info">This is an informational alert.</InlineAlert>
                <InlineAlert type="success">Record saved successfully.</InlineAlert>
                <InlineAlert type="warning">Fee payment due in 3 days.</InlineAlert>
                <InlineAlert type="error">Verification failed. Record not found.</InlineAlert>
              </div>
            </Row>
            <Row label="Toast">
              <Button size="sm" onClick={() => toast.success('Marksheet uploaded successfully')}>Success Toast</Button>
              <Button size="sm" variant="secondary" onClick={() => toast.error('Upload failed. Try again.')}>Error Toast</Button>
              <Button size="sm" variant="ghost" onClick={() => toast.info('OTP sent to 98264 XXXXX')}>Info Toast</Button>
            </Row>
            <Row label="Empty State">
              <div className="border border-[#D3D8E0] rounded-[2px] w-full max-w-sm">
                <EmptyState title="No results found" description="Try adjusting your search or filters." action={<Button size="sm" variant="secondary">Clear filters</Button>} />
              </div>
            </Row>
            <Row label="Skeleton">
              <div className="w-full max-w-sm flex flex-col gap-1 border border-[#D3D8E0] rounded-[2px] p-3">
                <Skeleton className="w-3/4" height={20} />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            </Row>
            <Row label="Permission">
              <div className="border border-[#D3D8E0] rounded-[2px] w-full max-w-sm">
                <PermissionDenied role="Student" />
              </div>
            </Row>
          </Section>

          <Section title="Navigation">
            <Row label="Tabs">
              <Tabs tabs={[{id:'tab1',label:'Dashboard',labelHi:'डैशबोर्ड'},{id:'tab2',label:'Results',labelHi:'परिणाम'},{id:'tab3',label:'Fee',labelHi:'शुल्क'}]} activeId={tabId} onChange={setTabId} lang={lang} />
            </Row>
            <Row label="Breadcrumb">
              <Breadcrumb items={[{ label: 'Home', onClick: () => onNavigate('landing') }, { label: 'Students' }, { label: 'Priya Sharma' }]} />
            </Row>
            <Row label="Stepper">
              <div className="w-full max-w-lg">
                <Stepper steps={[{label:'Apply'},{label:'Documents'},{label:'Fee'},{label:'Allotment'}]} current={2} />
              </div>
            </Row>
            <Row label="Timeline">
              <div className="max-w-sm">
                <Timeline items={[
                  { label: 'Application submitted', date: '10-10-2024', by: 'Student', status: 'done' },
                  { label: 'Documents verified', date: '12-10-2024', by: 'Hostel Office', status: 'done' },
                  { label: 'Fee payment pending', date: '—', by: 'Accounts', status: 'current' },
                  { label: 'Room allotment', date: '—', by: 'Warden', status: 'pending' },
                ]} />
              </div>
            </Row>
          </Section>

          <Section title="Overlays">
            <Row label="Modal">
              <Button variant="secondary" onClick={() => setModalOpen(true)}>Open Modal</Button>
              <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Confirm Action"
                footer={<><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={() => setModalOpen(false)}>Confirm</Button></>}>
                <p className="text-[14px] text-[#5A6577]">Are you sure you want to proceed with this action? This cannot be undone.</p>
              </Modal>
            </Row>
            <Row label="Drawer">
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open Drawer</Button>
              <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Student Details">
                <p className="text-[14px] text-[#5A6577]">Drawer content goes here — typically a record detail view.</p>
              </Drawer>
            </Row>
          </Section>

          <Section title="Data Display">
            <Row label="Verified Seal">
              <VerifiedSeal size={48} />
              <VerifiedSeal size={64} />
              <VerifiedSeal size={80} />
            </Row>
            <Row label="Avatar">
              <Avatar name="Priya Sharma" size={32} />
              <Avatar name="Rahul Verma" size={40} />
              <Avatar name="Smt. Kavita Shrivastava" size={48} />
            </Row>
            <Row label="Tooltip">
              <Tooltip text="Enrolment number format: JU + Year + Course + Serial">
                <Button size="sm" variant="secondary">Hover me</Button>
              </Tooltip>
            </Row>
            <Row label="Notification">
              <div className="border border-[#D3D8E0] rounded-[2px] w-full max-w-sm overflow-hidden">
                <NotificationItem title="Marksheet for Sem 6 is now available" time="2 hours ago" read={false} />
                <NotificationItem title="Fee payment due: ₹12,500 before 30-11-2024" time="1 day ago" read={false} />
                <NotificationItem title="Hostel allotment confirmed" time="3 days ago" read={true} />
              </div>
            </Row>
            <Row label="Record Band">
              <div className="w-full max-w-2xl">
                <RecordBand title="Priya Sharma" subtitle="B.Sc. Computer Science · Govt. Women’s College, Demo City" id="JU2021CS0234"
                  meta={[{label:'Semester',value:'Sem 6'},{label:'Category',value:'OBC'},{label:'CGPA',value:'8.4'}]} />
              </div>
            </Row>
          </Section>

          <Section title="Forms">
            <Row label="Toggle">
              <Toggle on={toggleOn} onChange={setToggleOn} label="Enable notifications" />
            </Row>
            <Row label="Checkbox">
              <Checkbox label="I agree to the terms" checked={checked} onChange={setChecked} />
              <Checkbox label="Disabled checkbox" checked={true} onChange={() => {}} disabled />
            </Row>
            <Row label="Spinner">
              <Spinner size={16} />
              <Spinner size={24} color="#E0952A" />
              <Spinner size={32} color="#0E7A5F" />
            </Row>
          </Section>
        </main>
      </div>
    </div>
  );
}
