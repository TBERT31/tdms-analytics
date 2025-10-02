import { RecordBatchReader, Table, Vector } from "apache-arrow";

export const ARROW_MIME = "application/vnd.apache.arrow.stream";

export type ArrowXY = { x: Float64Array; y: Float64Array };

export function extractXY(table: Table): ArrowXY {
  const timeCol = table.getChild("time") as Vector | null;
  const valueCol = table.getChild("value") as Vector | null;
  if (!timeCol || !valueCol) {
    throw new Error("Colonnes Arrow 'time' et 'value' manquantes");
  }

  // Option 1 (simple boucle) — OK tous types numériques
  const x = new Float64Array(timeCol.length);
  const y = new Float64Array(valueCol.length);
  for (let i = 0; i < timeCol.length; i++) {
    x[i] = Number(timeCol.get(i));
    y[i] = Number(valueCol.get(i));
  }
  return { x, y };

  // Option 2 (si on préfère éviter la boucle, mais moins safe pour Int64/BigInt) :
  // const xa = timeCol.toArray() as ArrayLike<number>;
  // const ya = valueCol.toArray() as ArrayLike<number>;
  // return { x: Float64Array.from(xa as any), y: Float64Array.from(ya as any) };
}

export async function fetchArrowTable(url: string): Promise<Table> {
  const res = await fetch(url, { headers: { Accept: ARROW_MIME }, cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} – ${await res.text()}`);

  const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
  if (!ct.includes(ARROW_MIME)) throw new Error("NOT_ARROW");

  const body = res.body ?? (await res.arrayBuffer());
  const reader = await RecordBatchReader.from(body as any);

  const batches = await reader.readAll();
  return new Table(batches);
}