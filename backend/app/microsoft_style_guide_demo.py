"""Hardcoded Microsoft Writing Style Guide excerpt for demos (OnBirdie part 4).

Production can set STYLE_GUIDE_USE_MICROSOFT_DEMO=false to use the employer record from MongoDB.
Inspired by the Microsoft Writing Style Guide (voice, capitalization, accessibility, inclusive language).
"""

MICROSOFT_STYLE_GUIDE_DEMO = """# Microsoft Writing Style Guide — demo excerpt (OnBirdie)

Use this as the authority for reviews below. Prefer clarity and consistency with these rules.

## Voice and tone
- Use clear, concise language. Prefer active voice.
- Speak to the reader directly with "you" when it fits the context.
- Avoid unnecessary jargon; define terms on first use when needed.

## Capitalization
- Use sentence case for headings, titles, and UI labels unless a proper noun requires title case.
- Do not use ALL CAPS for emphasis in prose or UI copy.

## Punctuation and lists
- Use the Oxford (serial) comma in lists of three or more items when it improves clarity.
- In UI: keep button and menu labels short; no trailing punctuation on standalone buttons.

## Code-adjacent conventions (general)
- Prefer meaningful identifiers; avoid cryptic abbreviations except common ones (id, url, api).
- User-visible strings and comments should follow the voice rules above.

## Accessibility
- Do not rely on color alone to convey meaning.
- When text describes UI, name controls as users see them.

## Inclusive language
- Use inclusive, neutral wording; avoid terms that unnecessarily exclude or stereotype.

## Error and status messages
- State what happened, then what the user can do next. Avoid blaming the user.
"""
