# Launch posts for Visor

Drafts only. Nothing here has been posted. Every post waits for the developer's approval.

**Videos** (rendered from `marketing/video`, see [README.md](README.md)):

| File                              | Format            | Length | For                                      |
| --------------------------------- | ----------------- | ------ | ---------------------------------------- |
| `video/out/visor-reddit-16x9.mp4` | 1920×1080, 16:9   | 52 s   | Reddit (r/gnome, r/linux, r/SideProject) |
| `video/out/visor-reddit-1x1.mp4`  | 1080×1080, square | 52 s   | Reddit in the feed on phones, r/unixporn |
| `video/out/visor-reel-9x16.mp4`   | 1080×1920, 9:16   | 27 s   | Instagram Reel (@bytaulit)               |

All three have no sound and work without it: every step has a short English caption.

**Before any post**

- Read each draft once in your own voice and change what you would not say. They avoid claims about you that I can't know (how long you worked on it, what you use most); add such details yourself if they're true.

- Decide the install path the post links to. The README still says "link after release" for extensions.gnome.org and the AUR. Posting before the extensions.gnome.org review is through means people can only build from source, which costs a lot of the interest a launch post gets. Best: post on the day the extension is live on extensions.gnome.org.
- The website (https://taulit.github.io/visor/) works only after GitHub Pages is switched on (see the PR).
- The video shows the T3 Code approvals, which come from the separate module Visor: T3 Code (taulit/visor-t3). That repository is private right now; make it public (and ideally released) before posting, or people ask where to get it.
- Post from the personal account, one subreddit per day or two, not all at once (crossposting the same video to five subreddits in an hour looks like spam to moderators and to Reddit's filters).
- Stay in the comments for the first two hours. Answer questions, take criticism without arguing.

## Subreddit rules on self-promotion

Reddit blocked every automated way to read the rules pages: plain requests, the JSON endpoints and a headless browser all got "blocked by network security". So the rules below come from **secondary sources** (third-party guides, a dated copy of the r/unixporn rules in a GitHub PR) and general knowledge, and **were not read on the subreddits themselves**. Before each post, open the subreddit's rules (sidebar → Rules) and the pinned posts and check the points marked **check**.

| Subreddit     | Fit                                    | What is known                                                                                                                                                                                                                                                                                                                                                                                                     | Verdict                                                                                                                                  |
| ------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| r/gnome       | Best fit: the exact audience           | Posts about extensions are common there. **Check**: an "Extensions" (or similar) flair, whether a video upload is fine, any rule about AI-related content.                                                                                                                                                                                                                                                        | Post first. 16:9 video.                                                                                                                  |
| r/linux       | Large, critical, wary of promotion     | Reddit no longer sets a sitewide ratio; the old "about 10 % of your activity may be your own stuff" guideline is still what many moderators apply. **Check**: whether image and video posts are allowed at all (several large subreddits allow only links and text), the flair for software releases, and a rule on self-promotion.                                                                               | Second, a few days after r/gnome. If media posts are not allowed: text post with the GitHub link and a link to the video on the website. |
| r/unixporn    | Visual audience, likes polished shells | A copy of the rules dated 2026-10-25 (in a GitHub PR, unverified) lists: a WM/DE tag in the title (here `[GNOME]`), significant customization, **two windows from two apps visible**, a details comment, no NSFW. Our video shows the panel on an empty desktop, so as a screenshot post it may break the "two windows" rule. **Check** whether there is a flair for tools/resources ("Material") that is exempt. | Only with the right flair, or after recording a variant with two app windows open. Leave a details comment at once (draft below).        |
| r/SideProject | Built for exactly this                 | Several sources agree self-promotion is welcome as long as the post shows real progress (demo, screenshots), not a pitch; repeated posts of the same project in a short time are not.                                                                                                                                                                                                                             | Fine. 16:9 video, short text.                                                                                                            |
| r/opensource  | Probably not yet                       | A recent report says the moderators now exclude projects that use or are made with AI, and want projects maintained for at least a year with three or more contributors and a community; older guides only ask for the "Promotional" flair and an OSI license. **Check** the current rules.                                                                                                                       | Skip for now; Visor is new and has one maintainer.                                                                                       |
| r/archlinux   | No                                     | Generally only about Arch itself; projects are not promoted there.                                                                                                                                                                                                                                                                                                                                                | Skip. Mention the AUR package in r/gnome comments instead.                                                                               |

Sources (secondary): [rules list quoted in lumen-wm PR #14](https://github.com/madkoding/lumen-wm/pull/14), [r/opensource rule change (runtimewire)](https://runtimewire.com/article/r-opensource-bars-ai-projects-and-requires-a-year-of-maintenance-for-promotion), [r/opensource (Thread Otter)](https://www.threadotter.com/subreddit-rules/opensource), [r/SideProject (oneup.today)](https://oneup.today/tools/reddit-self-promotion-checker/sideproject), [Reddit self-promotion overview (tryhubbub)](https://www.tryhubbub.com/guides/reddit-self-promotion-rules).

## Reddit

### r/gnome

**Video:** `visor-reddit-16x9.mp4` (native upload)

**Title:**

> I built a Dynamic Island for GNOME Shell: media, timers, calendar, search and agent approvals in the top bar

**Text** (first comment, or the body if it is a text post with the video):

> Hi r/gnome, I've been working on Visor, a GNOME Shell extension that replaces the date menu in the middle of the top bar with a notch.
>
> It rests as the clock. When something happens (a timer ends, a song starts, an AI coding agent waits for you) it grows a little or shows a row of chips. Click it and it opens into a panel with what's going on right now on the left and your next calendar events and notifications on the right.
>
> There's one search field in it that calculates, converts currencies and units, answers time zone and date questions, launches apps and starts timers (`timer 25m Pizza`).
>
> Some things I cared about:
>
> - It follows the top bar, your accent colour and light/dark, and respects reduced animations.
> - No account, no telemetry. The only network requests are the ECB exchange rates (only when you type a conversion, can be turned off) and cover art a player points to.
> - Other extensions can add their own rows or sections through a small, frozen module API. The AI agent part in the video is one: Visor: T3 Code, a separate extension that shows T3 Code sessions and lets you answer their approvals.
> - Disabling it brings the normal date menu back.
>
> It needs GNOME Shell 50 or 51. It's GPL, on GitHub: https://github.com/taulit/visor (install: [extensions.gnome.org link / "build from source" until the review is done])
>
> I'd really like to hear what feels off: what's missing, what's in the way, what you'd want as a module. Bugs and rough edges welcome too.

### r/linux

**Video:** `visor-reddit-16x9.mp4`, if media posts are allowed; otherwise a link post to the GitHub repo or the website with the text below as a comment.

**Title:**

> I made Visor, an open source notch for GNOME Shell that shows media, timers, calendar and AI agent approvals

**Text:**

> Visor is a GNOME Shell 50/51 extension I've been building. The clock in the middle of the top bar becomes a notch: it peeks out when something happens and opens into a panel with players (MPRIS), timers, downloads, calendar events and notifications, plus one search field for calculations, conversions, time zones, apps and system actions.
>
> One part that's a bit unusual: with the companion module Visor: T3 Code (a separate extension, built on the same module API anyone can use), the notch lights up when a T3 Code agent wants to run a command, and you can read the command and allow or deny it without switching windows.
>
> Technical bits, since this is r/linux: TypeScript compiled to GJS, no runtime dependencies, the calculator is a small parser (no `eval`), no telemetry, every network request is listed in the README with a switch to turn it off. Tests run in a sandboxed headless GNOME Shell so they never touch your session. Modules from other extensions plug in through a versioned API.
>
> GPL-2.0-or-later: https://github.com/taulit/visor
>
> Feedback, criticism and "this already exists as X" are all welcome.

### r/unixporn

Only after checking the rules above (flair, two-windows rule).

**Video:** `visor-reddit-1x1.mp4` (or a new recording with two app windows open)

**Title:**

> [GNOME] Visor: a Dynamic Island for the top bar

**Details comment** (post it right away):

> - **DE:** GNOME Shell 50
> - **Extension:** Visor, https://github.com/taulit/visor (my own project, open source)
> - **Wallpaper:** GNOME default "Blobs" (dark)
> - **Font:** the default of GNOME (Adwaita Sans)
> - **Accent:** blue, dark style
>
> The notch rests as the clock, peeks out with chips when something happens and opens into a panel with media, timers, downloads, calendar, notifications and a search field. Happy to answer questions about how it's built.

### r/SideProject

**Video:** `visor-reddit-16x9.mp4`

**Title:**

> I built a Dynamic Island for the Linux desktop (GNOME), open source

**Text:**

> Visor is a GNOME Shell extension: the clock in the top bar turns into a notch that shows what's playing, running timers, downloads, your next meetings and notifications, and has a search field for quick maths, conversions and apps. With a companion module it also shows when an AI coding agent (T3 Code) needs an approval, and you can allow it right there.
>
> Built in TypeScript, no telemetry, other extensions can add modules. Free and open source: https://github.com/taulit/visor
>
> What would make you install something like this, and what would make you uninstall it again?

## Instagram, @bytaulit

**Video:** `visor-reel-9x16.mp4` (27 s). Cover: the frame with the open panel and "Media, timers, agents…" (about second 4).

**Caption:**

> Your top bar, but it pays attention. 👀
>
> Visor turns the clock of GNOME into a notch: it peeks out when something happens and opens into what's playing, your timers, your next meeting, and (with a module) the AI agent that's waiting for your OK.
>
> One search field does the rest: maths, currencies, time zones, apps, timers.
>
> Free and open source for GNOME Shell 50 and 51. Link in bio.

**Hashtags** (first comment or end of caption, 10 to 15 work better than 30):

> #linux #gnome #opensource #linuxdesktop #desktopsetup #dynamicisland #productivity #developer #devtools #foss #ricing #unixporn #typescript #indiedev

**Alt text:**

> Screen recording of a GNOME desktop. The clock in the top bar grows into a black panel showing a playing song, timers and calendar events. Someone types calculations and conversions into a search field and answers are shown at once. A coding agent asks for approval and the request is allowed from the panel.

**Bio link:** https://taulit.github.io/visor/ (once Pages is live), otherwise https://github.com/taulit/visor.

**Story** (optional, same day): the first 6 seconds of the reel with a link sticker to the website.
