mal-multi-select-export — MAL Multi-Select Export

Short description
-----------------
Browser content script to multi-select anime entries on MyAnimeList and export selected titles to clipboard or JSON. Useful for quickly building qBittorrent RSS rules or copying lists of titles.

Suggested GitHub "Create repository" settings
--------------------------------------------
- Repository name: mal-multi-select-export
- Short description (one line): MAL Multi-Select Export — select multiple MAL entries and copy/export as JSON
- Visibility: Public (recommended for browser extensions unless you want to keep it private)
- Default branch: main
- License: MIT License
- Topics (tags): mal, myanimelist, browser-extension, chrome-extension, chromium, firefox, content-script, rss, qBittorrent
- Initialize this repository with a README? No (we already have README.md in the folder). Add a LICENSE file (we add MIT below).

Repository Features to enable on GitHub (recommended)
-----------------------------------------------------
- Issues: Enabled (for bug reports and feature requests)
- Discussions: Optional (if you want to create a community)
- Pull requests: Enabled (default)
- Wikis: Optional
- GitHub Pages: Not necessary for the extension itself (unless you want a demo site)

Branch protection recommendations for `main`
-------------------------------------------
- Require pull request reviews before merging (1 review)
- Require status checks to pass (CI) before merging
- Include administrators in protection rules (if you want strict controls)

Suggested community files (added in this repo)
----------------------------------------------
- .github/ISSUE_TEMPLATE/bug_report.md
- .github/ISSUE_TEMPLATE/feature_request.md
- .github/PULL_REQUEST_TEMPLATE.md
- .github/workflows/ci.yml (basic lint/test workflow)
- LICENSE (MIT)

Publishing notes
----------------
- Chrome/Edge: pack the extension or use 'Load unpacked' in developer mode to test locally.
- Firefox: convert as a WebExtension and test via about:debugging (temporary add-on) or package and submit to AMO.

What I added to the repo (local)
-------------------------------
- REPO_INFO.md (this file): quick repo description and settings guidance
- .github/ISSUE_TEMPLATE/...
- .github/PULL_REQUEST_TEMPLATE.md
- .github/workflows/ci.yml
- LICENSE (MIT)

Next steps (once you have a remote)
-----------------------------------
1. Create a new GitHub repository named `mal-multi-select-export` (public, MIT, default branch `main`).
2. Add remote and push local repository:

   cd mal-multi-select-export
   git remote add origin https://github.com/<you>/mal-multi-select-export.git
   git branch -M main
   git push -u origin main

3. In repository settings on GitHub enable branch protection rules as recommended and set Topics in the repo's settings page.

If you want, I can add a Release (tag) and prepare a small publish checklist for Chrome Web Store / Edge Store submission.
