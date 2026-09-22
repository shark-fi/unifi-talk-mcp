/**
 * Serializes a tool result within a character budget while keeping it valid JSON: the largest
 * list (found by descending into the largest child at each level) is trimmed to as many items as
 * fit, and a `_truncated` note says how much was left out. Only a result with no list to trim is
 * cut as raw text.
 */
export function serializeWithinBudget(value: unknown, budget: number): string {
  const full = JSON.stringify(value) ?? "null";
  if (full.length <= budget) return full;

  const list = findLargestList(value);
  if (list && list.items.length > 1) {
    const total = list.items.length;
    const where = list.path.length > 0 ? `'${list.path.join(".")}'` : "the result";
    const render = (keep: number) => {
      const note = `${where} shows ${keep} of ${total} items; the rest were omitted to fit the response size limit`;
      const trimmed = withList(value, list.path, list.items.slice(0, keep));
      return JSON.stringify(
        Array.isArray(trimmed) ? { _truncated: note, items: trimmed } : { _truncated: note, ...(trimmed as object) },
      );
    };

    // Largest item count that still fits.
    let low = 0;
    let high = total - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (render(mid).length <= budget) low = mid;
      else high = mid - 1;
    }
    if (low > 0) return render(low);
  }

  return `${full.slice(0, budget)}\n… [cut at ${budget} of ${full.length} characters; this output is not valid JSON]`;
}

function findLargestList(value: unknown, path: string[] = []): { path: string[]; items: unknown[] } | undefined {
  if (Array.isArray(value)) return { path, items: value };
  if (value === null || typeof value !== "object") return undefined;

  let largest: [string, unknown] | undefined;
  let largestSize = -1;
  for (const [key, child] of Object.entries(value)) {
    if (child === null || typeof child !== "object") continue;
    const size = JSON.stringify(child).length;
    if (size > largestSize) {
      largest = [key, child];
      largestSize = size;
    }
  }
  return largest && findLargestList(largest[1], [...path, largest[0]]);
}

function withList(value: unknown, path: string[], items: unknown[]): unknown {
  const [key, ...rest] = path;
  if (key === undefined) return items;
  const object = value as Record<string, unknown>;
  return { ...object, [key]: withList(object[key], rest, items) };
}
