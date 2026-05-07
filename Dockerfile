# ---- Etapa 1: Builder ----
FROM node:20-alpine AS builder

WORKDIR /app

# Definir ARGs para que Vite las inyecte en tiempo de compilación
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG GEMINI_API_KEY

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_GEMINI_API_KEY=$GEMINI_API_KEY

# Copiar manifiestos e instalar dependencias
COPY package.json package-lock.json ./
RUN npm install

# Copiar el resto del código fuente
COPY . .

# Compilar la aplicación
RUN npm run build

# ---- Etapa 2: Servidor ----
FROM nginx:alpine

# Copiar la build al directorio de Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Configuración de Nginx para SPA (React Router)
RUN echo 'server { \
    listen 80; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
