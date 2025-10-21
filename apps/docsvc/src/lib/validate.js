export function asString(value, fallback = undefined) {
  return typeof value === 'string' ? value : fallback;
}

export function isTiptapDoc(obj) {
  return obj && obj.type === 'doc' && Array.isArray(obj.content);
}
