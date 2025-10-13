import {
  Table,
  Vector,
  Type,
  Timestamp,
  TimeUnit,
  RecordBatchReader,
} from "apache-arrow";
import { datasetApi } from "@/app/services/apiClient";

export const ARROW_MIME = "application/vnd.apache.arrow.stream";

export type ArrowXY = { x: Float64Array; y: Float64Array };

const typeIdOf = (v: Vector): Type => (v.type as any).typeId as Type;

export function extractXY(table: Table): ArrowXY {
  const timeCol = table.getChild("time") as Vector | null;
  const valueCol = table.getChild("value") as Vector | null;
  if (!timeCol || !valueCol) {
    throw new Error("Colonnes Arrow 'time' et 'value' manquantes");
  }

  const isTimestamp =
    typeIdOf(timeCol) === Type.Timestamp ||
    (timeCol.type as any).constructor?.name === "Timestamp";

  const x = toF64(timeCol, isTimestamp);
  const y = toF64(valueCol, false);
  return { x, y };
}

/**
 * Fetch et parse une table Arrow depuis URLSearchParams
 * ⭐ UTILISE datasetApi au lieu de fetch direct
 */
export async function fetchArrowTable(params: URLSearchParams): Promise<Table> {
  const response = await datasetApi.getWindowFilteredArrow(params);
  const arrayBuffer = await response.arrayBuffer();
  return parseArrowBuffer(arrayBuffer);
}

/**
 * Parse un ArrayBuffer en Table Arrow
 */
async function parseArrowBuffer(buffer: ArrayBuffer): Promise<Table> {
  try {
    const reader = await RecordBatchReader.from(new Uint8Array(buffer));
    const batches = await reader.readAll();
    return new Table(batches);
  } catch (error) {
    throw new Error("NOT_ARROW");
  }
}

function toF64(v: Vector, treatAsTimestamp = false): Float64Array {
  const tid = typeIdOf(v);

  if (tid === Type.Float64) return v.toArray() as Float64Array;
  if (tid === Type.Float32) return Float64Array.from(v.toArray() as Float32Array);
  if (
    tid === Type.Int8 || tid === Type.Int16 || tid === Type.Int32 ||
    tid === Type.Uint8 || tid === Type.Uint16 || tid === Type.Uint32
  ) {
    return Float64Array.from(v.toArray() as ArrayLike<number>);
  }

  if (tid === Type.Int64) {
    const a = v.toArray() as BigInt64Array;
    return Float64Array.from(a as unknown as Iterable<bigint>, (b) => Number(b));
  }

  if (tid === Type.Timestamp) {
    const a = v.toArray() as BigInt64Array;
    const unit = (v.type as Timestamp).unit;
    const scale =
      unit === TimeUnit.SECOND ? 1000 :
      unit === TimeUnit.MILLISECOND ? 1 :
      unit === TimeUnit.MICROSECOND ? 1 / 1000 :
      1 / 1e6;
    const k = treatAsTimestamp ? scale : 1;
    return Float64Array.from(a as unknown as Iterable<bigint>, (b) => Number(b) * k);
  }

  const tmp: number[] = Array.from({ length: v.length }, (_, i) => Number(v.get(i)));
  return Float64Array.from(tmp);
}