# Progress - Worker M1 Fix

Last visited: 2026-10-11T01:41:30Z

## Status
- Concurrency and Race Condition resolved via atomic insertion and rollback.
- Pre-reservation lifecycle fixed: `paymentStatus === "pago_total"` retention, `commit-reservation` expired rejection with 400 PRE_RESERVATION_EXPIRED, configurable holdMinutes.
- Tariff Engine & Calendar fixed: extracted shared `findEffectiveTariffOverride`, channel normalization, string array `daysOfWeek.map(Number)` in bulk-update.
- Twin-server parity verified: SHA-256 match `40F566578E37E633F8A426C7B01ADC3BE98DB37CFD14E53CE73FA87BDF28670E` identical.
- All 5 test suites pass with 100% success (55/55 passed, 0 failures).
- Additional regression suites pass with 100% success (56/56 passed).
- Frontend in `artifacts/limpeza` built cleanly.
- `handoff.md` created.
- Ready for git commit and push.
