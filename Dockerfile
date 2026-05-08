FROM nginx:alpine

COPY index.html styles.css scripts.js /usr/share/nginx/html/

EXPOSE 80
