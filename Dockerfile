FROM python:3.11-slim AS api

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


# --- analytical batch image -------------------------------------------------------------
# The API image above deliberately ships WITHOUT duckdb (CLAUDE.md: "never a dependency of
# the base install or the live API"). The offline batches need it, so they get their own
# image layered on top rather than widening that one.
#
# ⚠️ This stage must stay LAST only by accident of file order, never by reliance on it: both
# compose files pin `target:` explicitly, because a bare `docker build .` takes the final
# stage and would otherwise put duckdb in the image that serves requests.
FROM api AS analytics
RUN pip install --no-cache-dir ".[analytical]"
CMD ["python", "-c", "import duckdb; print('analytical image; run a batch module explicitly')"]
