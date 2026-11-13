/**
 * e2e/sandbox/time-travel.mjs
 * 
 * Helper library for shifting time offset in the isolated test backend.
 * Enables deterministic testing of:
 * - 14:00 Digital lock key release and cleaning badge
 * - 18:00 Maid shift turnover and daily summary
 * - 22:00 / 05:00 Breakfast cutoff rules
 */

/**
 * Shifts the backend clock by a specific millisecond offset.
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @param {number} options.offsetMs
 * @returns {Promise<object>}
 */
export async function setTimeTravelOffset(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const offsetMs = Number(options.offsetMs || 0);

  const res = await fetch(`${baseUrl}/api/test/time-travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offsetMs })
  });

  if (!res.ok) {
    throw new Error(`[time-travel] Failed to set offset: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Shifts the backend clock to a specific hour of today in Brasília time.
 * E.g., targetHour = 14 shifts to 14:00 (lock key release), 18 to 18:00 (maid shift), 22 to 22:00 (breakfast cutoff).
 * 
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @param {number} options.targetHour - Hour in 24h format (0 to 23)
 * @returns {Promise<object>}
 */
export async function setTimeTravelHour(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const targetHour = Number(options.targetHour);

  if (isNaN(targetHour) || targetHour < 0 || targetHour > 23) {
    throw new Error(`[time-travel] Invalid targetHour: ${options.targetHour}. Expected 0-23.`);
  }

  const res = await fetch(`${baseUrl}/api/test/time-travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetHour })
  });

  if (!res.ok) {
    throw new Error(`[time-travel] Failed to set target hour: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return {
    ...data,
    hour: data.brasilia?.hour ?? targetHour
  };
}

/**
 * Shifts the backend clock to an arbitrary target date string.
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @param {string} options.targetDate - ISO date or string parseable by Date
 * @returns {Promise<object>}
 */
export async function setTimeTravelDate(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");
  const targetDate = options.targetDate;

  const res = await fetch(`${baseUrl}/api/test/time-travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetDate })
  });

  if (!res.ok) {
    throw new Error(`[time-travel] Failed to set target date: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Resets the simulated clock back to the real system clock (offset 0).
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @returns {Promise<object>}
 */
export async function resetTimeTravel(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/api/test/time-travel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reset: true })
  });

  if (!res.ok) {
    throw new Error(`[time-travel] Failed to reset time travel: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Gets the current simulated time status and Brasília time components.
 * @param {object} options
 * @param {string} [options.baseUrl="http://127.0.0.1:5055"]
 * @returns {Promise<object>}
 */
export async function getTimeTravelStatus(options = {}) {
  const baseUrl = (options.baseUrl || "http://127.0.0.1:5055").replace(/\/+$/, "");

  const res = await fetch(`${baseUrl}/api/test/time-travel`);
  if (!res.ok) {
    throw new Error(`[time-travel] Failed to get status: ${res.status} ${res.statusText}`);
  }
  return await res.json();
}
