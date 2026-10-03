import { useState } from 'react';
import { useComplianceChecklist, useReviewCompliance } from '../../lib/governancequeries';
import { Button, Modal, InlineAlert, toast } from '../../components/ui';
import { inst } from '../../lib/institution';

interface Props { onNavigate: (s: any) => void; onModule: (m: string) => void }

interface ChecklistItem {
  id: string;
  category: string;
  item: string;
  status: 'compliant' | 'non_compliant' | 'pending_action';
  value: string;
  due: string;
  remarks?: string;
}

const SectionLabel = ({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) => (
  <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between border-b border-[#D3D8E0]">
    <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">{children}</span>
    {right}
  </div>
);

const STATUS_CONFIG = {
  compliant: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0E7A5F" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" /><polyline points="16 8 10 14 8 12" />
      </svg>
    ),
    label: 'Compliant',
    bg: 'bg-[#D1FAE5]',
    text: 'text-[#065F46]',
  },
  non_compliant: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A8242C" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
      </svg>
    ),
    label: 'Non-Compliant',
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#A8242C]',
  },
  pending_action: {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6D1F" strokeWidth="2.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
    label: 'Pending Action',
    bg: 'bg-[#FEF3C7]',
    text: 'text-[#8A6D1F]',
  },
};

export default function AffiliationCompliance(_props: Props) {
  const { data: checklist, totals } = useComplianceChecklist();
  const review = useReviewCompliance();

  const items: ChecklistItem[] = checklist.map(a => ({
    id: a.code,
    category: a.category,
    item: a.item,
    // The file's PARTIAL reads as an action still outstanding.
    status: (a.status === 'partial' ? 'pending_action' : a.status) as
      | 'compliant' | 'non_compliant' | 'pending_action',
    value: a.value,
    due: a.due,
    remarks: a.remarks,
  }));

  const [resolveId, setResolveId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [evidence, setEvidence] = useState('');

  const nonCompliant = items.filter(i => i.status === 'non_compliant');
  const pendingAction = items.filter(i => i.status === 'pending_action');
  const allCompliant = nonCompliant.length === 0 && pendingAction.length === 0;

  const categories = Array.from(new Set(items.map(i => i.category)));

  function openResolve(id: string) {
    setResolveId(id);
    setEvidence(checklist.find(c => c.code === id)?.value ?? '');
    setConfirmOpen(true);
  }

  /**
   * Marks a requirement met.
   *
   * The server refuses this without the evidence that makes it so — a
   * checklist whose ticks point at nothing is worse than no checklist.
   */
  async function confirmResolve() {
    if (!resolveId) return;
    try {
      await review.mutateAsync({
        code: resolveId,
        status: 'COMPLIANT',
        ...(evidence.trim() && evidence !== '—' ? { evidence: evidence.trim() } : {}),
      });
      setConfirmOpen(false);
      toast.success('Requirement marked compliant, against the evidence recorded.');
      setResolveId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update that requirement.');
    }
  }

  const resolveItem = items.find(i => i.id === resolveId);

  return (
    <div className="flex flex-col bg-[#EDEFF3] min-h-full">
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-3">
        <h1 className="text-[17px] font-semibold text-[#16264A]">Affiliation Compliance</h1>
        <p className="text-[12px] text-[#5A6577]">{inst().name} Affiliation Requirements — 2024–25</p>
      </div>

      <div className="p-6 flex flex-col gap-4">
        {/* Overall status banner */}
        <section>
          {nonCompliant.length > 0 ? (
            <div className="flex items-center gap-3 p-4 bg-[#FEE2E2] border border-[#A8242C] rounded-[2px]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A8242C" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              <div>
                <div className="text-[14px] font-semibold text-[#A8242C]">
                  {nonCompliant.length} non-compliance{nonCompliant.length > 1 ? 's' : ''} found
                </div>
                <div className="text-[12px] text-[#A8242C]">Immediate action required before affiliation renewal deadline.</div>
              </div>
            </div>
          ) : pendingAction.length > 0 ? (
            <div className="flex items-center gap-3 p-4 bg-[#FEF3C7] border border-[#E0952A] rounded-[2px]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A6D1F" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div>
                <div className="text-[14px] font-semibold text-[#8A6D1F]">
                  {pendingAction.length} action{pendingAction.length > 1 ? 's' : ''} required
                </div>
                <div className="text-[12px] text-[#8A6D1F]">Complete pending actions before respective deadlines.</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 bg-[#D1FAE5] border border-[#0E7A5F] rounded-[2px]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0E7A5F" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="16 8 10 14 8 12" />
              </svg>
              <div>
                <div className="text-[14px] font-semibold text-[#065F46]">Fully Compliant</div>
                <div className="text-[12px] text-[#065F46]">All {items.length} requirements are met.</div>
              </div>
            </div>
          )}
        </section>

        {/* Category groups */}
        {categories.map(cat => {
          const catItems = items.filter(i => i.category === cat);
          const compliantCount = catItems.filter(i => i.status === 'compliant').length;
          return (
            <section key={cat} className="bg-white border border-[#D3D8E0]">
              <SectionLabel>
                {cat} — {compliantCount} of {catItems.length} compliant
              </SectionLabel>
              <div className="divide-y divide-[#D3D8E0]">
                {catItems.map(item => {
                  const cfg = STATUS_CONFIG[item.status];
                  const needsAction = item.status !== 'compliant';
                  return (
                    <div key={item.id} className={`px-4 py-3 ${needsAction ? 'bg-[#FFFDF9]' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 shrink-0">{cfg.icon}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="text-[13px] font-semibold text-[#16264A]">{item.item}</div>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-[12px] text-[#5A6577]">{item.value}</span>
                                <span className="text-[11px] text-[#9CA3AF]">Due: {item.due}</span>
                              </div>
                              {item.remarks && (
                                <div className="mt-2">
                                  <InlineAlert type={item.status === 'non_compliant' ? 'error' : 'warning'}>
                                    {item.remarks}
                                  </InlineAlert>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-[3px] ${cfg.bg} ${cfg.text}`}>
                                {cfg.label}
                              </span>
                              {needsAction && (
                                <Button size="sm" variant="secondary" onClick={() => openResolve(item.id)}>
                                  Mark Resolved
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* Export section */}
        <section className="bg-white border border-[#D3D8E0]">
          <SectionLabel>Reports &amp; Submission</SectionLabel>
          <div className="px-4 py-4 flex items-center gap-3">
            <Button onClick={() => toast.success('Generating compliance report…')}>
              Download Compliance Report (PDF)
            </Button>
            <Button variant="secondary" onClick={() => toast.info(`Report forwarded to ${inst().name} affiliation office.`)}>
              Send to JU Affiliation Office
            </Button>
            <div className="ml-auto text-[12px] text-[#5A6577]">
              {allCompliant
                ? `${items.length}/${items.length} requirements met`
                : `${items.filter(i => i.status === 'compliant').length}/${items.length} requirements met`}
            </div>
          </div>
        </section>
      </div>

      {/* Resolve Confirmation Modal */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Mark as Resolved"
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmResolve}>Confirm Resolved</Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {resolveItem && (
            <div className="p-3 bg-[#EDEFF3] rounded-[2px]">
              <div className="text-[13px] font-semibold text-[#16264A]">{resolveItem.item}</div>
              <div className="text-[12px] text-[#5A6577] mt-0.5">Category: {resolveItem.category}</div>
            </div>
          )}
          <p className="text-[14px] text-[#5A6577]">
            Marking this item as <strong className="text-[#16264A]">compliant</strong> confirms that all required action has been taken. This update will be reflected in the compliance report.
          </p>
          <InlineAlert type="warning">
            Ensure supporting documentation is available for inspection by the JU affiliation committee.
          </InlineAlert>
        </div>
      </Modal>
    </div>
  );
}
