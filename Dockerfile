FROM alpine:3.21
WORKDIR /app
RUN apk add --no-cache nodejs python3 py3-pip supervisor curl bash \
    && curl -L https://github.com/odise/go-cron/releases/download/v0.0.7/go-cron-linux.gz | zcat > /usr/local/bin/go-cron \
    && chmod +x /usr/local/bin/go-cron
COPY . .
RUN chmod +x /app/run_once.sh \
    && pip3 install --no-cache-dir --break-system-packages requests python-dotenv \
    && apk del py3-pip curl
CMD ["/usr/bin/supervisord", "-c", "/app/supervisord.conf"]