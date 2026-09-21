---
name: impeccable
description: "Use when the user wants to design, redesign, shape, critique, audit, polish, simplify, harden, animate, or otherwise improve a frontend interface: websites, landing pages, dashboards, product UI, components, forms, settings, onboarding, empty states, and native iOS or Android screens. Handles UX review, hierarchy, layout, typography, color, motion, UX copy, accessibility, responsive behavior, edge cases, and capturing or documenting design systems (DESIGN.md, tokens). Also for making bland UI bolder, loud UI quieter, or ambitious visual effects. Not for backend-only or non-UI tasks."
metadata:
  version: "4.9.2"
---

# Impeccable

## Scope and provenance

The user supplied the name, description, and version metadata. The original skill body and supporting resources were not supplied. The instructions below are a project-local working implementation of that scope, not a verified copy of the upstream Impeccable 4.9.2 release. Reconcile this file with the original instructions if the user supplies them later.

## Working guidance

- Establish the interface's purpose, primary user action, target platform, and requested change. Inspect the existing implementation, references, design tokens, and any `DESIGN.md` before choosing a direction.
- Match the user's requested mode. For critique or audit, report concrete issues and their effects on users; for implementation, make the authorized changes. Do not turn a narrow polish request into a full redesign or add unrequested screens and features.
- Make hierarchy intentional through layout, spacing, typography, and contrast. Reuse established components and tokens where appropriate. When changing visual intensity, preserve readability, navigation, and a clear primary action.
- Design complete interaction states: loading, empty, error, disabled, focused, pressed, and success. Keep useful user input, prevent accidental repeated submissions, and explain recovery in concise UX copy.
- Adapt to the platform and actual content. Consider small screens, long labels, text scaling, keyboard appearance, safe areas, scrolling, and touch targets. Preserve keyboard navigation and accessible names where relevant.
- Use motion to clarify relationships and state changes. Keep frequent actions responsive, allow interruption where needed, and honor reduced-motion preferences. Ambitious effects should support the interface's purpose and remain usable when reduced or unavailable.
- Capture reusable decisions in existing design documentation or tokens when the task calls for a design system. Separate established rules from proposals; avoid introducing a second competing system.
- Verify with methods permitted by the user and project. Respect restrictions on builds, runtime tests, and Computer Use. State the changes, verification performed, and remaining limitations without implying that untested behavior was confirmed.
