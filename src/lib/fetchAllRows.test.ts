import { describe, expect, it } from 'vitest';
import { fetchAllRows } from './fetchAllRows';

const table = (size: number) => Array.from({ length: size }, (_, id) => ({ id }));
const pager = (rows: { id: number }[], calls: Array<[number, number]> = []) =>
  async (from: number, to: number) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };

describe('fetchAllRows', () => {
  it('returns every row of a table larger than one page', async () => {
    const calls: Array<[number, number]> = [];
    const { data, error } = await fetchAllRows(pager(table(2500), calls), 1000);
    expect(error).toBeNull();
    expect(data).toHaveLength(2500);
    expect(new Set(data!.map((row) => row.id)).size).toBe(2500);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('asks for one extra empty page when the size is an exact multiple', async () => {
    const calls: Array<[number, number]> = [];
    const { data } = await fetchAllRows(pager(table(2000), calls), 1000);
    expect(data).toHaveLength(2000);
    expect(calls).toHaveLength(3);
  });

  it('returns an empty list for an empty table and stops at the first error', async () => {
    expect((await fetchAllRows(pager([]), 1000)).data).toEqual([]);
    const failing = async (from: number) =>
      from === 0
        ? { data: table(1000), error: null }
        : { data: null, error: { message: 'boom' } };
    expect(await fetchAllRows(failing, 1000)).toEqual({ data: null, error: { message: 'boom' } });
  });
});
