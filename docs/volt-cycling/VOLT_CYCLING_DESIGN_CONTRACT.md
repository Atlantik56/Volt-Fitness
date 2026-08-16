# VOLT Cycling Design Contract v1.0

**Status:** Approved

**Visual direction:** `VOLT Cycling — Sunset Copper`

**Reference screen:** `Cycling Home Reference Implementation v1`

## Scope

This contract defines the approved visual identity, compact Cycling flow and
Home hierarchy for VOLT Cycling. Cycling is a specialised interface for one
discipline inside the shared VOLT product; it does not own a parallel training
programme, calendar, history, analytics, records or Coach.

Cycling has four views, which may be states of one continuous flow:

1. `Home`;
2. `Details`;
3. `Active`;
4. `Result`.

The only new top-level route is `/cycling`. Cycling uses the global VOLT shell
and the shared workout lifecycle. It must not introduce `/cycling/history`,
`/cycling/analytics`, `/cycling/records`, `/cycling/coach`, a separate calendar,
an independent start date or its own programme progression.

VOLT Cycling is a distinct sports environment inside the VOLT ecosystem. It is
not ordinary VOLT recoloured with a cycling image, and it is not a copy of VOLT
Swim. The character is:

> Road. Sunset. Forward motion. Calm endurance.

## Approved visual sources

| Role | Canonical asset | Integrity (SHA-256) |
|---|---|---|
| Cycling Home Reference Implementation v1 | [assets/cycling-home-reference-v1.png](assets/cycling-home-reference-v1.png) | `3ff0b82da20ea44f00c7438d0edd6998fb456e9c87cc9190b3aeaea5ec95659f` |
| Cycling Background v1 | [assets/cycling-background-v1.png](assets/cycling-background-v1.png) | `61e945e684efdc1d978f0d424afaa4b20aa73dea1d89c02d3c422e549b97bc0b` |

The approved Home reference governs composition, information hierarchy,
relative visual weight, surface placement and the relationship between UI and
background. The separate background governs the scene, subject, atmosphere,
lighting and intended crop family.

### Source-of-truth rule

> The approved Home Reference and separate Cycling Background are the visual
> source of truth for VOLT Cycling. They must not be regenerated, retouched,
> replaced with a similar image or substituted with generic dark fitness UI,
> ordinary VOLT styling or VOLT Swim styling.

This written contract is authoritative for colour tokens and semantic colour
usage. The lime accents visible in the early Home reference are superseded by
the approved Sunset Copper direction: primary CTA, active navigation, progress,
selected states and Cycling brand accents must use orange/copper. Lime must not
be copied from the reference as Cycling's primary UI colour.

If implementation requirements conflict with the approved assets or this
contract, stop and request a design decision instead of inventing a compromise.

## Product identity

The three VOLT environments must remain immediately distinguishable:

| Environment | Visual core | Character |
|---|---|---|
| Ordinary VOLT | graphite + electric lime | gym, strength, energy |
| VOLT Swim | deep navy + aqua/cyan | water, coolness, flow |
| VOLT Cycling | warm black + sunset orange/copper/gold | asphalt, sunset, road, endurance |

Cycling inherits the parent product's standards for clarity, hierarchy,
accessibility and premium material quality. It does not inherit ordinary VOLT
lime as its primary accent, Swim colours, water effects or Swim composition.

## Background

- Use the approved full-page cinematic image of a cyclist riding away from the
  viewer toward the sunset and modern metropolis.
- The cyclist, road, skyline, orange-gold sky and deep perspective are essential
  parts of the Cycling identity.
- The cyclist sits predominantly in the right half of the composition. Preserve
  calmer left/central space for interface content wherever the viewport allows.
- The background is an architectural page layer, not an image embedded inside
  Hero, Next Workout or another card.
- Render one shared background per page. Do not repeat it, split it into a
  separate photo panel or assign it to multiple components.
- Apply restrained global and local darkening for readability without erasing
  the sunset, road depth or cyclist silhouette.
- Responsive crops may change, but must keep the rider, direction of travel,
  sunset and metropolis legible. Do not mirror the image.

## Colour system — Sunset Copper

| Role | Token |
|---|---|
| Cycling primary | `#FF7A1A` |
| Primary light / hover | `#FF9D45` |
| Gold highlight | `#FFC56E` |
| Copper support | `#C85D24` |
| Deep warm background | `#100D0B` |
| Warm graphite | `#1B1714` |
| Warm glass base | `rgba(28, 21, 17, 0.68)` |
| Warm glass border | `rgba(255, 157, 69, 0.16)` |
| Primary text | `#FFF7F0` |
| Secondary text | `#B9ADA4` |
| Danger / pain | `#FF4D5E` |

Orange/copper is used for primary CTA, active navigation, progress, selected
states and essential Cycling accents. Amber/gold supports hierarchy but does
not become a second competing primary.

Keep approximately 80–85% of the interface in dark warm glass and neutral text;
the sunset already supplies strong colour. Avoid covering every icon, border or
metric with orange. Orange is a brand accent in Cycling and therefore must not
also be the default warning colour. Use coral/red only for HR emphasis when
needed, pain feedback, destructive actions and negative states.

## Warm VOLT Glass

Cycling uses a warm variant of VOLT Glass:

- translucent warm-black/graphite base;
- controlled backdrop blur;
- thin, low-contrast warm border;
- restrained inner highlight and soft depth shadow;
- very subtle orange glow only for primary, active or selected states;
- enough transparency for the road and sunset to remain perceptible;
- sufficient fallback contrast when backdrop blur is unavailable.

Surfaces must feel related to the shared VOLT material system, but tuned to the
warm environment. Prohibited effects include opaque black slabs, milky glass,
constant neon outlines, orange glow around every card, plastic gradients and
unreadable transparency.

## Home composition and hierarchy

The required hierarchy is:

> Brand + atmosphere → Next Workout → weekly metrics → last ride → program
> progression + load feedback → contextual safety information.

### 1. Brand and atmosphere

- Display `VOLT CYCLING`; `CYCLING` uses the Cycling orange/copper accent.
- Use a short, calm positioning line such as `Спокойная аэробная работа` and
  `Движение. Выносливость. Прогресс.`
- The cyclist, road and sunset remain the dominant visual Hero; do not add a
  competing sports illustration.

### 2. Next Workout

Next Workout is the dominant functional object on Home. Its large glass card
shows:

- scheduled day;
- `Optional` status when supplied by the product;
- workout name;
- duration;
- three concise load conditions or instructions;
- one primary action to start the workout.

The primary CTA is Sunset Orange/Copper. Speed, power and achievement data must
not compete with the purpose and conditions of the next workout.

### 3. Weekly metrics

Use four quiet compact metrics:

- time in the saddle;
- number of rides;
- average HR;
- average speed.

They form a secondary information tier and must never visually outweigh Next
Workout. Display only real available data and honest empty states.

### 4. Last ride

Use one horizontal entry card with ride name, date/source, time, distance and HR
when those values exist. The whole card can lead to ride details. Do not invent
missing telemetry.

### 5. Program progression

Show the current week of the shared VOLT programme and its actual progression
step in a compact block. Progress uses orange. The language communicates
gradual development, not a competitive challenge or streak pressure.

### 6. Load feedback

Home includes `Как переносится нагрузка?` with the latest recorded state:

- спокойно / без дискомфорта;
- небольшой дискомфорт;
- боль.

This is training feedback, not diagnosis. Do not infer a medical condition,
promise safety or hide a pain state behind decorative colour.

### 7. Contextual safety information

Cycling is presented as calm, low-impact aerobic work. The UI should reinforce
progression primarily by time rather than resistance and must not motivate the
user to chase maximum speed, power or intensity. Safety information remains
contextual and concise; it does not compete with the workout action and does not
make medical claims.

## Product ownership and navigation

The main VOLT product remains the sole owner of the weekly Plan, schedule and
transfers, complete workout history, load analytics, records, Coach and shared
programme progression. Cycling does not reproduce those destinations.

Cycling uses the established global VOLT shell. Its only local movement is the
continuous `Home → Details → Active → Result` workout flow; this is state
navigation, not a new section navigation system. The global shell keeps the
normal VOLT destinations and module entry points available without introducing
a Cycling-specific sidebar or bottom navigation.

`Result` reuses the shared provider-independent Garmin/FIT import pipeline. A
user may attach a bicycle `.fit` file to the awaiting-confirmation draft; the
import supplies objective metrics but does not confirm the workout by itself.
Both `Active` and `Result` must provide a destructive, clearly labelled way to
cancel the open draft before it is saved to the shared workout history.

The last ride and weekly metrics on Cycling Home are concise summaries derived
from confirmed shared `workout_logs`. They are not separate Cycling History or
Analytics products and must not imply a second source of truth.

## Responsive behaviour

- Desktop defines the complete information architecture and full composition.
- Mobile preserves every required tier and access point while stacking content
  around the protected cyclist/background crop.
- Next Workout remains the first dominant actionable object after Brand.
- Weekly metrics may wrap, but their order and secondary weight remain stable.
- Preserve access to the global VOLT shell and its existing mobile entry points.
- Do not add local Cycling History, Analytics, Records or Coach entry points.
- Validate text and controls against the real background, including long labels,
  empty states and reduced-transparency fallback.

## Prohibited

- Generic dark fitness-dashboard styling.
- Ordinary VOLT lime as Cycling primary, CTA, active or progress colour.
- VOLT Swim navy/aqua palette, pool effects or copied Swim layout.
- Replacing, regenerating, retouching or mirroring approved visual assets.
- Treating the background as card content or repeating it across components.
- Competitive pressure around maximum speed, power or intensity.
- Fake metrics, fake telemetry, fabricated achievements or medical conclusions.
- Multiple equally dominant cards that flatten the Home hierarchy.
- Functionality changes made solely to match the reference image.
- A separate Cycling Plan, calendar, programme start or progression engine.
- Separate Cycling History, Analytics, Records or Coach routes.

## Implementation acceptance checklist

- [ ] The two approved assets above are used without modification.
- [ ] Background remains a single page-level architectural layer.
- [ ] Sunset Copper is the primary Cycling accent; lime is not primary UI.
- [ ] Warm VOLT Glass preserves both readability and visible atmosphere.
- [ ] Home hierarchy matches the required seven tiers.
- [ ] Next Workout is the dominant functional object with one primary CTA.
- [ ] Cycling contains only Home, Details, Active and Result views under `/cycling`.
- [ ] The global VOLT shell is retained without a Cycling-specific navigation system.
- [ ] Plan, History, Analytics, Records and Coach remain owned by main VOLT.
- [ ] Weekly metrics and last ride are summaries from confirmed shared `workout_logs`.
- [ ] A bike FIT can be linked from `Result`; imported objective metrics remain
      read-only and the workout is saved only after explicit confirmation.
- [ ] Both `Active` and `Result` can cancel their open draft without creating a
      workout-log fact.
- [ ] Load feedback is clearly training feedback, not medical diagnosis.
- [ ] Metrics and telemetry are real or represented by honest states.
- [ ] Ordinary VOLT and VOLT Swim remain visually and functionally untouched.
