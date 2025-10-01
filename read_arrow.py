import pyarrow.ipc as pa_ipc

with pa_ipc.open_stream(open("window.arrow", "rb")) as r:
    tbl = r.read_all()
    print("Schema:", tbl.schema)
    print("Rows:", tbl.num_rows)

    # Afficher la première colonne brut
    print(tbl.column("time")[:10])
    print(tbl.column("value")[:10])
