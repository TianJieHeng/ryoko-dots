# OpenDots / Ryoko — B — Redline Comms

## Approved visual direction

Cyberpunk 2077 / Edgerunners-inspired interface with Eva Unit-02 palette. Use the selected concept `exec-8118b608-0948-401a-a44b-726e65198b08.png` as the composition reference. This document is independently usable and defines this theme, its shared behavior and its background integration.

Use a 56–64 px black utility rail followed by a 270–300 px vermilion navigation pane. Preserve actual existing utility destinations; omit icons whose function cannot be mapped. The main masthead is a broad red slab with a diagonal right cut and oversized cream RYOKO lettering. Keep the rightmost header actions on charcoal. The empty-state heading is left aligned, stacked on two or three lines, with a thin orange vertical rule. A restrained status card sits toward the bottom right above a wide cream composer. Its runtime and history sections stack vertically. Avoid letting this dock obscure conversation messages.

## Theme tokens

| Token | Value |
| --- | --- |
| canvas | `#101416` |
| surface | `#191C1D` |
| raised | `#2C2925` |
| accent | `#FF9239` |
| structure | `#E5472D` |
| text | `#F5EED8` |
| muted | `#C5BDB0` |

Sidebar treatment: Use dark text on the saturated red sidebar for ordinary navigation. Selected rows are near-black with cream text and a thin orange or cream marker. Do not reproduce low-contrast white-on-red small text from the concept image.

Composer treatment: Cream input surface #F3EBD5 with charcoal text #181A1B, dark attachment icon and orange focus indication. Keep the surrounding composer frame black with red rules. Disabled send is neutral gray; enabled send is orange with a dark icon.

Art file: `B-Redline-Comms-Chat-Background.png`, in the same folder as this document. CSS background position: `right center`. The skyline climbs the far right edge. Vermilion signage and orange industrial illumination dissolve toward a near-black center and left. Darken the art further behind populated messages.

Suggested art binding:

```css
.chat-scene {
  position: relative;
  isolation: isolate;
  background: #101416 url('./B-Redline-Comms-Chat-Background.png') right center / cover no-repeat;
}
.chat-scene::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #101416;
  opacity: .40;
  pointer-events: none;
}
.chat-scene[data-has-messages='true']::before { opacity: .85; }
.chat-scene > .content { position: relative; z-index: 1; }
```

Resolve the asset through the application's bundler rather than assuming this relative URL works in every framework. This snippet illustrates layering, not a required framework.

## Functional scope and implementation boundary

This is a visual redesign of the supplied OpenDots conversation application, not a replacement runtime or a new backend. Preserve the existing routes, state management, permissions, storage and supported actions. Do not invent model identity, local execution, connection success, latency, message history or agent capabilities from decorative labels in the mockup. Remove concept labels A/B/C, invented unit identifiers and promotional copy from production unless explicitly desired as theme decoration. Ryoko is the displayed assistant in this example; bind names and avatars to actual app data.

The screenshot shows an unavailable saved-history service and a disconnected runtime. These are example states, not permanent fixtures of the theme. The normal connected screen should be calmer and devote the recovered space to conversation. Loading failure must not masquerade as a genuinely empty conversation: use “Conversation could not be loaded” when history is unavailable; reserve “What’s on your mind?” for a confirmed empty/new conversation. The mockup combines these states for visual exploration; production must distinguish them.

## Layout measurements and hierarchy

Target 1600 × 1000, while remaining usable at 1280 × 800. Use a full-height shell, independently scrollable navigation and message regions, and an anchored composer. Main workspace is a grid with rows for breadcrumb/header, optional notices, flexible scrollable conversation, optional connection/history status, and composer. Never position the composer over the last message.

Use 16–24 px outer main-pane padding, 12–16 px panel gaps and a 4 px spacing base. Breadcrumb bar: 48–60 px. Assistant masthead: 88–112 px on large screens, 64–80 px on smaller screens. Navigation rows: 44–52 px. New chat: 48–56 px. Composer: 84 px minimum, expanding to approximately 220 px before its textarea scrolls. Keep normal conversation reading width around 720–880 px even when the decorative canvas is much wider.

Use 10–18 px clipped panel corners and 6–8 px button cuts. Build frames with nested CSS shapes or SVG borders so content and focus rings are not clipped. Do not rasterize the UI into an image. Controls, text, icons, warning labels and decorative unit numbers must remain separate elements.

## Typography and icons

Use a locally bundled condensed display font such as Rajdhani Bold or Barlow Condensed Bold for large headings and sparse uppercase section labels, with a system sans-serif for body copy and chat. Use a system monospace for timestamps and exact identifiers. Font suggestions are implementation options; ensure the selected font files and licenses are available before bundling.

Display title: 40–56 px; empty-state title: 36–48 px; section labels: 13–14 px; navigation and buttons: 15–16 px; message body: 16–18 px with 1.55 line height; metadata: 12–14 px. Avoid compressed display fonts in long messages. Small Japanese labels are optional secondary decoration and never the only functional label. Do not copy malformed generated lettering.

Use one coherent outlined icon family, approximately 20 px with consistent stroke weight. Every icon action has an accessible label and visible tooltip on hover and keyboard focus. Use 40–44 px minimum action targets. The R monogram can be a simple original SVG or text fallback; no external character art is required.

## Navigation

Retain New chat; Dots with Ryoko; Spaces with Everyday and Local setup; Recent chats; Imported history; Scheduled & activity; Memories; Settings & setup; and Sign out. Retain Make it your own only if the original application exposes that destination. Spaces expand and collapse through actual folder controls. Do not invent operations behind plus, phone, clock or document icons: map them to existing supported actions, otherwise omit them or show a clearly explained unavailable state.

Selected Dot and selected conversation are different selections. Use an accent edge, background and semantic current-state attribute. New chat begins a new conversation through the existing flow and retains the current conversation draft. Recent chat titles truncate visually with full-title tooltip/focus access. Preserve active chat and sidebar scrolling across refreshes. Imported history is explicitly read-only. Memory scope labels must reflect real scope, not a hardcoded “Scoped” badge.

## Conversation presentation

A confirmed empty conversation shows the theme's hero composition and city art. Once messages exist, remove the large greeting, reduce decorative art visibility and show an ordinary readable transcript. Avoid retaining giant unit numbers beneath message text. Keep message bodies on opaque or nearly opaque surfaces with verified contrast.

Differentiate user and Ryoko messages with clear author labels, a modest accent edge and spacing, not color alone. Use original timestamps where available in the user's configured timezone and preferred 24-hour format. Support paragraphs, lists, links and horizontally scrollable code blocks with labeled Copy actions. Long content must remain selectable and readable. Do not force equal-width speech bubbles or giant avatars.

Follow new arrivals only while the user is already near the bottom. If they are reading older content, show a quiet New messages control. Loading older messages preserves viewport anchoring. Switching conversations restores position and draft, and late responses must never appear under the wrong conversation.

## Composer and delivery

Use a real multiline textarea or accessible editor, an attachment action when supported and a Send button. Enter sends and Shift+Enter inserts a newline, subject to the app's established preference; IME composition must not trigger sending. Show the recipient in an accessible label. Keep focus after send and preserve selection during toolbar interactions.

A disconnected runtime allows drafting but disables sending, with a visible reason and Connect runtime nearby. Connecting shows pending status without repeatedly clearing the draft. Do not auto-send merely because a connection becomes available. Send must also be disabled for empty text unless supported attachments are present. Upload failures retain the draft and affected attachment details.

Preserve the application's distinction between pending local input, accepted work, runtime progress and committed history. An acknowledgment is not an assistant answer. Do not insert uncommitted provider output into canonical history. If optimistic input is supported, label it pending until confirmed. Failed sending retains recoverable text; uncertain delivery should not cause an automatic duplicate resend. Use Check status only if the backend supports it. Stop/cancel controls appear only for supported operations and must describe their actual effect.

## Runtime, history and provenance

Maintain two independent status areas:

| Area | States and behavior |
| --- | --- |
| Runtime | Disconnected, Connecting, Connected, Reconnecting, Failed; Connect runtime initiates the existing explicit connection flow. |
| Saved history | Loading, Loaded, Stale, Failed, Confirmed empty; Refresh saved state rereads persisted state and does not connect the runtime. |
| Provenance | Available, Unavailable, Unknown; shown in History details with the existing committed-text explanation. |

A disconnected runtime does not erase history. An unavailable history service does not prove the conversation is empty. Retain previously loaded messages with a last-successful-load timestamp and stale notice after refresh failure. No permanent green light or fabricated availability label is allowed.

Keep the expanded status dock only when needed. In the healthy state, collapse it to a quiet text strip. Each action shows pending, success or error inline; avoid repeated toasts. Retry history fetch and Connect runtime remain separately labeled. Technical diagnostics can expand inside History details; do not expose credentials, private tool details or uncommitted provider payloads. Dismissing a warning hides its expansion, not the underlying failure indicator.

## Background asset integration

The supplied PNG is newly reconstructed artwork matching the concept, not a pixel-perfect extraction. It contains city atmosphere only: no functional text, navigation, buttons or baked-in unit numbers. Keep the original PNG as the source asset. Production optimization may create a derivative while preserving this source.

Place the image behind the conversation viewport only, never behind navigation text, the composer or dialogs. Use background-size: cover and the theme-specific position below. Add a dark scrim above the image. Start with 30–45% scrim opacity for the empty state and 75–90% for a populated transcript; verify actual text contrast and use solid message surfaces. Art must not determine scroll height or capture input. At narrow widths it may disappear entirely. If loading fails, the flat canvas token is a complete fallback.

Layer order: canvas color → city image → dark scrim → optional decorative numeral → functional content. Decorations use pointer-events: none and aria-hidden. Do not use parallax, animated noise, flickering neon or scanline effects.

## Grit and edge wear without extra image dependencies

The city PNG already includes texture. For frame wear, generate a tiny deterministic SVG turbulence texture inside the implementation, using the exact SVG below. This avoids requiring a seventh external file. Render it in an isolated decorative layer beneath labels and controls, masked to frame edges or inside large colored slabs. Never apply it as a full-page overlay above text.

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="3" seed="11" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="192" height="192" filter="url(#grain)" opacity="0.4"/>
</svg>
```

Use the SVG as a repeating background on a pseudo-element at 0.08–0.16 opacity with multiply blending on bright panels, or 0.03–0.06 opacity on dark chrome. Isolate blending to the panel. Cache/rasterize once if SVG filtering is expensive. The texture is static and optional. Short diagonal hazard strips and edge scratches should be separate CSS/SVG ornaments with low density. Keep all six delivered files usable without an external texture download.

## Interaction states and accessibility

Hover slightly raises the surface or strengthens its border; it must not move the control. Focus is a 2 px high-contrast ring with a 2 px offset, distinguishable from selected state. Disabled controls retain readable labels and show a reason where needed. Loading uses labeled indicators or simple skeletons, never fictitious completion percentages. Reduced motion removes nonessential transitions; ordinary transitions are 100–150 ms.

Normal text must meet 4.5:1 contrast and large text/control indicators at least 3:1. Validate actual combinations, especially colored sidebar labels, red buttons and muted text. Theme accent colors are not inherently semantic success/error colors. Pair statuses with explicit words and icons. All settings, lists and message actions must work without hover. Keyboard order follows visual order; Escape closes dialogs and returns focus; text entry must not fire global shortcuts. Preserve zoom up to 200% with wrapping and accessible scrolling.

## Responsive behavior

At 1400 px and above use the full composition. At 1100–1399 px reduce sidebar to 240–260 px, shorten masthead height and wrap status actions. At 800–1099 px collapse secondary utility navigation and offer a sidebar toggle. Below 800 px use an overlay navigation drawer with a clear Close action, focus containment and focus restoration. Status cards stack; the composer stays available and grows above the keyboard when applicable. Hide decorative numerals before shrinking text. Preserve selected conversation, draft and scroll state across all transitions.

## Implementation and acceptance

Suggested components: AppShell, NavigationPanel, ConversationHeader, ConversationViewport, EmptyConversation, RuntimeStatus, HistoryStatus, HistoryDetails, MessageList and Composer. Theme tokens and art configuration should be separate from functional state, allowing these three directions to share behavior without copying the application logic. A theme switch, if implemented, must not reset connections, drafts or selection.

Verify the approved silhouette at 1600 × 1000 and readable operation at 1280 × 800. Also verify confirmed-empty, populated, long-message, loading, disconnected, stale-history, failed-send and narrow-window states. The background must be independently replaceable, controls must remain semantic elements, and a failed art load must not affect operation. This specification does not claim runtime or history integrations have been implemented or verified.
