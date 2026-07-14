# MAL Multi-Select Export - AI Developer Documentation

## Extension Overview
The **MAL Multi-Select Export** is a Chrome extension (Manifest V3) that injects a multi-selection UI over MyAnimeList (MAL) season pages (`https://myanimelist.net/anime/season`). It allows users to bulk select anime titles and export them as JSON or CSV, or copy them directly to the clipboard.

## Architecture

### Files
1. **`manifest.json`**: Manifest V3 configuration. Grants `storage` and `contextMenus` permissions. Specifies `background.js` as a service worker, and injects `content_script.js` + `style.css` on MAL season pages.
2. **`content_script.js`**: The main UI injection script. Runs on `document_idle`.
   - Uses `MutationObserver` to attach checkboxes dynamically if the page loads more items.
   - Attaches an overlay (`mal-export-card-overlay`) and a checkbox to each anime card node.
   - Injects a fixed toolbar (`mal-export-toolbar`) at the top.
   - Subscribes to `chrome.storage.local` to listen for the `extensionDisabled` flag. If the extension is toggled off, it removes all injected DOM elements and listeners gracefully.
3. **`background.js`**: Service worker handling global extension features.
   - Registers a context menu item on the extension icon (`contexts: ["action"]`) to toggle the extension on/off via `chrome.contextMenus`.
   - Stores the state in `chrome.storage.local` under the `extensionDisabled` key.
4. **`style.css`**: Provides styling for the injected toolbar, settings dialog, help dialog, context menus, checkboxes, and active selection states.

## State Management
- Checkbox selections are saved directly to `chrome.storage.local` (and fallback `localStorage`) using `savedSelections`.
- Global extension toggle state is saved in `chrome.storage.local` under `extensionDisabled`.
- Options like "Disable right-click context menu" and "Theme" are saved via helper functions (`saveSettingToStorage`).

## Key Selectors
The extension relies heavily on finding `.seasonal-anime` and `.link-title` nodes to inject checkboxes and extract anime titles. If MAL updates its page structure, the `findAnimeNodes` and `extractTitleFromNode` functions in `content_script.js` must be updated.

## Recent Changes
- Added a background service worker to support right-clicking the extension icon to disable the overlay injection.
- Added `isExtensionDisabled` check in `content_script.js` to immediately halt/remove overlays when disabled.
