/**
 * Fetches rows from a Supabase query by paginating automatically.
 * Supabase PostgREST caps results per request (default 1000, configurable).
 * Loops until data.length < pageSize (last page) or maxPages is reached.
 *
 * Usage:
 *   const rows = await fetchAllPages((from, to) =>
 *     supabaseClient.from('table').select('cols').eq('col', val).range(from, to)
 *   );
 */
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000,
  maxPages = 20, // safety cap: prevents unbounded loops on large tables
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  let page = 0;
  while (page < maxPages) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error('[fetchAllPages] query error:', error?.message ?? error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
    from += pageSize;
    page += 1;
  }
  if (page === maxPages) {
    console.warn(`[fetchAllPages] hit maxPages limit (${maxPages}). Results may be incomplete.`);
  }
  return all;
}
