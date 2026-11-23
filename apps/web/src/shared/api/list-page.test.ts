import { describe, expect, it } from "vitest";
import {
  flattenListPages,
  LIST_PAGE_SIZE,
  loadedCountLabel,
  withListPage,
} from "./list-page";

describe("list pages", () => {
  it("sends the page size and the cursor from the previous page", () => {
    expect(withListPage("/workspaces")).toBe(`/workspaces?limit=${LIST_PAGE_SIZE}`);
    expect(withListPage("/workspaces", { cursor: "abc" })).toBe(
      `/workspaces?limit=${LIST_PAGE_SIZE}&cursor=abc`,
    );
  });

  it("flattens pages in the order they were loaded", () => {
    expect(
      flattenListPages({
        pages: [{ items: [{ id: "a" }] }, { items: [{ id: "b" }] }],
      }),
    ).toEqual([{ id: "a" }, { id: "b" }]);
    expect(flattenListPages(undefined)).toEqual([]);
  });

  it("does not present a loaded count as a total while another page exists", () => {
    expect(loadedCountLabel(50, true)).toBe("50+");
    expect(loadedCountLabel(12, false)).toBe("12");
  });
});
