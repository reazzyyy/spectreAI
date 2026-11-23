import { infiniteQueryOptions } from "@tanstack/react-query";

/** Server default page size (`parseLimit` fallback). */
export const LIST_PAGE_SIZE = 50;

/** Append `limit` and, when present, the opaque `cursor` from the previous page. */
export function withListPage(
  path: string,
  input?: { cursor?: string | null; limit?: number },
): string {
  const params = new URLSearchParams();
  params.set("limit", String(input?.limit ?? LIST_PAGE_SIZE));
  if (input?.cursor) {
    params.set("cursor", input.cursor);
  }
  return `${path}?${params.toString()}`;
}

export function flattenListPages<T>(
  data: { pages: ReadonlyArray<{ items: readonly T[] }> } | undefined,
): T[] {
  if (!data) {
    return [];
  }
  return data.pages.flatMap((page) => [...page.items]);
}

/**
 * A count of loaded rows. `+` means another page exists, so the number is not a total.
 */
export function loadedCountLabel(count: number, hasMore: boolean): string {
  return hasMore ? `${count}+` : String(count);
}

export function listInfiniteOptions<TPage extends { nextCursor?: string | null }>(
  queryKey: readonly unknown[],
  queryFn: (cursor: string | null) => Promise<TPage>,
  enabled?: boolean,
) {
  return infiniteQueryOptions({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => queryFn(pageParam),
    getNextPageParam: (last) => last.nextCursor || undefined,
    ...(enabled === undefined ? {} : { enabled }),
  });
}
