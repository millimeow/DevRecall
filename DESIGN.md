---
name: DevRecall
description: A dark developer workspace for decisions and their source evidence.
colors:
  canvas: "#101211"
  sidebar: "#0c0e0d"
  surface: "#171a18"
  import-surface: "#151916"
  field: "#111412"
  border: "#2b302d"
  text: "#ecefec"
  muted: "#a0aaa3"
  accent: "#b7ecc8"
  accent-hover: "#cef8db"
  accent-ink: "#14271a"
  secondary-surface: "#191d1a"
  secondary-text: "#d1d9d3"
  nav-active: "#1d2820"
  accepted-surface: "#1f3526"
  accepted-text: "#b5e4c2"
  rejected-surface: "#37231f"
  rejected-text: "#e9b0a6"
  proposed-surface: "#242d40"
  proposed-text: "#bac9ed"
  contested-surface: "#372438"
  contested-text: "#e7b8dc"
  uncertain-surface: "#302e20"
  uncertain-text: "#dfcc91"
  quote-surface: "#181e19"
  quote-border: "#344137"
  unknown-choice-surface: "#1c211d"
  unknown-choice-text: "#b2beb6"
  mobile-model-text: "#bfd2c5"
typography:
  headline:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "29px"
    fontWeight: 550
    lineHeight: 1.3
    letterSpacing: "-1px"
  title:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 550
    letterSpacing: "-0.25px"
  body:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "11px"
    fontWeight: 500
  code:
    fontFamily: "'SFMono-Regular', Consolas, monospace"
    fontSize: "12px"
rounded:
  badge: "5px"
  navigation: "6px"
  control: "7px"
  quote: "8px"
  container: "9px"
  empty-state: "10px"
  panel: "12px"
spacing:
  compact: "8px"
  control-gap: "9px"
  inline: "12px"
  field-gap: "20px"
  panel-inset: "24px"
  section: "35px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.secondary-surface}"
    textColor: "{colors.secondary-text}"
    rounded: "{rounded.control}"
    padding: "10px 15px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "12px 13px"
  navigation-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.accent}"
    rounded: "{rounded.navigation}"
    padding: "10px 12px"
  status-accepted:
    backgroundColor: "{colors.accepted-surface}"
    textColor: "{colors.accepted-text}"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  import-panel:
    backgroundColor: "{colors.import-surface}"
    rounded: "{rounded.panel}"
  unknown-choice:
    backgroundColor: "{colors.unknown-choice-surface}"
    textColor: "{colors.unknown-choice-text}"
    rounded: "{rounded.container}"
    padding: "19px 17px"
  evidence-quote:
    backgroundColor: "{colors.quote-surface}"
    rounded: "{rounded.quote}"
    padding: "13px 14px"
---

# Design System: DevRecall

## Overview

**Creative North Star: “Annotated source archive.”**

A dark, quiet developer workspace, consistent with the PRD's GitHub-inspired lightweight app and the user's confirmed dark, code-first direction. The organizing mechanism is a recovered decision beside inspectable evidence: interpretation on the left, original words on the right. This describes the built interface, rather than a separate visual theme.

Dense, readable controls and restrained separators keep the conversation in view. Mint marks actions and active navigation; labeled outcome colors distinguish accepted, rejected, proposed, contested and uncertain statements. No decorative imagery is used.

**Key Characteristics:**

- Dark green-tinted surfaces with subtle one-pixel borders.
- Compact sans-serif interface; monospace for code, paths, commands and IDs.
- Source quotes, attribution and inspection actions adjacent to interpretations.
- Tonal depth, modest corners and visible keyboard focus.

This is a source-based documentation refresh from `frontend/src/styles.css` and `frontend/src/App.jsx`. The populated desktop/mobile review identified three workflow/state fixes. Its subsequent verdict scored all three resolved and returned `ship` at that fix scope; this is not a model-accuracy certification.

## Colors

The palette pairs near-black green neutrals with pale mint actions. The frontmatter records the core implemented colors; individual component borders and secondary text tones remain in the stylesheet.

### Primary

- **Mint** (`accent`): primary actions, active navigation, links to source and focus outlines. Hover uses `accent-hover`; primary labels use `accent-ink`.

### Secondary

- **Outcome colors**: accepted uses green, rejected uses rose, proposed uses blue, contested uses mauve and uncertain uses amber. Each uses its paired surface and text tokens. Always show a written status; color alone does not establish meaning.

### Neutral

- **Canvas / sidebar**: the sidebar is darker than the main workspace.
- **Surface / import surface / field**: low tonal steps distinguish containers and editable areas.
- **Text / muted**: primary reading and supporting explanations.
- **Border**: default separators. Quotes use their own surface and border to keep evidence distinct.

## Typography

**Interface Font:** DM Sans, with platform sans-serif fallbacks. It is loaded through a Google Fonts CSS import; the fallback remains relevant when that request is unavailable.

**Code Font:** SFMono-Regular, Consolas, monospace. Reserve it for IDs, referenced paths, structured JSON and setup commands. Original discussion prose remains sans-serif.

### Hierarchy

- **Headline:** 29px / 550 / 1.3, with -1px tracking. Main headings become 25px at widths of 1100px and below. Discussion headings use 26px, then 24px on mobile.
- **Title:** 16px / 550, -0.25px tracking. Decision titles use 25px / 1.35, then 23px on mobile.
- **Body:** the root is 14px / 400; paragraph line height is 1.65. Most content paragraphs are explicitly 11–13px. Decision-list summaries cap at 75ch; quotes use 12px / 1.8.
- **Label:** form labels use 11px / 500. Controls use 12px / 600; compact metadata ranges from 8–11px. Preserve hierarchy when extending the UI instead of treating all text as body size.
- **Numbers:** overview counters use tabular numerals; 29px on desktop and 24px on mobile.

## Layout

Desktop uses a fixed 224px sidebar and a 69px top bar. The main region has a 1330px maximum outer width with 36px 38px 25px padding. This replaces the earlier provisional 1260px documentation. Spacing is compact and contextual, not a strict eight-pixel grid: 8, 9, 12, 20, 24 and 35px recur in controls, fields, panels and sections.

The discussion detail grid has `minmax(0, 1.5fr) minmax(260px, 1fr)` columns and a 35px gap. A left border separates evidence from interpretation. Import title and URL fields share two equal columns. The overview uses three metric columns plus a supporting note.

At 1100px and below, the sidebar narrows to 200px, main horizontal padding becomes 25px, the overview note disappears and the evidence column becomes 270px. At 760px and below, navigation becomes a horizontal scrolling row above the content; the sidebar's recent discussions and model-health block are hidden. A compact model-health button appears in the top bar instead of the local-first badge and opens model setup; it shows Model ready, Model offline or Connecting with a status dot. Main padding becomes 26px 18px, import fields stack, the form action spans its row and evidence stacks below the decision with a top separator. Secondary recent-table columns collapse. At 1500px and above, top spacing and the discussion input grow.

## Elevation & Depth

There are no box shadows in the implemented stylesheet. Depth comes from darker navigation, slightly lighter editable and evidence surfaces, one-pixel borders and tonal hover states. Preserve this flat layering. Do not add floating-card shadows as the default container treatment.

Motion is limited to the input border's 160ms transition and a one-second linear loading spinner. The stylesheet disables animation and transitions under `prefers-reduced-motion: reduce` and restores automatic scroll behavior. No entrance reveal is currently implemented.

## Shapes

Controls use 7px corners, navigation items 6px, status badges 5px, evidence quotes 8px and most grouped containers 9px. The import and utility panels use 12px. Empty states use 10px corners and a dashed border. Small dots provide status reinforcement; they accompany labels. Do not apply a universal 12px radius to every element.

## Components

### Buttons

Compact text-and-icon actions. Primary and secondary buttons use 10px 15px padding, a 39px minimum height, 9px icon gap and 7px radius. Primary is mint with dark ink; secondary has a dark raised surface and `#39413b` border, changing to `#252d27` on hover. Text buttons are mint, 12px, with no container. Disabled buttons use 0.55 opacity and a wait cursor.

All interactive elements use a 2px mint `:focus-visible` outline with a 4px offset. Primary form actions reach 42px minimum height on mobile.

### Inputs / Fields

Dark fields with a one-pixel default border, 7px radius and 12px 13px padding. Hover changes the border to `#465149`; focus changes it to `#91b99e`, with the shared keyboard outline. Placeholder text is `#7d8880`; the caret is mint. Textareas resize vertically and wrap prose. JSON and path inputs use the code font. Show field labels and keep attribution and character count beside the relevant input.

### Navigation

Left-aligned icon and label rows; muted at rest, a `#191e1a` surface on hover and a green active surface with mint text. Counts are small rectangular badges. Import and decision tabs use a two-pixel mint bottom indicator. On mobile, preserve horizontal scrolling rather than compressing labels into unreadable widths. The model-health/setup button uses 9px type, 6px vertical padding and a 6px gap; its text color is `mobile-model-text`. It retains the shared keyboard focus outline.

### Status badges

Five labeled outcome variants use the paired colors in the frontmatter. A current-color dot reinforces the label. Exact quotation verification is a separate evidence state: it establishes source presence, not semantic correctness.

### Cards / Containers

The import panel uses the import surface, a `#343d36` border and 12px corners. Its introduction and form use 24px horizontal insets on desktop; these become 17px on mobile. Lists use separators and hover fills. Empty states use a dashed border and concise next-step guidance. Utility panels use `#151b17`, a `#354239` border and 27px padding, reduced to 20px on mobile.

### Decision outcome

The green chosen-approach callout and check icon appear only for an accepted decision with a nonempty chosen approach and verified chosen-approach evidence. Otherwise, use the neutral `unknown-choice` surface and text, a CircleHelp icon, “Outcome not established” and “No verified choice established.” The smaller label remains muted. The existing callout geometry stays at 9px corners, 19px 17px padding and a 12px icon gap.

### Source evidence

Quotes use their own surface and border, 8px corners and 13px 14px padding. Small attribution and verification labels precede 12px / 1.8 quotation text; a source action opens the corresponding original message. Unverified quotes use a `#605238` border and amber verification text. The selected original message receives a `#1d3023` highlight. Keep the explanatory distinction between verified quote presence and model interpretation visible. Global question-answer citations resolve the discussion directly from the source message ID, open its original messages and highlight the matching message; they do not require a match in the current decision list. A missing source produces a retry/reimport error.

## Do's and Don'ts

### Do:

- **Do** keep decisions close to their inspectable source evidence.
- **Do** use written status and verification labels alongside color.
- **Do** use tonal fills and one-pixel separators for depth.
- **Do** preserve the shared visible keyboard focus and reduced-motion behavior.
- **Do** distinguish saved sources, processing state, actual model output and uncertain interpretation.

### Don't:

- **Don't** replace the confirmed dark workspace with a light or decorative visual direction without user instruction.
- **Don't** imply source-quote verification proves the model's interpretation.
- **Don't** invent source content or populated outputs for a visual review.
- **Don't** document provisional values as built tokens when the stylesheet differs.
