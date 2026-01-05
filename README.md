# mal-multi-select-export
MAL Multi-Select Export — select multiple MyAnimeList entries and export as JSON/CSV

## Description
Browser extension that injects checkboxes on MyAnimeList season pages so you can multi-select anime entries and export selected titles. Useful for quickly collecting titles to import into other tools (for example: qBittorrent RSS Rule Editor).

## Features
- **Click-anywhere selection**: Click anywhere on an anime card to toggle selection
- **Right-click context menu**: Quick access to all operations (select/deselect all, invert, copy, download)
- **Batch range selection**: Right-click checkbox → Set start point → Right-click another → Select/deselect range
- **Two selection modes**:
  - Default: Preserve link navigation (Ctrl+Click to select without navigating)
  - Disable Links mode: Clicking anywhere selects without navigation
- **Multiple export formats**: JSON and CSV
- **Selection stats**: See "5 of 24 selected" format for progress tracking
- **Undo/Redo**: Step back and forward through selection changes (up to 50 steps)
- **Help dialog**: Click Help button for keyboard shortcuts and instructions
- **Keyboard shortcuts**:
  - `Ctrl+A` / `Cmd+A`: Select all anime
  - `Escape`: Clear all selections
  - `Ctrl+C` / `Cmd+C`: Copy to clipboard
  - `Ctrl+Z` / `Cmd+Z`: Undo last change
  - `Ctrl+Shift+Z` / `Cmd+Shift+Z`: Redo last undone change
- **Selection persistence**: Your selections are automatically saved and restored
- **Toast notifications**: Clean, non-intrusive feedback messages
- **Dark mode support**: Automatically adapts to your system theme

## Installation (Developer/Unpacked)
1. Clone this repository or download as ZIP and extract
2. Open your browser's extensions page:
   - Chrome/Edge/Brave: `chrome://extensions/`
   - Firefox: `about:debugging#/runtime/this-firefox`
3. Enable **Developer mode** (Chrome/Edge) or click **Load Temporary Add-on** (Firefox)
4. Click **Load unpacked** and select the extension folder (containing `manifest.json`)

## Usage
1. Visit a MyAnimeList season page (e.g., https://myanimelist.net/anime/season)
2. A toolbar appears at the top with selection controls
3. Click any anime card to select it (checkbox appears left of title)
4. **Right-click** anywhere for quick access menu with all operations
5. **Batch selection**: Right-click checkbox → "Set as start point" → Right-click another → "Select range"
6. Use toolbar buttons to:
   - **Copy to clipboard**: Copy selected titles as JSON
   - **Download JSON**: Download titles as `mal-selected-titles.json`
   - **Download CSV**: Download titles as `mal-selected-titles.csv`
   - **Clear**: Deselect all
   - **Help**: View keyboard shortcuts and instructions
   - **Disable links**: Toggle link navigation (when enabled, clicking anywhere selects without navigating)

## Export Integration
The exported JSON/CSV can be imported into:
- [qBittorrent RSS Rule Editor](https://github.com/xAkai97/qBittorrent-RSS-Rule-Editer) via "Import > Open JSON File" or "Import > Paste from Clipboard"
- Spreadsheet applications (use CSV export)
- Any tool that accepts JSON arrays of strings

## Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Ctrl+A` / `Cmd+A` | Select all anime on page |
| `Escape` | Clear all selections |
| `Ctrl+C` / `Cmd+C` | Copy selected titles to clipboard |
| `Ctrl+Z` / `Cmd+Z` | Undo last change |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo last undone change |

## Related Projects
- [qBittorrent RSS Rule Editor](https://github.com/xAkai97/qBittorrent-RSS-Rule-Editer) — Desktop utility to turn anime title lists into qBittorrent RSS rules

## License
MIT License. See [LICENSE](LICENSE) file for details.
