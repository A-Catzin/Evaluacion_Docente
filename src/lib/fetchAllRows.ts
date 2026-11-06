export const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

/**
 * PostgREST caps every response at 1000 rows, so a plain `.select()` silently drops the rest of a larger
 * table. This reads ranged pages until a short one and keeps the `{ data, error }` shape of a normal query.
 * The query must be ordered by a unique column so pages never skip or repeat rows.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = PAGE_SIZE,
): Promise<PageResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: null, error };
    const block = data || [];
    rows.push(...block);
    if (block.length < pageSize) return { data: rows, error: null };
  }
}
