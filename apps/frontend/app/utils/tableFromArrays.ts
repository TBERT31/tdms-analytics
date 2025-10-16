import * as arrow from "apache-arrow";

export function tableFromArrays(cols: { [name: string]: ArrayLike<number> }) {
  const arrays: Record<string, arrow.Vector> = {};
  for (const [name, arr] of Object.entries(cols)) {
    arrays[name] = arrow.vectorFromArray(arr as any);
  }

  return new arrow.Table(arrays);
}