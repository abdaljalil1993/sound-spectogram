import test from "node:test";
import assert from "node:assert/strict";

import { validateIncomingDevicePayload } from "../src/utils/validation";

test("accepts snake_case frequency_bins payloads and preserves them", () => {
  const result = validateIncomingDevicePayload({
    deviceId: 1,
    start_time: "2025-01-01T00:00:00.000Z",
    end_time: "2025-01-01T00:00:01.000Z",
    data: [
      [1, 2],
      [3, 4]
    ],
    frequency_bins: [100, 200]
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.parsed?.frequencyBins, [100, 200]);
});
