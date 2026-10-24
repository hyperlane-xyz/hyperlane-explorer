# Animated OG preview draft

Open `/preview/og-video` on the branch deployment. Switch between delivered/pending
and video/still image. Examples use labeled illustrative data, not live messages.
Normal message and transaction pages continue to use their existing image cards.

## Local preview

```sh
pnpm install --frozen-lockfile
pnpm run generate:og-video
pnpm run dev
```

`pnpm run build` generates both MP4s and PNG posters before building Next. The
generator renders deterministic React frames with the existing `@vercel/og`, then
uses a build-only FFmpeg binary. Outputs in `public/og-video/` are ignored by git.
Temporary frames are removed after rendering. Clip plus poster must fit within
2 MiB per example. No request-time video generation or new runtime dependencies.

Each clip is five seconds, 24 fps, 1200×630, silent H.264 Baseline / yuv420p, with
the MP4 metadata moved to the front for playback. Posters use the final frame.
The existing OG font is used when available; otherwise the renderer explicitly
uses its bundled font. The page does not autoplay; viewers choose when to play.

## Metadata and platform checks

The page server-renders absolute video/poster URLs on the deployment's own host.
Video metadata is opt-in on `OGHead`; ordinary pages keep their image cards.
The Twitter card remains `summary_large_image`. `og:type=video.other` appears
after it, because Discord uses the last applicable layout tag.

- [Apple Messages](https://developer.apple.com/documentation/technotes/tn3156-create-rich-previews-for-messages):
  direct downloadable MP4; no HTML player required. Total associated resources
  should remain below Apple's documented 10 MB guideline.
- [Discord](https://docs.discord.com/developers/link-previews/overview#video):
  direct HTTPS video, poster required, video layout. The description is omitted
  in its video layout. Use a fresh query parameter when testing cached links.
- [X Player Cards](https://github.com/xdevplatform/cards-player-samples):
  separate iframe player integration; not implemented in this draft.
- [Slack video blocks](https://docs.slack.dev/reference/block-kit/blocks/video-block/):
  separate installed-app integration; not implemented in this draft.

Verify the public preview page and assets return 200 without authentication;
check video MIME type and byte-range responses. Test both statuses, the still
image variant, desktop/mobile layout, and video decoding. Then paste the page
URL into real iMessage and Discord clients to check their actual unfurls.
Metadata tests and successful browser playback do not prove platform playback.

## Before enabling on real message links

Choose a production renderer/cache for message-specific snapshots. Only emit
video tags once the asset is available; keep PNGs as fallback. Version assets by
message state and template, and account for platform caching of pending status.
Keep illustrative five-second playback distinct from the actual delivery time.
