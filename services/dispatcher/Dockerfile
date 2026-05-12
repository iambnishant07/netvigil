FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

COPY pyproject.toml ./
RUN mkdir -p src/aankha_dispatcher && \
    printf '__version__ = "0.0.0"\n' > src/aankha_dispatcher/__init__.py
RUN uv pip install --system .

COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "aankha_dispatcher.main"]
