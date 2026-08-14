# Natura SecOps — Design System

## 1. Atmosphere & Identity

A friendly brutalist command center. The interface keeps the engineered grid,
visible structure, and strong typographic contrast of industrial UI, but drops
the aggressive military-terminal palette in favor of warm, pastel earth tones.
It should feel like a well-organized technical manual printed on recycled
paper: precise, human, and trustworthy rather than alarming.

Signature: warm cream substrate + pastel terracotta signal + visible grid lines.

### Brand Assets

- `/public/logo-icon.png` — circular triskelion icon (no text). Used for sidebar avatar and favicon.
- `/public/logo-full.png` — same icon with "SRC" + "natura" wordmark. Used for overview page brand mark.

## 2. Color

### Palette

| Role                   | Token                    | Value   | Usage                           |
| ---------------------- | ------------------------ | ------- | ------------------------------- |
| background             | --background             | #F7F5F0 | Main page background            |
| foreground             | --foreground             | #2C2C2C | Primary text                    |
| card                   | --card                   | #FDFCFA | Cards, panels, sidebar          |
| card-foreground        | --card-foreground        | #2C2C2C | Text on cards                   |
| muted                  | --muted                  | #EDEAE4 | Muted surfaces, stripes         |
| muted-foreground       | --muted-foreground       | #6E6A63 | Secondary text, hints           |
| border                 | --border                 | #D9D5CC | Dividers, outlines              |
| input                  | --input                  | #E8E5DE | Input backgrounds               |
| ring                   | --ring                   | #E89B72 | Focus rings                     |
| primary                | --primary                | #E89B72 | CTAs, active nav, highlights    |
| primary-foreground     | --primary-foreground     | #2C2C2C | Text on primary surfaces        |
| secondary              | --secondary              | #B8C4A7 | Secondary actions, success tint |
| secondary-foreground   | --secondary-foreground   | #2C2C2C | Text on secondary surfaces      |
| accent                 | --accent                 | #8FA3B8 | Accent surfaces, info           |
| accent-foreground      | --accent-foreground      | #FDFCFA | Text on accent surfaces         |
| destructive            | --destructive            | #E07A6E | Errors, destructive actions     |
| destructive-foreground | --destructive-foreground | #FDFCFA | Text on destructive surfaces    |
| critica                | --critica                | #E07A6E | Critical severity               |
| alta                   | --alta                   | #D4A056 | High severity                   |
| media                  | --media                  | #C9B67A | Medium severity                 |
| baixa                  | --baixa                  | #9DB88E | Low severity                    |
| signal                 | --signal                 | #E89B72 | Status signals                  |
| steel                  | --steel                  | #EDEAE4 | Loading skeletons, placeholders |

### Rules

- All surfaces sit on warm cream. No pure white or pure black.
- Severity colors are desaturated pastels of the brand triad.
- Accent (primary) is used sparingly for interactive emphasis and the active state.

## 3. Typography

### Scale

| Level   | Size             | Weight | Line Height | Usage                 |
| ------- | ---------------- | ------ | ----------- | --------------------- |
| Display | 2.5rem / 40px    | 700    | 1.1         | Page title            |
| H1      | 1.75rem / 28px   | 700    | 1.2         | Section headers       |
| H2      | 1.25rem / 20px   | 600    | 1.3         | Card titles           |
| H3      | 1rem / 16px      | 600    | 1.4         | Subsection titles     |
| Body    | 0.875rem / 14px  | 400    | 1.6         | Default text          |
| Body/sm | 0.75rem / 12px   | 400    | 1.5         | Secondary info        |
| Caption | 0.6875rem / 11px | 500    | 1.4         | Labels, metadata      |
| Data    | 0.75rem / 12px   | 500    | 1.4         | Numbers, tabular data |

### Font Stack

- Display: "Chakra Petch", sans-serif — page titles, nav brand, large KPIs.
- Body: "DM Sans", system-ui, sans-serif — body text, tables, labels, charts.
- Mono: "JetBrains Mono", monospace — tabular data, code, QIDs, timestamps.
- Numbers use `tabular-nums` for alignment.

### Rules

- Three families justified: display for brutalist structure, body for friendly readability, mono for data alignment.
- Display text may use uppercase + letter-spacing for structural labels only, not body.
- Body text is sentence case.

## 4. Spacing & Layout

### Base Unit

All spacing derives from 4px.

| Token    | Value | Usage                 |
| -------- | ----- | --------------------- |
| space-1  | 4px   | Tight icon-to-label   |
| space-2  | 8px   | Compact groups        |
| space-3  | 12px  | Default field padding |
| space-4  | 16px  | Card padding          |
| space-5  | 20px  | Section inner spacing |
| space-6  | 24px  | Major card gaps       |
| space-8  | 32px  | Between card groups   |
| space-10 | 40px  | Page sections         |

### Grid

- Max content width: 1440px.
- Sidebar width: 230px.
- Breakpoints: Tailwind defaults.

## 5. Components

### Card (slab)

- Background: --card
- Border: 1px solid --border
- Border-radius: 16px (--radius-lg)
- Shadow: subtle warm shadow `0 4px 14px -6px oklch(0.35 0.01 70 / 12%)`
- Padding: 16-20px

### Signal Card (slab-signal)

- Same as slab, but border and shadow tinted with --primary at 40% opacity.
- Used for active KPIs or highlighted metrics.

### Button / Nav Link

- Border: 1px solid transparent
- Padding: 10px 16px
- Border-radius: 12px
- Hover: translateY(-1px), border-color --border, soft shadow
- Active: primary background, primary-foreground text
- Focus: 2px ring --ring

### Stencil Label

- Font: display
- Text-transform: uppercase
- Letter-spacing: 0.06em
- Use only for section labels, badges, and metadata — never for body paragraphs.

## 6. Motion & Interaction

| Type     | Duration | Easing                        | Usage                |
| -------- | -------- | ----------------------------- | -------------------- |
| Micro    | 150ms    | ease-out                      | Button press, toggle |
| Standard | 200ms    | ease-in-out                   | Hover, tab switch    |
| Emphasis | 300ms    | cubic-bezier(0.16, 1, 0.3, 1) | Card mount           |

### Rules

- Only animate transform and opacity.
- Every interactive element has hover, active, and focus states.
- Reduced motion: respect prefers-reduced-motion.

## 7. Depth & Surface

### Strategy

Mixed: warm tonal shifts for surface hierarchy plus 1px borders for structure.
Soft shadows are used only on elevated cards; never for every surface.

| Level      | Value                                      | Usage           |
| ---------- | ------------------------------------------ | --------------- |
| Card rest  | 0 4px 14px -6px oklch(0.35 0.01 70 / 12%)  | Cards, panels   |
| Card hover | 0 8px 22px -10px oklch(0.35 0.01 70 / 16%) | Hover elevation |
| Signal     | 0 6px 18px -8px oklch(0.55 0.08 45 / 18%)  | Signal cards    |
