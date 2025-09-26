# TDMS Analytics

📊 **TDMS with ClickHouse Analytics** is a FastAPI application that analyzes and serves TDMS ingested data using ClickHouse. 
You can ingest big TDMS files and read it with the proposed endpoints.

---

## 🚀 Features

- ⚡ Fast SQL queries powered by ClickHouse
- 🌐 REST API served via FastAPI
- ⚡ 3rd party responses are cached in Redis
- 🐳 Docker + Poetry powered development
- 🔄 Automatic ClickHouse initialization and table creation

## 📦 How to run the app?
```
git clone <replace by my futur repo>
cd tdms-analytics
docker-compose up
```

## 📦 API endpoints and schema
* ...
* ...
* ...
* ...

Head to `/docs` to see the Swagger doc:

![swagger.png](images/swagger.png)


## Architecture
* Analytical queries - Clickhouse

## Local development
The project is managed with poetry, run `poetry install` to install and configure all necessary dependencies. 
Then, run `uvicorn pypi_clickhouse_analytics.main:app --reload` to start the app, you should see an output like:
```
INFO:     Started server process [40443]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

## Configuration
The app manages config like DB URL, cache TTL etc. using [pydantic-settings](https://pypi.org/project/pydantic-settings/).
The config is defined in `src/tdms-analytics/app_settings.py`. Each setting in the `Settings` class can be overridden with environment variables (.env file for example).