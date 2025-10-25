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
    HIGHLIGHT_DURATION: 3000
  };

  // ==================== State Management ====================
  let lastCheckedIndex = -1;

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
    
    chrome.storage.local.get(['clickAnywhere', 'rangeSelection'], (result) => {
      try {
        if (result.clickAnywhere !== undefined) {
          localStorage.setItem(CONFIG.STORAGE_PREFIX + 'clickAnywhere', JSON.stringify(result.clickAnywhere));
          const checkbox = document.getElementById(CONFIG.TOOLBAR_ID + '-clickAnywhere');
          if (checkbox) checkbox.checked = !!result.clickAnywhere;
        }
        if (result.rangeSelection !== undefined) {
          localStorage.setItem(CONFIG.STORAGE_PREFIX + 'rangeSelection', JSON.stringify(result.rangeSelection));
          const checkbox = document.getElementById(CONFIG.TOOLBAR_ID + '-rangeSelection');
          if (checkbox) checkbox.checked = !!result.rangeSelection;
        }
      } catch (error) {
        console.warn('Failed to load settings from Chrome storage:', error);
      }
    });
  }

  // ==================== DOM Helpers ====================
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
   * Creates the toolbar UI with buttons and checkboxes.
   * Only creates if it doesn't already exist on the page.
   */
  function createToolbar() {
    if (document.getElementById(CONFIG.TOOLBAR_ID)) return;

    const toolbar = document.createElement('div');
    toolbar.id = CONFIG.TOOLBAR_ID;
    toolbar.className = 'mal-export-toolbar';

    const countDisplay = document.createElement('span');
    countDisplay.id = CONFIG.TOOLBAR_ID + '-count';
    countDisplay.textContent = '0 selected';
    toolbar.appendChild(countDisplay);

    toolbar.appendChild(createButton('Copy to clipboard', handleCopyToClipboard));
    toolbar.appendChild(createButton('Download JSON', handleDownloadJSON));
    toolbar.appendChild(createButton('Clear', clearAllSelections));

    const clickAnywhereToggle = createCheckboxWithLabel(
      CONFIG.TOOLBAR_ID + '-clickAnywhere',
      'Click anywhere',
      loadSettingFromStorage('clickAnywhere') === true,
      (e) => saveSettingToStorage('clickAnywhere', e.target.checked)
    );
    toolbar.appendChild(clickAnywhereToggle);

    const rangeSelectionToggle = createCheckboxWithLabel(
      CONFIG.TOOLBAR_ID + '-rangeSelection',
      'Enable range (Shift)',
      loadSettingFromStorage('rangeSelection') === true,
      (e) => saveSettingToStorage('rangeSelection', e.target.checked)
    );
    toolbar.appendChild(rangeSelectionToggle);

    toolbar.appendChild(createButton('Debug / Rescan', handleDebugRescan));

    document.body.prepend(toolbar);
    loadSettingsFromChromeStorage();
  }

  // ==================== Anime Node Detection ====================
  /**
   * Finds all anime card nodes on the page using multiple detection strategies.
   * @returns {HTMLElement[]} Array of unique top-level anime card elements
   */
  function findAnimeNodes() {
    const nodes = [];
    
    // Primary: use .link-title elements (MAL's visible title element)
    document.querySelectorAll('.link-title').forEach(titleEl => {
      const container = titleEl.closest('article, li, div') || titleEl.parentElement;
      if (container) nodes.push(container);
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
    
    return Array.from(new Set(topLevelNodes));
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
      const titleElement = node.querySelector('h3, h2, .title, .item-title, .link-title');
      let rawTitle = '';
      
      if (titleElement?.textContent?.trim()) {
        rawTitle = titleElement.textContent.trim();
      } else {
        const link = node.querySelector('a[href*="/anime/"]');
        if (link?.textContent) {
          rawTitle = link.textContent.trim();
        }
      }
      
      return sanitizeTitle(rawTitle);
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
    if (countElement) {
      countElement.textContent = `${selectedCount} selected`;
    }
  }

  // ==================== Event Handlers ====================
  /**
   * Handles copying selected titles to clipboard as JSON.
   */
  function handleCopyToClipboard() {
    const selectedItems = gatherSelectedTitles();
    if (selectedItems.length === 0) {
      alert('No items selected');
      return;
    }
    
    const titles = selectedItems.map(item => item.title).filter(Boolean);
    const jsonString = JSON.stringify(titles, null, 2);
    
    navigator.clipboard.writeText(jsonString)
      .then(() => alert(`Copied ${titles.length} titles to clipboard`))
      .catch(error => alert(`Copy failed: ${error}`));
  }

  /**
   * Handles downloading selected titles as a JSON file.
   */
  function handleDownloadJSON() {
    const selectedItems = gatherSelectedTitles();
    if (selectedItems.length === 0) {
      alert('No items selected');
      return;
    }
    
    const titles = selectedItems.map(item => item.title).filter(Boolean);
    const blob = new Blob([JSON.stringify(titles, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mal-selected-titles.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
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
    lastCheckedIndex = -1;
    updateSelectedCount();
  }

  /**
   * Debug function to rescan and highlight all found anime nodes.
   */
  function handleDebugRescan() {
    const nodes = findAnimeNodes();
    console.log('mal-export: findAnimeNodes ->', nodes.length, 'nodes');
    highlightNodesTemporarily(nodes);
  }

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
  function highlightNodesTemporarily(nodes) {
    nodes.forEach(node => {
      try {
        node.style.outline = '3px solid rgba(255,165,0,0.9)';
      } catch (error) {
        console.warn('Failed to highlight node:', error);
      }
    });
    
    setTimeout(() => {
      nodes.forEach(node => {
        try {
          node.style.outline = '';
        } catch (error) {
          console.warn('Failed to remove highlight:', error);
        }
      });
    }, CONFIG.HIGHLIGHT_DURATION);
  }

  // ==================== Checkbox Attachment ====================
  /**
   * Attaches a checkbox to an anime card node.
   * @param {HTMLElement} node - The anime card element
   * @param {number} index - The checkbox index for range selection
   */
  function attachCheckboxToNode(node, index) {
    if (!node) return;
    
    // Avoid duplicate checkboxes
    if (node.querySelector?.('input.' + CONFIG.CHECKBOX_CLASS) || node.__malExportAttached) {
      node.__malExportAttached = true;
      return;
    }
    
    node.__malExportAttached = true;
    node.classList.add(CONFIG.CARD_OVERLAY_CLASS);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = CONFIG.CHECKBOX_CLASS;
    checkbox.style.marginRight = '6px';
    checkbox.__malNodeRef = node;
    checkbox.__malIndex = index || 0;
    
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        node.classList.add(CONFIG.SELECTED_CLASS);
      } else {
        node.classList.remove(CONFIG.SELECTED_CLASS);
      }
      updateSelectedCount();
    });

    // Click-anywhere support on card
    node.addEventListener('click', (event) => {
      handleCardClick(event, checkbox, node);
    }, true);

    // Insert checkbox into title area
    const titleElement = node.querySelector('h3, h2, .title, .item-title, .link-title');
    if (titleElement?.prepend) {
      titleElement.prepend(checkbox);
    } else {
      try {
        node.prepend(checkbox);
      } catch (error) {
        node.insertBefore(checkbox, node.firstChild);
      }
    }
  }

  /**
   * Handles clicks on the anime card for click-anywhere and range selection.
   * @param {MouseEvent} event - The click event
   * @param {HTMLInputElement} checkbox - The checkbox element
   * @param {HTMLElement} node - The anime card element
   */
  function handleCardClick(event, checkbox, node) {
    const clickAnywhereEnabled = loadSettingFromStorage('clickAnywhere') === true;
    if (!clickAnywhereEnabled) return;
    
    const target = event.target;
    
    // If user clicked the checkbox itself, handle normally
    if (target === checkbox || target.closest?.('input.' + CONFIG.CHECKBOX_CLASS)) {
      lastCheckedIndex = checkbox.__malIndex;
      return;
    }
    
    // Prevent navigation when click-anywhere is enabled
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      console.warn('Failed to prevent default:', error);
    }

    // Handle range selection (Shift+click)
    const rangeSelectionEnabled = loadSettingFromStorage('rangeSelection') === true;
    if (rangeSelectionEnabled && event.shiftKey && lastCheckedIndex >= 0) {
      selectCheckboxRange(checkbox.__malIndex, lastCheckedIndex);
      return;
    }

    // Toggle checkbox for any other clicks
    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
      node.classList.add(CONFIG.SELECTED_CLASS);
    } else {
      node.classList.remove(CONFIG.SELECTED_CLASS);
    }
    lastCheckedIndex = checkbox.__malIndex;
    updateSelectedCount();
  }

  /**
   * Selects a range of checkboxes between two indices.
   * @param {number} currentIndex - The current checkbox index
   * @param {number} lastIndex - The last checked checkbox index
   */
  function selectCheckboxRange(currentIndex, lastIndex) {
    const start = Math.min(lastIndex, currentIndex);
    const end = Math.max(lastIndex, currentIndex);
    const checkboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    
    for (let i = start; i <= end; i++) {
      const checkbox = checkboxes[i];
      if (!checkbox) continue;
      
      checkbox.checked = true;
      if (checkbox.__malNodeRef) {
        checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
      }
    }
    updateSelectedCount();
  }

  // ==================== Initialization ====================
  /**
   * Scans the page for anime nodes and attaches checkboxes to each.
   * Creates the toolbar if it doesn't exist.
   */
  function scanAndAttachCheckboxes() {
    createToolbar();
    const animeNodes = findAnimeNodes();
    animeNodes.forEach((node, index) => attachCheckboxToNode(node, index));
    refreshCheckboxIndices();
  }

  // ==================== Global Click Handler ====================
  /**
   * Global capturing click handler for click-anywhere functionality.
   * Intercepts clicks on anime cards when the feature is enabled.
   * @param {MouseEvent} event - The click event
   */
  document.addEventListener('click', function handleGlobalClick(event) {
    const clickAnywhereEnabled = loadSettingFromStorage('clickAnywhere') === true;
    if (!clickAnywhereEnabled) return;
    
    const toolbar = document.getElementById(CONFIG.TOOLBAR_ID);
    if (toolbar?.contains(event.target)) return;
    
    // Ignore clicks on form controls
    if (event.target.closest?.('input, button, textarea, select, label')) return;

    // Find the nearest card and its checkbox
    let card = event.target.closest?.('article, .seasonal-anime');
    let checkbox = card?.querySelector('input.' + CONFIG.CHECKBOX_CLASS);
    
    // Search upward for a card with a checkbox if not found
    let searchNode = card;
    while (!checkbox && searchNode?.parentElement) {
      searchNode = searchNode.parentElement;
      checkbox = searchNode.querySelector?.('input.' + CONFIG.CHECKBOX_CLASS);
      if (checkbox) {
        card = searchNode;
        break;
      }
    }
    
    if (!checkbox) return;

    // Prevent navigation
    try {
      event.preventDefault();
      event.stopPropagation();
    } catch (error) {
      console.warn('Failed to prevent default:', error);
    }

    // Update last checked index if user clicked the checkbox directly
    if (event.target === checkbox) {
      const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
      lastCheckedIndex = checkbox.__malIndex ?? allCheckboxes.indexOf(checkbox);
      return;
    }

    // Handle range selection
    const rangeSelectionEnabled = loadSettingFromStorage('rangeSelection') === true;
    if (rangeSelectionEnabled && event.shiftKey && lastCheckedIndex >= 0) {
      const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
      const currentIndex = checkbox.__malIndex ?? allCheckboxes.indexOf(checkbox);
      selectCheckboxRange(currentIndex, lastCheckedIndex);
      return;
    }

    // Toggle checkbox
    checkbox.checked = !checkbox.checked;
    if (checkbox.checked) {
      card.classList.add(CONFIG.SELECTED_CLASS);
    } else {
      card.classList.remove(CONFIG.SELECTED_CLASS);
    }
    
    const allCheckboxes = Array.from(document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS));
    lastCheckedIndex = checkbox.__malIndex ?? allCheckboxes.indexOf(checkbox);
    updateSelectedCount();
  }, true);

  // ==================== Keyboard Shortcuts ====================
  /**
   * Global keyboard shortcut handler.
   * Ctrl+A: Select all checkboxes
   * Escape: Clear all selections
   * Ctrl+C: Copy to clipboard (when items are selected)
   * @param {KeyboardEvent} event - The keyboard event
   */
  document.addEventListener('keydown', function handleKeyboardShortcuts(event) {
    // Ctrl+A or Cmd+A: Select all
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      const checkboxes = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS);
      if (checkboxes.length > 0) {
        event.preventDefault();
        checkboxes.forEach(checkbox => {
          checkbox.checked = true;
          if (checkbox.__malNodeRef) {
            checkbox.__malNodeRef.classList.add(CONFIG.SELECTED_CLASS);
          }
        });
        updateSelectedCount();
        return;
      }
    }
    
    // Escape: Clear all selections
    if (event.key === 'Escape') {
      const selectedCount = document.querySelectorAll('.' + CONFIG.CHECKBOX_CLASS + ':checked').length;
      if (selectedCount > 0) {
        event.preventDefault();
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
  const contentObserver = new MutationObserver(() => {
    if (window.__malExportScanTimer) {
      clearTimeout(window.__malExportScanTimer);
    }
    window.__malExportScanTimer = setTimeout(() => {
      scanAndAttachCheckboxes();
    }, CONFIG.DEBOUNCE_DELAY);
  });

  contentObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true
  });

  // ==================== Initial Scan ====================
  scanAndAttachCheckboxes();

})();
