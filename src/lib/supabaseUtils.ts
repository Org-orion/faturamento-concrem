/**
 * Fetches ALL rows from a Supabase query by paginating automatically.
 * Supabase PostgREST caps results per request (default 1000, configurable).
 * This helper loops until data.length < pageSize (last page).
 *
 * Usage:
 *   const rows = await fetchAllPages((from, to) =>
 *     supabaseClient.from('table').select('*').eq('col', val).range(from, to)
 *   );
 */
export async function fetchAllPages<T>(
  buildQuery: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) {
      console.error('[fetchAllPages] query error:', error?.message ?? error);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break; // last page
    from += pageSize;
  }
  return all;
}
