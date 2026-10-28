# A disposable Linux box with the newest release of every command-line agent this CLI schedules.
# Build with --no-cache to pick up new releases; nothing here is pinned on purpose.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates curl git unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
  && ln -s /root/.bun/bin/bun /usr/local/bin/bun

RUN npm install -g @openai/codex@latest @anthropic-ai/claude-code@latest opencode-ai@latest \
  && npm install -g --ignore-scripts @earendil-works/pi-coding-agent@latest

# The installer links the binary as both `agent` and `cursor-agent` under ~/.local/bin.
RUN curl https://cursor.com/install -fsS | bash
ENV PATH="/root/.local/bin:${PATH}"

# Codex sandboxes its own shell with bubblewrap; without it, edit runs can't write anything.
RUN apt-get update \
  && apt-get install -y --no-install-recommends bubblewrap \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /work
WORKDIR /work
COPY inside.sh /usr/local/bin/sandbox-inside
RUN chmod +x /usr/local/bin/sandbox-inside
ENTRYPOINT ["sandbox-inside"]
