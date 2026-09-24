# Self-hosting: build the static app and serve it. No server side, no state.
# The build stage is pinned to the builder's architecture; its output is static
# files, so only the nginx stage differs per target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
