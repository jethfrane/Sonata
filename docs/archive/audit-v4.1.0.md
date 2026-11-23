# Sonata v4.1.0 (2026-11-10): Song Bank v2 and split Songs view

Requested by Jethro: better Song Bank creation with a preview ("Sonata Card"), social logos (Instagram, TikTok, Facebook, YouTube and personal links) instead of WhatsApp, payment QR codes (QR Ph: GCash, Maya, banks), and the items left from v4.0.0 (tablet side-by-side Songs, README screenshots).

## What changed

- **Sonata Card** (`js/ui/bankcard.js`): one card component used live in the editor, as the public page's header, and as a downloadable 1080×1350 PNG with a QR to the Song Bank and brand logos drawn from their SVG paths.
- **Song Bank editor** (`js/ui/bank.js`): two columns on wide screens (card preview + sharing on the left, form on the right), one column on phones. Photo upload (cropped square, JPEG ≤ 160 KB, stored inside the Song Bank file), social links (pasted profile links become user names), up to 4 payment codes, songs with search, select all/clear, genres.
- **Payment codes**: an uploaded screenshot is read with jsQR (loaded only when adding a code); the text is stored and redrawn crisply, the wallet is guessed from the code (GCash, Maya, BPI…). If a code can't be read, the picture itself is kept (shrunk). Visitors can enlarge a code or save it as a PNG to scan from their gallery. Copy on every view: Sonata never handles money.
- **Data** (`js/core/bank.js`, file version 2): `socials`, `links`, `photo`, `payments`. Version 1 files still open (Messenger name → Facebook; WhatsApp, SMS and Telegram dropped). Request channels: Messenger (text filled in), Instagram DM (text copied), email.
- **Links** end with the owner's name: `/bank/<id>/<name>` (storage-free; the id is what counts).
- **Songs side by side** (≥ 900 px): tapping a song shows its chart, meta and Edit/Present/Share beside the list; double-click opens the editor; phones unchanged.
- Brand logos from Simple Icons (CC0), only the 10 used (`js/ui/brands.js`).

## Not built: artist subdomains

`name.sonata.jethrofrane.xyz` is possible but needs (1) a wildcard domain on Vercel, which requires moving `jethrofrane.xyz` to Vercel's nameservers, and (2) a registry mapping names to Drive files, which is server storage. Both are decisions for Jethro; the readable `/bank/<id>/<name>` link was built instead.

## Verification

See the end of this file (filled in after the full run).
- Unit + API: **31/31** (new: social link tidying, v1 → v2 compatibility, payment code validation, wallet guess, request channels).
- Browser: browser **32**, routes **53**, a11y **22**, regression **41**, features **42** (new: card updates live, pasted Instagram link → user name, a GCash QR screenshot is read and labelled, published file holds card/links/payment code and no WhatsApp, link ends with the name, Messenger request with text, card PNG is 1080×1350, side-by-side Songs).
- Layout audit: **210 states** (35 screens × 6 sizes). The first run found 2 issues, both fixed and re-checked: the side preview was a nested landmark (axe, 1024/1440) and the QR-reading library had entered the offline download (precache 661 → 534 KB; it loads only when adding a payment code).
