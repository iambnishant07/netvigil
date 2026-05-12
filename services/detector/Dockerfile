FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

# Stub lets hatchling discover the package so uv can install all deps
# without the real source. Layer only re-runs when pyproject.toml changes.
# --extra-index-url prevents uv from pulling CUDA transitive deps for torch.
COPY pyproject.toml ./
RUN mkdir -p src/aankha_detector && \
    printf '__version__ = "0.0.0"\n' > src/aankha_detector/__init__.py
RUN uv pip install --system \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    .

# Overwrite stub with real source; reinstall project only (deps already cached)
COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "aankha_detector.main"]
