curl.exe -X GET "http://localhost:3001/dataset/health" -H "Content-Type: application/json" -v
  
curl.exe -X GET "http://localhost:3001/dataset/api/constraints" -H "Content-Type: application/json" -v
  
curl.exe -X GET "http://localhost:3001/dataset/datasets" -H "Content-Type: application/json" -v
  
Measure-Command {curl.exe -X POST "http://localhost:3001/dataset/ingest" -H "Content-Type: multipart/form-data" -H "Cookie: connect.sid=s%3ANlFCBUzUw-Ec78KXDEaP6jIGjvOBC3kS.z89zEM0UdNyofXuwbVEi6dHDjNzxGeCQoXvWILgUVqE" -F "file=@big_sample.tdms" -v}

curl.exe -X GET "http://localhost:3001/dataset/dataset_meta?dataset_id=3b4c4f32-85c4-46ed-9ca4-15b4d6ae03d8" -H "Content-Type: application/json" -v

curl.exe -X GET "http://localhost:3001/dataset/datasets/3b4c4f32-85c4-46ed-9ca4-15b4d6ae03d8/channels" -H "Content-Type: application/json" -v

curl.exe -X GET "http://localhost:3001/dataset/channels/7a91a017-410a-4d8e-9827-7da0915264bb/time_range" -H "Content-Type: application/json" -v

curl.exe -X GET "http://localhost:3001/dataset/window?channel_id=7a91a017-410a-4d8e-9827-7da0915264bb&start=2021-09-30T20:00:00Z&end=2021-09-30T21:00:00Z&points=2000&method=uniform" -H "Content-Type: application/json" -v

curl.exe -X GET "http://localhost:3001/dataset/window?channel_id=7a91a017-410a-4d8e-9827-7da0915264bb&start_sec=0&end_sec=3600&relative=true&points=1500" -H "Content-Type: application/json" -v

curl.exe -X GET "http://localhost:3001/dataset/window?channel_id=7a91a017-410a-4d8e-9827-7da0915264bb&points=1000" -H "Accept: application/vnd.apache.arrow.stream" --output window.arrow -v

Measure-Command {curl.exe -X GET "http://localhost:3001/dataset/get_window_filtered?channel_id=7a91a017-410a-4d8e-9827-7da0915264bb&limit=100000&points=2000&method=lttb" -H "Content-Type: application/json" -v}

curl.exe -X DELETE "http://localhost:3001/dataset/datasets/a562371b-3d12-4af5-9956-202b89bf48c8" -H "Cookie: connect.sid=s%3ANlFCBUzUw-Ec78KXDEaP6jIGjvOBC3kS.z89zEM0UdNyofXuwbVEi6dHDjNzxGeCQoXvWILgUVqE" -v