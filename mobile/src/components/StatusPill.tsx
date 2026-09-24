import { StyleSheet, View } from 'react-native';
import { radius } from '@/theme/tokens';
import { Text } from './Text';
import { useLang } from '@/lib/language';

export type StatusType =
  | 'approved'
  | 'pending'
  | 'rejected'
  | 'draft'
  | 'under-review'
  | 'paid'
  | 'overdue'
  | 'valid'
  | 'revoked'
  | 'tampered';

// Identical map to the web system so a status reads the same on both surfaces.
const STATUS: Record<StatusType, { bg: string; fg: string; dot: string; label: string; labelHi: string }> = {
  approved: { bg: '#D1FAE5', fg: '#0E7A5F', dot: '#0E7A5F', label: 'Approved', labelHi: 'स्वीकृत' },
  pending: { bg: '#FEF9EC', fg: '#8A6D1F', dot: '#E0952A', label: 'Pending', labelHi: 'लंबित' },
  rejected: { bg: '#FEE2E2', fg: '#A8242C', dot: '#A8242C', label: 'Rejected', labelHi: 'अस्वीकृत' },
  draft: { bg: '#F1F5F9', fg: '#5A6577', dot: '#94A3B8', label: 'Draft', labelHi: 'मसौदा' },
  'under-review': { bg: '#EFF6FF', fg: '#1D4ED8', dot: '#3B82F6', label: 'Under Review', labelHi: 'समीक्षाधीन' },
  paid: { bg: '#D1FAE5', fg: '#0E7A5F', dot: '#0E7A5F', label: 'Paid', labelHi: 'भुगतान हो गया' },
  overdue: { bg: '#FEE2E2', fg: '#A8242C', dot: '#A8242C', label: 'Overdue', labelHi: 'अतिदेय' },
  valid: { bg: '#D1FAE5', fg: '#0E7A5F', dot: '#0E7A5F', label: 'Valid', labelHi: 'वैध' },
  revoked: { bg: '#FEE2E2', fg: '#A8242C', dot: '#A8242C', label: 'Revoked', labelHi: 'रद्द' },
  tampered: { bg: '#FEE2E2', fg: '#A8242C', dot: '#A8242C', label: 'Tampered', labelHi: 'छेड़छाड़' },
};

export function StatusPill({
  status,
  compact,
  label,
}: {
  status: StatusType;
  compact?: boolean;
  label?: string;
}) {
  const { lang } = useLang();
  const cfg = STATUS[status];
  const text = label ?? (lang === 'hi' ? cfg.labelHi : cfg.label);

  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: cfg.bg },
        compact ? styles.compact : styles.regular,
      ]}
    >
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
      <Text weight="medium" style={{ color: cfg.fg, fontSize: compact ? 11 : 12 }}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  regular: { paddingHorizontal: 10, paddingVertical: 4 },
  compact: { paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
