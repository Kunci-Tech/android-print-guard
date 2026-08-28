# Domain Docs

How engineering skills consume this repository's domain documentation.

## Before exploring

- Read root `CONTEXT.md` for the domain glossary.
- Read ADRs under `docs/adr/` that affect the area being changed.
- If a document or directory does not exist, proceed silently; domain-modeling workflows create them lazily.

## Layout

This is a single-context repository:

```text
/
|-- CONTEXT.md
|-- docs/adr/
`-- src/
```

## Vocabulary

Use terms defined in `CONTEXT.md` in issue titles, specifications, tests, and implementation proposals. Avoid synonyms that the glossary explicitly rejects. If a needed concept is absent, record the gap for a domain-modeling workflow.

## ADR conflicts

Surface any conflict with an existing ADR explicitly instead of silently overriding it.
