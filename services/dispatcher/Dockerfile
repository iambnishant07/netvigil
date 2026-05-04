FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY pyproject.toml ./
COPY src ./src
RUN uv pip install --system .
CMD ["python", "-m", "netvigil_dispatcher.main"]
