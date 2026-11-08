import { processDueFioIntegrations } from "../src/modules/fio/service";

const pollIntervalMs = 30_000;
let stopping = false;

process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

async function wait(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  while (!stopping) {
    try {
      const result = await processDueFioIntegrations();
      if (result.processed > 0) {
        console.info("Fio synchronization cycle completed.", result);
      }
    } catch {
      console.error("Fio synchronization cycle failed safely.");
    }
    if (!stopping) await wait(pollIntervalMs);
  }
}

void main().catch(() => {
  console.error("Fio synchronization worker stopped unexpectedly.");
  process.exitCode = 1;
});
