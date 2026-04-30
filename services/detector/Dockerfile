FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir uv
# Install CPU-only PyTorch first to avoid the ~2 GB CUDA wheel
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml ./
COPY src ./src
RUN uv pip install --system .
CMD ["python", "-m", "netvigil_detector.main"]
