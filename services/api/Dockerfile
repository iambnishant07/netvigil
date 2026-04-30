FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN uv pip install --system .
CMD ["sh", "-c", "alembic upgrade head && uvicorn netvigil_api.main:app --host 0.0.0.0 --port 8000"]
