FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
COPY src ./src
COPY alembic.ini ./
COPY migrations ./migrations
RUN uv pip install --system .

CMD ["sh", "-c", "echo '[start] running alembic...' && (timeout 60 alembic upgrade head && echo '[start] migrations ok') || echo '[start] alembic timed-out or failed, continuing anyway' ; echo '[start] starting uvicorn on port '${PORT:-8000} && exec uvicorn aankhanet_api.main:app --host 0.0.0.0 --port ${PORT:-8000} --log-level info"]
