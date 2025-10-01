import io
from typing import Iterable, Optional

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as pa_ipc
from starlette.responses import StreamingResponse
from starlette.requests import Request


ARROW_MIME = "application/vnd.apache.arrow.stream"


def client_wants_arrow(request: Request) -> bool:
    """
    True si le client a mis `Accept: application/vnd.apache.arrow.stream`
    (négociation de contenu).
    """
    accept = request.headers.get("accept", "")
    return ARROW_MIME in accept.lower()


def dataframe_to_arrow_streaming_response(
    df: pd.DataFrame,
    filename: Optional[str] = "window.arrow",
) -> StreamingResponse:
    """
    Sérialise un pandas.DataFrame en Arrow IPC stream (sans index) et renvoie une StreamingResponse.
    """
    # IMPORTANT: pas d'index en colonne
    table = pa.Table.from_pandas(df, preserve_index=False)
    sink = pa.BufferOutputStream()
    with pa_ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    buf = sink.getvalue()  # pyarrow.Buffer

    return StreamingResponse(
        io.BytesIO(buf.to_pybytes()),
        media_type=ARROW_MIME,
        headers={
            # Pour debug Chrome (devtools) et download éventuel:
            "Content-Disposition": f'inline; filename="{filename}"'
        },
    )