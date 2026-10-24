// Ported from Orca (MIT, (c) 2026 Lovecast Inc.): src/main/browser/grab-guest-*.ts.
// Generated from Orca's ARM script and kept as ES5-style JS so the extraction logic, budgets
// and regexes stay byte-for-byte comparable with upstream. Changes from upstream:
//  - wrapped in installPicker() and returns the picker API instead of writing window.__orcaGrab
//  - React fiber reads go through bridge.getReactMetadata (they need the page's MAIN world)
//  - hit-testing ignores the extension's own UI via bridge.isOwnElement
//  - the caller re-slots the host before the extension UI host (see browser-api.ts)
//  - host id / selection marker attribute renamed
/* eslint-disable */
// @ts-nocheck

export function installPicker(bridge) {
  'use strict';

  var BUDGET = {
    textSnippetMaxLength: 200,
    nearbyTextEntryMaxLength: 200,
    nearbyTextMaxEntries: 10,
    htmlSnippetMaxLength: 4096,
    ancestorPathMaxEntries: 10,
    nearbyElementsMaxEntries: 6,
    nearbyElementMaxLength: 160,
    selectorMaxLength: 700,
    pathMaxLength: 900,
    cssClassesMaxLength: 500,
    selectedTextMaxLength: 500,
    sourceFileMaxLength: 500,
    reactComponentsMaxLength: 500
  };
  var TEXT_NODE_SCAN_LIMIT = 80;
  var NEARBY_ELEMENT_SCAN_LIMIT = 80;

  var SAFE_ATTRS = new Set([
    'id', 'class', 'name', 'type', 'role', 'href', 'src', 'alt',
    'title', 'placeholder', 'for', 'action', 'method'
  ]);

  var SECRET_PATTERNS = [
    'access_token', 'auth_token', 'api_key', 'apikey', 'client_secret',
    'oauth_state', 'x-amz-', 'session_id', 'sessionid', 'csrf',
    'secret', 'password', 'passwd'
  ];

  var SAFE_URL_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

  var STYLE_PROPS = [
    'display', 'position', 'width', 'height', 'margin', 'padding',
    'color', 'backgroundColor', 'border', 'borderRadius', 'fontFamily',
    'fontSize', 'fontWeight', 'lineHeight', 'textAlign', 'zIndex'
  ];

  function clampStr(s, max) {
    if (!s || typeof s !== 'string') return '';
    if (s.length <= max) return s;
    return s.slice(0, max) + ' (truncated)';
  }

  function containsSecret(value) {
    if (!value) return false;
    var lower = value.toLowerCase();
    for (var i = 0; i < SECRET_PATTERNS.length; i++) {
      if (lower.indexOf(SECRET_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function sanitizeUrl(url) {
    try {
      var u = new URL(url);
      if (u.protocol === 'about:') {
        return u.toString() === 'about:blank' ? 'about:blank' : '';
      }
      if (!SAFE_URL_PROTOCOLS.has(u.protocol)) {
        return '';
      }
      u.search = '';
      u.hash = '';
      return u.toString();
    } catch (e) {
      // Never return unvalidated raw URLs on parse failure.
      return '';
    }
  }

  function createTextAccumulator() {
    return { text: '', pendingSpace: false };
  }

  function isWhitespaceCode(code) {
    return code === 32 || (code >= 9 && code <= 13) || code === 160 ||
      code === 5760 || (code >= 8192 && code <= 8202) || code === 8232 ||
      code === 8233 || code === 8239 || code === 8287 || code === 12288 ||
      code === 65279;
  }

  function appendTextSeparator(acc) {
    if (acc.text.length > 0) acc.pendingSpace = true;
  }

  function appendNormalizedText(acc, text, max) {
    var limit = max + 20;
    var value = String(text || '');
    for (var i = 0; i < value.length && acc.text.length < limit; i++) {
      var code = value.charCodeAt(i);
      if (isWhitespaceCode(code)) {
        if (acc.text.length > 0) acc.pendingSpace = true;
        continue;
      }
      if (acc.pendingSpace) {
        acc.text += ' ';
        acc.pendingSpace = false;
        if (acc.text.length >= limit) break;
      }
      acc.text += value.charAt(i);
    }
  }

  function finishAccumulatedText(acc, max) {
    return clampStr(acc.text, max);
  }

  function getBoundedText(el, max) {
    try {
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var acc = createTextAccumulator();
      var inspected = 0;
      var node = walker.nextNode();
      while (node && acc.text.length < max + 20 && inspected < TEXT_NODE_SCAN_LIMIT) {
        inspected++;
        appendTextSeparator(acc);
        var remaining = max + 20 - acc.text.length - (acc.pendingSpace ? 1 : 0);
        if (remaining <= 0) break;
        appendNormalizedText(acc, (node.nodeValue || '').slice(0, remaining), max);
        node = walker.nextNode();
      }
      return finishAccumulatedText(acc, max);
    } catch (e) {
      return '';
    }
  }

  function getTextSnippet(el) {
    return getBoundedText(el, BUDGET.textSnippetMaxLength);
  }

  function getSelectedText() {
    try {
      var selection = window.getSelection ? window.getSelection() : null;
      if (!selection || selection.rangeCount === 0) return '';
      var acc = createTextAccumulator();
      var inspected = 0;
      for (
        var i = 0;
        i < selection.rangeCount && acc.text.length < BUDGET.selectedTextMaxLength + 20;
        i++
      ) {
        var range = selection.getRangeAt(i);
        var walkerRoot = range.commonAncestorContainer;
        var walker = document.createTreeWalker(
          walkerRoot,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: function(node) {
              if (range.intersectsNode && !range.intersectsNode(node)) {
                return NodeFilter.FILTER_REJECT;
              }
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        var node = walkerRoot.nodeType === Node.TEXT_NODE ? walkerRoot : walker.nextNode();
        while (
          node &&
          acc.text.length < BUDGET.selectedTextMaxLength + 20 &&
          inspected < TEXT_NODE_SCAN_LIMIT
        ) {
          inspected++;
          var textNode = node;
          var value = textNode.nodeValue || '';
          appendTextSeparator(acc);
          var remaining =
            BUDGET.selectedTextMaxLength + 20 - acc.text.length - (acc.pendingSpace ? 1 : 0);
          if (remaining <= 0) break;
          if (value) {
            var start = textNode === range.startContainer ? range.startOffset : 0;
            var end = textNode === range.endContainer ? range.endOffset : value.length;
            if (end > start + remaining) {
              end = start + remaining;
            }
            if (textNode === range.startContainer) {
              start = Math.min(start, value.length);
            }
            value = value.slice(start, end);
            appendNormalizedText(acc, value, BUDGET.selectedTextMaxLength);
          }
          node = walker.nextNode();
        }
      }
      return finishAccumulatedText(acc, BUDGET.selectedTextMaxLength);
    } catch (e) {
      return '';
    }
  }

  function getHtmlSnippet(el) {
    var clone = el.cloneNode(true);
    var scripts = clone.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      scripts[i].remove();
    }
    var html = clone.outerHTML || '';
    return clampStr(html, BUDGET.htmlSnippetMaxLength);
  }

  function getSafeAttributes(el) {
    var attrs = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var attr = el.attributes[i];
      var name = attr.name.toLowerCase();
      var isAria = name.indexOf('aria-') === 0;
      if (!SAFE_ATTRS.has(name) && !isAria) continue;
      var value = attr.value;
      if (containsSecret(value)) {
        attrs[name] = '[redacted]';
      } else if ((name === 'href' || name === 'src' || name === 'action') && value) {
        attrs[name] = sanitizeUrl(value);
      } else if (name === 'class') {
        attrs[name] = clampStr(value, 200);
      } else {
        attrs[name] = value;
      }
    }
    return attrs;
  }

  // Avoid splitting huge page-controlled aria-labelledby values into an unbounded array.
  function getAriaLabelledByIds(value) {
    var ids = [];
    var tokenStart = -1;
    for (var index = 0; index <= value.length; index++) {
      var isEnd = index === value.length;
      if (!isEnd && !isAriaLabelledBySeparator(value.charCodeAt(index))) {
        if (tokenStart === -1) tokenStart = index;
        continue;
      }
      if (tokenStart !== -1) {
        ids.push(value.slice(tokenStart, index));
        tokenStart = -1;
        if (ids.length >= 32) break;
      }
    }
    return ids;
  }

  function isAriaLabelledBySeparator(code) {
    return code === 32 ||
      (code >= 9 && code <= 13) ||
      code === 160 ||
      code === 5760 ||
      (code >= 8192 && code <= 8202) ||
      code === 8232 ||
      code === 8233 ||
      code === 8239 ||
      code === 8287 ||
      code === 12288 ||
      code === 65279;
  }

  function getAccessibility(el) {
    var role = el.getAttribute('role') || el.tagName.toLowerCase();
    var ariaLabel = el.getAttribute('aria-label') || null;
    var ariaLabelledBy = el.getAttribute('aria-labelledby') || null;
    var accessibleName = null;
    if (ariaLabel) {
      accessibleName = ariaLabel;
    } else if (ariaLabelledBy) {
      var parts = getAriaLabelledByIds(ariaLabelledBy);
      var names = [];
      for (var i = 0; i < parts.length; i++) {
        var ref = document.getElementById(parts[i]);
        if (ref) names.push(getBoundedText(ref, 100));
      }
      if (names.length) accessibleName = names.join(' ');
    } else {
      var tag = el.tagName.toLowerCase();
      if (tag === 'button' || tag === 'a' || tag === 'label') {
        accessibleName = getBoundedText(el, 100);
      } else if (el.getAttribute('title')) {
        accessibleName = el.getAttribute('title');
      } else if (el.getAttribute('alt')) {
        accessibleName = el.getAttribute('alt');
      }
    }
    return {
      role: role,
      accessibleName: accessibleName,
      ariaLabel: ariaLabel,
      ariaLabelledBy: ariaLabelledBy
    };
  }

  function getComputedStyleSubset(el) {
    var cs = window.getComputedStyle(el);
    var result = {};
    for (var i = 0; i < STYLE_PROPS.length; i++) {
      result[STYLE_PROPS[i]] = cs.getPropertyValue(
        STYLE_PROPS[i].replace(/[A-Z]/g, function(m) { return '-' + m.toLowerCase(); })
      ) || '';
    }
    return result;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) {
      return '\\' + ch;
    });
  }

  function looksHashy(value) {
    return /^[A-Za-z0-9_-]{12,}$/.test(value) && /\d/.test(value) && /[A-Z]/.test(value);
  }

  function getStableClasses(el, maxCount) {
    if (!el.classList) return [];
    var result = [];
    for (var i = 0; i < el.classList.length && result.length < maxCount; i++) {
      var cls = el.classList[i];
      if (!cls || cls.length > 60 || containsSecret(cls)) continue;
      if (/^css-[a-z0-9]+$/i.test(cls) || looksHashy(cls)) continue;
      result.push(cls);
    }
    return result;
  }

  function buildSelectorPart(el) {
    var tag = el.tagName.toLowerCase();
    var id = el.id;
    if (id && !containsSecret(id)) {
      return tag + '#' + cssEscape(id);
    }
    var classes = getStableClasses(el, 2);
    if (classes.length > 0) {
      return tag + classes.map(function(cls) { return '.' + cssEscape(cls); }).join('');
    }
    return tag;
  }

  function isUniqueSelector(selector) {
    try {
      return document.querySelectorAll(selector).length === 1;
    } catch(e) {
      return false;
    }
  }

  function getNthOfTypeSuffix(current) {
    var tag = current.tagName;
    var index = 1;
    var sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) index++;
      sibling = sibling.previousElementSibling;
    }
    if (index > 1) return ':nth-of-type(' + index + ')';

    sibling = current.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === tag) return ':nth-of-type(1)';
      sibling = sibling.nextElementSibling;
    }
    return '';
  }

  function buildSelector(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && parts.length < 10) {
      var part = buildSelectorPart(current);
      var parent = current.parentElement;
      if (parent && !isUniqueSelector(parts.concat([part]).reverse().join(' > '))) {
        part += getNthOfTypeSuffix(current);
      }
      parts.unshift(part);
      var selector = parts.join(' > ');
      if (isUniqueSelector(selector)) {
        return clampStr(selector, BUDGET.selectorMaxLength);
      }
      current = parent;
    }
    return clampStr(parts.join(' > ') || el.tagName.toLowerCase(), BUDGET.selectorMaxLength);
  }

  function buildReadablePath(el) {
    var parts = [];
    var current = el;
    while (current && current !== document.documentElement && parts.length < 6) {
      var tag = current.tagName.toLowerCase();
      if (tag === 'html' || tag === 'body') break;
      var label = tag;
      var aria = current.getAttribute('aria-label');
      var role = current.getAttribute('role');
      var stableClasses = getStableClasses(current, 1);
      if (current.id && !containsSecret(current.id)) {
        label = '#' + cssEscape(current.id);
      } else if (aria && !containsSecret(aria)) {
        label = tag + '[aria-label="' + clampStr(aria, 40).replace(/"/g, '\\"') + '"]';
      } else if (role && !containsSecret(role)) {
        label = tag + '[role="' + clampStr(role, 30).replace(/"/g, '\\"') + '"]';
      } else if (stableClasses.length > 0) {
        label = '.' + cssEscape(stableClasses[0]);
      }
      parts.unshift(label);
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function buildFullPath(el) {
    var parts = [];
    var current = el;
    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.documentElement && parts.length < 20) {
      parts.unshift(buildSelectorPart(current));
      current = current.parentElement;
    }
    return clampStr(parts.join(' > '), BUDGET.pathMaxLength);
  }

  function getNearbyText(el) {
    var results = [];
    var parent = el.parentElement;
    if (!parent) return results;

    function addSiblingText(sibling) {
      if (!sibling) return;
      var text = getBoundedText(sibling, BUDGET.nearbyTextEntryMaxLength);
      if (text) {
        results.push(clampStr(text, BUDGET.nearbyTextEntryMaxLength));
      }
    }

    var inspected = 0;
    var previous = el.previousElementSibling;
    var next = el.nextElementSibling;
    while (
      results.length < BUDGET.nearbyTextMaxEntries &&
      inspected < NEARBY_ELEMENT_SCAN_LIMIT &&
      (previous || next)
    ) {
      if (previous) {
        var previousSibling = previous;
        previous = previous.previousElementSibling;
        inspected++;
        addSiblingText(previousSibling);
      }
      if (
        next &&
        results.length < BUDGET.nearbyTextMaxEntries &&
        inspected < NEARBY_ELEMENT_SCAN_LIMIT
      ) {
        var nextSibling = next;
        next = next.nextElementSibling;
        inspected++;
        addSiblingText(nextSibling);
      }
    }
    return results;
  }

  function getAncestorPath(el) {
    var path = [];
    var current = el.parentElement;
    while (current && current !== document.documentElement && path.length < BUDGET.ancestorPathMaxEntries) {
      var tag = current.tagName.toLowerCase();
      var role = current.getAttribute('role');
      path.push(role ? tag + '[role=' + role + ']' : tag);
      current = current.parentElement;
    }
    return path;
  }

  function getNearbyElements(el) {
    var parent = el.parentElement;
    if (!parent) return [];
    var result = [];

    function addSibling(sibling) {
      if (!sibling) return;
      if (sibling === el) return;
      var rect = sibling.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      var label = sibling.tagName.toLowerCase();
      var stableClasses = getStableClasses(sibling, 1);
      if (stableClasses.length > 0) label += '.' + stableClasses[0];
      var text = getBoundedText(sibling, 50);
      if (text) label += ' "' + clampStr(text, 50) + '"';
      result.push(clampStr(label, BUDGET.nearbyElementMaxLength));
    }
    var inspected = 0;
    var previous = el.previousElementSibling;
    var next = el.nextElementSibling;
    while (
      result.length < BUDGET.nearbyElementsMaxEntries &&
      inspected < NEARBY_ELEMENT_SCAN_LIMIT &&
      (previous || next)
    ) {
      if (previous) {
        var previousSibling = previous;
        previous = previous.previousElementSibling;
        inspected++;
        addSibling(previousSibling);
      }
      if (
        next &&
        result.length < BUDGET.nearbyElementsMaxEntries &&
        inspected < NEARBY_ELEMENT_SCAN_LIMIT
      ) {
        var nextSibling = next;
        next = next.nextElementSibling;
        inspected++;
        addSibling(nextSibling);
      }
    }
    return result;
  }

  function isElementFixed(el) {
    var current = el;
    while (current && current !== document.body) {
      var position = window.getComputedStyle(current).position;
      if (position === 'fixed' || position === 'sticky') return true;
      current = current.parentElement;
    }
    return false;
  }

  function extractPayload(el) {
    var rect = el.getBoundingClientRect();
    var react = bridge.getReactMetadata(el);
    return {
      page: {
        sanitizedUrl: sanitizeUrl(window.location.href),
        title: document.title || '',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        devicePixelRatio: window.devicePixelRatio || 1,
        capturedAt: new Date().toISOString()
      },
      target: {
        tagName: el.tagName.toLowerCase(),
        selector: buildSelector(el),
        elementPath: buildReadablePath(el),
        fullPath: buildFullPath(el),
        cssClasses: containsSecret(el.getAttribute('class') || '')
          ? '[redacted]'
          : clampStr(el.getAttribute('class') || '', BUDGET.cssClassesMaxLength),
        nearbyElements: getNearbyElements(el),
        selectedText: getSelectedText() || null,
        isFixed: isElementFixed(el),
        reactComponents: react.reactComponents,
        sourceFile: react.sourceFile,
        textSnippet: getTextSnippet(el),
        htmlSnippet: getHtmlSnippet(el),
        attributes: getSafeAttributes(el),
        accessibility: getAccessibility(el),
        rectViewport: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        },
        rectPage: {
          x: rect.x + window.scrollX,
          y: rect.y + window.scrollY,
          width: rect.width,
          height: rect.height
        },
        computedStyles: getComputedStyleSubset(el)
      },
      nearbyText: getNearbyText(el),
      ancestorPath: getAncestorPath(el),
      screenshot: null
    };
  }

  // Catch selection clicks in the overlay so the page does not receive them.
  var host = document.createElement('div');
  host.id = '__element-grab-host';
  host.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:all;cursor:crosshair;';
  document.documentElement.appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  var overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483647;';
  shadow.appendChild(overlay);

  // A light border and dark shadow keep the outline legible on arbitrary page backgrounds.
  var highlightBox = document.createElement('div');
  highlightBox.style.cssText = 'position:fixed;border:2px solid rgba(255,255,255,0.9);border-radius:3px;pointer-events:none;transition:all 0.05s ease-out;display:none;background:rgba(255,255,255,0.08);box-shadow:0 0 0 1px rgba(0,0,0,0.3),0 2px 8px rgba(0,0,0,0.15);';
  overlay.appendChild(highlightBox);

  var hoverLabel = document.createElement('div');
  hoverLabel.style.cssText = 'position:fixed;padding:3px 8px;background:rgba(30,30,30,0.92);color:#e5e5e5;font:11px/1.4 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;border-radius:4px;pointer-events:none;white-space:nowrap;display:none;max-width:300px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  overlay.appendChild(hoverLabel);

  var currentEl = null;

  function updateHighlight(el) {
    if (!el || el === document.documentElement || el === document.body) {
      highlightBox.style.display = 'none';
      hoverLabel.style.display = 'none';
      currentEl = null;
      return;
    }
    currentEl = el;
    var rect = el.getBoundingClientRect();
    highlightBox.style.left = rect.x + 'px';
    highlightBox.style.top = rect.y + 'px';
    highlightBox.style.width = rect.width + 'px';
    highlightBox.style.height = rect.height + 'px';
    highlightBox.style.display = 'block';

    var tag = el.tagName.toLowerCase();
    var role = el.getAttribute('role');
    var text = getBoundedText(el, 40);
    if (text.length > 40) text = text.slice(0, 37) + '...';
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    var parts = [tag];
    if (role) parts.push('role=' + role);
    if (text) parts.push('"' + text + '"');
    parts.push(w + 'x' + h);
    hoverLabel.textContent = parts.join('  ');

    var labelY = rect.bottom + 6;
    if (labelY + 28 > window.innerHeight) {
      labelY = rect.top - 28;
    }
    hoverLabel.style.left = Math.max(4, rect.x) + 'px';
    hoverLabel.style.top = labelY + 'px';
    hoverLabel.style.display = 'block';
  }

  function onPointerMove(e) {
    // Exclude the overlay from hit testing to find the page element underneath.
    host.style.pointerEvents = 'none';
    var el = document.elementFromPoint(e.clientX, e.clientY);
    host.style.pointerEvents = 'all';
    if (el && !bridge.isOwnElement(el)) {
      requestAnimationFrame(function() { updateHighlight(el); });
    }
  }

  host.addEventListener('mousemove', onPointerMove);

  var selectedAttribute = "data-element-grab-selected";
  var selectedEl = null;
  var selectedValue = null;
  var previousSelectedValue = null;
  var frozenFrame = 0;
  var frozenResizeObserver = null;

  function refreshFrozenHighlight() {
    frozenFrame = 0;
    if (selectedEl && selectedEl.isConnected) {
      updateHighlight(selectedEl);
    } else {
      highlightBox.style.display = 'none';
      hoverLabel.style.display = 'none';
    }
  }

  function scheduleFrozenHighlight() {
    if (!frozenFrame) frozenFrame = requestAnimationFrame(refreshFrozenHighlight);
  }

  function stopTrackingSelection() {
    window.removeEventListener('scroll', scheduleFrozenHighlight, true);
    window.removeEventListener('resize', scheduleFrozenHighlight, true);
    if (frozenResizeObserver) frozenResizeObserver.disconnect();
    frozenResizeObserver = null;
    if (frozenFrame) cancelAnimationFrame(frozenFrame);
    frozenFrame = 0;
    if (selectedEl && selectedEl.getAttribute(selectedAttribute) === selectedValue) {
      try {
        if (previousSelectedValue === null) selectedEl.removeAttribute(selectedAttribute);
        else selectedEl.setAttribute(selectedAttribute, previousSelectedValue);
      } catch(e) {}
    }
    selectedEl = null;
    selectedValue = null;
    previousSelectedValue = null;
  }

  var api = {
    host: host,
    extractPayload: extractPayload,
    getCurrentElement: function() { return currentEl; },
    // Release pointer events while preserving the selection outline for the copy menu.
    freezeHighlight: function(selectionId) {
      host.removeEventListener('mousemove', onPointerMove);
      host.style.pointerEvents = 'none';
      host.style.cursor = 'default';
      // Capture scrolls so selection tracking includes nested scroll containers.
      selectedEl = currentEl;
      if (!selectedEl) return;
      // A DOM marker crosses isolated worlds without exposing the viewport bridge's token.
      previousSelectedValue = selectedEl.getAttribute(selectedAttribute);
      selectedValue = selectionId;
      selectedEl.setAttribute(selectedAttribute, selectionId);
      highlightBox.style.transition = 'none';
      window.addEventListener('scroll', scheduleFrozenHighlight, true);
      window.addEventListener('resize', scheduleFrozenHighlight, true);
      if (typeof ResizeObserver === 'function') {
        frozenResizeObserver = new ResizeObserver(scheduleFrozenHighlight);
        frozenResizeObserver.observe(selectedEl, { box: 'border-box' });
        // A scrollbar appearing narrows the page without a window resize.
        if (selectedEl !== document.documentElement) {
          frozenResizeObserver.observe(document.documentElement);
        }
      }
    },
    cleanup: function() {
      host.removeEventListener('mousemove', onPointerMove);
      stopTrackingSelection();
      try { host.remove(); } catch(e) {}
    }
  };

  return api;
}
