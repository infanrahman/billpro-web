/** Use Django's canonical paths so redirects cannot turn POST requests into GET. */
export const buildApiUrl = (path: string, apiBase: string) => {
  const base = apiBase.trim().replace(/\/+$/, "");
  if (!base) return path;

  const suffixIndex = path.search(/[?#]/);
  const pathname = suffixIndex < 0 ? path : path.slice(0, suffixIndex);
  const suffix = suffixIndex < 0 ? "" : path.slice(suffixIndex);
  const remotePath = pathname
    .replace(/^\/api\/tracking\//, "")
    .replace(/^\/api\//, "")
    .replace(/^\/+|\/+$/g, "");

  return `${base}/${remotePath}/${suffix}`;
};
