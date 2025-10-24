export async function uploadImage(
  file: File,
  options?: { signal?: AbortSignal }
): Promise<{ url: string }> {
  const fd = new FormData()
  fd.append("file", file)
  const resp = await fetch("/api/assets", {
    method: "POST",
    body: fd,
    signal: options?.signal,
  })
  if (!resp.ok) throw new Error(`upload failed: ${resp.status}`)
  const data = await resp.json().catch(() => ({}))
  if (!data?.url) throw new Error("missing url")
  return { url: data.url as string }
}
