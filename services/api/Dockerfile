FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
RUN uv pip install --system -e ".[dev]"
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
CMD ["sh", "-c", "alembic upgrade head && uvicorn netvigil_api.main:app --host 0.0.0.0 --port 8000"]
