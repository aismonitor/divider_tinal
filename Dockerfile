FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html divider.html editor.html home.js divider.js editor.js styles.css /usr/share/nginx/html/
COPY vendor/jszip.min.js /usr/share/nginx/html/vendor/jszip.min.js

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
