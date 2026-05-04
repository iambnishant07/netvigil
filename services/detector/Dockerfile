FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
# CPU-only PyTorch to avoid the 2 GB CUDA wheel
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml ./
COPY src ./src
RUN uv pip install --system .
CMD ["python", "-m", "netvigil_detector.main"]
