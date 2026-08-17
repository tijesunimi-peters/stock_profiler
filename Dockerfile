# --- frontend build ---------------------------------------------------------------------
# Builds `clearyfi_frontend` into a static bundle the API serves at /app. Its own stage, so
# Node never reaches the runtime image -- the thing that serves requests stays a slim Python
# image with no JS toolchain in it.
#
# `CLEARYFI_BASE=/app/` is passed explicitly rather than left to the config's NODE_ENV default,
# because the mount point is a DEPLOYMENT fact and belongs where the deployment is described.
FROM node:22-slim AS frontend
WORKDIR /build
# Manifests first: `npm ci` is the expensive layer and only needs to re-run when deps change.
COPY clearyfi_frontend/package.json clearyfi_frontend/package-lock.json ./
RUN npm ci
COPY clearyfi_frontend/ ./
RUN npm run build && CLEARYFI_BASE=/app/ npm run app:build


FROM python:3.11-slim AS api

WORKDIR /app

# Install the package (and its runtime deps) without dev extras.
COPY pyproject.toml README.md ./
COPY src ./src
RUN pip install --no-cache-dir .

# The built SPA, served by `api/main.py` at /app (see APP_DIR there). Copied AFTER the pip
# install so a frontend-only change does not invalidate the Python layer.
#
# ⚠️ Into SITE-PACKAGES, not /app/src. `pip install .` COPIES the package, so `__file__` resolves
# under site-packages and a bundle dropped in the source tree would never be found -- the app
# would 404 with the files sitting right there.
COPY --from=frontend /build/app-dist /usr/local/lib/python3.11/site-packages/secfin/api/app

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
