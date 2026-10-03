import { useEffect, useState } from 'react';
import { Button, InlineAlert, Input, Select, toast } from '../../components/ui';
import {
  PRODUCT_NAME,
  useInstitution,
  useSaveInstitution,
  type Institution,
  type InstitutionKind,
} from '../../lib/institution';
import AcademicStructure from './AcademicStructure';

const KINDS: InstitutionKind[] = ['University', 'College', 'School', 'Institute', 'Academy', 'Other'];

/** The subset of the view that the API stores. */
function pick(i: Institution): Institution {
  return {
    name: i.name, nameHi: i.nameHi, shortCode: i.shortCode, kind: i.kind, tagline: i.tagline,
    address: i.address, city: i.city, state: i.state, pincode: i.pincode, country: i.country,
    phone: i.phone, email: i.email, website: i.website, emailDomain: i.emailDomain, helpdesk: i.helpdesk,
  };
}

/**
 * Who this deployment belongs to. Everything a user sees — the logo mark,
 * the name in every header and footer, the sign-in help line, the tab
 * title — is read from what is saved here.
 */
export default function InstitutionGroup() {
  const current = useInstitution();
  const save = useSaveInstitution();
  const [form, setForm] = useState<Institution>(() => pick(current));
  const [error, setError] = useState<string | null>(null);

  // The cached copy paints first; take the server's once it lands.
  const serverKey = JSON.stringify(pick(current));
  useEffect(() => setForm(JSON.parse(serverKey) as Institution), [serverKey]);

  const set = <K extends keyof Institution>(k: K, v: Institution[K]) => setForm(f => ({ ...f, [k]: v }));
  const text = (k: keyof Institution) => ({
    value: (form[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k, e.target.value as never),
  });

  const dirty = JSON.stringify(form) !== serverKey;
  const valid = form.name.trim().length >= 2 && form.shortCode.trim().length >= 1;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const saved = await save.mutateAsync(form);
      toast.success(`Saved. The whole app now shows “${saved.name}”.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the institution profile.');
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <form onSubmit={submit} className="max-w-3xl p-5 flex flex-col gap-5">
        <div>
          <h2 className="text-[16px] font-semibold text-[#16264A]">Institution Profile</h2>
          <p className="text-[13px] text-[#5A6577] mt-1">
            {PRODUCT_NAME} works for any university, college, school or institute. What you save here
            replaces the name, logo mark and contact details everywhere in the web and mobile apps.
          </p>
        </div>

        {error && <InlineAlert type="error">{error}</InlineAlert>}

        {/* Live preview of the logo mark and header line */}
        <div className="flex items-center gap-3 border border-[#D3D8E0] rounded-[4px] bg-white p-3">
          <div className="min-w-10 h-10 px-2 bg-[#16264A] rounded-[4px] flex items-center justify-center text-white font-bold text-[14px]">
            {(form.shortCode || '?').toUpperCase()}
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[#16264A]">{form.name || 'Institution name'}</p>
            <p className="text-[12px] text-[#5A6577]">
              {[form.kind, form.city].filter(Boolean).join(' · ')}{form.tagline ? ` — ${form.tagline}` : ''}
            </p>
          </div>
          <span className="ml-auto text-[11px] uppercase tracking-wider text-[#5A6577]">Preview</span>
        </div>

        <Section title="Identity">
          <Input label="Institution name" required {...text('name')} placeholder="e.g. Sunrise Public School" />
          <Input label="Name in Hindi (optional)" {...text('nameHi')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Short code (logo mark)" required maxLength={6} {...text('shortCode')}
              hint="1–6 letters, e.g. SPS" />
            <Select label="Type" value={form.kind} onChange={e => set('kind', e.target.value as InstitutionKind)}>
              {KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </Select>
          </div>
          <Input label="Tagline (optional)" {...text('tagline')} />
        </Section>

        <Section title="Address">
          <Input label="Street address" {...text('address')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="City" {...text('city')} />
            <Input label="State / Province" {...text('state')} />
            <Input label="PIN / Postal code" {...text('pincode')} />
            <Input label="Country" required {...text('country')} />
          </div>
        </Section>

        <Section title="Contact">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Phone" {...text('phone')} />
            <Input label="Email" type="email" {...text('email')} />
            <Input label="Website" {...text('website')} placeholder="www.example.edu" />
            <Input label="Official email domain" {...text('emailDomain')} placeholder="example.edu"
              hint="Used as the example address on sign-in forms" />
          </div>
          <Input label="IT help-desk line (sign-in pages)" {...text('helpdesk')}
            hint="Shown as “Contact the IT Cell: …”. Leave blank to hide." />
        </Section>

        <div className="flex gap-3 sticky bottom-0 bg-[#EDEFF3] py-3">
          <Button type="submit" loading={save.isPending} disabled={!dirty || !valid}>Save changes</Button>
          <Button type="button" variant="secondary" disabled={!dirty || save.isPending}
            onClick={() => setForm(JSON.parse(serverKey) as Institution)}>Discard</Button>
        </div>
      </form>
      <div className="max-w-3xl px-5 pb-8">
        <AcademicStructure />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border border-[#D3D8E0] rounded-[4px] bg-white p-4 flex flex-col gap-4">
      <legend className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#5A6577]">{title}</legend>
      {children}
    </fieldset>
  );
}
