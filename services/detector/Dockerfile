FROM python:3.12-slim
WORKDIR /app

ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv
# CPU-only PyTorch — separate layer so it stays cached across source changes
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install all other dependencies before copying source.
# A minimal stub lets hatchling discover the package without real source.
# This layer only re-runs when pyproject.toml changes, not on every code push.
COPY pyproject.toml ./
RUN mkdir -p src/netvigil_detector && \
    printf '__version__ = "0.0.0"\n' > src/netvigil_detector/__init__.py
RUN uv pip install --system .

# Copy real source and reinstall only the project package (deps already cached)
COPY src ./src
RUN uv pip install --system --no-deps .

CMD ["python", "-m", "netvigil_detector.main"]
