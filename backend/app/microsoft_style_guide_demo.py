"""Hardcoded coding-conventions guide for demos (OnBirdie style review).

Based on Microsoft Learn — World Locking Tools coding guidelines (C# / Unity), which align
with broader Microsoft code style. See:
https://learn.microsoft.com/en-us/previous-versions/mixed-reality/world-locking-tools/documentation/howtos/codingconventions

Production: set STYLE_GUIDE_USE_MICROSOFT_DEMO=false to use employer.style_guide from MongoDB.
"""

MICROSOFT_STYLE_GUIDE_DEMO = """# OnBirdie demo — Microsoft-style coding conventions (code only)

This guide is for **code structure and style**, not documentation voice or marketing prose.
Reviewers must only cite rules that appear below.

## License header (C# / project policy)
- Public scripts may require the standard MIT header block exactly as the repo specifies.

## Documentation comments
- Public APIs: use XML/doc comments (`/// <summary>`) describing purpose and use.
- Omit doc comments only when the repo explicitly allows it.

## Namespaces
- Place types in appropriate namespaces; do not omit namespaces for public types when the repo requires them.

## Indentation: spaces vs tabs
- Use **spaces for indentation** (e.g. four spaces per level) unless the repo specifies otherwise.
- Put a space between keywords and `(` for control flow: `if (`, `while (`, `for (` — not `if(`.

## Spacing around brackets and calls
- No extra spaces inside `[]` or between type name and `(` in constructors: `new int[9]`, `new Vector2(0f, 10f)`.
- Do not insert spaces like `int[ ]` or `new Vector2 ( 0f, 10f )`.

## Naming
- **PascalCase** for public/protected/virtual members and types.
- **camelCase** for private fields and locals (unless repo or serialization requires otherwise).

## Access modifiers
- Always declare `public`, `private`, `protected`, or `internal` explicitly where the language allows.
- Prefer `private` fields with public/protected properties when exposing state.

## Braces
- Always use braces for `if` / `else` / `while` / `for` bodies, one statement per block when multi-line.
- Place opening `{` on its own line for methods/types (Allman / common C# style) when that is the team standard.

## One public type per file
- Prefer one public class/struct/enum per file; nested public types are discouraged unless small and private.

## Enums
- Name enums with a **Type** suffix when that is the convention (e.g. `OrderingType`).
- Put default / none values first when extending enums safely.
- Use `[Flags]` when multiple enum values may combine.

## Performance and clarity (when relevant)
- Prefer `for` with index over `foreach` when hot paths and the collection supports indexing.
- Prefer `DateTime.UtcNow` over `DateTime.Now` unless local time is required.
- Avoid per-frame allocations in tight loops; cache references where appropriate.

## Cross-language note (TypeScript, JavaScript, Python, etc.)
- Apply the **same spirit**: consistent indentation (spaces), spacing after `if`/`while`/`for`, explicit access/export patterns where the language has them, clear naming (PascalCase vs camelCase per language norms), and braces/blocks as idiomatic for that language.

"""
