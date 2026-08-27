FROM python:3.12-alpine

RUN apk add --no-cache git docker-cli docker-cli-compose openssh-client wget

WORKDIR /app
COPY server.py /app/server.py

ENV REPO_DIR=/repo \
    UPDATE_PORT=8080 \
    UPDATE_LISTEN=0.0.0.0 \
    PYTHONUNBUFFERED=1

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health >/dev/null || exit 1

CMD ["python", "-u", "/app/server.py"]
