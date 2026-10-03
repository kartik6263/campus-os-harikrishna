/**
 * Requests to correct a student's own particulars.
 *
 * The student files one in `student:record-corrections` (with supporting
 * papers under `student:record-correction/<id>`); the records section in
 * Academic Operations verifies it and, on approval, changes the record itself
 * through PATCH /api/office/students/:id — so the request alone never changes
 * anything.
 */

export type CorrectionField = 'Name' | 'Date of birth' | 'Gender' | 'Category' | 'Mobile number' | 'Permanent address';

/** Which student field each request changes when approved. */
export const FIELD_KEY: Record<CorrectionField, 'name' | 'dob' | 'gender' | 'category' | 'mobile' | 'address'> = {
  Name: 'name', 'Date of birth': 'dob', Gender: 'gender', Category: 'category', 'Mobile number': 'mobile', 'Permanent address': 'address',
};

/** Changes to identity need proof; contact details do not. */
export const NEEDS_PROOF: Record<CorrectionField, string | null> = {
  Name: 'Class 10 marksheet or gazette notification',
  'Date of birth': 'Class 10 marksheet or birth certificate',
  Gender: 'Government ID',
  Category: 'Caste certificate',
  'Mobile number': null,
  'Permanent address': 'Aadhaar or domicile certificate',
};

export interface RecordCorrection {
  id: string;
  field: CorrectionField;
  current: string;
  requested: string;
  reason: string;
  raisedAt: string;
  status: 'pending' | 'approved' | 'returned' | 'rejected';
  deskNote?: string;
  decidedAt?: string;
  decidedBy?: string;
}

export const correctionNo = () => `RC/${new Date().getFullYear()}/${String(Date.now()).slice(-6)}`;
