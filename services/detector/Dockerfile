FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

# Install all project dependencies without building the package itself.
# --no-install-project: only deps, not the project — this layer caches unless
#   pyproject.toml changes.
# --extra-index-url: lets uv resolve torch to the CPU-only wheel instead of
#   pulling CUDA transitive deps (nvidia-nccl-cu12 etc.) from PyPI.
COPY pyproject.toml ./
RUN uv pip install --system --no-install-project \
    --extra-index-url https://download.pytorch.org/whl/cpu \
    .

# Copy real source and install only the project package — deps already cached
COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "netvigil_detector.main"]
