# Claw AI — Design System & Visual Language

> **Version**: 1.0
> **Scope**: Defines the unique visual identity for the Claw Agent Hub ecosystem
> **Audience**: Frontend developers, designers, AI agents implementing UI components

---

## 1. Color Philosophy

Claw's color palette is built on the principle of **intelligent growth meets premium craft**. We avoid the generic dark-purple/blue gradient that dominates AI chat interfaces. Instead, our palette draws from nature's most trusted signals: deep greens for intelligence and growth, warm ambers for premium human touch.

### 1.1 Core Palette

| Token | Hex | Usage | Emotion |
|-------|-----|-------|---------|
| `--claw-primary` | `#059669` | Primary actions, active states, links, agent highlights | Growth, intelligence, trust |
| `--claw-primary-hover` | `#047857` | Hover states for primary elements | Deepened focus |
| `--claw-primary-light` | `#D1FAE5` | Light backgrounds, subtle accents | Freshness, openness |
| `--claw-accent` | `#D97706` | Important callouts, premium features, highlights | Premium warmth, human touch |
| `--claw-accent-hover` | `#B45309` | Hover state for accent elements | Refined intensity |
| `--claw-accent-light` | `#FEF3C7` | Subtle accent backgrounds | Warmth, attention |

### 1.2 Surface System (Dark Mode Primary)

Claw uses a **rich dark surface system with subtle green undertones** — not pure black, not cold gray. This creates depth and a distinctive "alive" feeling.

| Token | Hex | Usage |
|-------|-----|-------|
| `--claw-surface-0` | `#0C1117` | Deepest background (app shell) |
| `--claw-surface-1` | `#111921` | Main content area, panels |
| `--claw-surface-2` | `#172029` | Cards, elevated surfaces |
| `--claw-surface-3` | `#1E2A35` | Hover states, nested cards |
| `--claw-surface-4` | `#263540` | Active/pressed states |
| `--claw-border` | `#2A3A47` | Default borders, dividers |
| `--claw-border-hover` | `#3A5060` | Hover borders |

### 1.3 Text System

| Token | Hex | Usage |
|-------|-----|-------|
| `--claw-text-primary` | `#F5F0EB` | Headings, primary content — **warm white, not cold** |
| `--claw-text-secondary` | `#A0ADB8` | Secondary text, descriptions |
| `--claw-text-muted` | `#6B7A88` | Placeholders, timestamps, tertiary info |
| `--claw-text-accent` | `#34D399` | Highlighted text, links in content |
| `--claw-text-on-primary` | `#FFFFFF` | Text on primary-colored backgrounds |

### 1.4 Semantic Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--claw-success` | `#10B981` | Success states, completed tasks |
| `--claw-warning` | `#F59E0B` | Warnings, pending states |
| `--claw-error` | `#EF4444` | Errors, failures |
| `--claw-info` | `#3B82F6` | Informational states |

### 1.5 Agent Identity Colors

Each agent has its own color for avatars, gradient rings, and accents:

| Agent | Color | Hex | Gradient Pair |
|-------|-------|-----|---------------|
| Claw General | Emerald | `#059669` | `#059669` → `#34D399` |
| Mail Agent | Ocean Blue | `#2563EB` | `#2563EB` → `#60A5FA` |
| Code Agent | Violet | `#7C3AED` | `#7C3AED` → `#A78BFA` |
| Data Agent | Amber | `#D97706` | `#D97706` → `#FBBF24` |
| Creative Agent | Rose | `#E11D48` | `#E11D48` → `#FB7185` |

---

## 2. Typography

### 2.1 Font Stack

```css
--claw-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--claw-font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

**Why Inter?** Clean, modern, slightly rounded letterforms that suggest **approachable intelligence**. Not cold and mechanical, not playful and childish. The goldilocks of UI typefaces.

### 2.2 Type Scale

Based on a **1.25 major third** scale with a 16px base:

| Token | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| `--claw-text-xs` | 12px | 500 | 1.5 | Badges, timestamps, metadata |
| `--claw-text-sm` | 14px | 400 | 1.6 | Secondary text, labels |
| `--claw-text-base` | 16px | 400 | 1.65 | Body text, descriptions |
| `--claw-text-lg` | 18px | 500 | 1.6 | Subheadings, emphasized content |
| `--claw-text-xl` | 20px | 600 | 1.4 | Card titles, section heads |
| `--claw-text-2xl` | 24px | 600 | 1.35 | Page titles |
| `--claw-text-3xl` | 32px | 700 | 1.25 | Hero headings |
| `--claw-text-4xl` | 40px | 700 | 1.2 | Display headings |

### 2.3 Font Weight Usage

- **400 (Regular)**: Body text, descriptions
- **500 (Medium)**: UI labels, table headers, emphasis
- **600 (Semibold)**: Headings, card titles, buttons
- **700 (Bold)**: Display headings, major actions

---

## 3. Layout Principles

### 3.1 Card-Based UI with Glass Morphism

All content panels use a subtle glass morphism effect:

```css
.claw-card {
  background: rgba(23, 32, 41, 0.7);     /* --claw-surface-2 with transparency */
  backdrop-filter: blur(16px);
  border: 1px solid rgba(42, 58, 71, 0.6); /* --claw-border with transparency */
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}
```

### 3.2 Spacing System

Based on a **4px grid** for consistent rhythm:

| Token | Value | Usage |
|-------|-------|-------|
| `--claw-space-1` | 4px | Tight icon gaps |
| `--claw-space-2` | 8px | Inner padding, small gaps |
| `--claw-space-3` | 12px | List item gaps |
| `--claw-space-4` | 16px | Card inner padding |
| `--claw-space-5` | 20px | Section gaps |
| `--claw-space-6` | 24px | Card outer padding |
| `--claw-space-8` | 32px | Section margins |
| `--claw-space-10` | 40px | Large section breaks |
| `--claw-space-12` | 48px | Page-level spacing |

**Rule**: Generous whitespace. When in doubt, add more space. Claw should feel **breathable**, not cramped.

### 3.3 Layout Grid

```
┌─────────────────────────────────────────────────┐
│  Sidebar (280px)  │  Main Content (flex-1)       │
│                   │  ┌─────────────────────────┐ │
│  [Agent List]     │  │  Header                 │ │
│  ┌───────────┐    │  ├─────────────────────────┤ │
│  │ Claw Gen  │    │  │                         │ │
│  ├───────────┤    │  │  Chat / Content Area    │ │
│  │ Mail Agt  │    │  │  (scrollable)           │ │
│  ├───────────┤    │  │                         │ │
│  │ Code Agt  │    │  │                         │ │
│  ├───────────┤    │  │                         │ │
│  │ Data Agt  │    │  └─────────────────────────┘ │
│  ├───────────┤    │                              │
│  │ Creative  │    │  ┌─────────────────────────┐ │
│  └───────────┘    │  │  Input Bar              │ │
│                   │  └─────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 4. Unique Motion & Animation Design

### 4.1 Spring Physics (Not Linear)

All animations use **spring-based easing**, not linear or simple ease-in-out. This creates an organic, alive feeling:

```css
/* Spring-like cubic bezier approximations */
--claw-spring-snappy: cubic-bezier(0.34, 1.56, 0.64, 1);    /* Bouncy, fast */
--claw-spring-smooth: cubic-bezier(0.22, 1, 0.36, 1);        /* Smooth deceleration */
--claw-spring-gentle: cubic-bezier(0.25, 0.1, 0.25, 1);      /* Gentle ease */
--claw-spring-enter: cubic-bezier(0.16, 1, 0.3, 1);          /* Content entrance */
--claw-spring-exit: cubic-bezier(0.55, 0.06, 0.68, 0.19);    /* Content exit */
```

**Duration Guide**:
- Micro-interactions (hover, press): `150ms`
- Content transitions (panel switch): `250ms`
- Page transitions: `350ms`
- Complex animations: `500ms`

### 4.2 Neural Pulse Animation (Agent Thinking)

When an agent is processing, display a **neural pulse** animation — concentric rings that pulse outward with the agent's color:

```css
@keyframes claw-neural-pulse {
  0% {
    transform: scale(0.8);
    opacity: 0.6;
    box-shadow: 0 0 0 0 var(--agent-color);
  }
  50% {
    transform: scale(1.0);
    opacity: 1;
    box-shadow: 0 0 20px 4px var(--agent-color-glow);
  }
  100% {
    transform: scale(0.8);
    opacity: 0.6;
    box-shadow: 0 0 0 0 var(--agent-color);
  }
}

.claw-thinking-indicator {
  animation: claw-neural-pulse 2s ease-in-out infinite;
}
```

**Implementation**: Three concentric rings with staggered animation delays (`0s`, `0.4s`, `0.8s`) creating a ripple effect.

### 4.3 Breathing Animation (Status Indicators)

Active/idle status dots use a subtle breathing animation:

```css
@keyframes claw-breathe {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.15); }
}

.claw-status-breathing {
  animation: claw-breathe 3s ease-in-out infinite;
}
```

### 4.4 Content Stagger (Message Entrance)

Messages and tool call cards enter with a staggered slide-up animation:

```css
@keyframes claw-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.claw-message-enter {
  animation: claw-slide-up 300ms var(--claw-spring-smooth) forwards;
}
```

---

## 5. Component Patterns

### 5.1 Agent Avatars with Gradient Rings

Agent avatars are **not flat circles**. They have a gradient ring that subtly animates:

```css
.claw-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  background: var(--claw-surface-2);
}

.claw-avatar::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--agent-color-start), var(--agent-color-end));
  z-index: -1;
  opacity: 0.8;
  transition: opacity 200ms ease, transform 200ms ease;
}

.claw-avatar:hover::before,
.claw-avatar.active::before {
  opacity: 1;
  transform: scale(1.05);
}
```

### 5.2 Gradient Text for Agent Names

Agent names in headers and cards use gradient text:

```css
.claw-agent-name {
  background: linear-gradient(135deg, var(--agent-color-start), var(--agent-color-end));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-weight: 600;
}
```

### 5.3 Hover States with Glow Effects

Interactive elements emit a subtle glow on hover matching their agent color:

```css
.claw-glow-hover {
  transition: box-shadow 200ms ease, border-color 200ms ease;
}

.claw-glow-hover:hover {
  box-shadow: 0 0 16px -2px var(--agent-color-glow);
  border-color: var(--agent-color);
}
```

### 5.4 Tool Call Cards

Tool call results are displayed as expandable cards with **color-coded left borders**:

```css
.claw-tool-card {
  border-left: 3px solid var(--tool-color);
  background: var(--claw-surface-1);
  border-radius: 0 12px 12px 0;
  padding: var(--claw-space-4);
  margin: var(--claw-space-2) 0;
  transition: all 200ms ease;
}

/* Tool type colors */
.claw-tool-card[data-tool="gmail"]   { --tool-color: #2563EB; }
.claw-tool-card[data-tool="calendar"] { --tool-color: #7C3AED; }
.claw-tool-card[data-tool="github"]   { --tool-color: #8B5CF6; }
.claw-tool-card[data-tool="sheets"]   { --tool-color: #059669; }
.claw-tool-card[data-tool="docs"]     { --tool-color: #059669; }
.claw-tool-card[data-tool="drive"]    { --tool-color: #F59E0B; }
.claw-tool-card[data-tool="vercel"]   { --tool-color: #FFFFFF; }
.claw-tool-card[data-tool="web"]      { --tool-color: #3B82F6; }
.claw-tool-card[data-tool="data"]     { --tool-color: #D97706; }

.claw-tool-card:hover {
  background: var(--claw-surface-2);
  border-left-width: 4px;
}

/* Expandable content */
.claw-tool-card .tool-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 300ms var(--claw-spring-smooth);
}

.claw-tool-card.expanded .tool-content {
  max-height: 500px;
}
```

### 5.5 Animated Border Gradients (Active Elements)

Active/focused input fields and panels have an animated gradient border:

```css
@keyframes claw-border-rotate {
  0% { --border-angle: 0deg; }
  100% { --border-angle: 360deg; }
}

.claw-animated-border {
  --border-angle: 0deg;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
}

.claw-animated-border::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1.5px;
  background: conic-gradient(
    from var(--border-angle),
    var(--agent-color-start),
    var(--agent-color-end),
    transparent 60%,
    var(--agent-color-start)
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: claw-border-rotate 3s linear infinite;
}
```

### 5.6 Custom Scrollbar

```css
.claw-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.claw-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.claw-scrollbar::-webkit-scrollbar-thumb {
  background: var(--claw-border);
  border-radius: 3px;
  transition: background 200ms ease;
}

.claw-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--claw-border-hover);
}

/* Firefox */
.claw-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: var(--claw-border) transparent;
}
```

### 5.7 Noise Texture Overlay (Depth)

Apply a subtle noise texture to the app shell for visual depth:

```css
.claw-noise-bg::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.03;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  background-repeat: repeat;
  background-size: 256px 256px;
  z-index: 9999;
}
```

---

## 6. Interaction Patterns

### 6.1 Message Types

| Type | Visual Treatment |
|------|-----------------|
| User message | Right-aligned, primary background, warm white text |
| Agent response | Left-aligned, surface-2 card, agent avatar + gradient name |
| Tool call | Collapsible card with color-coded left border |
| System message | Centered, muted text, subtle separator |
| Error | Left-aligned, error surface card, error border |

### 6.2 Loading States

- **Skeleton screens** for content loading (animated shimmer, not static gray)
- **Neural pulse** for agent thinking (see section 4.2)
- **Progressive reveal** — content streams in naturally

### 6.3 Sidebar Agent Cards

Each agent in the sidebar shows:
1. Avatar with gradient ring (or neural pulse when active)
2. Agent name in gradient text
3. Status dot (green=active, amber=busy, red=error, gray=idle)
4. Current task preview (truncated, muted text)

---

## 7. Responsive Breakpoints

| Token | Value | Target |
|-------|-------|--------|
| `--claw-bp-mobile` | 640px | Mobile phones |
| `--claw-bp-tablet` | 768px | Tablets |
| `--claw-bp-desktop` | 1024px | Laptops |
| `--claw-bp-wide` | 1280px | Desktops |

**Mobile**: Sidebar becomes a bottom tab bar. Cards stack vertically. Single column.
**Tablet**: Sidebar collapses to icon-only. Two-column where needed.
**Desktop**: Full sidebar + content layout. All features visible.

---

## 8. Accessibility

- **Minimum contrast ratio**: 4.5:1 for text on backgrounds (WCAG AA)
- **Focus indicators**: Visible focus rings using agent primary color, 2px offset
- **Motion reduction**: All animations respect `prefers-reduced-motion: reduce`
- **Keyboard navigation**: All interactive elements are keyboard accessible
- **Screen reader**: Semantic HTML, ARIA labels, live regions for dynamic content

---

## 9. Implementation Notes for Developers

### 9.1 CSS Custom Properties Setup

Define all tokens at the `:root` level. Override per agent using data attributes:

```html
<div data-agent="general">  <!-- Sets --agent-color-* tokens -->
<div data-agent="mail">
<div data-agent="code">
<div data-agent="data">
<div data-agent="creative">
```

### 9.2 Component Library Priority

Build components in this order:
1. **Foundation**: Colors, typography, spacing, borders
2. **Atoms**: Avatar, badge, button, input, status dot
3. **Molecules**: Tool card, agent card, message bubble, sidebar item
4. **Organisms**: Chat area, sidebar, header, input bar
5. **Templates**: Agent-specific views
6. **Motion**: Add animations last, progressively

### 9.3 Animation Performance

- Use `transform` and `opacity` only for animations (GPU-accelerated)
- Use `will-change` sparingly and only for currently animating elements
- All spring animations should use `cubic-bezier` approximations (not JS springs) for performance

### 9.4 Dark Mode Only (v1)

This design system is dark-mode first and only. Do not implement a light mode toggle — the rich dark surfaces with green undertones are core to the brand identity.
