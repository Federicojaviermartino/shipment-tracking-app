# Estela — specification, part 4: the interface

Desktop-first (reference viewport 1440×900, fluid from 1280), light theme only (`color-scheme:
light`), English. There is no brand guide to follow: the result must look like a
calm, precise professional tool, clearly not a template.

## 1. Direction

**Calm, exact, candid.** Estela reads like a nautical chart crossed with an instrument panel: warm
paper canvas, white data surfaces, blue-black ink, hairlines instead of shadows, numerals that align.
Its signature is the chart's own line language: the track sailed is solid, the course an operator
declared is dashed, what the model says is dotted. Chrome is colourless (primary buttons are ink), so
every coloured pixel means punctuality or AI. Two densities, one system: operations scan compact
rows; a customer reads one word and one date.

Anti-goals: no sidebar, no KPI tiles, no charts, no map, no gradient or glow or sparkle or typing
animation on AI, no shadows in flow, no large radii, no illustrations, no status carried by colour
alone, no chat bubble.

## 2. Tokens (`src/app/globals.css`)

Hue is reserved for meaning. Punctuality is the only hue scale (green, amber, red). Held is a stop,
not a degree of lateness: ink fill. Stale describes our knowledge, not the shipment: grey plus hatch.
Delivered is finished: a quiet outline. Indigo-violet belongs to model output alone, always flat.
Tailwind's default colours, radii and shadows are deleted so an off-system class generates nothing.

```css
@import "tailwindcss";

@theme {
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;

  --color-white: #ffffff;
  --color-canvas: #f6f4ef;
  --color-surface: #ffffff;
  --color-sunken: #eeebe4;
  --color-line: #ddd8ce;
  --color-line-strong: #847f75;

  --color-ink-900: #131c2b;
  --color-ink-700: #34404f;
  --color-ink-600: #4a5666;
  --color-ink-500: #5e6978;
  --color-ink-400: #8a94a2;

  --color-brand-700: #164b73;
  --color-brand-600: #1d5f92;
  --color-brand-200: #bfd8ea;
  --color-brand-50: #eaf2f8;

  --color-ontime-700: #17663f;
  --color-ontime-600: #1f8553;
  --color-ontime-200: #b7dbc6;
  --color-ontime-50: #e9f4ee;

  --color-atrisk-700: #7a4b00;
  --color-atrisk-600: #b26f00;
  --color-atrisk-200: #efd49a;
  --color-atrisk-50: #fcf4e1;

  --color-delayed-700: #a0281f;
  --color-delayed-600: #c4372c;
  --color-delayed-200: #f1bbb4;
  --color-delayed-50: #fcece9;

  --color-held-700: #222c3a;

  --color-stale-700: #525b66;
  --color-stale-600: #6e7782;
  --color-stale-200: #c9cdd3;
  --color-stale-50: #f1f2f4;

  --color-delivered-700: #3a4654;
  --color-delivered-200: #cdd2d8;

  --color-ai-700: #4b37b3;
  --color-ai-600: #5e4ad0;
  --color-ai-200: #cfc7f3;
  --color-ai-50: #f2effd;

  --font-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, monospace;
  --text-2xs: 0.6875rem;
  --text-2xs--line-height: 1rem;

  --spacing-topbar: 3.5rem;
  --spacing-demobar: 2.5rem;
  --spacing-rail: 25rem;
  --spacing-drawer: 30rem;
  --container-portal: 67rem;

  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;

  --shadow-overlay: 0 6px 16px -4px #131c2b29;
  --shadow-drawer: -12px 0 32px -12px #131c2b2e;

  --ease-out: cubic-bezier(0.2, 0, 0, 1);
  --animate-flash: flash 1600ms var(--ease-out) 1;
  @keyframes flash {
    from {
      background-color: var(--color-brand-50);
    }
    to {
      background-color: transparent;
    }
  }
}

@utility bg-hatch {
  background-image: repeating-linear-gradient(135deg, transparent 0 4px, #525b6629 4px 5px);
}
```

Contrast (WCAG 2.2, computed): ink-900 on surface 17.1; ink-600 7.5; ink-500 5.6 is the lightest text
allowed; ink-400 is decoration only. Status `-700` text on its `-50` tint is at least 6.2; white on
held 14.1. Glyph strokes (`-600`) on surface are at least 4.1.

**Type.** IBM Plex Sans (400/500/600) for UI; IBM Plex Mono (400/500) for whatever a user copies or
compares: references, timestamps, raw operator payloads. Both through `@fontsource/ibm-plex-sans`
and `@fontsource/ibm-plex-mono`, imported once in `src/app/layout.tsx` (the weights used, latin
subset): the files are bundled, nothing touches the network. Numeric columns use `tabular-nums`.
Scale: `2xs` 11/16 caps labels and table headers; `xs` 12/16 captions; `sm` 14/20 operations body;
`base` 16/24 customer body and AI prose; `lg` 18/28 section titles; `2xl` 24/32 page titles; `4xl`
36/40 the customer's delivery date.

**Shape.** 4px grid. Radii: 4 controls, 6 cards and panels, 8 overlays; only statuses are pills, so a
status is found by silhouette. Borders: 1px `line` for structure, 1px `line-strong` for inputs, 2px
for provenance strokes and the active tab, 3px status bar on flagged cards and toasts. No shadows in
flow; two for overlays.

**Dates.** `Fri 16 Oct`; with time `Tue 6 Oct 06:10`; always in the local time of the event's place,
with the place beside it. Ages are relative ("25 min ago", "27 h ago"). Clocks: "Now", "Act within
4 h", "Cut-off in 20 h", "Free time ends Fri 9 Oct".

## 3. Provenance grammar (the heart of the design)

Three channels, each sufficient alone, so the grammar survives greyscale: **stroke**, **fill** and
**words**. It is identical in both roles.

| Class                     | Glyph                                          | Rail / stroke                            | Words (ops)                                            | Words (customer)                                                |
| ------------------------- | ---------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------- |
| Confirmed (operator fact) | ● filled circle                                | solid 2px ink                            | `Confirmed · Noray Lines · 12 min ago`                 | `Confirmed`                                                     |
| Operator estimate         | ○ hollow circle                                | dashed 2px ink (`6 4`)                   | `Operator estimate · Noray Lines · declared Mon 5 Oct` | `Estimated · by the carrier`                                    |
| Estela estimate (model)   | ◇ hollow diamond, ai-600                       | dotted 2px ai-600 (round caps)           | `Estela estimate · rule-based` + window                | only inside an approved notice: `Estimated · by Ibón logistics` |
| Planned                   | · small dot, ink-400                           | solid 1px line                           | `Planned`                                              | `Planned`                                                       |
| Committed                 | ▮ solid tick                                   | none                                     | `Committed`                                            | `Committed`                                                     |
| Written by AI (text)      | `AI` tag (Plex Mono 2xs caps, ai-700 on ai-50) | dotted ai-600 left rule on its container | `Written by AI from 6 facts`                           | never shown unapproved                                          |

Rules:

1. Dashed and dotted are reserved words: never decorative. Dividers, dropzones and focus rings are
   solid.
2. Violet means a model produced this, and nothing else. Counts, holds, staleness, rule-based
   exceptions and playbook steps carry no violet and no `AI` tag. There is no violet button: acting
   is always a human decision.
3. No source, no value: a missing estimate reads "No estimate yet", "No estimate: no position from
   Eisvogel Spedition for 27 h", never a placeholder date.
4. Human review changes the mark: an edited AI draft gets a solid ink rule and the tag
   `AI draft · edited`; an AI reading that a person confirmed reads `Read by AI · confirmed by Marta
Soler`.
5. A status inherits the mark of its evidence: At risk is a hollow triangle (estimated), Delayed a
   filled one (declared or confirmed).
6. A superseded operator estimate is shown struck through with its age: "declared Tue 6 Oct, before
   the vessel delay".
7. Staleness: the pill becomes `◌ Stale · 27 h`, the position marker turns hollow and the rail from
   the last event to Now becomes a hatched band (`bg-hatch`), meaning unknown. Hatch appears nowhere
   else.

One `DateStamp` component renders every date in the product. It switches exhaustively on the
provenance kind, so a new kind fails the build until it has a mark and a label. Day-precision values
never show a time of day.

## 4. Components (`src/ui/kit`)

- **Button**: `primary` (ink-900 fill, one per region), `secondary` (surface, line-strong border),
  `ghost`, `link` (brand-700); heights 28, 32, 40. States: hover, focus-visible, disabled
  (`aria-disabled`, still focusable, with a reason via tooltip), loading (spinner replaces the icon,
  width stays).
- **StatusPill** + **StatusGlyph**: height 20 or 24; seven custom SVG glyphs at 12px in one
  component (icon-set shapes blur at that size). On time ● and Delivered ✓ are quiet (surface, `-200`
  border); At risk △ and Delayed ▲ sit on their `-50` tint with `-700` text; Held ■ is held-700 fill
  with white text; Stale ◌ (broken ring) is stale-50 plus hatch; Neutral (customer "in progress") is
  a plain outline with no glyph claim. Optional qualifier ("At risk · +1 d"). Doubles as a filter
  chip (`aria-pressed`).
- **ProvenanceMark** and **DateStamp**: section 3.
- **AiMark**: the `AI` tag and the dotted left rule container (`AiBlock`), with a footer line
  ("Written by AI from the 2 nearest deadlines").
- **Card**: surface, 1px line, radius 6, padding 16 (ops) or 24 (customer). Variants: static,
  interactive (one stretched link), flagged (3px status bar on the left), notice.
- **Table**: real `<table>`; header 32px on sunken with 2xs caps; rows 64px, two lines. The reference
  is the stretched row link; the action button is a second tab stop. Row states: hover, focus-visible
  (inset ring), updated (`animate-flash` + "Updated just now"), new (3px brand bar until hovered).
- **Tabs**: underline, 40px; active ink-900 with a 2px underline; arrow-key roving (Radix).
- **Drawer**: right, 480px, above the demo bar; scrim ink-900 at 32%; header 56, sticky footer 64;
  Radix Dialog for focus trap, `Esc` and focus return.
- **Toast**: top right under the top bar, 360px, overlay shadow, 3px status bar, at most three, 8 s,
  paused on hover or focus, `role="status"`; errors `role="alert"` and persistent.
- **Menu / Popover / Tooltip**: Radix, 8px radius, overlay shadow.
- **RouteStrip**: `mini` (160×16, for rows and cards) and `full` (88px, with place names, mode icons
  and operator names). Segments have equal width (proportional widths would erase the road legs next
  to a sea leg). Road and sea are told apart by a small mode icon and label, never by colour. A port
  with a customs gate is a square node. Completed stretches are solid ink; stretches ahead are a 1px
  planned line; the current position is a 12px brand-600 dot with a brand-200 halo, hollow when stale;
  a stretch with a problem carries its status glyph.
- **Timeline** (`LegTimeline`): one data shape, two renderings. Section header 40px ("Sea · Noray
  Lines · NORAY ALTAIR 612W · Valencia → Veracruz"); entry rows 44px (ops) or 56px (customer): time
  column 128px in mono, rail 24px with the provenance glyph, label plus caption. A `Now` rule splits
  past from future. `audience="ops"` shows every entry (milestones, holds, positions collapsed to one
  line, notes, our own actions) and each has a "Show original" disclosure with the raw payload in
  mono on sunken, channel and received time. `audience="customer"` shows customer-level milestones
  and confirmed holds only.
- **Skeleton** (sunken blocks copying the final geometry, shown after 150 ms, opacity pulse) and
  **EmptyState** (left-aligned text, one true sentence, one action, no illustration).
- **KeyValue** list for references and facts.

## 5. Shell (`src/ui/shell`)

- **Role layouts.** `/ops/*` for internal personas, `/portal/*` for external ones. `/` redirects to
  the active persona's home (Marta by default). A persona on the wrong side is redirected to its own
  home. Each role layout renders its data-dependent subtree behind one `<Suspense>` with a
  browser-only gate (`use(browser(...))`, see the overview): the prerendered HTML is the frame and a
  skeleton.
- **Ops top bar** (56px): the wordmark (a short solid-dashed-dotted line, then "Estela"); the ask bar
  in the centre (480px, 640 on focus; `/` focuses it); on the right a `Legend` popover (the six marks
  of section 3 in one small table), the live indicator ("Live · last operator update 2 min ago"), and
  the identity chip ("Marta Soler · Logistics · All sites · 23 shipments").
- **Portal top bar**: wordmark, "Ibón Fluid Systems · shipment tracking", the account name and the
  persona name. No navigation: the list is the home.
- **Demo bar** (fixed bottom, 40px, ink-900, Plex Mono xs; the only inverse surface, so it reads as
  tooling outside the product): the label `DEMO`; the persona menu, grouped Operations / Customer,
  each item with its perimeter in words, opening upward; the operator events control: a primary
  button that names the next sendable event ("Send: Noray Lines · NORAY ALTAIR delayed at Veracruz")
  and a menu listing the four events with their state (sent, or disabled with the reason, e.g. "Send
  the corrected invoice for EST-4012 first"); the demo clock ("Demo clock · Wed 7 Oct 2026 16:03 ·
  Zaragoza"); `Reset`. It is a labelled region and the last in tab order.
- **Toasts and live region.** Operations get a toast for a feed notice that touches their perimeter
  (with `View`, which applies the notice's filter), for their own completed actions ("Notice sent.
  Mariana Olvera now sees Fri 16 Oct."), and when a case is resolved by an operator update. The
  portal never toasts: a new notice simply appears on top, tagged `New`. A polite live region
  announces the same sentences.
- **Liveness.** Rows update in place with a single flash and "Updated just now"; order never changes
  under the cursor: new or re-ranked cases wait behind a "1 new · Show" bar.

## 6. Screens

### 6.1 Operations: shipments (`/ops`)

One table serves the queue and the portfolio. State lives in the URL: `view`, `q` and the filter
fields.

Top to bottom:

1. **Digest band.** Left: the computed counts as status-pill filter chips (`▲ 1 Delayed`, `■ 2 Held`,
   `△ 2 At risk`, `◌ 1 Stale`), then plain text "11 on plan · 4 delivered since yesterday". Below, in
   an `AiBlock`: the one generated sentence, with the footer "Written by AI from the 2 nearest
   deadlines". Counts are never violet.
2. **Tabs**: `Needs attention 6` · `Waiting 0` · `All 23`.
3. **Ask result**, when `q` is set: for a filter, a chip row "Read by AI as:" with one removable chip
   per recognised constraint, showing resolved values ("Destination: France", "Due: this week, 5–11
   Oct", "Health: Delayed or At risk") and, if any, "Not used: urgent"; removing a chip updates the
   URL and the table. For a lookup, an answer card: reference, status line (composed by code, with
   provenance marks on its dates), "Open shipment". For an unsupported question, the refusal sentence.
   For a text that was not understood: "Couldn't turn that into filters. Showing text matches for
   …". Suggested queries appear on focus so a reviewer never hits a dead end.
4. **Table.** Columns: `Status` (pill, and under it the clock: "Act within 4 h"); `Shipment` (id in
   mono, order number, account; second line: mini route strip and "Zaragoza → Querétaro, MX");
   `Why it is here` in the attention views (one line with the provenance glyph of its evidence; "Read
   by AI, confirm" tag when it rests on an unconfirmed reading) or `Now` in the All view (stage, and
   the vessel or the last place); `Delivery` (committed date; under it the best estimate with its
   provenance glyph and the difference in days); `Next step` (one button named after the step:
   "Review notice", "Message Eisvogel", "Send invoice", "Confirm reading"; opens the drawer in place;
   a step the actor may not perform shows disabled with its reason); `Updated` (age).
5. Empty attention view: "Nothing needs you right now. 11 shipments in your perimeter are moving as
   planned."

### 6.2 Operations: shipment (`/ops/shipments/[id]`)

Header: back link; `EST-4058` · Order 12345 · Aquabajío Ingeniería (customer) · status pill · stage.
Second line: origin site → consignee; the incoterm line ("DAP Querétaro: the consignee clears
import"); cargo; container; vessel and voyage. Then the full route strip.

Main column:

1. **Case panel** (only when an exception is open; flagged card). Title in words ("At risk: estimate
   one day after the committed date"), the clock, then **Why it is here**: evidence lines, each with
   its provenance glyph, source and age, and a link that scrolls to and flashes its timeline entry.
   Then **Proposed steps**, numbered, each with its button and state ("Done · Marta Soler · 16:12",
   or disabled with the reason). An unconfirmed AI reading shows as a small `AiBlock`: what was read,
   "Show original", `Confirm reading`, `Not right`. When every step is done: "Your part is done.
   Waiting on customs."
2. **Timeline**, grouped by section, with the `Now` rule.

Rail (400px, sticky):

1. **Delivery** block: three labelled rows with their marks: Committed; Operator estimate (who, when
   declared; struck through with the reason when superseded; "Withdrawn by Turia Global Forwarding"
   when withdrawn); Estela estimate (day, window, "Rule-based estimate"; or "No estimate: …"; or
   "Agrees with the operator"). A `Why?` disclosure lists the chain of steps with where each time
   came from, "Firms up when the vessel berths", and the assumption if any. Under a hairline:
   **Customer currently sees**: the verdict and the published date exactly as the portal shows them.
2. **Documents** with their status.
3. **References**.
4. **Messages**: what was sent, to whom, by whom, when.

No day ruler: three labelled dates carry the point.

### 6.3 The one drawer: review and send

The single gate between AI output and the outside world, used for the three outbound steps.

- Title: "Customer notice" / "Message to Eisvogel Spedition" / "Send document to Turia Global
  Forwarding". `To:` the recipient (customer contact and "portal alert + email", or the operator's
  desk). Outbound delivery is mocked and labelled so ("Prototype: nothing leaves this browser").
- Subject (editable) and body (editable textarea) inside an `AiBlock`: "Drafted by AI from 6 facts.
  Nothing is sent until you approve." Editing switches the mark to `AI draft · edited`.
- **Facts used**: the fact sheet as read-only lines with provenance marks (new date and its kind,
  previous date, cause and its source, committed date).
- For a customer notice, **What approving changes**: "The customer's verdict: In progress →
  Delayed." "The customer's date: under review → Fri 16 Oct, estimated by Ibón logistics." The
  published date comes from the snapshot, not from the prose.
- A deterministic guard: if the body mentions a date that is not in the fact sheet, an inline message
  names it ("This date is not in the shipment record: 18 Oct") and sending is disabled until fixed.
- For a document: an attachment row with a file input and "Use the sample file".
- Footer: `Cancel` · `Approve and send` (primary). States: draft loading (600 ms, skeleton "Reading
  the shipment record…"), draft failed ("The assistant couldn't write a draft. Start from the facts
  below.", empty body, manual path intact), outdated ("The estimate changed while this draft was
  open. Reload the draft."), sending, sent (drawer closes, toast).

### 6.4 Portal: your shipments (`/portal`)

Centred column (`max-w-portal`). Greeting and a computed summary sentence at 2xl ("7 shipments on the
way. 1 needs your attention."). Then approved notices, newest first (notice card: status bar, title,
first sentence, "Approved by Marta Soler, Ibón logistics · 16:12", `See shipment`). Then three
groups: **Needs your attention** (delayed or on hold), **On the way**, **Delivered in the last 30
days** (compact rows). A shipment card (112px): the customer's own order number first and the cargo;
the mini route strip and the stage in the customer's words; the verdict pill and the date with its
provenance word ("Fri 9 Oct · Estimated"); the age of the last confirmed update. The word "stale"
never appears; only the age.

### 6.5 Portal: shipment (`/portal/shipments/[id]`)

The verdict in three seconds, then the proof. Test: cover everything below 300px and the answer must
survive.

- Hero: the verdict word with its glyph and the delivery date at 4xl, then one line with the
  provenance ("Estimated by the carrier" / "Estimated by Ibón logistics, approved by Marta Soler" /
  "Confirmed"), the committed date and the difference ("two days later than planned"), a one-line
  reason, and "Last confirmed update 2 h ago". In-progress shipments make no claim: "Delivery date
  under review (was Wed 14 Oct)".
- The latest notice, signed.
- The full route strip, then the customer-level milestones with their provenance words.
- Rail (320px): **Documents** (name, date, `Download`); **References** (your order, container, bill
  of lading, vessel and voyage, port of arrival and its date, and the incoterm line "DAP Querétaro:
  you clear import"); "Questions? logistics@ibon.example".
- Unknown or foreign id: "We couldn't find that shipment." with a link back, identical in both cases.

## 7. Accessibility and motion

- One 2px solid brand-600 focus outline at 2px offset (inset on rows; brand-200 on the demo bar),
  `:focus-visible` only, never removed. Skip link. `Esc` closes overlays. Two tab stops per table row.
- Semantics: a real table; each timeline section an `<ol>` with `<time datetime>`; pill glyphs
  `aria-hidden` with the meaning in text; provenance in the accessible name; the three dates a
  `<dl>`. Targets at least 28px.
- Motion: 120 ms for hover and press colour; 200 ms ease-out for drawer, menu and toast entry; the
  1600 ms flash for changed data. Nothing loops except the skeleton pulse.
  `prefers-reduced-motion`: transitions drop to zero, the flash becomes a 3px brand bar that stays
  until hover or focus, skeletons hold still.
- Responsive: fluid from 1280 to 1920; between 1024 and 1279 the gutter shrinks to 20 and the rail to
  340; below 1024 the rail drops under the main column and the table scrolls inside its card. Portal
  pages are single-column by construction. No mobile navigation: stated as a limitation.

## 8. Code layout

```text
src/ui/kit/        primitives above, each in its own file, plus kit tests
src/ui/shell/      providers (browser gate, gateway, query client, persona), top bars, demo bar,
                   legend, toasts, live region
src/ui/features/   ops-shipments/, ops-shipment/, message-drawer/, portal/
src/ui/hooks/      gateway access, actor, now, query options and keys, live invalidation
src/ui/format/     date and age formatting for components (built on the domain time module)
src/app/           layout.tsx, page.tsx, not-found.tsx, ops/…, portal/…
```

Components receive view models from the gateway and render them. They never filter by perimeter,
never compute a status and never compose domain sentences: that already happened behind the gateway.
