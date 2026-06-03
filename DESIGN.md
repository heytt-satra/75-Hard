# Mission 75: Heytt OS Design System

## Product Context

Mission 75 is a private discipline operating system for one person. The app should feel calm, severe, premium, and fast to use. It is not a social habit tracker and not a motivational landing page. It is a daily execution surface for fitness, business, reading, writing, revenue, and self-review.

## Chosen Direction

The selected design direction is `Quiet Command Workspace`.

- Light, tactile surfaces with disciplined contrast.
- Compact panels instead of giant dashboards.
- Current focus appears before analytics.
- Completed work becomes quiet; open work stays actionable.
- Sync/device status is visible but not loud.

## Shotgun Variants Considered

`Quiet Command Workspace`: calm operational workspace, best for repeated daily use.

`Founder War Room`: sharper, denser, more business-command oriented. Useful for future Business and Money sections, but too intense for every screen.

`Transformation Journal`: warmer and more reflective. Useful for Review and History, but too soft for the main command surface.

## Typography

Use Aptos and Segoe UI Variable as local-first fonts. Avoid external font imports so the PWA stays reliable offline.

Headings should be heavy and compact. Panel headings should stay small. Hero-scale type belongs only in the top day header.

## Color

Primary ink: `#172033`

Surface: `#fffdf8`

Warm background: `#f7f4ec`

Indigo action: `#4f46e5`

Teal progress: `#0f9f8f`

Red risk: `#dc5c4a`

Green complete: `#16a36a`

The palette should not become one-note purple, beige, or dark slate. Indigo is for selected actions, not every object.

## Layout

Mobile first:

- Header, signals, mission brief, task strip, navigation, then active section.
- Open tasks are horizontally scannable.
- Completed tasks stay collapsed.
- Forms should appear directly in the selected tab.

Desktop:

- Header uses a two-column command layout.
- Operational panels use 2 or 3 columns when space allows.
- Pipeline boards can scroll horizontally because stages are fixed-format.

## Interaction

- One-tap day templates reduce setup friction.
- The mission brief shows the current task and next nudge.
- Locking the day creates a psychological finish line.
- Sync health should read like an ecosystem state: Live, Syncing, Queued, Check, Local.
- Progress should explain improvement in plain language before charts.

## Motion

Use subtle transitions only where state changes: task chips, buttons, meters, pipeline cards. Avoid decorative motion that distracts from execution.

## Feature Principles

- Every feature must answer one of three questions:
  - What do I need to do now?
  - What proof did I create?
  - Am I becoming more consistent?

- Data should remain exportable.
- Offline use should still feel first-class.
- Cross-device sync should converge without requiring manual thought.
