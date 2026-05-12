FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN mkdir -p src/aankha_ingestor && \
    printf '__version__ = "0.0.0"\n' > src/aankha_ingestor/__init__.py
RUN uv pip install --system .

COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "aankha_ingestor.main"]
