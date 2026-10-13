# UI/UX Design Guidelines: GridSense Dashboard

## 1. Design Philosophy & Vibe
* **Theme:** Industrial SCADA, power distribution control room, highly technical.
* **Core Rule:** Function over form. Maximize data density without causing cognitive overload. 
* **Anti-Patterns to Avoid:** No soft drop shadows (`shadow-lg`), no massive border radii (`rounded-3xl`), no playful gradients, and no excessive whitespace (`p-10`). 

## 2. Global Styling & Theming (Tailwind & shadcn)
* **Mode:** Strict Dark Mode. The background should be a deep, flat neutral (e.g., `bg-zinc-950` or `bg-black`).
* **Borders:** Use thin, high-contrast borders (`border-zinc-800` or `border-zinc-700`) to separate UI panels instead of relying on background color differences or shadows.
* **Border Radius:** Enforce minimal rounding. Set the shadcn CSS variable `--radius` to `0.25rem` or use `rounded-sm`/`rounded-none` for all Cards, Buttons, and Inputs.

## 3. Typography
* **UI Text:** Use a clean, neutral sans-serif (e.g., Inter, Roboto, or standard system sans) for headers and labels. Text should be relatively small (`text-sm` or `text-xs`) and muted (`text-zinc-400`) to reduce glare.
* **Telemetry Data (Critical):** ALL live numbers, voltages, currents, and timestamps MUST use a monospace font (e.g., `font-mono`, JetBrains Mono, or Roboto Mono) with tabular numbers (`tabular-nums`). This ensures that rapidly changing values do not cause the UI layout to jitter or shift horizontally.

## 4. Color Palette & Status Indicators
* **Normal Operation:** Use muted greens (e.g., `text-emerald-500`, `bg-emerald-500/10`) for "Online" status and healthy metrics. Do not use bright neon green for standard background elements.
* **Faults & Alerts (FDIR):** Use stark, highly visible reds (e.g., `text-rose-500`, `bg-rose-500/20`, `border-rose-500`) ONLY for actual faults ($\vert{}I_1 - I_2\vert{} > 0.5A$, voltage drop). When a fault is active, the affected Card should have a pulsing red border (`animate-pulse border-rose-500`).
* **Warning/Degraded:** Use stark yellow/amber for missing data (e.g., a node missed its LBT transmission window).

## 5. Layout & Spatial Rules
* **Grid Architecture:** Use a strict "Bento Box" or masonry grid layout using CSS Grid (`grid-cols-12`). Every panel must align perfectly with its neighbors. 
* **Data Panels (shadcn Cards):** 
  * Header: Left-aligned title, right-aligned status `Badge`.
  * Body: Use flexbox with `justify-between` and `items-baseline` to align the metric label on the left and the monospace value on the right.
* **Fixed Heights:** Recharts containers and telemetry matrices must have fixed heights (e.g., `h-64` or `h-96`) so the page never scrolls or jumps unexpectedly when new LoRa payloads arrive.

## 6. Interaction & State (shadcn Toast)
* **Fault Alerts:** When a differential fault is detected, trigger a destructive `Toast` component.
* **Persistence:** The toast must NOT auto-dismiss. It must remain on screen with a highly visible "Acknowledge" button. The UI state must visually reflect that the grid is in a fault state until this specific physical button is clicked.