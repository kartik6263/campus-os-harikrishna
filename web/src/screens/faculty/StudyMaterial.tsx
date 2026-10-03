import { useState, useMemo } from 'react';
import { Button, Modal, InlineAlert, Toggle, Tabs, toast } from '../../components/ui';
import {
  useAddMaterial,
  useDeleteMaterial,
  useMaterialList,
  useMySubjects,
  useUpdateMaterial,
  type LegacyMaterial as StudyMaterialItem,
} from '../../lib/facultyqueries';
import { formatBytes, pickFiles, uploadFile as storeFile } from '../../lib/records';

interface Props {
  onNavigate: (s: any) => void;
  onModule: (m: string) => void;
}

const TYPE_CONFIG: Record<StudyMaterialItem['type'], { label: string; bg: string; color: string }> = {
  pdf:   { label: 'PDF',   bg: '#FEE2E2', color: '#A8242C' },
  ppt:   { label: 'PPT',   bg: '#FFF7ED', color: '#C05621' },
  video: { label: 'Video', bg: '#EFF6FF', color: '#1D4ED8' },
  link:  { label: 'Link',  bg: '#F1F5F9', color: '#5A6577' },
};

const UNIT_TITLES_BCA501: Record<number, string> = {
  1: 'Introduction to SE & Process Models',
  2: 'Requirements Engineering',
  3: 'Software Design',
  4: 'Software Testing & Maintenance',
};

let nextId = 1000;

export default function StudyMaterial({ onNavigate, onModule }: Props) {
  const { data: MY_SUBJECTS } = useMySubjects();
  const { data: materials } = useMaterialList();
  const addMaterial = useAddMaterial();
  const updateMaterial = useUpdateMaterial();
  const removeMaterial = useDeleteMaterial();

  // Falls back to the first subject taught once the load arrives.
  const [subject, setSubject] = useState<string | null>(null);
  const selectedSubject = subject ?? MY_SUBJECTS[0]?.code ?? '';
  const setSelectedSubject = setSubject;

  // Upload modal state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadSubject, setUploadSubject] = useState('');
  const [uploadUnit, setUploadUnit] = useState(1);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState('');
  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<StudyMaterialItem['type']>('pdf');
  const [linkUrl, setLinkUrl] = useState('');
  const [visibleToStudents, setVisibleToStudents] = useState(true);
  const [uploading, setUploading] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const subjectMaterials = useMemo(
    () => materials.filter(m => m.subjectCode === selectedSubject),
    [materials, selectedSubject]
  );

  // Group by unit
  const byUnit = useMemo(() => {
    const map: Record<number, StudyMaterialItem[]> = {};
    for (const m of subjectMaterials) {
      if (!map[m.unit]) map[m.unit] = [];
      map[m.unit].push(m);
    }
    return map;
  }, [subjectMaterials]);

  async function toggleVisibility(id: string) {
    const current = materials.find(m => m.id === id);
    if (!current) return;
    const next = !current.visibleToStudents;
    try {
      await updateMaterial.mutateAsync({ id, visibleToStudents: next });
      toast.info(next ? 'Visible to students.' : 'Hidden from students.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not change visibility.');
    }
  }

  async function deleteMaterial() {
    if (!deleteId) return;
    try {
      await removeMaterial.mutateAsync(deleteId);
      toast.success('Material deleted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the material.');
    } finally {
      setDeleteId(null);
    }
  }

  function openUpload() {
    setUploadSubject(selectedSubject);
    setUploadUnit(1);
    setUploadTitle(selectedSubject === 'BCA501' ? UNIT_TITLES_BCA501[1] : '');
    setUploadFile('');
    setPickedFile(null);
    setUploadType('pdf');
    setLinkUrl('');
    setVisibleToStudents(true);
    setUploadOpen(true);
  }

  function handleUnitChange(unit: number) {
    setUploadUnit(unit);
    if (uploadSubject === 'BCA501') {
      setUploadTitle(UNIT_TITLES_BCA501[unit] ?? '');
    }
  }

  async function chooseFile() {
    const accept = uploadType === 'ppt' ? '.ppt,.pptx,.odp' : uploadType === 'video' ? 'video/*' : '.pdf,application/pdf';
    const [file] = await pickFiles(accept);
    if (!file) return;
    setPickedFile(file);
    setUploadFile(file.name);
  }

  async function doUpload() {
    if (uploadType !== 'link' && !pickedFile) { toast.error('Please select a file.'); return; }
    if (uploadType === 'link' && !linkUrl) { toast.error('Please enter a URL.'); return; }
    if (!uploadTitle.trim()) { toast.error('Please enter a unit title.'); return; }
    setUploading(true);
    try {
      // The file itself is stored where every signed-in student can read it;
      // the material points at it.
      const stored = uploadType === 'link' || !pickedFile ? null : await storeFile(pickedFile, `campus:study-material/${uploadSubject}`);
      await addMaterial.mutateAsync({
        code: uploadSubject,
        unit: uploadUnit,
        unitTitle: uploadTitle.trim(),
        filename: uploadType === 'link' ? linkUrl : uploadFile,
        type: uploadType.toUpperCase() as 'PDF' | 'PPT' | 'VIDEO' | 'LINK',
        ...(uploadType === 'link'
          ? { url: linkUrl }
          : { url: `campusos-file:${stored!.id}`, size: formatBytes(stored!.size) }),
        visibleToStudents,
      });
      setUploadOpen(false);
      setSelectedSubject(uploadSubject);
      toast.success(
        visibleToStudents
          ? 'Material uploaded and visible to students.'
          : 'Material uploaded. Not yet visible to students.',
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not file the material.');
    } finally {
      setUploading(false);
    }
  }

  const subjectTabs = MY_SUBJECTS.map(s => ({ id: s.code, label: `${s.code}` }));

  return (
    <div className="flex flex-col h-full bg-[#EDEFF3]">
      {/* Header */}
      <div className="bg-white border-b border-[#D3D8E0] px-6 py-4 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-[16px] font-semibold text-[#16264A]">Study Materials</h2>
          <p className="text-[12px] text-[#5A6577]">Upload and manage course materials for your subjects</p>
        </div>
        <Button variant="primary" size="md" onClick={openUpload}>
          + Upload Material
        </Button>
      </div>

      {/* Subject tabs */}
      <div className="bg-white border-b border-[#D3D8E0] px-6">
        <Tabs tabs={subjectTabs} activeId={selectedSubject} onChange={setSelectedSubject} />
      </div>

      {/* Subject info bar */}
      {(() => {
        const sub = MY_SUBJECTS.find(s => s.code === selectedSubject);
        return sub ? (
          <div className="bg-white border-b border-[#D3D8E0] px-6 py-2 flex items-center gap-4 text-[13px] text-[#5A6577]">
            <span className="font-semibold text-[#16264A]">{sub.name}</span>
            <span className="text-[#D3D8E0]">·</span>
            <span>{sub.classLabel}</span>
            <span className="text-[#D3D8E0]">·</span>
            <span>{sub.totalStudents} students</span>
            <span className="text-[#D3D8E0]">·</span>
            <span className="capitalize">{sub.type}</span>
            <span className="ml-auto font-medium text-[#16264A]">{subjectMaterials.length} file{subjectMaterials.length !== 1 ? 's' : ''}</span>
          </div>
        ) : null;
      })()}

      {/* Materials list */}
      <div className="flex-1 overflow-y-auto p-6">
        {Object.keys(byUnit).length === 0 ? (
          <div className="bg-white border border-[#D3D8E0] rounded-[2px] flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 rounded-full bg-[#EDEFF3] flex items-center justify-center mb-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5A6577" strokeWidth="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <p className="text-[15px] font-medium text-[#16264A]">No materials uploaded</p>
            <p className="text-[13px] text-[#5A6577] mt-1">Upload PDFs, PPTs, videos, or links for this subject.</p>
            <div className="mt-4">
              <Button variant="primary" size="sm" onClick={openUpload}>Upload Material</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {[1, 2, 3, 4].filter(u => byUnit[u] && byUnit[u].length > 0).map(unit => {
              const items = byUnit[unit];
              const unitTitle = items[0]?.unitTitle ?? `Unit ${unit}`;
              return (
                <div key={unit} className="bg-white border border-[#D3D8E0] rounded-[2px] overflow-hidden">
                  {/* Unit header */}
                  <div className="bg-[#EDEFF3] px-4 py-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#5A6577] uppercase tracking-wider">
                      Unit {unit} — {unitTitle}
                    </span>
                    <span className="text-[11px] text-[#5A6577]">{items.length} file{items.length !== 1 ? 's' : ''}</span>
                  </div>
                  {/* Material rows */}
                  {items.map((item, idx) => {
                    const tc = TYPE_CONFIG[item.type];
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-4 px-5 py-3.5 ${idx < items.length - 1 ? 'border-b border-[#D3D8E0]' : ''} hover:bg-[#EDEFF3]/40 transition-colors`}
                      >
                        {/* Type icon area */}
                        <div
                          className="w-8 h-8 rounded-[4px] flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: tc.bg, color: tc.color }}
                        >
                          {tc.label}
                        </div>

                        {/* File info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-[#16264A] truncate">{item.filename}</p>
                          <div className="flex items-center gap-3 mt-0.5 text-[12px] text-[#5A6577]">
                            {item.size && <span>{item.size}</span>}
                            {item.size && <span className="text-[#D3D8E0]">·</span>}
                            <span>Uploaded {item.uploadedOn}</span>
                          </div>
                        </div>

                        {/* Visibility toggle */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[12px] text-[#5A6577]">
                            {item.visibleToStudents ? 'Visible' : 'Hidden'}
                          </span>
                          <Toggle
                            on={item.visibleToStudents}
                            onChange={() => toggleVisibility(item.id)}
                          />
                        </div>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteId(item.id)}
                          className="text-[#A8242C] hover:bg-[#FEE2E2] shrink-0"
                        >
                          Delete
                        </Button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="Upload Study Material"
        width="520px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={doUpload} loading={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {/* Subject */}
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">Subject</label>
            <select
              value={uploadSubject}
              onChange={e => {
                setUploadSubject(e.target.value);
                setUploadUnit(1);
                setUploadTitle(e.target.value === 'BCA501' ? UNIT_TITLES_BCA501[1] : '');
              }}
              className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
            >
              {MY_SUBJECTS.map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
              ))}
            </select>
          </div>

          {/* Unit */}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Unit</label>
              <select
                value={uploadUnit}
                onChange={e => handleUnitChange(Number(e.target.value))}
                className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A]"
              >
                {[1, 2, 3, 4].map(u => <option key={u} value={u}>Unit {u}</option>)}
              </select>
            </div>
            <div className="flex-[2] flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">Unit Title</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="e.g. Software Design Patterns"
                className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]"
              />
            </div>
          </div>

          {/* File type */}
          <div className="flex flex-col gap-1">
            <label className="text-[13px] font-medium text-[#16264A]">File Type</label>
            <div className="flex gap-2">
              {(['pdf', 'ppt', 'video', 'link'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setUploadType(t)}
                  className={`px-3 py-1.5 rounded-[4px] text-[13px] font-medium border cursor-pointer transition-colors
                    ${uploadType === t ? 'border-[#E0952A] bg-[#FEF9EC] text-[#8A6D1F]' : 'border-[#D3D8E0] bg-white text-[#5A6577] hover:bg-[#EDEFF3]'}`}
                >
                  {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* File input */}
          {uploadType !== 'link' ? (
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">File</label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => void chooseFile()}
                  className="h-9 px-4 text-[14px] font-medium border border-[#D3D8E0] rounded-[4px] bg-white hover:bg-[#EDEFF3] text-[#16264A] cursor-pointer transition-colors"
                >
                  Choose file…
                </button>
                {uploadFile ? (
                  <span className="text-[13px] text-[#0E7A5F] font-medium truncate">{uploadFile}</span>
                ) : (
                  <span className="text-[13px] text-[#5A6577]">No file selected</span>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className="text-[13px] font-medium text-[#16264A]">URL</label>
              <input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://…"
                className="h-9 px-3 text-[14px] text-[#16264A] bg-white border border-[#D3D8E0] rounded-[4px] outline-none focus:border-[#E0952A] placeholder-[#5A6577]"
              />
            </div>
          )}

          {/* Visibility */}
          <Toggle
            on={visibleToStudents}
            onChange={setVisibleToStudents}
            label="Visible to students immediately"
          />

          {!visibleToStudents && (
            <InlineAlert type="info">
              You can make this material visible later from the material list.
            </InlineAlert>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Material"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteMaterial}>Delete</Button>
          </>
        }
      >
        <InlineAlert type="error">
          This material will be permanently removed and students will no longer be able to access it.
        </InlineAlert>
      </Modal>
    </div>
  );
}
