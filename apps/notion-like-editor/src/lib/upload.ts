// apps/notion-like-editor/src/lib/upload.ts
export function getEmbedToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const t = params.get('token');
  return t && t.trim().length ? t.trim() : null;
}

export async function uploadImage(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append('file', file);

  const token = getEmbedToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const resp = await fetch('/api/assets', {
    method: 'POST',
    body: fd,
    headers,
    signal: options?.signal,
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`upload failed: ${resp.status} ${text}`);
  }

  const data = await resp.json().catch(() => ({} as any));
  if (!data?.url) throw new Error('missing url');
  return { url: data.url as string };
}
