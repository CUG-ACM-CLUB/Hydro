FROM node:22-bookworm
ARG VCS_REF=unknown
LABEL org.opencontainers.image.revision=$VCS_REF
WORKDIR /src
RUN corepack enable && corepack prepare yarn@4.18.1 --activate
COPY . .
RUN yarn install && yarn build:ui
ENV NODE_ENV=production
EXPOSE 8888
ENTRYPOINT ["sh", "/src/install/platform/entrypoint.sh"]
