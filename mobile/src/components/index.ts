// Campus OS mobile design system — single import surface.
//   import { Button, Card, StatusPill } from '@/components';

export { Text, type TextProps } from './Text';
export { Button, ButtonRow, type ButtonProps, type ButtonSize, type ButtonVariant } from './Button';
export { Spinner, LoadingBlock } from './Spinner';
export { Input, Select, type InputProps, type SelectOption } from './Input';
export { StatusPill, type StatusType } from './StatusPill';

export { Screen, Card, SectionHeader, Divider, Field, FieldGrid, RecordBand } from './Layout';

export {
  toast,
  ToastHost,
  InlineAlert,
  Skeleton,
  SkeletonRow,
  EmptyState,
  PermissionDenied,
} from './Feedback';

export {
  Tabs,
  Segmented,
  Breadcrumb,
  Stepper,
  Timeline,
  ListRow,
  type TabItem,
  type TimelineItem,
} from './Navigation';

export {
  Sheet,
  Avatar,
  Checkbox,
  Toggle,
  OtpInput,
  VerifiedSeal,
  ProgressBar,
  ProgressRing,
  TileButton,
} from './Controls';

export { AppBar } from './AppBar';
