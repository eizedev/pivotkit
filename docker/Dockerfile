# syntax=docker/dockerfile:1
#
# The container image of pivotkit: the REST service, the MCP server and the command line from one
# install (docs/reference/container.md). Built from this repository at a release tag, from the root
# lock file (no install scripts), onto a distroless Node 22 image that runs as a fixed non-root user.
#
#   docker build -f docker/Dockerfile -t pivotkit .
#
# The base images are pinned by digest; .github/workflows/image.yml builds, tests and publishes it.

ARG BUILD_IMAGE=node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs22-debian12:nonroot@sha256:13593b7570658e8477de39e2f4a1dd25db2f836d68a0ba771251572d23bb4f8e

FROM ${BUILD_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json LICENSE ./
COPY packages/ packages/
# the CLI's example files (pivotkit example) are build output: made from the playground's data
COPY scripts/examples.js scripts/
COPY examples/playground/src/data.js examples/playground/src/
COPY examples/playground/data/ examples/playground/data/
# only the three commands and what they need at run time, at the lock file's versions
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --include-workspace-root=false \
        --workspace pivotkit-server --workspace pivotkit-mcp --workspace pivotkit-cli \
    && node scripts/examples.js \
    && mkdir -p /app/packages \
    && for p in core xlsx report cli server mcp; do cp -a "packages/pivotkit-$p" /app/packages/; done \
    && rm -rf /app/packages/*/test /app/packages/*/bench /app/packages/*/node_modules \
    && cp -a node_modules LICENSE /app/ \
    && mkdir /out

FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="pivotkit" \
      org.opencontainers.image.description="pivotkit's REST service, MCP server and command line" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.documentation="https://pivotkit.eize.dev/reference/container/"
COPY --from=build /app /app
# the output directory, owned by the user that writes it (a volume created from it keeps that owner)
COPY --from=build --chown=10001:10001 /out /out
WORKDIR /app
ENV NODE_ENV=production \
    PIVOTKIT_CONFIG=/config/pivotkit.json \
    PIVOTKIT_PORT=3333
# a fixed user and group, not the base image's: the operator owns /out by this id
USER 10001:10001
EXPOSE 3333
VOLUME ["/out"]
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
    CMD ["/nodejs/bin/node", "/app/packages/pivotkit-server/bin/pivotkit-server.js", "healthcheck"]
ENTRYPOINT ["/nodejs/bin/node", "/app/packages/pivotkit-server/bin/pivotkit-server.js"]
# serve on every address of the container: the server refuses to start so without auth token or oauth
CMD ["serve", "--host", "0.0.0.0"]
