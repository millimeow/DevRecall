---
name: 'DevRecall'
description: 'A restrained repository-memory dashboard in the pinned Operate direction.'
colors:
  accent: '#6554d9'
  accent-hover: '#5442c5'
  navy: '#13182b'
  dashboard: '#f7f8fc'
  surface: '#ffffff'
  text: '#252a3d'
  support-text: '#626b80'
  muted: '#737b8f'
  line: '#e8eaf1'
  focus: '#9a8bf3'
  secondary-text: '#535a70'
  secondary-border: '#dde0e9'
  secondary-hover: '#f0eefb'
  secondary-hover-border: '#c7bfed'
  nav-text: '#aeb6d0'
  nav-hover: '#20263d'
  nav-active: '#2e294c'
  nav-active-text: '#d4ccff'
  field: '#fdfdff'
  field-border: '#dddfea'
  field-focus: '#a090db'
  field-text: '#5a6077'
  field-invalid: '#d38d9a'
  ready: '#257857'
  ready-surface: '#eaf6f0'
  indexing: '#6854b0'
  indexing-surface: '#eeeafa'
  partial: '#866324'
  partial-surface: '#fff1d9'
  failed: '#b04458'
  failed-surface: '#fcebee'
  metric-violet: '#7a67d4'
  metric-violet-surface: '#f0ecfc'
  metric-rose: '#cf7788'
  metric-rose-surface: '#fcf0f3'
  metric-blue: '#5f8dcd'
  metric-blue-surface: '#edf3fc'
  metric-amber: '#bf984c'
  metric-amber-surface: '#fbf4e6'
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '14px'
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '27px'
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: '-0.8px'
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '24px'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '-0.6px'
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '30px'
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: '-1px'
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '12px'
    fontWeight: 560
  section-label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '12px'
    fontWeight: 650
    letterSpacing: '1.4px'
rounded:
  badge: '5px'
  icon-button: '6px'
  button: '7px'
  field: '8px'
  composer: '10px'
  card: '14px'
  dialog: '17px'
  empty-mark: '20px'
spacing:
  compact: '8px'
  control: '12px'
  grid: '16px'
  panel: '24px'
  conversation: '32px'
  dashboard: '40px'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.surface}'
    typography: '{typography.button}'
    rounded: '{rounded.button}'
    padding: '0 14px'
    height: '38px'
  button-primary-hover:
    backgroundColor: '{colors.accent-hover}'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.secondary-text}'
    typography: '{typography.button}'
    rounded: '{rounded.button}'
    padding: '0 14px'
    height: '38px'
  button-secondary-hover:
    backgroundColor: '{colors.secondary-hover}'
  button-icon:
    textColor: '#7c8497'
    rounded: '{rounded.icon-button}'
    size: '34px'
  button-add-repository:
    backgroundColor: '#1d2138'
    textColor: '#cbc5f7'
    rounded: '{rounded.field}'
    height: '42px'
    width: '100%'
  tabs-content:
    textColor: '{colors.support-text}'
    padding: '0 0 15px'
  input-url:
    backgroundColor: '{colors.field}'
    textColor: '{colors.field-text}'
    rounded: '{rounded.field}'
    padding: '12px 13px'
  nav-repository:
    textColor: '{colors.nav-text}'
    rounded: '{rounded.field}'
    padding: '13px 12px'
    width: '100%'
  nav-repository-active:
    backgroundColor: '{colors.nav-active}'
    textColor: '{colors.nav-active-text}'
  status-ready:
    backgroundColor: '{colors.ready-surface}'
    textColor: '{colors.ready}'
    rounded: '{rounded.badge}'
    padding: '4px 7px'
  card-metric:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
    padding: '18px 19px'
  panel-chat:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.card}'
  dialog-repository:
    backgroundColor: '{colors.surface}'
    rounded: '{rounded.dialog}'
    width: '500px'
---

# Design System: DevRecall

## Overview

**Creative North Star: "Operate"**

DevRecall is a restrained workspace for recovering engineering context. The pinned navy sidebar anchors a light dashboard; violet identifies actions and selection. Rounded white panels, compact system typography, and generous space between groups keep repository evidence easy to scan.

This document records the implementation in `web/src/styles.css`, with visual authority from PRD section 5. The original screenshot references are absent. No custom imagery, decorative font, or replacement visual direction is established.

**Key Characteristics:**

- Persistent navy navigation and a pale dashboard canvas.
- Violet actions and selection, with semantic status colors.
- White bordered cards with restrained depth.
- System sans typography and tabular metric numbers.
- Responsive navigation, visible focus, and reduced-motion support.

## Colors

The palette combines a dark navy anchor, cool light neutrals, and a violet action accent. Frontmatter records reusable colors; the stylesheet remains the source for local decorative tints.

### Primary

- **Action Violet** (`accent`): Primary buttons, selected tabs, links, and input caret; hover uses `accent-hover`.
- **Navigation Navy** (`navy`): Persistent sidebar and mobile drawer. Repository items use `nav-text`, `nav-hover`, and the violet-tinted `nav-active` / `nav-active-text` pair.

### Secondary

- **Semantic statuses:** Ready is green; indexing, analyzing, and queued are violet; partial is amber; failed is rose. Each uses its corresponding pale surface and a written label.
- **Metric markers:** Pale violet, rose, blue, and amber icon tiles distinguish categories; these do not replace action violet.

### Neutral

- **Dashboard Mist** (`dashboard`): Main canvas behind white surfaces.
- **White Surface** (`surface`): Topbar, cards, tab panels, and dialog.
- **Ink** (`text`): Root text color.
- **Supporting Slate** (`support-text`): Shipped `#626b80` correction for metric notes, repository metadata, empty-state copy, composer hints, placeholders, dialog introduction, and evidence metadata.
- **Muted Slate** (`muted`): Existing `--muted` primitive and configuration copy; distinct from corrected supporting text.
- **Cool Divider** (`line`): Card borders and structural separators.
- **Focus Lavender** (`focus`): Keyboard focus outline.

## Typography

**Display and Body Font:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.

**Character:** Native system sans keeps the dashboard compact and familiar. Hierarchy comes from size, weight, spacing, and color. The root size is 14px; most interface copy is explicitly 11–13px.

### Hierarchy

- **Repository headline:** 27px, weight 650, line-height 1.3, tracking -0.8px; 25px at 1150px and below.
- **Empty-state title:** 24px, weight 600, line-height 1.4, tracking -0.6px; 28px at 1600px and above, 21px at 850px and below, with line-height 1.45 on mobile.
- **Metrics:** 30px, weight 650, line-height 1.2, tracking -1px, tabular numerals; 29px on mobile.
- **Body:** Repository description uses 13px / 1.6 and 65ch maximum. Conversation text uses 13px / 1.9 and 75ch maximum, changing to 12px on mobile. Supporting contexts use 11px or 12px.
- **Controls:** Main buttons use 12px and weight 560; full-width dialog action uses 13px.
- **Section labels:** Sidebar section headings use 12px, weight 650, uppercase, and 1.4px tracking; this treatment is specific to section labels.

## Layout

The desktop shell has a fixed 256px sidebar and a main area offset by the same width. A 69px white topbar spans the main area. The centered dashboard has a 1500px maximum width and padding of 35px 40px 0. Metrics form four equal columns with 16px gaps and a 28px bottom margin. Metric padding is 18px 19px, conversation padding 26px 32px, and composer padding 10px 24px 19px.

Spacing is contextual rather than a rigid scale: recurring 8px, 12px, 16px, 24px, 32px, and 40px values coexist with component-specific measurements. Do not round source measurements to a new grid.

- **1600px and above:** Dashboard top padding 45px; metric gaps and padding 22px; chat minimum height 590px.
- **1150px and below:** Sidebar and main offset 222px; dashboard padding 28px 25px 0; metric gaps 10px and padding 15px 13px.
- **850px and below:** Metrics become two columns; repository header wraps; conversation padding becomes 25px 20px; selected secondary hints disappear.
- **650px and below:** Sidebar becomes a 256px off-canvas drawer with backdrop; main offset is removed. Topbar height is 59px, dashboard padding 25px 18px 0, metric padding 14px, and chat minimum height 450px. Decision toolbar stacks. Dialog maximum width is `calc(100vw - 26px)` with inner padding 29px 23px 21px.

Conversation content scrolls within a 65vh maximum. The dialog is 500px wide with desktop limits of `calc(100vw - 32px)` and `calc(100dvh - 40px)` and internal scrolling. Default chat minimum height is 490px.

## Elevation & Depth

Dashboard cards are flat white surfaces separated by pale 1px borders. Tonal layering carries normal depth. The dialog receives a structural shadow and a dimmed, blurred backdrop; focus halos identify active fields.

### Shadow Vocabulary

- **Dialog:** `0 24px 85px #0d102c2b`.
- **URL field focus:** `0 0 0 3px #6554d908`, border `#a090db`.
- **Composer focus:** `0 0 0 3px #6554d90b`, border `#a69ade`.
- **Dialog backdrop:** `#11182c66`, with `backdrop-filter: blur(3px)`.
- **Mobile drawer backdrop:** `#151b3655`, without blur.

## Shapes

Metric cards and tab panels use the 14px `--radius` token. Buttons use 7px, fields and repository navigation 8px, composer and progress panels 10px, icon buttons 6px, status badges 5px, dialog 17px, and desktop empty-state mark 20px. Status dots are 6px circles. Borders are generally 1px; sidebar Add Repository is dashed. No image assets are required by the implemented visual system.

## Components

### Buttons

Primary and secondary controls use 38px height, 7px corners, 0 14px padding, and 8px icon gaps. Primary is violet with white text; hover uses `accent-hover`. Secondary is white with `secondary-border` and `secondary-text`; hover uses `secondary-hover` and `secondary-hover-border`. Icon buttons are 34px square. Sidebar Add Repository is a full-width 42px dashed control on `#1d2138`, with lavender text and 8px corners.

Buttons transition background and text color over 150ms ease. Disabled buttons use a not-allowed cursor, 0.55 opacity, and no transition. The send button is a 33px violet square with its own disabled tint.

### Chips

Repository status chips use 12px, weight 500, 4px 7px padding, 5px corners, and a 6px dot. Ready, indexing, partial, and failed variants pair written status with semantic foreground and background. Decision outcome badges have separate accepted, rejected/removed, uncertain, and neutral treatments.

### Cards / Containers

Metric cards and the tab panel use white, 1px `line` borders, and 14px corners. Metric values have tabular numerals. Evidence cards are linked containers with a 420px maximum, 8px corners, 12px 14px padding, `#fbfafc` background, and `#e7e5ef` border. Hover uses `#f5f1fc` and `#c5b9e9`; quotes have bounded overflow. Cards do not gain hover lift or shadows.

### Inputs / Fields

The URL field has 8px corners, `field` background, `field-border`, and 12px 13px padding. Focus-within applies the documented border and halo. Text uses `field-text`; placeholders use `support-text`. Invalid URL border uses `field-invalid`.

The composer has 10px corners, `#e0e3ee` border, `#fcfcfe` background, and 11px 12px 11px 16px padding. Its textarea uses 12px / 1.7, a 110px maximum height, and wrapper focus styling. General keyboard focus uses a 3px `focus` outline with 4px offset.

### Navigation

Repository navigation has 6px list gaps. Items use 8px corners, 13px 12px padding, and 65px minimum height. Names truncate on one line with status beneath. Hover brightens text on `nav-hover`; active uses the violet-tinted active pair. Mobile reuses this navigation in a drawer.

Content tabs sit on a 1px divider with 26px gaps and 15px bottom padding. Selected tabs use violet, weight 600, and a 2px underline. Unselected tabs use corrected supporting slate; hover uses violet. Mobile reduces gaps and padding.

### Add Repository Dialog

A white 17px container centers on a dimmed backdrop. Desktop content padding is 34px 35px 24px. A single URL field, verified repository preview, progress and error messaging, and full-width 43px primary action keep the task focused. The preview has a green tonal treatment and verified text `#40734c`. Introduction, hint, footnote, and preview description use the shipped support-text correction.

### Motion and Loading

Button colors transition over 150ms ease; evidence background over 150ms; mobile drawer transform over 200ms ease. Skeletons pulse opacity to 0.5 over 1.5s ease-in-out; indeterminate progress translates from -100% to 500% over 2s ease-in-out; spinners rotate over 1.25s linear. These loading animations repeat while active. `prefers-reduced-motion: reduce` removes animations and transitions and sets scroll behavior to auto.

## Do's and Don'ts

### Do:

- **Do** preserve the pinned navy sidebar, light dashboard, white cards, and violet actions.
- **Do** use `#626b80` for the supporting-text contexts corrected in the shipped stylesheet.
- **Do** preserve tabular metric numbers, visible keyboard focus, and reduced-motion behavior.
- **Do** pair semantic status colors with readable written labels.
- **Do** keep empty and incomplete states honest about available repository evidence.

### Don't:

- **Don't** introduce a replacement visual identity or claim the missing screenshots were inspected.
- **Don't** add decorative shadows or hover lift to flat dashboard cards.
- **Don't** render illustrative metrics, decisions, or answers as actual repository analysis.
- **Don't** replace the system font stack or add image assets without an established requirement.
