# The Triple Invite

A single-page invitation to one evening with three reasons: Michael's 80th,
Savio's 50th, and Orwill & Jovita's Silver. Thanksgiving Mass at Don Bosco
Shrine, Saturday 29 November, dinner after.

Static HTML, CSS and one script. No build step, no framework, no runtime
dependency on anything remote — the fonts, the textures and the wireframe
marks are all served from this repo, so the page renders the same on a
patchy signal as it does on a desk.

## Deploy

Vercel, zero build:

1. **New Project → Import** `HyperToken9/the-triple-invite`
2. Framework Preset: **Other**
3. Leave everything else alone and **Deploy**

`vercel.json` already sets the output directory to `demo/`, so the invitation
lands at `/`. If a deploy ever comes back 404, check
**Settings → Build & Development Settings → Output Directory** reads `demo`.

### The one thing to change

`demo/index.html` hard-codes the live domain twice, in `og:url` and
`og:image`:

```html
<meta property="og:url"   content="https://the-triple-invite.vercel.app/">
<meta property="og:image" content="https://the-triple-invite.vercel.app/assets/preview.png">
```

WhatsApp fetches the link preview from its own servers, so these have to be
absolute and they have to match the domain the site actually ends up on. If
the Vercel project name differs, or a custom domain gets pointed at it, edit
those two lines. Nothing else in the project hard-codes a URL.

WhatsApp caches previews hard. To force a re-fetch after a change, send the
link with a throwaway query string once: `…vercel.app/?v=2`.

## What is where

```
demo/
  index.html      the invitation — the deployed site
  system.css      the shared design system (palette, type, components)
  wireframe.js    the 3D wireframe marks: flutes, heart, disco ball, rings
  assets/
    fonts/        Bodoni Moda + Archivo, variable, subset to woff2
    env-paper.jpg the envelope stock; five folds are cut from this one sheet
    paper.jpg     the page's grain, a seamless tile
    preview.png   1200x630, what WhatsApp puts in the bubble
  overview.html   studio scaffolding: index of the demos
  teaser.html     studio scaffolding: an early WhatsApp mock
  palette.html    the design system on a board, useful when editing system.css
the_pivot/        design references and source textures — not deployed
```

The three studio pages are working notes, not part of the invitation. They
ship, because they cost nothing and are handy while the design is still
moving, but nothing links to them from the invitation.

## Local

```sh
cd demo && python3 -m http.server 8777
# http://localhost:8777
```

A server rather than opening the file directly: the variable fonts and the
paper textures will not load over `file://`.

## Still to fill in

`demo/index.html` carries placeholders in square brackets — `[Time]`,
`[Venue]`, `[Address]`, `[date]`. Search for `[` to find them all.

The RSVP contact is spelled **Jovita Saldanha**; that spelling has not been
confirmed.
