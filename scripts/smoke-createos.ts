import { createOSFromEnvironment } from "../lib/sandbox/createos";
import { runSandboxSmokeTest } from "../lib/sandbox/smoke";

void runSandboxSmokeTest(createOSFromEnvironment, process.env.CREATEOS_SANDBOX_SHAPE?.trim() || undefined)
  .then((result) => {
    // The SDK's shared HTTP/2 pool can keep a CLI alive after all work ends.
    // Exit only after cleanup has completed and the result has been flushed.
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`, () => {
      process.exit(result.status === "PASSED" ? 0 : 1);
    });
  }).catch(() => {
    process.stderr.write("Smoke-test result could not be produced. Check the CreateOS account for a sandbox named aegis-smoke-* before retrying.\n", () => process.exit(1));
  });
