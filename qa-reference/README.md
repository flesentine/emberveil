# Emberveil QA reference package

This directory accompanies the full integrated QA build.

## Contents

- `src/qa/DeveloperConsole.ts` — the in-engine F10 developer command console.
- `tools/test-quality-assurance.mjs` — the executable 13-suite regression runner used against the complete integrated project.
- `tools/verify-reference.mjs` — dependency-free repository check used by GitHub Actions.
- `HIGH_PRIORITY_FIXES.patch` — focused patch for the two high-priority persistence defects discovered in this pass.

The full integrated project also includes the developer host wiring, runtime debug methods, package scripts, and all automated tests. The repository keeps the new QA work isolated and reviewable because the preceding branches contain reference source packs rather than the complete game tree.

Run the complete suite in the integrated project with:

```bash
npm run verify:qa
```

The physical-device manual checklist remains intentionally marked **Not tested** until executed on the listed browsers and hardware.
