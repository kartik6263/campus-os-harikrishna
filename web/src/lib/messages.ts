/**
 * Parent–teacher messages (`parent:messages`): one thread per question, kept
 * on the ward's record. The parent writes from the parent portal; the teacher
 * it is addressed to (or the mentor) replies from the faculty workspace.
 */
export interface MessageThread {
  id: string;
  /** The teacher's name as the timetable carries it, or "Class mentor". */
  to: string;
  subjectCode?: string;
  topic: string;
  status: 'open' | 'answered' | 'closed';
  messages: Array<{ from: 'parent' | 'staff'; by: string; text: string; at: string }>;
}

export const threadNo = () => `MSG/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
