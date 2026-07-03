FROM python:3.11-slim

WORKDIR /app

# Install the package (and its runtime deps) without dev extras.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

# SQLite cache lives here (see config.py:secfin_db_path); mount a volume at /app/data
# to persist it across container restarts.
RUN mkdir -p /app/data

EXPOSE 8000

# SEC_USER_AGENT must be set at runtime (-e SEC_USER_AGENT="app you@example.com");
# requests without a descriptive User-Agent are blocked by the SEC.
CMD ["uvicorn", "secfin.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
