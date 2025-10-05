import {
  Table,
  Vector,
  Type,
  Timestamp,
  TimeUnit,
  RecordBatchReader,
} from "apache-arrow";

export const ARROW_MIME = "application/vnd.apache.arrow.stream";

export type ArrowXY = { x: Float64Array; y: Float64Array };

const typeIdOf = (v: Vector): Type => (v.type as any).typeId as Type;

export function extractXY(table: Table): ArrowXY {
    const timeCol = table.getChild("time") as Vector | null;
    const valueCol = table.getChild("value") as Vector | null;
    if (!timeCol || !valueCol) {
        throw new Error("Colonnes Arrow 'time' et 'value' manquantes");
    }

    // Option 1 (simple boucle) — OK tous types numériques
    // const x = new Float64Array(timeCol.length);
    // const y = new Float64Array(valueCol.length);
    // for (let i = 0; i < timeCol.length; i++) {
    // x[i] = Number(timeCol.get(i));
    // y[i] = Number(valueCol.get(i));
    // }
    // return { x, y };

    // Option 2 (si on préfère éviter la boucle, mais moins safe pour Int64/BigInt) :
    const isTimestamp =
        typeIdOf(timeCol) === Type.Timestamp ||
        (timeCol.type as any).constructor?.name === "Timestamp";

    const x = toF64(timeCol, isTimestamp);
    const y = toF64(valueCol, false);
    return { x, y };
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

function toF64(v: Vector, treatAsTimestamp = false): Float64Array {
    const tid = typeIdOf(v);

    // chemins directs (zéro copie ou copie simple)
    if (tid === Type.Float64) return v.toArray() as Float64Array;
    if (tid === Type.Float32) return Float64Array.from(v.toArray() as Float32Array);
    if (
        tid === Type.Int8 || tid === Type.Int16 || tid === Type.Int32 ||
        tid === Type.Uint8 || tid === Type.Uint16 || tid === Type.Uint32
    ) {
        return Float64Array.from(v.toArray() as ArrayLike<number>);
    }

    // Int64 -> BigInt64Array
    if (tid === Type.Int64) {
        const a = v.toArray() as BigInt64Array;
        return Float64Array.from(a as unknown as Iterable<bigint>, (b) => Number(b));
    }

    // Timestamp -> BigInt64Array, mise à l’échelle en millisecondes
    if (tid === Type.Timestamp) {
        const a = v.toArray() as BigInt64Array;
        const unit = (v.type as Timestamp).unit;
        const scale =
        unit === TimeUnit.SECOND ? 1000 :
        unit === TimeUnit.MILLISECOND ? 1 :
        unit === TimeUnit.MICROSECOND ? 1 / 1000 :
        1 / 1e6; // NANOSECOND
        // `treatAsTimestamp` est optionnel si tu veux forcer l’échelle uniquement dans certains cas
        const k = treatAsTimestamp ? scale : 1;
        return Float64Array.from(a as unknown as Iterable<bigint>, (b) => Number(b) * k);
    }

    // fallback (rare) : conversions diverses
    const tmp: number[] = Array.from({ length: v.length }, (_, i) => Number(v.get(i)));
    return Float64Array.from(tmp);
}