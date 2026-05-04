FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv
COPY pyproject.toml ./
COPY src ./src
RUN uv pip install --system .
CMD ["python", "-m", "netvigil_dispatcher.main"]
