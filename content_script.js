// MAL Multi-Select Export - content_script.js
// Injects a simple UI that allows selecting anime cards on MAL and copying
// selected items to the clipboard as JSON/CSV/plain text.

(function () {
  'use strict';

  // ==================== Constants ====================
  const CONFIG = {
    TOOLBAR_ID: 'mal-export-toolbar-v1',
    CHECKBOX_CLASS: 'mal-export-checkbox-v1',
    SELECTED_CLASS: 'mal-export-selected-v1',
    CARD_OVERLAY_CLASS: 'mal-export-card-overlay',
    STORAGE_PREFIX: 'malExport_',
    DEBOUNCE_DELAY: 200,
    TOAST_CLASS: 'mal-export-toast',
    TOAST_DURATION: 3000
  };

  // ==================== State Management ====================
  let cachedAnimeNodes = null;
  let undoHistory = [];
  let redoHistory = [];
  const MAX_HISTORY = 50;
  let contextMenuAnchorIndex = -1; // For right-click context menu
  let currentTheme = 'auto'; // auto, light, or dark

  // ==================== Theme Management ====================
  /**
   * Gets the effective theme based on user preference and system settings
   * @returns {string} 'light' or 'dark'
   */
  function getEffectiveTheme() {
    const themeSetting = loadSettingFromStorage('theme') || 'auto';
    
    if (themeSetting === 'auto') {
      // Detect system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    
    return themeSetting;
  }
  
  /**
   * Applies theme colors to dialogs and menus
   */
  function getThemeColors() {
    const isDark = getEffectiveTheme() === 'dark';
    
    return {
      // Dialog colors
      dialogBg: isDark ? '#1a1a1a' : '#ffffff',
      dialogBorder: isDark ? '#333' : '#e0e0e0',
      dialogText: isDark ? '#ffffff' : '#1a1a1a',
      dialogTextSecondary: isDark ? '#e0e0e0' : '#666',
      
      // Table colors
      tableHeaderBg: isDark ? '#2a2a2a' : '#f5f5f5',
      tableRowAlt: isDark ? '#222' : '#f9f9f9',
      tableBorder: isDark ? '#444' : '#ccc',
      tableCellText: isDark ? '#e0e0e0' : '#1a1a1a',
      
      // Code colors
      codeBg: isDark ? '#333' : '#f0f0f0',
      codeText: isDark ? '#4fc3f7' : '#1a73e8',
      
      // Accent colors
      accentText: isDark ? '#4fc3f7' : '#1a73e8',
      accentCheckbox: isDark ? '#4fc3f7' : '#1a73e8',
      
      // Menu colors
      menuBg: isDark ? '#1a1a1a' : '#ffffff',
      menuBorder: isDark ? '#444' : '#ccc',
      menuItemText: isDark ? '#e0e0e0' : '#1a1a1a',
      menuItemHover: isDark ? '#2a2a2a' : '#f0f0f0',
      separatorColor: isDark ? '#444' : '#ddd'
    };
  }

  // ==================== Storage Helpers ====================
  /**
   * Saves a setting to both localStorage and Chrome storage.
   * @param {string} key - The setting key to save
   * @param {any} value - The value to store
   */
  function saveSettingToStorage(key, value) {
    const storageKey = CONFIG.STORAGE_PREFIX + key;
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
      if (window.chrome?.storage?.local) {
        chrome.storage.local.set({ [key]: value }, () => {});
      }
    } catch (error) {
      console.warn('Failed to save setting:', key, error);
    }
  }

  /**
   * Loads a setting from localStorage.
   * @param {string} key - The setting key to load
   * @returns {any|null} The stored value, or null if not found
   */
  function loadSettingFromStorage(key) {
    const storageKey = CONFIG.STORAGE_PREFIX + key;
    try {
      const value = localStorage.getItem(storageKey);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.warn('Failed to load setting:', key, error);
      return null;
    }
  }

  /**
   * Loads settings from Chrome storage and syncs them to localStorage.
   * Updates corresponding UI checkboxes if they exist.
   */
  function loadSettingsFromChromeStorage() {
    if (!window.chrome?.storage?.local) return;
    
    chrome.storage.local.get(['disableLinks'], (result) => {
      try {
        if (result.disableLinks !== undefined) {
          localStorage.setItem(CONFIG.STORAGE_PREFIX + 'disableLinks', JSON.stringify(result.disableLinks));
          const checkbox = document.getElementById(CONFIG.TOOLBAR_ID + '-disableLinks');
          if (checkbox) checkbox.checked = !!result.disableLinks;
        }
      } catch (error) {
        console.warn('Failed to load settings from Chrome storage:', error);
      }
    });
  }

  // ==================== DOM Helpers ====================
  /**
   * Shows a toast notification with a message.
   * @param {string} message - The message to display
   * @param {string} type - The type of toast ('success', 'error', 'info')
   */
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = CONFIG.TOAST_CLASS;
    toast.textContent = message;
    
    const colors = {
      success: '#1a73e8',
      error: '#ea4335',
      info: '#34a853'
    };
    
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: ${colors[type] || colors.success};
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      font-weight: 500;
      animation: slideInUp 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOutDown 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
  }

  /**
   * Creates a button element with text and click handler.
   * @param {string} text - The button text
   * @param {Function} onClick - Click event handler
   * @returns {HTMLButtonElement} The created button
   */
  function createButton(text, onClick) {
    const button = document.createElement('button');
    button.textContent = text;
    button.addEventListener('click', onClick);
    return button;
  }

  /**
   * Creates a dropdown button for download options
   * @returns {HTMLElement} The dropdown container
   */
  function createDownloadDropdown() {
    const container = document.createElement('div');
    container.className = 'mal-export-dropdown';
    container.style.cssText = 'position: relative; display: inline-block;';
    
    const mainButton = document.createElement('button');
    mainButton.textContent = 'Download ▼';
    mainButton.className = 'mal-export-dropdown-button';
    
    const menu = document.createElement('div');
    menu.className = 'mal-export-dropdown-menu';
    menu.style.cssText = `
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      background: #2e51a2;
      border: 1px solid #1557b0;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      z-index: 1000;
      min-width: 150px;
      margin-top: 4px;
    `;
    
    const jsonOption = document.createElement('div');
    jsonOption.textContent = 'JSON';
    jsonOption.style.cssText = 'padding: 10px 16px; cursor: pointer; font-size: 14px; color: white; font-weight: 600;';
    jsonOption.addEventListener('mouseenter', () => jsonOption.style.background = '#1a73e8');
    jsonOption.addEventListener('mouseleave', () => jsonOption.style.background = 'transparent');
    jsonOption.addEventListener('click', () => {
      handleDownloadJSON();
      menu.style.display = 'none';
    });
    
    const csvOption = document.createElement('div');
    csvOption.textContent = 'CSV';
    csvOption.style.cssText = 'padding: 10px 16px; cursor: pointer; font-size: 14px; color: white; font-weight: 600;';
    csvOption.addEventListener('mouseenter', () => csvOption.style.background = '#1a73e8');
    csvOption.addEventListener('mouseleave', () => csvOption.style.background = 'transparent');
    csvOption.addEventListener('click', () => {
      handleDownloadCSV();
      menu.style.display = 'none';
    });
    
    menu.appendChild(jsonOption);
    menu.appendChild(csvOption);
    
    mainButton.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
      menu.style.display = 'none';
    });
    
    container.appendChild(mainButton);
    container.appendChild(menu);
    
    return container;
  }

  /**
   * Creates a checkbox with associated label.
   * @param {string} id - The checkbox element ID
   * @param {string} labelText - The label text
   * @param {boolean} isChecked - Initial checked state
   * @param {Function} onChange - Change event handler
   * @returns {HTMLLabelElement} The label element containing the checkbox
   */
  function createCheckboxWithLabel(id, labelText, isChecked, onChange) {
    const label = document.createElement('label');
    label.style.display = 'inline-flex';
    label.style.alignItems = 'center';
    label.style.gap = '6px';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = id;
    checkbox.checked = isChecked;
    checkbox.addEventListener('change', onChange);
    
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(labelText));
    
    return label;
  }

  // ==================== UI Creation ====================
  /**
   * Shows a help dialog with keyboard shortcuts and instructions
   */
  function showHelpDialog() {
    const existingDialog = document.querySelector('.mal-export-help-dialog');
    if (existingDialog) {
      existingDialog.remove();
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'mal-export-help-dialog';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const colors = getThemeColors();
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: ${colors.dialogBg};
      border-radius: 8px;
      padding: 24px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      border: 1px solid ${colors.dialogBorder};
    `;
    
    dialog.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 24px; color: ${colors.dialogText}; font-weight: 700;">MAL Multi-Select Export - Help</h2>
      
      <h3 style="margin: 16px 0 8px 0; font-size: 18px; color: ${colors.dialogText}; font-weight: 600;">Keyboard Shortcuts</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr style="background: ${colors.tableHeaderBg};">
          <th style="text-align: left; padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.dialogText}; font-weight: 600;">Shortcut</th>
          <th style="text-align: left; padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.dialogText}; font-weight: 600;">Action</th>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};"><code style="background: ${colors.codeBg}; padding: 2px 6px; border-radius: 3px; color: ${colors.codeText}; font-weight: 600;">Ctrl+A</code></td>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};">Select all anime</td>
        </tr>
        <tr style="background: ${colors.tableRowAlt};">
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};"><code style="background: ${colors.codeBg}; padding: 2px 6px; border-radius: 3px; color: ${colors.codeText}; font-weight: 600;">Escape</code></td>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};">Clear all selections</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};"><code style="background: ${colors.codeBg}; padding: 2px 6px; border-radius: 3px; color: ${colors.codeText}; font-weight: 600;">Ctrl+C</code></td>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};">Copy selected to clipboard</td>
        </tr>
        <tr style="background: ${colors.tableRowAlt};">
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};"><code style="background: ${colors.codeBg}; padding: 2px 6px; border-radius: 3px; color: ${colors.codeText}; font-weight: 600;">Ctrl+Z</code></td>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};">Undo last change</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};"><code style="background: ${colors.codeBg}; padding: 2px 6px; border-radius: 3px; color: ${colors.codeText}; font-weight: 600;">Ctrl+Shift+Z</code></td>
          <td style="padding: 8px; border: 1px solid ${colors.tableBorder}; color: ${colors.tableCellText};">Redo last undone change</td>
        </tr>
      </table>
      
      <h3 style="margin: 16px 0 8px 0; font-size: 18px; color: ${colors.dialogText}; font-weight: 600;">Batch Selection</h3>
      <ol style="margin: 0; padding-left: 20px; line-height: 1.8; color: ${colors.tableCellText};">
        <li style="margin-bottom: 8px;">Right-click any checkbox and select <strong style="color: ${colors.accentText};">"Set as start point"</strong></li>
        <li>Right-click another checkbox to see range options:</li>
        <ul style="margin: 8px 0; padding-left: 20px;">
          <li style="margin-bottom: 4px;"><strong style="color: ${colors.accentText};">Select range</strong> - Check all items in range</li>
          <li style="margin-bottom: 4px;"><strong style="color: ${colors.accentText};">Deselect range</strong> - Uncheck all items in range</li>
          <li><strong style="color: ${colors.accentText};">Clear start point</strong> - Reset the anchor</li>
        </ul>
      </ol>
      
      <h3 style="margin: 16px 0 8px 0; font-size: 18px; color: ${colors.dialogText}; font-weight: 600;">Context Menu Options</h3>
      <p style="margin: 8px 0; line-height: 1.8; color: ${colors.tableCellText};">Right-click anywhere on the page for quick access to:</p>
      <ul style="margin: 0; padding-left: 20px; line-height: 1.8; color: ${colors.tableCellText};">
        <li style="margin-bottom: 4px;">Select All / Deselect All</li>
        <li style="margin-bottom: 4px;">Invert Selection</li>
        <li>Copy / Download JSON / Download CSV</li>
      </ul>
      
      <button style="
        margin-top: 20px;
        padding: 10px 20px;
        background: #2e51a2;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        width: 100%;
      " onclick="this.closest('.mal-export-help-dialog').remove();">Close</button>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }
  
  /**
   * Shows a settings dialog
   */
  function showSettingsDialog() {
    const existingDialog = document.querySelector('.mal-export-settings-dialog');
    if (existingDialog) {
      existingDialog.remove();
      return;
    }
    
    const overlay = document.createElement('div');
    overlay.className = 'mal-export-settings-dialog';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    
    const colors = getThemeColors();
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: ${colors.dialogBg};
      border-radius: 8px;
      padding: 24px;
      max-width: 500px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      border: 1px solid ${colors.dialogBorder};
    `;
    
    const disableContextMenuSetting = loadSettingFromStorage('disableContextMenu') === true;
    const themeSetting = loadSettingFromStorage('theme') || 'auto';
    
    dialog.innerHTML = `
      <h2 style="margin: 0 0 16px 0; font-size: 24px; color: ${colors.dialogText}; font-weight: 700;">Settings</h2>
      
      <div style="margin-bottom: 20px;">
        <h3 style="margin: 0 0 8px 0; font-size: 16px; color: ${colors.dialogText}; font-weight: 600;">Theme</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="radio" name="theme" value="auto" ${themeSetting === 'auto' ? 'checked' : ''} style="margin-right: 8px; cursor: pointer; accent-color: ${colors.accentCheckbox};">
            <span style="font-size: 14px; color: ${colors.dialogText};">Auto (follow system)</span>
          </label>
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="radio" name="theme" value="light" ${themeSetting === 'light' ? 'checked' : ''} style="margin-right: 8px; cursor: pointer; accent-color: ${colors.accentCheckbox};">
            <span style="font-size: 14px; color: ${colors.dialogText};">Light</span>
          </label>
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="radio" name="theme" value="dark" ${themeSetting === 'dark' ? 'checked' : ''} style="margin-right: 8px; cursor: pointer; accent-color: ${colors.accentCheckbox};">
            <span style="font-size: 14px; color: ${colors.dialogText};">Dark</span>
          </label>
        </div>
      </div>
      
      <div style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; cursor: pointer;">
          <input type="checkbox" id="setting-disable-context-menu" ${disableContextMenuSetting ? 'checked' : ''} style="margin-right: 8px; width: 18px; height: 18px; cursor: pointer; accent-color: ${colors.accentCheckbox};">
          <span style="font-size: 16px; color: ${colors.dialogText}; font-weight: 600;">Disable right-click context menu</span>
        </label>
        <p style="margin: 4px 0 0 26px; font-size: 14px; color: ${colors.dialogTextSecondary}; line-height: 1.6;">When enabled, the extension's context menu won't appear on right-click</p>
      </div>
      
      <div style="display: flex; gap: 12px; margin-top: 24px;">
        <button style="
          flex: 1;
          padding: 10px 20px;
          background: #2e51a2;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
        " id="settings-save">Save</button>
        <button style="
          flex: 1;
          padding: 10px 20px;
          background: #ccc;
          color: #1a1a1a;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 15px;
          font-weight: 600;
        " id="settings-cancel">Cancel</button>
      </div>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // Save button handler
    dialog.querySelector('#settings-save').addEventListener('click', () => {
      const disableContextMenu = dialog.querySelector('#setting-disable-context-menu').checked;
      const selectedTheme = dialog.querySelector('input[name="theme"]:checked').value;
      
      saveSettingToStorage('disableContextMenu', disableContextMenu);
      saveSettingToStorage('theme', selectedTheme);
      
      showToast('✓ Settings saved', 'success');
      overlay.remove();
      
      // Reapply theme if changed
      currentTheme = selectedTheme;
    });
    
    // Cancel button handler
    dialog.querySelector('#settings-cancel').addEventListener('click', () => {
      overlay.remove();
    });
    
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }
  
  /**
   * Creates the toolbar UI with buttons and checkboxes.
   * Only creates if it doesn't already exist on the page.
   */
  function createToolbar() {
    if (document.getElementById(CONFIG.TOOLBAR_ID)) return;

    const toolbar = document.createElement('div');
    toolbar.id = CONFIG.TOOLBAR_ID;
    toolbar.className = 'mal-export-toolbar';

    // Left side - main actions
    const leftSide = document.createElement('div');
    leftSide.style.cssText = 'display: flex; align-items: center; gap: 12px;';

    const countDisplay = document.createElement('span');
    countDisplay.id = CONFIG.TOOLBAR_ID + '-count';
    countDisplay.textContent = '0 selected';
    leftSide.appendChild(countDisplay);

    leftSide.appendChild(createButton('Copy to clipboard', handleCopyToClipboard));
    leftSide.appendChild(createDownloadDropdown());
    leftSide.appendChild(createButton('Clear', clearAllSelections));

    const disableLinksToggle = createCheckboxWithLabel(
      CONFIG.TOOLBAR_ID + '-disableLinks',
      'Disable links',
      loadSettingFromStorage('disableLinks') === true,
      (e) => saveSettingToStorage('disableLinks', e.target.checked)
    );
    leftSide.appendChild(disableLinksToggle);
    
    toolbar.appendChild(leftSide);

    // Right side - utility buttons
    const rightSide = document.createElement('div');
    rightSide.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-left: auto;';
    
    rightSide.appendChild(createButton('Help', showHelpDialog));
    rightSide.appendChild(createButton('Settings', showSettingsDialog));
    
    toolbar.appendChild(rightSide);

    document.body.prepend(toolbar);
    loadSettingsFromChromeStorage();
  }

  // ==================== Anime Node Detection ====================
  /**
   * Finds all anime card nodes on the page using multiple detection strategies.
   * Results are cached for performance.
   * @param {boolean} forceRefresh - Force refresh of cached nodes
   * @returns {HTMLElement[]} Array of unique top-level anime card elements
   */
  function findAnimeNodes(forceRefresh = false) {
    if (cachedAnimeNodes && !forceRefresh) {
      return cachedAnimeNodes;
    }
    
    const nodes = [];
    
    // Primary: use .link-title elements and find the actual card container
    document.querySelectorAll('.link-title').forEach(titleEl => {
      // Look for the actual seasonal anime card container
      const container = titleEl.closest('.seasonal-anime, article, .js-anime-card, [class*="anime-item"]');
      if (container) {
        nodes.push(container);
      } else {
        // Fallback: get parent that has substantial height (likely the card)
        let parent = titleEl.parentElement;
        while (parent && parent !== document.body) {
          if (parent.offsetHeight > 200) {  // Cards are typically > 200px tall
            nodes.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      }
    });
    
    // Fallback: try common card selectors
    if (nodes.length === 0) {
      const selectors = ['.seasonal-anime .seasonal-anime', '.anime-card', 'article'];
      for (const selector of selectors) {
        const found = Array.from(document.querySelectorAll(selector))
          .filter(node => node.querySelector('a[href*="/anime/"]'));
        if (found.length > 0) {
          nodes.push(...found);
          break;
        }
      }
    }
    
    // Last resort: find any element containing anime links
    if (nodes.length === 0) {
      nodes.push(...Array.from(document.querySelectorAll('*'))
        .filter(node => node.querySelector?.('a[href*="/anime/"]')));
    }

    // Deduplicate and keep only top-level nodes
    const topLevelNodes = nodes.filter(node => 
      node && !nodes.some(other => other !== node && other.contains?.(node))
    );
    
    cachedAnimeNodes = Array.from(new Set(topLevelNodes));
    return cachedAnimeNodes;
  }

  // ==================== Title Processing ====================
  /**
   * Cleans and sanitizes an anime title string.
   * Removes scores, IDs, dates, duplicate phrases, and normalizes whitespace.
   * @param {string} rawTitle - The raw title text to sanitize
   * @returns {string} The cleaned title
   */
  function sanitizeTitle(rawTitle) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    
    // Normalize whitespace
    let title = rawTitle
      .replace(/\r/g, ' ')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove numeric metadata (scores, IDs, dates)
    title = title.replace(/\b\d+\.\d+\b/g, '');  // Decimal scores (e.g., 8.14)
    title = title.replace(/\b\d{4,9}\b/g, '');    // IDs/dates (e.g., 357907, 20251012)
    title = title.replace(/\s+/g, ' ').trim();
    
    // Remove duplicate trailing title fragments
    const words = title.split(' ');
    for (let wordCount = 6; wordCount >= 3; wordCount--) {
      if (words.length >= wordCount * 2) {
        const startPhrase = words.slice(0, wordCount).join(' ');
        const endPhrase = words.slice(-wordCount).join(' ');
        if (startPhrase === endPhrase) {
          return words.slice(0, -wordCount).join(' ');
        }
      }
    }
    
    return title;
  }

  /**
   * Extracts the anime title from a card node.
   * @param {HTMLElement} node - The anime card element
   * @returns {string} The extracted and sanitized title
   */
  function extractTitleFromNode(node) {
    try {
      // First try to get the main title link (h2 a or .link-title a)
      let titleLink = node.querySelector('.link-title a, h2 a, h3:not(.h3_anime_subtitle) a');
      if (titleLink?.textContent?.trim()) {
        return sanitizeTitle(titleLink.textContent.trim());
      }
      
      // Fallback: try h2/h3 elements but exclude subtitle
      const titleElement = node.querySelector('h2:not(.h3_anime_subtitle), .title, .item-title, .link-title');
      if (titleElement?.textContent?.trim()) {
        return sanitizeTitle(titleElement.textContent.trim());
      }
      
      // Last resort: any anime link but exclude subtitle text
      const link = node.querySelector('a[href*="/anime/"]');
      if (link?.textContent?.trim()) {
        return sanitizeTitle(link.textContent.trim());
      }
      
      return '';
    } catch (error) {
      console.warn('Failed to extract title:', error);
      return '';
    }
  }

  // ==================== UI Updates ====================
  /**
   * Updates the selected count display in the toolbar.
   */
  function updateSelectedCount() {
    const countElement = document.getElementById(CONFIG.TOOLBAR_ID + '-count');
    const selectedCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked')?.length || 0;
    const totalCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS)?.length || 0;
    
    if (countElement) {
      if (totalCount > 0) {
        countElement.textContent = `${selectedCount} of ${totalCount} selected`;
      } else {
        countElement.textContent = '0 selected';
      }
    }
  }

  // ==================== Event Handlers ====================
  /**
   * Handles copying selected titles to clipboard as JSON.
   */
  function handleCopyToClipboard() {
    const selectedItems = gatherSelectedTitles();
    if (selectedItems.length === 0) {
      showToast('No items selected. Click anime cards to select them.', 'info');
      return;
    }
    
    const titles = selectedItems.map(item => item.title).filter(Boolean);
    if (titles.length === 0) {
      showToast('Selected items have no valid titles.', 'error');
      return;
    }
    
    const jsonString = JSON.stringify(titles, null, 2);
    
    navigator.clipboard.writeText(jsonString)
      .then(() => showToast(`✓ Copied ${titles.length} title${titles.length > 1 ? 's' : ''} to clipboard`, 'success'))
      .catch(error => {
        console.error('Copy failed:', error);
        showToast('Clipboard access denied. Check browser permissions.', 'error');
      });
  }

  /**
   * Handles downloading selected titles as a JSON file.
   */
  function handleDownloadJSON() {
    const selectedItems = gatherSelectedTitles();
    if (selectedItems.length === 0) {
      showToast('No items selected. Click anime cards to select them.', 'info');
      return;
    }
    
    const titles = selectedItems.map(item => item.title).filter(Boolean);
    if (titles.length === 0) {
      showToast('Selected items have no valid titles.', 'error');
      return;
    }
    
    try {
      const blob = new Blob([JSON.stringify(titles, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mal-selected-titles.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      
      showToast(`✓ Downloaded ${titles.length} title${titles.length > 1 ? 's' : ''} as JSON`, 'success');
    } catch (error) {
      console.error('Download failed:', error);
      showToast('Download failed. Please try again.', 'error');
    }
  }

  /**
   * Handles downloading selected titles as a CSV file.
   */
  function handleDownloadCSV() {
    const selectedItems = gatherSelectedTitles();
    if (selectedItems.length === 0) {
      showToast('No items selected. Click anime cards to select them.', 'info');
      return;
    }
    
    const titles = selectedItems.map(item => item.title).filter(Boolean);
    if (titles.length === 0) {
      showToast('Selected items have no valid titles.', 'error');
      return;
    }
    
    try {
      // CSV format with proper escaping
      const csvContent = 'Title\n' + titles.map(title => `"${title.replace(/"/g, '""')}"`).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mal-selected-titles.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      
      showToast(`✓ Downloaded ${titles.length} title${titles.length > 1 ? 's' : ''} as CSV`, 'success');
    } catch (error) {
      console.error('CSV download failed:', error);
      showToast('CSV download failed. Please try again.', 'error');
    }
  }

  /**
   * Saves current selections to storage.
   */
  function saveSelections() {
    const selectedTitles = gatherSelectedTitles().map(item => item.title);
    saveSettingToStorage('savedSelections', selectedTitles);
  }

  /**
   * Loads and restores saved selections from storage.
   */
  function loadSelections() {
    const savedTitles = loadSettingFromStorage('savedSelections');
    if (!savedTitles || !Array.isArray(savedTitles) || savedTitles.length === 0) return;
    
    // Match saved titles to current checkboxes
    document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS).forEach(checkbox => {
      const node = checkbox.__malNodeRef;
      if (!node) return;
      
      const title = extractTitleFromNode(node);
      if (savedTitles.includes(title)) {
        checkbox.checked = true;
        node.classList.add(CONFIG.SELECTED_CLASS);
      }
    });
    
    updateSelectedCount();
    const restoredCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked').length;
    if (restoredCount > 0) {
      showToast(`✓ Restored ${restoredCount} saved selection${restoredCount > 1 ? 's' : ''}`, 'info');
    }
  }

  /**
   * Clears all selections and resets state.
   */
  function clearAllSelections() {
    document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS).forEach(checkbox => {
      checkbox.checked = false;
    });
    document.querySelectorAll('.' + CONFIG.SELECTED_CLASS).forEach(element => {
      element.classList.remove(CONFIG.SELECTED_CLASS);
    });
    contextMenuAnchorIndex = -1;
    saveSelections(); // Save empty state
    updateSelectedCount();
  }

  /**
   * Debug function to rescan and highlight all found anime nodes.
   */
  // (debug helper removed)

  // ==================== Selection Management ====================
  /**
   * Updates the __malIndex property on all checkboxes for range selection.
   */
  function refreshCheckboxIndices() {
    const checkboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    checkboxes.forEach((checkbox, index) => {
      try {
        checkbox.__malIndex = index;
      } catch (error) {
        console.warn('Failed to set checkbox index:', error);
      }
    });
  }

  /**
   * Gathers all selected anime titles from checked checkboxes.
   * @returns {Array<{title: string}>} Array of objects containing selected titles
   */
  function gatherSelectedTitles() {
    const selectedTitles = [];
    document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked').forEach(checkbox => {
      const node = checkbox.__malNodeRef;
      if (!node) return;
      
      const title = extractTitleFromNode(node);
      if (title) {
        selectedTitles.push({ title });
      }
    });
    return selectedTitles;
  }

  /**
   * Temporarily highlights nodes with an outline for visual feedback.
   * @param {HTMLElement[]} nodes - Array of nodes to highlight
   */
  // (temporary highlight helper removed)

  // ==================== Checkbox Attachment ====================
  /**
   * Attaches a checkbox to an anime card node.
   * @param {HTMLElement} node - The anime card element
   * @param {number} index - The checkbox index for range selection
   */
  function attachCheckboxToNode(node, index) {
    if (!node) return;
    
    // Check if already processed
    if (node.__malExportAttached) {
      return;
    }
    
    // Remove any existing checkbox containers first (defensive cleanup)
    const existingContainers = node.querySelectorAll('.mal-export-checkbox-container');
    existingContainers.forEach(container => container.remove());
    
    node.__malExportAttached = true;
    node.classList.add(CONFIG.CARD_OVERLAY_CLASS);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CONFIG.CHECKBOX_CLASS;
    checkbox.__malNodeRef = node;
    checkbox.__malIndex = index || 0;
    
    checkbox.addEventListener('change', () => {
      saveStateToHistory(); // Save state for undo
      if (checkbox.checked) {
        node.classList.add(CONFIG.SELECTED_CLASS);
      } else {
        node.classList.remove(CONFIG.SELECTED_CLASS);
      }
      updateSelectedCount();
      saveSelections(); // Persist selections
    }, { once: false });

    // Create checkbox container (completely isolated)
    const checkboxContainer = document.createElement('span');
    checkboxContainer.className = 'mal-export-checkbox-container';
    checkboxContainer.appendChild(checkbox);
    
    // Handle checkbox click
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
    }, false);
    
    // Handle right-click for context menu
    checkbox.addEventListener('contextmenu', (e) => {
      // Check if context menu is disabled in settings
      if (loadSettingFromStorage('disableContextMenu') === true) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
      const currentIndex = allCheckboxes.indexOf(checkbox);
      
      showContextMenu(e.clientX, e.clientY, currentIndex);
    }, false);
    
    // Find the actual link title and insert checkbox right inside it (before the text)
    const linkTitle = node.querySelector('.link-title, h2 a, h3 a, .h2_anime_title a');
    if (linkTitle) {
      // Insert as first child of the link
      linkTitle.insertBefore(checkboxContainer, linkTitle.firstChild);
    } else {
      // Fallback: try h2/h3 directly
      const titleHeader = node.querySelector('h2, h3, .h2_anime_title');
      if (titleHeader) {
        titleHeader.insertBefore(checkboxContainer, titleHeader.firstChild);
      } else {
        // Last resort: insert at start of card
        try {
          node.insertBefore(checkboxContainer, node.firstChild);
        } catch (error) {
          node.prepend(checkboxContainer);
        }
      }
    }
  }

  // ==================== Global Card Click Handler ====================
  /**
   * Global click handler for click-anywhere functionality.
   * Only intercepts clicks on anime cards, not the entire page.
   * @param {MouseEvent} event - The click event
   */
  document.addEventListener('click', function handleGlobalClick(event) {
    const toolbar = document.getElementById(CONFIG.TOOLBAR_ID);
    if (toolbar?.contains(event.target)) return;
    
    // Ignore clicks on form controls
    if (event.target.closest?.('input, button, textarea, select, label')) return;

    // Find the nearest card and its checkbox
    let card = event.target.closest?.('article, .seasonal-anime, .' + CONFIG.CARD_OVERLAY_CLASS);
    let checkbox = card?.querySelector('input.' + CONFIG.CHECKBOX_CLASS);
    
    // If not on a card with a checkbox, don't intercept
    if (!card || !checkbox) return;

    const isLink = event.target.closest('a[href]');
    const isCheckbox = event.target === checkbox || event.target.closest?.('input.' + CONFIG.CHECKBOX_CLASS);
    const disableLinksMode = loadSettingFromStorage('disableLinks') === true;
    
    // If clicking checkbox directly, let it handle naturally
    if (isCheckbox) {
      const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
      lastCheckedIndex = checkbox.__malIndex ?? allCheckboxes.indexOf(checkbox);
      return;
    }
    
    // Handle link clicks based on mode
    if (isLink && !disableLinksMode) {
      // Default mode: Allow link navigation
      return;
    }
    
    // Prevent default and stop propagation (in both modes for non-links, and in disable-links mode for everything)
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      console.warn('Failed to prevent default:', error);
    }

    // Toggle checkbox (this will trigger the change event automatically)
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change', { bubbles: false }));
    
    const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    lastCheckedIndex = checkbox.__malIndex ?? allCheckboxes.indexOf(checkbox);
  });

  /**
   * Selects a range of checkboxes between two indices.
   * @param {number} currentIndex - The current checkbox index
   * @param {number} lastIndex - The last checked checkbox index
   */
  /**
   * Shows a context menu for batch selection operations
   */
  function showContextMenu(x, y, currentIndex) {
    // Remove any existing context menu
    const existingMenu = document.querySelector('.mal-export-context-menu');
    if (existingMenu) existingMenu.remove();
    
    const colors = getThemeColors();
    const menu = document.createElement('div');
    menu.className = 'mal-export-context-menu';
    menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: ${colors.menuBg};
      border: 1px solid ${colors.menuBorder};
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.5);
      z-index: 10000;
      min-width: 200px;
      padding: 4px 0;
    `;
    
    const options = [];
    const checkboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    const selectedCount = checkboxes.filter(cb => cb.checked).length;
    
    // If we're on a checkbox, show range selection options
    if (currentIndex >= 0) {
      // Option: Set as anchor point
      if (contextMenuAnchorIndex === -1) {
        options.push({
          label: '📍 Set as start point',
          action: () => {
            contextMenuAnchorIndex = currentIndex;
            showToast('✓ Start point set', 'info');
          }
        });
      } else {
        // Option: Select range from anchor to here
        const rangeSize = Math.abs(currentIndex - contextMenuAnchorIndex) + 1;
        options.push({
          label: `✓ Select range (${rangeSize} items)`,
          action: () => {
            saveStateToHistory();
            selectRange(contextMenuAnchorIndex, currentIndex, true);
            showToast(`✓ Selected ${rangeSize} anime`, 'success');
            contextMenuAnchorIndex = -1;
          }
        });
        
        // Option: Deselect range from anchor to here
        options.push({
          label: `✗ Deselect range (${rangeSize} items)`,
          action: () => {
            saveStateToHistory();
            selectRange(contextMenuAnchorIndex, currentIndex, false);
            showToast(`✓ Deselected ${rangeSize} anime`, 'info');
            contextMenuAnchorIndex = -1;
          }
        });
        
        // Option: Clear anchor
        options.push({
          label: '✗ Clear start point',
          action: () => {
            contextMenuAnchorIndex = -1;
            showToast('Start point cleared', 'info');
          }
        });
        
        options.push({ separator: true });
      }
    }
    
    // Global selection options
    options.push({
      label: '☑️ Select All',
      action: () => {
        saveStateToHistory();
        checkboxes.forEach(checkbox => {
          checkbox.checked = true;
          if (checkbox.__malNodeRef) {
            checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
          }
        });
        updateSelectedCount();
        saveSelections();
        showToast(`✓ Selected all ${checkboxes.length} anime`, 'success');
      }
    });
    
    options.push({
      label: '☐ Deselect All',
      action: () => {
        saveStateToHistory();
        clearAllSelections();
        showToast('✓ Cleared all selections', 'info');
      }
    });
    
    options.push({
      label: '🔄 Invert Selection',
      action: () => {
        saveStateToHistory();
        checkboxes.forEach(checkbox => {
          checkbox.checked = !checkbox.checked;
          if (checkbox.__malNodeRef) {
            if (checkbox.checked) {
              checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
            } else {
              checkbox.__malNodeRef.classList.remove(CONFIG.SELECTED_CLASS);
            }
          }
        });
        updateSelectedCount();
        saveSelections();
        showToast('✓ Selection inverted', 'info');
      }
    });
    
    // Export options (only if something is selected)
    if (selectedCount > 0) {
      options.push({ separator: true });
      
      options.push({
        label: `📋 Copy (${selectedCount} items)`,
        action: () => {
          handleCopyToClipboard();
        }
      });
      
      options.push({
        label: `💾 Download JSON (${selectedCount} items)`,
        action: () => {
          handleDownloadJSON();
        }
      });
      
      options.push({
        label: `📊 Download CSV (${selectedCount} items)`,
        action: () => {
          handleDownloadCSV();
        }
      });
    }
    
    // Create menu items
    options.forEach(option => {
      if (option.separator) {
        const separator = document.createElement('div');
        separator.style.cssText = `
          height: 1px;
          background: ${colors.separatorColor};
          margin: 4px 0;
        `;
        menu.appendChild(separator);
        return;
      }
      
      const item = document.createElement('div');
      item.textContent = option.label;
      item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        color: ${colors.menuItemText};
        white-space: nowrap;
      `;
      item.addEventListener('mouseenter', () => {
        item.style.background = colors.menuItemHover;
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        option.action();
        menu.remove();
      });
      menu.appendChild(item);
    });
    
    document.body.appendChild(menu);
    
    // Adjust position if menu goes off screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }
    
    // Close menu on click outside
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('contextmenu', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
  }
  
  /**
   * Selects/deselects a range of checkboxes
   */
  function selectRange(startIndex, endIndex, checked) {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const checkboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    
    for (let i = start; i <= end; i++) {
      const checkbox = checkboxes[i];
      if (!checkbox) continue;
      
      if (checkbox.checked !== checked) {
        checkbox.checked = checked;
        checkbox.dispatchEvent(new Event('change', { bubbles: false }));
      }
      
      if (checkbox.__malNodeRef) {
        if (checked) {
          checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
        } else {
          checkbox.__malNodeRef.classList.remove(CONFIG.SELECTED_CLASS);
        }
      }
    }
    updateSelectedCount();
    saveSelections();
  }

  /**
   * Saves current selection state to undo history.
   */
  function saveStateToHistory() {
    const currentState = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS))
      .map(checkbox => checkbox.checked);
    
    undoHistory.push(currentState);
    if (undoHistory.length > MAX_HISTORY) {
      undoHistory.shift();
    }
    redoHistory = [];
  }

  /**
   * Restores selection state from history.
   */
  function restoreState(state) {
    if (!state) return;
    
    const checkboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    checkboxes.forEach((checkbox, index) => {
      if (state[index] !== undefined) {
        checkbox.checked = state[index];
        const node = checkbox.__malNodeRef;
        if (node) {
          if (checkbox.checked) {
            node.classList.add(CONFIG.SELECTED_CLASS);
          } else {
            node.classList.remove(CONFIG.SELECTED_CLASS);
          }
        }
      }
    });
    
    updateSelectedCount();
  }

  /**
   * Undo last selection change.
   */
  function handleUndo() {
    if (undoHistory.length === 0) {
      showToast('Nothing to undo', 'info');
      return;
    }
    
    const currentState = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS))
      .map(checkbox => checkbox.checked);
    redoHistory.push(currentState);
    if (redoHistory.length > MAX_HISTORY) {
      redoHistory.shift();
    }
    
    const previousState = undoHistory.pop();
    restoreState(previousState);
    showToast('↶ Undo', 'info');
  }

  /**
   * Redo last undone selection change.
   */
  function handleRedo() {
    if (redoHistory.length === 0) {
      showToast('Nothing to redo', 'info');
      return;
    }
    
    const currentState = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS))
      .map(checkbox => checkbox.checked);
    undoHistory.push(currentState);
    if (undoHistory.length > MAX_HISTORY) {
      undoHistory.shift();
    }
    
    const nextState = redoHistory.pop();
    restoreState(nextState);
    showToast('↷ Redo', 'info');
  }

  // ==================== Initialization ====================
  /**
   * Scans the page for anime nodes and attaches checkboxes to each.
   * Creates the toolbar if it doesn't exist.
   */
  function scanAndAttachCheckboxes() {
    createToolbar();
    const animeNodes = findAnimeNodes(true); // Force refresh cache
    animeNodes.forEach((node, index) => attachCheckboxToNode(node, index));
    refreshCheckboxIndices();
    loadSelections(); // Restore saved selections
  }

  // ==================== Keyboard Shortcuts ====================
  /**
   * Global keyboard shortcut handler.
   * Ctrl+A or Cmd+A: Select all checkboxes
   * Escape: Clear all selections
   * Ctrl+C or Cmd+C: Copy to clipboard (when items are selected)
   * Ctrl+Z or Cmd+Z: Undo last change
   * Ctrl+Shift+Z or Cmd+Shift+Z: Redo last undone change
   * @param {KeyboardEvent} event - The keyboard event
   */
  document.addEventListener('keydown', function handleKeyboardShortcuts(event) {
    // Ctrl+Z or Cmd+Z: Undo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      event.preventDefault();
      handleUndo();
      return;
    }
    
    // Ctrl+Shift+Z or Cmd+Shift+Z: Redo
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && event.shiftKey) {
      event.preventDefault();
      handleRedo();
      return;
    }
    
    // Ctrl+A or Cmd+A: Select all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      const checkboxes = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS);
      if (checkboxes.length > 0) {
        event.preventDefault();
        saveStateToHistory(); // Save state for undo
        checkboxes.forEach(checkbox => {
          checkbox.checked = true;
          if (checkbox.__malNodeRef) {
            checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
          }
        });
        updateSelectedCount();
        saveSelections();
        return;
      }
    }
    
    // Escape: Clear all selections
    if (event.key === 'Escape') {
      const selectedCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked').length;
      if (selectedCount > 0) {
        event.preventDefault();
        saveStateToHistory(); // Save state for undo
        clearAllSelections();
        return;
      }
    }
    
    // Ctrl+C or Cmd+C: Copy to clipboard (when items selected and not in input field)
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      const selectedCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked').length;
      const activeElement = document.activeElement;
      const isInInputField = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      );
      
      if (selectedCount > 0 && !isInInputField) {
        event.preventDefault();
        handleCopyToClipboard();
        return;
      }
    }
  });

  // ==================== Observer for Dynamic Content ====================
  /**
   * Observes specific content containers for dynamic updates instead of entire document.
   * Improves performance by reducing observer scope.
   */
  function setupContentObserver() {
    const contentObserver = new MutationObserver((mutations) => {
      // Filter mutations to only those affecting anime content
      const relevantMutation = mutations.some(mutation => {
        // Check if mutation involves anime-related nodes
        const hasAnimeContent = mutation.addedNodes.length > 0 && 
          Array.from(mutation.addedNodes).some(node => {
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            return node.querySelector?.('a[href*="/anime/"]') || 
                   node.closest?.('article, .seasonal-anime, .js-seasonal-anime-list');
          });
        return hasAnimeContent;
      });
      
      if (!relevantMutation) return;
      
      if (window.__malExportScanTimer) {
        clearTimeout(window.__malExportScanTimer);
      }
      window.__malExportScanTimer = setTimeout(() => {
        scanAndAttachCheckboxes();
      }, CONFIG.DEBOUNCE_DELAY);
    });

    // Observe specific content containers instead of entire document
    const contentSelectors = [
      '.js-seasonal-anime-list',
      '.seasonal-anime-list', 
      '#content',
      'main',
      '[class*="anime-list"]'
    ];
    
    let observerAttached = false;
    for (const selector of contentSelectors) {
      const container = document.querySelector(selector);
      if (container) {
        contentObserver.observe(container, {
          childList: true,
          subtree: true
        });
        observerAttached = true;
        console.log('mal-export: Observing container:', selector);
        break;
      }
    }
    
    // Fallback to body if no specific container found
    if (!observerAttached) {
      contentObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log('mal-export: Observing body (fallback)');
    }
  }

  setupContentObserver();

  // ==================== Global Context Menu ====================
  /**
   * Add context menu on right-click anywhere on the page
   */
  document.addEventListener('contextmenu', (e) => {
    // Check if context menu is disabled in settings
    if (loadSettingFromStorage('disableContextMenu') === true) return;
    
    // Only show if we're on a MAL anime season page (has checkboxes)
    const hasCheckboxes = document.querySelector('.' + CONFIG.CHECKBOX_CLASS);
    if (!hasCheckboxes) return;
    
    // Don't interfere with context menu on inputs, textareas, or links
    const target = e.target;
    if (target.tagName === 'INPUT' || 
        target.tagName === 'TEXTAREA' || 
        target.tagName === 'A' ||
        target.closest('a')) {
      return;
    }
    
    // Check if we're on a checkbox (already handled by checkbox event listener)
    const checkbox = target.closest('.' + 'mal-export-checkbox-container');
    if (checkbox) return; // Let checkbox handler deal with it
    
    // Show context menu with general options (no range selection)
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, -1);
  });

  // ==================== Initial Scan ====================
  scanAndAttachCheckboxes();

})();
