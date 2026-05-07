FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

# CPU-only PyTorch to avoid the 2 GB CUDA wheel
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install dependencies first (cached unless pyproject.toml changes)
COPY pyproject.toml ./
RUN uv pip install --system --no-install-project --extra-index-url https://download.pytorch.org/whl/cpu .

# Copy source and install the project itself (no dependency re-resolution)
COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "netvigil_detector.main"]
