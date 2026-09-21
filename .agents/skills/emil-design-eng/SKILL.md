---
name: emil-design-eng
description: This skill encodes Emil Kowalski's philosophy on UI polish, component design, animation decisions, and the invisible details that make software feel great.
---

# Design Engineering

Use this skill when refining UI polish, component behavior, interaction states, and animation decisions in an existing interface.

## Scope and provenance

The user supplied the skill name and description. The original skill instructions were not supplied. The guidance below is a local working implementation of that scope, not a verified reproduction of Emil Kowalski's original skill or writing. If the user supplies the full original instructions later, reconcile this file with that source.

## Working guidance

- Inspect the existing design, components, platform conventions, and user flow before changing the interface. Preserve the user's requested functionality and scope.
- Refine typography, spacing, alignment, contrast, and visual hierarchy together. Reuse existing design tokens and component patterns where they fit.
- Design components across their actual states: idle, focused, pressed, loading, disabled, empty, error, and success. Prevent repeated actions while a request is pending and preserve useful input after failures.
- Make interaction targets comfortable on touch screens. Support keyboard focus, accessible labels, text scaling, and reduced motion where applicable.
- Add motion when it explains a state change, preserves orientation, or provides useful feedback. Keep frequent interactions responsive; avoid decorative delays and unnecessary animation. Prefer stable layouts and interruptible transitions.
- Review the small details that affect use: truncation, long content, keyboard appearance, scroll behavior, safe areas, and recovery from errors. Prioritize observed problems over hypothetical complexity.
- Verify using the methods authorized for the task and allowed by the project. Respect instructions to skip builds, runtime tests, or Computer Use. Report what was checked and what remains unverified.
