---
name: with-evidence
description: "Require cited evidence from real web sources before making external factual claims. Use for verification, comparisons, recommendations, docs/API behavior, current information, pricing/licensing, security, legal/regulatory, medicine, finance, or any answer where guessing would be harmful."
---

# with-evidence

Use this skill when the user asks for factual claims, recommendations, comparisons, technical explanations, legal/regulatory facts, pricing/licensing details, API behavior, library/framework behavior, current events, or anything where guessing would be harmful.

## Goal

Prevent unsupported claims. Back every important external factual assertion with evidence from credible, reachable web sources.

## When to Use

Use this skill when the user asks:

- "Is this true?"
- "Which one is better?"
- "How does this work?"
- "What does the documentation say?"
- "Can you verify?"
- "Compare X and Y"
- "What is the current status/version/pricing/license?"
- Any claim involving external facts, APIs, docs, standards, laws, security, medicine, finance, or current information

Do not use for:

- Pure brainstorming
- Creative writing
- User-provided private context only
- Simple local code edits where evidence is the repository itself

## Evidence Rules

1. Use real website links as evidence.
2. Prefer primary sources:
   - Official documentation
   - Standards/specifications
   - Vendor pages
   - Government/regulatory sites
   - Maintainer repositories
   - Release notes/changelogs
3. Use secondary sources only when primary sources are unavailable.
4. Do not cite random blogs unless clearly marked as secondary.
5. Do not invent URLs, quotes, document titles, versions, or claims.
6. If evidence cannot be found, say so directly.
7. If sources disagree, explain the disagreement.
8. If evidence is stale or date-sensitive, mention the source date or version.
9. For local repository claims, cite file paths and line/function names instead of web links.

## Workflow

1. Identify key claims that need evidence.
2. Search or fetch credible sources.
3. Read enough source material to verify each claim.
4. Answer with claims tied to citations.
5. Separate verified facts, reasoned interpretation, and uncertainty.
6. Avoid overclaiming.

## Answer Format

Use this structure when appropriate:

```md
## Answer

[Short answer.]

## Evidence

- [Claim]: [source title/name] — [URL]
- [Claim]: [source title/name] — [URL]

## Notes / Uncertainty

[Any caveats, outdated info risk, conflicting sources, or missing evidence.]
```

Inline citations are preferred for dense answers:

```md
React recommends Effects only for synchronizing with external systems, not for deriving render data. Evidence: React docs — https://react.dev/learn/you-might-not-need-an-effect
```

For comparisons:

```md
| Claim | Evidence |
|---|---|
| X supports Y | Official docs: URL |
| Z deprecated A | Release notes: URL |
```

## Failure Mode

If no reliable evidence is available:

```md
I could not verify this from a reliable public source. I should not claim it as fact.
```

If browsing/web access is unavailable:

```md
I cannot verify external evidence in this environment right now. I can give a tentative answer, but it should not be treated as verified.
```

## Strong Requirement

Never present an external factual claim as certain unless it is supported by cited evidence.
