# Task 2 Report: Expose server functions and query options

## Status

**Completed successfully.**

## Files Changed

- `src/lib/data.fn.ts`
- `src/lib/sla-data.ts`

## Changes Summary

### `src/lib/data.fn.ts`

1. Extended `qidsFilterSchema` with `categories` and `statuses` fields.
2. Added `statsFilterSchema` and `fetchVulnerabilityStats` server function after `fetchReports`.

### `src/lib/sla-data.ts`

1. Imported `fetchVulnerabilityStats` from `./data.fn`.
2. Added `VulnerabilityStats` type definition.
3. Added `status: string;` field to `QidRow` type.
4. Extended `qidsQueryOptions` filters parameter with `categories` and `statuses`.
5. Added `vulnerabilityStatsQueryOptions` function.

## Commands Run

### Build Verification

```
cmd /c "bun run build"
```

**Output:**

- Client build: `✓ built in 2.15s`
- SSR build: `✓ built in 1.06s`
- Nitro build: `✓ built in 2.16s`
- No TypeScript errors encountered.

## Concerns

None. Build passed cleanly with zero errors.
