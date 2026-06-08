# Requirement Completeness Rules

> Source: Extracted from Platform team principles #4, #5 and document guidance (proven in production).
> Direct transfer — applies to strategy output without modification.

---

- Missing information MUST be listed in `requirement_gaps` — never silently assumed
- Critical behavior undefined → lower confidence, lower depth
- Never assume missing business logic — if the spec doesn't say it, don't design tests for it
- If information is missing or ambiguous, state assumptions explicitly (platform principle #4: "create a test case that surfaces the ambiguity rather than assuming intent" → adapted: surface the gap in `requirement_gaps` rather than assuming coverage)
- Conflicting requirements between documents → flag in output, cite both sources, note which interpretation was used
