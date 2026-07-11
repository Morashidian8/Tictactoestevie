FROM python:3.11-slim

WORKDIR /app

COPY polybot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY polybot/ polybot/

ENV POLYBOT_TOKEN=
EXPOSE 8700

CMD ["uvicorn", "polybot.api:app", "--host", "0.0.0.0", "--port", "8700"]
