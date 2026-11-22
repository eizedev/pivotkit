# syntax=docker/dockerfile:1
#
# The container image of pivotkit: the REST service, the MCP server and the command line from one
# install (docs/reference/container.md). Built from this repository at a release tag, from the root
# lock file (no install scripts), onto a distroless Node 24 image that runs as a fixed non-root user.
#
#   docker build -f docker/Dockerfile -t pivotkit .
#
# The base images are pinned by digest; .github/workflows/image.yml builds, tests and publishes it.

ARG BUILD_IMAGE=node:24-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54
ARG RUNTIME_IMAGE=gcr.io/distroless/nodejs24-debian12:nonroot@sha256:14d42e2511532589a7c7e01a753667a74fcc96266e137e8125006b87b0c32d0a

FROM ${BUILD_IMAGE} AS build
WORKDIR /src
COPY package.json package-lock.json LICENSE ./
COPY packages/ packages/
# the CLI's example files (pivotkit example) are build output: made from the playground's data and
# the print templates
COPY scripts/examples.js scripts/is-main.js scripts/
COPY examples/playground/src/data.js examples/playground/src/
COPY examples/playground/data/ examples/playground/data/
COPY examples/report-templates/ examples/report-templates/
# only the three commands and what they need at run time, at the lock file's versions
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund --include-workspace-root=false \
        --workspace pivotkit-server --workspace pivotkit-mcp --workspace pivotkit-cli \
    && node scripts/examples.js \
    && mkdir -p /app/packages \
    && for p in core xlsx report node cli server mcp; do cp -a "packages/pivotkit-$p" /app/packages/; done \
    && rm -rf /app/packages/*/test /app/packages/*/bench /app/packages/*/node_modules \
    && cp -a node_modules LICENSE /app/ \
    && mkdir -p /app/examples /out \
    && gunzip -c packages/pivotkit-cli/examples/sales.csv.gz > /app/examples/sales.csv \
    && mkdir -m 0700 /state

FROM ${RUNTIME_IMAGE}
LABEL org.opencontainers.image.title="pivotkit" \
      org.opencontainers.image.description="pivotkit's REST service, MCP server and command line" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.documentation="https://pivotkit.eize.dev/reference/container/"
COPY --from=build /app /app
# an output directory for a configuration that names /out, owned by the user that writes it (a named
# volume mounted there takes that owner). No VOLUME, as for the state directory below: an anonymous
# volume nobody named keeps nothing anyone finds again
COPY --from=build --chown=10001:10001 /out /out
# the state directory: the token and keys made at the first start (state.js), only this user's. No
# VOLUME: an anonymous volume would hide that nothing keeps it; mount a named one (-v pivotkit:/var/lib/pivotkit),
# which takes this owner and mode when it is new
COPY --from=build --chown=10001:10001 --chmod=0700 /state /var/lib/pivotkit
# `pivotkit-server` on the PATH, for docker exec / kubectl exec (distroless has no /usr/bin/env)
COPY --chmod=0755 docker/pivotkit-server /usr/local/bin/pivotkit-server
WORKDIR /app
# the log as JSON lines: docker run -t gives the process a terminal, where "auto" would write text;
# a configuration's log.format still wins
# /config/pivotkit.json missing and /config empty: the built-in example configuration (state.js)
ENV NODE_ENV=production \
    PIVOTKIT_CONFIG=/config/pivotkit.json \
    PIVOTKIT_STATE_DIR=/var/lib/pivotkit \
    PIVOTKIT_PORT=3333 \
    PIVOTKIT_LOG_FORMAT=json
# a fixed user and group, not the base image's: the operator owns /out by this id
USER 10001:10001
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=6s --start-period=15s --retries=3 \
    CMD ["/nodejs/bin/node", "/app/packages/pivotkit-server/bin/pivotkit-server.js", "healthcheck"]
ENTRYPOINT ["/nodejs/bin/node", "/app/packages/pivotkit-server/bin/pivotkit-server.js"]
# serve on every address of the container: without a token of its own the server makes one in the
# state directory (pivotkit-server token show admin prints it); it never serves without auth here
CMD ["serve", "--host", "0.0.0.0"]
