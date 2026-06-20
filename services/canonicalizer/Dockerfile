# Base image runs the service with the deterministic floor + hashing embedder.
# For real embeddings build with: --build-arg EXTRAS=ml (adds sentence-transformers).
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

COPY requirements.txt requirements-llm.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-llm.txt

COPY canonicalizer ./canonicalizer
COPY data ./data

EXPOSE 8000
CMD ["uvicorn", "canonicalizer.api:app", "--host", "0.0.0.0", "--port", "8000"]
