/**
 * Workspace registers (Phase 11), as React state that persists.
 *
 * `useCollection(name, seed)` is a drop-in for `useState(seed)` over a list:
 * the screen reads and sets an array exactly as before, and every row it
 * adds, changes or drops is written to the server. Rows come back with a few
 * underscored fields (`_rid`, `_student`, …) that the server owns.
 *
 * `seed` is only ever used on the demo deployment, the first time a register
 * is opened; on a real institute's deployment a register starts empty.
 */
import { useCallback, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api, API_BASE, ApiError, getAccessToken, currentTenantCode, refreshSession } from './api';
import { toast } from '../components/ui';
import { shiftDemoDates } from './demodates';

export interface RecordMeta {
  _rid?: string;
  _key?: string;
  _studentId?: string | null;
  _student?: { name: string; enrolmentNo: string } | null;
  _createdAt?: string;
  _updatedAt?: string;
  /** Client-only: a row whose create is still in flight. */
  _tmp?: string;
}

export type Stored<T> = T & RecordMeta;

interface ListResponse<T> {
  rows: Stored<T>[];
  initialized: boolean;
}

/** The document a row stores: everything but the server's underscored fields. */
function docOf<T extends object>(row: Stored<T>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v;
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const newTmp = () => (globalThis.crypto?.randomUUID?.() ?? `tmp-${Date.now()}-${Math.random()}`);

export interface CollectionOptions {
  /** Staff reading one student's share of a student register. */
  studentId?: string;
  /** Skip loading (e.g. until a prerequisite is known). */
  enabled?: boolean;
}

export function useCollection<T extends object>(collection: string, seed: readonly T[] = [], opts: CollectionOptions = {}) {
  const qc = useQueryClient();
  const qs = opts.studentId ? `?studentId=${encodeURIComponent(opts.studentId)}` : '';
  const key: QueryKey = useMemo(() => ['records', collection, opts.studentId ?? null], [collection, opts.studentId]);
  // The seed is read once, on first open; holding it in a ref keeps the query stable.
  const seedRef = useRef(seed);

  const query = useQuery({
    queryKey: key,
    enabled: opts.enabled ?? true,
    queryFn: async () => {
      const res = await api<ListResponse<T>>(`/api/records/${collection}${qs}`);
      if (res.initialized) return res.rows;
      const started = await api<ListResponse<T>>(`/api/records/${collection}/init${qs}`, {
        method: 'POST',
        body: { rows: seedRef.current.map((data) => ({ data: shiftDemoDates(data) })) },
      });
      return started.rows;
    },
  });

  /** Creates in flight, by temporary id, so a quick edit after an add waits for it. */
  const pending = useRef(new Map<string, Promise<Stored<T> | null>>());

  const current = useCallback(() => (qc.getQueryData<Stored<T>[]>(key) ?? []), [qc, key]);

  const replaceRow = useCallback(
    (match: (r: Stored<T>) => boolean, row: Stored<T> | null) => {
      qc.setQueryData<Stored<T>[]>(key, (rows = []) =>
        row ? rows.map((r) => (match(r) ? row : r)) : rows.filter((r) => !match(r)),
      );
    },
    [qc, key],
  );

  const fail = useCallback(
    (err: unknown) => {
      toast.error(err instanceof ApiError ? err.message : 'Could not save — check your connection and try again.');
      void qc.invalidateQueries({ queryKey: key });
    },
    [qc, key],
  );

  const createRow = useCallback(
    (row: Stored<T>, tmp: string) => {
      const p = api<Stored<T>>(`/api/records/${collection}${qs}`, { method: 'POST', body: { data: docOf(row), ...(opts.studentId ? { studentId: opts.studentId } : {}) } })
        .then((saved) => {
          // Keep any edits made while the create was in flight.
          const latest = current().find((r) => r._tmp === tmp);
          const merged = latest && !same(docOf(latest), docOf(row)) ? { ...latest, ...saved, ...docOf(latest) } : saved;
          replaceRow((r) => r._tmp === tmp, merged as Stored<T>);
          if (latest && merged !== saved) {
            void api(`/api/records/${collection}/${saved._rid}${qs}`, { method: 'PATCH', body: { data: docOf(latest) } }).catch(fail);
          }
          return saved;
        })
        .catch((err) => { fail(err); return null; })
        .finally(() => pending.current.delete(tmp));
      pending.current.set(tmp, p);
    },
    [collection, qs, opts.studentId, current, replaceRow, fail],
  );

  /** Same contract as a useState setter over the list. */
  const setItems = useCallback(
    (next: Stored<T>[] | ((prev: Stored<T>[]) => Stored<T>[])) => {
      const prev = current();
      let after = typeof next === 'function' ? next(prev) : next;

      // Rows new to the list get a temporary id so they can be found again.
      after = after.map((r) => (r._rid || r._tmp ? r : { ...r, _tmp: newTmp() }));
      qc.setQueryData<Stored<T>[]>(key, after);

      const before = new Map(prev.filter((r) => r._rid).map((r) => [r._rid!, r]));
      const kept = new Set<string>();

      for (const row of after) {
        if (row._rid) {
          kept.add(row._rid);
          const old = before.get(row._rid);
          if (old && !same(docOf(old), docOf(row))) {
            void api(`/api/records/${collection}/${row._rid}${qs}`, { method: 'PATCH', body: { data: docOf(row) } }).catch(fail);
          }
        } else if (row._tmp && !pending.current.has(row._tmp) && !prev.some((p) => p._tmp === row._tmp)) {
          createRow(row, row._tmp);
        }
        // A row still being created picks up later edits when its create returns.
      }

      for (const [rid, old] of before) {
        if (!kept.has(rid)) {
          void api(`/api/records/${collection}/${rid}${qs}`, { method: 'DELETE' }).catch((err) => {
            fail(err);
            return old;
          });
        }
      }
    },
    [collection, qs, current, qc, key, createRow, fail],
  );

  const items = (query.data ?? []) as Stored<T>[];

  return {
    items,
    setItems,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    /** Adds a row at the top. */
    add: (row: T) => setItems((rows) => [row as Stored<T>, ...rows]),
    /** Merges fields into the row with this id (`id` field or `_rid`). */
    update: (id: string | number, patch: Partial<T>) =>
      setItems((rows) => rows.map((r) => (matches(r, id) ? { ...r, ...patch } : r))),
    remove: (id: string | number) => setItems((rows) => rows.filter((r) => !matches(r, id))),
  };
}

function matches(row: Stored<object>, id: string | number) {
  return row._rid === id || (row as { id?: unknown }).id === id;
}

/**
 * A single settings-like document (a hostel allotment, a mess menu), stored
 * as the one row of its register. Returns the document (or `fallback` while
 * loading or on an empty register) and a setter.
 */
export function useDocument<T extends object>(collection: string, seed: T | null, fallback: T, opts: CollectionOptions = {}) {
  const c = useCollection<T>(collection, seed ? [{ ...seed, id: 'doc' } as T] : [], opts);
  const row = c.items[0];
  const value = (row ?? fallback) as Stored<T>;
  const set = (patch: Partial<T>) =>
    c.setItems((rows) => (rows[0] ? [{ ...rows[0], ...patch }, ...rows.slice(1)] : [{ ...fallback, ...patch, id: 'doc' } as Stored<T>]));
  return { value, exists: Boolean(row), set, isLoading: c.isLoading };
}

// ─── Attachments ──────────────────────────────────────────────────────────────

export interface StoredFileInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  context: string | null;
  createdAt: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  const tenant = currentTenantCode();
  return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(tenant ? { 'X-Tenant': tenant } : {}) };
}

/** Uploads one file and returns what the server kept. */
export async function uploadFile(file: File, context?: string): Promise<StoredFileInfo> {
  if (file.size > MAX_BYTES) throw new ApiError(413, `${file.name} is larger than 10 MB`);
  const url = `${API_BASE}/api/files?name=${encodeURIComponent(file.name)}${context ? `&context=${encodeURIComponent(context)}` : ''}`;
  const send = () =>
    fetch(url, { method: 'POST', credentials: 'include', headers: { ...authHeaders(), 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new ApiError(res.status, err?.error?.message ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

/** Downloads a stored file through the signed-in session and saves it. */
export async function downloadStoredFile(id: string, name: string) {
  const send = () => fetch(`${API_BASE}/api/files/${id}`, { credentials: 'include', headers: authHeaders() });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  if (!res.ok) throw new ApiError(res.status, 'Could not download that file');
  saveBlob(await res.blob(), name);
}

/** Opens the system file picker; resolves with the chosen files (empty if cancelled). */
export function pickFiles(accept = '*/*', multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(input.files ? Array.from(input.files) : []);
    // Some browsers fire no event on cancel; the promise then simply never settles, which is harmless.
    input.click();
  });
}

/** Picks a file, uploads it, and reports the outcome with a toast. */
export async function pickAndUpload(context: string, accept = '*/*'): Promise<StoredFileInfo | null> {
  const [file] = await pickFiles(accept);
  if (!file) return null;
  try {
    const saved = await uploadFile(file, context);
    toast.success(`${saved.name} uploaded (${formatBytes(saved.size)})`);
    return saved;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : 'Upload failed');
    return null;
  }
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Re-files an upload under another record (e.g. once a drafted record exists). */
export const moveStoredFile = (id: string, context: string) =>
  api<StoredFileInfo>(`/api/files/${id}`, { method: 'PATCH', body: { context } });

/**
 * The files attached to one record, with upload and removal. `context` names
 * the record, e.g. "procurement:tender/<id>".
 */
export function useFiles(context: string | null) {
  const qc = useQueryClient();
  const key = ['files', context];
  const q = useQuery({
    queryKey: key,
    enabled: Boolean(context),
    queryFn: () => api<{ files: StoredFileInfo[] }>(`/api/files?context=${encodeURIComponent(context!)}`).then(r => r.files),
  });
  return {
    files: q.data ?? [],
    isLoading: q.isLoading,
    async upload(accept = '*/*') {
      if (!context) return null;
      const f = await pickAndUpload(context, accept);
      if (f) void qc.invalidateQueries({ queryKey: key });
      return f;
    },
    async remove(id: string) {
      try {
        await api(`/api/files/${id}`, { method: 'DELETE' });
        void qc.invalidateQueries({ queryKey: key });
        toast.success('File removed');
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'Could not remove the file');
      }
    },
    download: (f: StoredFileInfo) => downloadStoredFile(f.id, f.name).catch(() => toast.error('Could not download that file')),
  };
}

/** Study material and similar records point at a stored file as `campusos-file:<id>`. */
export const STORED_FILE_PREFIX = 'campusos-file:';

/** Opens a material: a stored file is downloaded with the user's session, a link opens in a new tab. */
export async function openMaterial(url: string | null | undefined, name: string) {
  if (!url) { toast.error('This material has no file attached'); return; }
  if (url.startsWith(STORED_FILE_PREFIX)) {
    try { await downloadStoredFile(url.slice(STORED_FILE_PREFIX.length), name); } catch { toast.error('Could not download that file'); }
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
