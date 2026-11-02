# Static-analysis image: Python + Slither + solc (+ optional Aderyn).
# Build: docker build -t syndicate .
# Run (free mode, no API key needed):
#   docker run --rm -v "$PWD/contracts:/work" syndicate audit /work --static-only --out /work/report.md
FROM python:3.12-slim

ARG SOLC_VERSIONS="0.8.24 0.8.20 0.7.6"
RUN apt-get update && apt-get install -y --no-install-recommends git curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml README.md ./
COPY config ./config
COPY src ./src
RUN pip install --no-cache-dir -e . slither-analyzer solc-select \
    && for v in $SOLC_VERSIONS; do solc-select install "$v"; done \
    && solc-select use $(echo $SOLC_VERSIONS | cut -d' ' -f1)

# Aderyn is optional; uncomment to include it.
# RUN curl -L https://raw.githubusercontent.com/Cyfrin/up/main/install | bash && /root/.cyfrin/bin/cyfrinup

ENTRYPOINT ["syndicate"]
