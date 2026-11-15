// The example of docs/reference/sources.md (Code sources), as written there, compiled with strict
// TypeScript against the generated declarations; keep the two the same.
import { createContext, SourceError } from "pivotkit-server";

const context = await createContext({
  sources: {
    tickets: {
      title: "Open tickets",
      load: async (params, { caller, signal }) => {
        const res = await fetch(`https://tickets.example.com/api/teams/${encodeURIComponent(params.team)}`, {
          signal,
          headers: { "x-on-behalf-of": caller.subject ?? caller.client }
        });
        if (res.status === 403) throw new SourceError("NOT_ALLOWED", { publicMessage: "You may not see this team's tickets." });
        if (res.status === 404) throw new SourceError("DATA_NOT_AVAILABLE", { publicMessage: "There is no such team." });
        if (!res.ok) throw new SourceError("SOURCE_UNAVAILABLE", { status: res.status });
        const body = await res.json();
        return { rows: body.items, asOf: body.generatedAt };
      },
      params: { team: { type: "string", required: true, enum: ["blue", "red"], description: "The team" } },
      timeMs: 20000,
      ttl: 120,
      maxStale: 3600,
      policy: { default: "summary", fields: { Team: "show", Status: "values" } }
    },
    rates: {
      // the same data for everyone: one copy, and load gets no caller
      load: async (_params, { caller, signal }) => {
        const res = await fetch("https://rates.example.com/today.json", { signal });
        return { rows: caller === null ? await res.json() : [], asOf: new Date() };
      },
      cacheShared: true,
      ttl: 600
    }
  }
});

await context.close();
