(function(){
  // Checks if editor mode is enabled
  function hasEditorFlag(){
    try {
      var g = window;
      var usp = new URLSearchParams(g.location.search || '');
      var hsp = new URLSearchParams((g.location.hash || '').replace(/^#/, ''));
      var qp = usp.get('editor');
      var hp = hsp.get('editor');
      return (qp === '1' || qp === 'true') || (hp === '1' || hp === 'true') || g.REDPEN_EDITOR === true;
    } catch (e) {
      return window.REDPEN_EDITOR === true;
    }
  }

  var MARKER_SELECTOR = '.circle';

  // Parse coords from dataset string like "[x,y]" or "x,y"
  function parseCoords(str){
    if (!str) return undefined;
    var s = String(str).trim();
    s = s.replace(/^\[/, '').replace(/\]$/, '').replace(/\s+/g, '');
    var parts = s.split(',').map(function(v){ return parseInt(v, 10); });
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return [parts[0], parts[1]];
    return undefined;
  }

  function ensureSelectedStyleInjected(){
    if (document.getElementById('redpen-editor-selected-style')) return;
    var style = document.createElement('style');
    style.id = 'redpen-editor-selected-style';
    style.textContent = '.is-selected{ outline: 2px solid #DC143C; outline-offset: 2px; }';
    document.head && document.head.appendChild(style);
  }

  function selectMarker(el){
    try {
      document.querySelectorAll(MARKER_SELECTOR + '.is-selected').forEach(function(n){ n.classList.remove('is-selected'); });
      if (el && el.classList) el.classList.add('is-selected');
    } catch (e) { /* noop */ }
  }

  function clearSelection(){
    try {
      document.querySelectorAll(MARKER_SELECTOR + '.is-selected').forEach(function(n){ n.classList.remove('is-selected'); });
    } catch (e) { /* noop */ }
    if (window.RedPenEditor && window.RedPenEditor.state) {
      window.RedPenEditor.state.ui.selectedAnnotationId = null;
      window.RedPenEditor.state.draft.id = undefined;
    }
  }

  function normalizeId(raw){
    var s = (raw || '').trim();
    return s === '' ? undefined : s;
  }

  function findGeneralOnPage(){
    // Preferred: from page annotations
    try {
      var anns = (window.RedPenPage && Array.isArray(window.RedPenPage.annotations)) ? window.RedPenPage.annotations
                : (Array.isArray(window.allAnns) ? window.allAnns : null);
      if (anns && anns.length){
        for (var i=0;i<anns.length;i++){
          var a = anns[i];
          if (a && a.annType === 'general'){
            var id = normalizeId(a.id);
            var text = typeof a.text === 'string' ? a.text : '';
            return { id: id, content: text };
          }
        }
      }
    } catch(e){ /* noop */ }
    // Fallback: from DOM global comment
    try {
      var gc = document.getElementById('global-comment');
      var text = gc ? (gc.textContent || gc.innerText || '') : '';
      if (text && text.trim().length > 0) {
        return { id: undefined, content: text };
      }
    } catch(e){ /* noop */ }
    return null;
  }

  function initGeneralCache(){
    try {
      var el = document.getElementById('global-comment');
      if (!el) return;

      function maybeValidText(t){
        if (!t) return false;
        var tt = String(t).trim();
        return tt.length > 0 && tt !== 'Загрузка…' && tt !== 'Загрузка...';
      }

      function applyIfAppropriate(t){
        if (!window.RedPenEditor || !window.RedPenEditor.state) return;
        // Normalize id for general as unknown
        window.RedPenEditor.state.cache.general = { id: undefined, content: t };
        window.RedPenEditor.state.autoContent.general = t;

        var draft = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft)
          ? window.RedPenEditorPanel.getDraft()
          : (window.RedPenEditor.state.draft || {});
        var taVal = (draft && typeof draft.content === 'string') ? draft.content : '';
        var annType = draft.annType || (window.RedPenEditor.state.draft && window.RedPenEditor.state.draft.annType);
        var prevAuto = window.RedPenEditor.state.ui.lastAutoGeneralContent;

        if (annType === 'general' && (taVal.trim() === '' || taVal.trim() === 'Загрузка…' || taVal.trim() === 'Загрузка...' || taVal === prevAuto)) {
          var newDraft = Object.assign({}, window.RedPenEditor.state.draft, { id: undefined, annType: 'general', content: t, coords: undefined });
          window.RedPenEditor.state.draft = newDraft;
          // Since we just loaded existing general, begin editing existing
          beginEditingExisting({ id: undefined, annType: 'general', content: t, coords: undefined });
          if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) {
            window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
          }
          window.RedPenEditor.state.ui.lastAutoGeneralContent = t;
        }
      }

      var initial = (el.textContent || el.innerText || '');
      if (maybeValidText(initial)) {
        applyIfAppropriate(String(initial).trim());
        return;
      }

      var observer = new MutationObserver(function(){
        var txt = el.textContent || el.innerText || '';
        if (maybeValidText(txt)) {
          applyIfAppropriate(String(txt).trim());
          try { observer.disconnect(); } catch(e) { /* noop */ }
        }
      });
      observer.observe(el, { attributes: true, childList: true, characterData: true, subtree: true });
    } catch(e) { /* noop */ }
  }

  function init(){
    // Initialize global state if missing
    if (!window.RedPenEditor) window.RedPenEditor = {};
    if (!window.RedPenEditor.state) {
      window.RedPenEditor.state = {
        ui: { selectedAnnotationId: null, lastAutoGeneralContent: undefined },
        draft: { id: undefined, annType: 'comment', content: '', coords: undefined },
        cache: { general: null },
        editing: { mode: 'none' },
        baseline: null,
        flags: { allowCoordChangeWithoutPrompt: false },
        autoContent: { general: undefined }
      };
    } else {
      // ensure cache exists
      if (!window.RedPenEditor.state.cache) window.RedPenEditor.state.cache = { general: null };
      if (!window.RedPenEditor.state.ui) window.RedPenEditor.state.ui = { selectedAnnotationId: null, lastAutoGeneralContent: undefined };
      if (typeof window.RedPenEditor.state.ui.lastAutoGeneralContent === 'undefined') {
        window.RedPenEditor.state.ui.lastAutoGeneralContent = undefined;
      }
      if (!window.RedPenEditor.state.editing) window.RedPenEditor.state.editing = { mode: 'none' };
      if (!('baseline' in window.RedPenEditor.state)) window.RedPenEditor.state.baseline = null;
      if (!window.RedPenEditor.state.flags) window.RedPenEditor.state.flags = { allowCoordChangeWithoutPrompt: false };
      if (!window.RedPenEditor.state.autoContent) window.RedPenEditor.state.autoContent = { general: undefined };
    }

    // Expose utilities for panel usage
    window.RedPenEditor.clearSelection = clearSelection;

    // Find right block container
    var container = document.getElementById('global-comment-container');
    if (!container) return;

    // Hide existing children (viewer mode)
    Array.prototype.slice.call(container.children).forEach(function(ch){
      if (ch && ch.style) ch.style.display = 'none';
    });

    // Mount editor panel
    if (window.RedPenEditorPanel && typeof window.RedPenEditorPanel.mount === 'function') {
      window.RedPenEditorPanel.mount(container);
      // After mount, sync the panel with initial draft state
      if (window.RedPenEditorPanel.setDraft) {
        window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
      }
    }

    // Inject selection style (editorMode only)
    ensureSelectedStyleInjected();

    // Start in general mode with empty content; fill later when real content becomes available
    clearSelection();
    window.RedPenEditor.state.ui.selectedAnnotationId = null;
    window.RedPenEditor.state.draft = Object.assign({}, window.RedPenEditor.state.draft, {
      id: undefined,
      annType: 'general',
      content: '',
      coords: undefined
    });
    if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) {
      window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
      if (window.RedPenEditorPanel.revalidate) try { window.RedPenEditorPanel.revalidate(); } catch(e) {}
    }
    try {
      var typeEl = document.getElementById('redpen-type');
      if (typeEl) typeEl.value = 'general';
      var coordEl = document.getElementById('redpen-coord');
      if (coordEl) { coordEl.value=''; coordEl.disabled = true; coordEl.parentElement && (coordEl.parentElement.style.display='none'); }
    } catch(e){ /* noop */ }
    // We're in new general draft until real content appears
    beginCreatingNew({ id: undefined, annType: 'general', content: '', coords: undefined });

    // Initialize general cache lazily when content is ready
    initGeneralCache();

    // Initialize editing state after start
    window.RedPenEditor.state.editing.mode = 'none';
    window.RedPenEditor.state.baseline = null;
    window.RedPenEditor.state.flags.allowCoordChangeWithoutPrompt = false;

    // Delegated click handling
    var imageContainer = document.getElementById('image-container');
    var pageImage = document.getElementById('page-image');
    if (imageContainer && pageImage) {
      imageContainer.addEventListener('click', function(ev){
        try {
          var target = ev.target;
          var marker = target && target.closest ? target.closest(MARKER_SELECTOR) : null;
          if (marker) {
            handleMarkerClick(marker, ev);
          } else {
            handleEmptyClick(ev);
          }
        } catch (e) { /* noop */ }
      }, { passive: true, capture: true });
    }

    // Type change handler exposed globally for panel to delegate
    window.RedPenEditor.onTypeChange = function(newType, prevType){
      var state = window.RedPenEditor.state;
      var current = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft() : state.draft;
      var baseline = state.baseline;
      var mode = (state.editing && state.editing.mode) || 'none';

      // If switching to general
      if (newType === 'general') {
        // If moving to an existing general and current is dirty, confirm
        var gen = state.cache && state.cache.general;
        if ((mode === 'existing' || mode === 'new') && isDirty(current, baseline)) {
          if (!confirmLoseChanges()) return false;
        }
        // Prepare draft for general
        if (gen) {
          state.draft = { id: gen.id, annType: 'general', content: gen.content, coords: undefined };
          beginEditingExisting(state.draft);
        } else {
          // no general yet: stay in new with user's current text
          state.draft = Object.assign({}, state.draft, { id: undefined, annType: 'general', coords: undefined });
          beginCreatingNew({ id: undefined, annType: 'general', content: state.draft.content || '', coords: undefined });
        }
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) window.RedPenEditorPanel.setDraft(state.draft);
        return true;
      }

      // Switching away from general or between non-general types
      if (mode === 'existing' && isDirty(current, baseline)) {
        if (!confirmLoseChanges()) return false;
      }
      if (mode === 'new' && isDirty(current, baseline)) {
        if (!confirmLoseChanges()) return false;
      }
      // Stay in new mode if current draft has no id
      var next = Object.assign({}, state.draft, { annType: newType });
      state.draft = next;
      if (!next.id) {
        beginCreatingNew({ id: undefined, annType: newType, content: next.content || '', coords: next.coords });
      } else {
        beginEditingExisting({ id: next.id, annType: newType, content: next.content || '', coords: next.coords });
      }
      if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) window.RedPenEditorPanel.setDraft(state.draft);
      return true;
    };

    // Helper: snapshot and dirty check
    function snapshotFromDraft(d){
      if (!d) d = {};
      var id = (d.id || '').trim ? (d.id || '').trim() : d.id;
      id = (id === '' || typeof id === 'undefined') ? undefined : id;
      var res = { id: id, annType: d.annType || 'comment', content: typeof d.content === 'string' ? d.content : '' };
      if (Array.isArray(d.coords) && d.coords.length === 2 && Number.isFinite(d.coords[0]) && Number.isFinite(d.coords[1])) {
        res.coords = [d.coords[0], d.coords[1]];
      }
      return res;
    }
    function isDirty(current, baseline){
      if (!baseline) return false;
      if (!current) return false;
      if (current.annType !== baseline.annType) return true;
      if ((current.content || '') !== (baseline.content || '')) return true;
      // coords ignored for general
      if (current.annType === 'general') return false;
      var c1 = current.coords, c2 = baseline.coords;
      if (!c1 && !c2) return false;
      if (!c1 || !c2) return true;
      return !(c1[0] === c2[0] && c1[1] === c2[1]);
    }
    function confirmLoseChanges(){
      return window.confirm('У вас есть несохранённые изменения. Отменить их?');
    }
    function beginEditingExisting(data){
      var snap = snapshotFromDraft(data);
      window.RedPenEditor.state.editing.mode = 'existing';
      window.RedPenEditor.state.baseline = snap;
      window.RedPenEditor.state.flags.allowCoordChangeWithoutPrompt = false;
    }
    function beginCreatingNew(initialDraft){
      var snap = snapshotFromDraft(initialDraft);
      window.RedPenEditor.state.editing.mode = 'new';
      window.RedPenEditor.state.baseline = snap;
      window.RedPenEditor.state.flags.allowCoordChangeWithoutPrompt = true;
    }

    // Expose helpers for panel
    window.RedPenEditor._isDirty = isDirty;
    window.RedPenEditor._snapshot = snapshotFromDraft;

    // Save/Cancel API for panel
    window.RedPenEditor.onSave = function(){
      try {
        var draft = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft() : window.RedPenEditor.state.draft;
        // Validate via panel
        var v = window.RedPenEditorPanel && typeof window.RedPenEditorPanel.validate === 'function' ? window.RedPenEditorPanel.validate(draft) : { valid: true, errors: {} };
        if (!v.valid) {
          if (window.RedPenEditorPanel && window.RedPenEditorPanel.showErrors) window.RedPenEditorPanel.showErrors(v.errors || {});
          return;
        }
        // Sync state.draft from form
        window.RedPenEditor.state.draft = Object.assign({}, window.RedPenEditor.state.draft, draft);
        // Update baseline and mode
        var snap = snapshotFromDraft(window.RedPenEditor.state.draft);
        window.RedPenEditor.state.baseline = snap;
        if (snap && snap.id) {
          window.RedPenEditor.state.editing.mode = 'existing';
          window.RedPenEditor.state.flags.allowCoordChangeWithoutPrompt = false;
        } else {
          window.RedPenEditor.state.editing.mode = 'new';
          window.RedPenEditor.state.flags.allowCoordChangeWithoutPrompt = true;
        }
        // Disable Save until next change
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.setSaveEnabled) window.RedPenEditorPanel.setSaveEnabled(false);
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.revalidate) window.RedPenEditorPanel.revalidate();
        // MVP toast
        try { window.alert('Сохранено'); } catch(e) { /* noop */ }
      } catch(e){ /* noop */ }
    };

    window.RedPenEditor.onCancel = function(){
      try {
        var state = window.RedPenEditor.state;
        var current = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft() : state.draft;
        var base = state.baseline;
        if (!base) {
          // nothing to revert to
          if (window.RedPenEditorPanel && window.RedPenEditorPanel.revalidate) window.RedPenEditorPanel.revalidate();
          return;
        }
        if (isDirty(current, base)) {
          if (!confirmLoseChanges()) return;
        }
        // Revert to baseline
        var revert = { id: base.id, annType: base.annType, content: base.content, coords: base.coords };
        state.draft = Object.assign({}, state.draft, revert);
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) window.RedPenEditorPanel.setDraft(state.draft);
        // Clear selection if baseline is general or new without id/coords
        if (base.annType === 'general' || !base.id || (typeof base.id === 'undefined' && !base.coords)) {
          try { clearSelection(); } catch(e) { /* noop */ }
        }
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.revalidate) window.RedPenEditorPanel.revalidate();
      } catch(e){ /* noop */ }
    };

    function handleMarkerClick(marker, event){
      if (event && event.stopPropagation) event.stopPropagation();
      if (event && event.stopImmediatePropagation) event.stopImmediatePropagation();

      // Before switching, check unsaved changes
      var currentDraft = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft() : (window.RedPenEditor.state && window.RedPenEditor.state.draft) || { annType: 'comment', content: '' };
      var baseline = window.RedPenEditor.state.baseline;
      var mode = (window.RedPenEditor.state.editing && window.RedPenEditor.state.editing.mode) || 'none';
      if ((mode === 'existing' || mode === 'new') && isDirty(currentDraft, baseline)) {
        if (!confirmLoseChanges()) return; // cancel transition
      }

      // Extract id: empty string -> undefined
      var rawId = (marker.id || '').trim();
      var id = rawId === '' ? undefined : rawId;

      // Resolve coords
      var ds = marker.dataset || {};
      var coords = parseCoords(ds.coords);
      if (!Array.isArray(coords)) {
        var img = document.getElementById('page-image');
        if (img && marker.getBoundingClientRect) {
          var mr = marker.getBoundingClientRect();
          var ir = img.getBoundingClientRect();
          var cx = Math.round(mr.left + mr.width/2 - ir.left);
          var cy = Math.round(mr.top + mr.height/2 - ir.top);
          coords = [cx, cy];
        }
      }

      // Determine type and content without overwriting with empty text
      currentDraft = (window.RedPenEditor && window.RedPenEditor.state && window.RedPenEditor.state.draft) || { annType: 'comment', content: '' };
      var annType = ds.annType || currentDraft.annType || 'comment';
      var content = (typeof ds.text === 'string' && ds.text.trim().length > 0) ? ds.text : currentDraft.content;

      // Update state (merge)
      window.RedPenEditor.state.ui.selectedAnnotationId = id || null;
      window.RedPenEditor.state.draft = Object.assign({}, currentDraft, { id: id, annType: annType, content: content, coords: coords });
      beginEditingExisting({ id: id, annType: annType, content: content, coords: coords });

      // Update UI
      selectMarker(marker);
      if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) {
        window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
        if (window.RedPenEditorPanel.revalidate) try { window.RedPenEditorPanel.revalidate(); } catch(e) {}
      }
      // Ensure coord input enabled when not general and sync type select
      try {
        var coordEl2 = document.getElementById('redpen-coord');
        if (coordEl2) {
          var isGen = window.RedPenEditor.state.draft.annType === 'general';
          coordEl2.disabled = isGen;
          coordEl2.parentElement && (coordEl2.parentElement.style.display = isGen ? 'none' : '');
        }
        var typeEl2 = document.getElementById('redpen-type');
        if (typeEl2) typeEl2.value = window.RedPenEditor.state.draft.annType;
      } catch(e){ /* noop */ }
    }

    function handleEmptyClick(event){
      // Ignore clicks in general mode
      try {
        var currentType = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft().annType : (window.RedPenEditor.state && window.RedPenEditor.state.draft && window.RedPenEditor.state.draft.annType);
        if (currentType === 'general') return;
      } catch(e){ /* noop */ }

      var img = document.getElementById('page-image');
      if (!img || !img.getBoundingClientRect) return;
      var r = img.getBoundingClientRect();
      var x = Math.round(event.clientX - r.left);
      var y = Math.round(event.clientY - r.top);
      var coords = [x, y];

      var mode = (window.RedPenEditor.state.editing && window.RedPenEditor.state.editing.mode) || 'none';
      var current = window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft
        ? window.RedPenEditorPanel.getDraft()
        : (window.RedPenEditor.state && window.RedPenEditor.state.draft) || { annType: 'comment', content: '' };

      if (mode === 'existing') {
        // Check for dirty before leaving existing
        if (isDirty(current, window.RedPenEditor.state.baseline)) {
          if (!confirmLoseChanges()) return; // cancel
        }
        // approved: clear selection and start creating new
        clearSelection();
        var newDraft = { id: undefined, annType: current.annType, content: '', coords: coords };
        window.RedPenEditor.state.draft = Object.assign({}, window.RedPenEditor.state.draft, newDraft);
        beginCreatingNew(newDraft);
      } else {
        // mode new or none: free change of coords without prompt
        clearSelection();
        window.RedPenEditor.state.draft = Object.assign({}, window.RedPenEditor.state.draft, { id: undefined, annType: current.annType, content: current.content, coords: coords });
        if (mode !== 'new') {
          beginCreatingNew({ id: undefined, annType: current.annType, content: current.content, coords: coords });
        }
      }

      if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) {
        window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
        if (window.RedPenEditorPanel.revalidate) try { window.RedPenEditorPanel.revalidate(); } catch(e) {}
      }
    }
  }

  // Export globals per spec
  window.RedPenEditor = window.RedPenEditor || {};
  window.RedPenEditor.init = init;
  // Hook to receive annotations from viewer code for immediate general loading
  window.RedPenEditor.onAnnotationsLoaded = function(anns){
    try {
      if (!Array.isArray(anns)) return;
      var gen = null;
      for (var i=0;i<anns.length;i++){ var a = anns[i]; if (a && a.annType === 'general'){ gen = { id: normalizeId(a.id), content: (typeof a.text==='string'?a.text:'') }; break; } }
      if (!window.RedPenEditor.state.cache) window.RedPenEditor.state.cache = { general: null };
      window.RedPenEditor.state.cache.general = gen;
      // If in general mode and user hasn’t typed (textarea empty or matches last auto), set content
      var draft = (window.RedPenEditorPanel && window.RedPenEditorPanel.getDraft) ? window.RedPenEditorPanel.getDraft() : window.RedPenEditor.state.draft;
      var ta = (draft && typeof draft.content === 'string') ? draft.content : '';
      var prevAuto = window.RedPenEditor.state.ui && window.RedPenEditor.state.ui.lastAutoGeneralContent;
      if (gen && draft && draft.annType === 'general' && (ta.trim()==='' || ta===prevAuto)){
        var newDraft = { id: gen.id, annType: 'general', content: gen.content, coords: undefined };
        window.RedPenEditor.state.draft = Object.assign({}, window.RedPenEditor.state.draft, newDraft);
        if (typeof beginEditingExisting === 'function') { beginEditingExisting(newDraft); }
        if (window.RedPenEditorPanel && window.RedPenEditorPanel.setDraft) {
          window.RedPenEditorPanel.setDraft(window.RedPenEditor.state.draft);
          if (window.RedPenEditorPanel.revalidate) try { window.RedPenEditorPanel.revalidate(); } catch(e) {}
        }
        if (window.RedPenEditor.state && window.RedPenEditor.state.ui) window.RedPenEditor.state.ui.lastAutoGeneralContent = gen.content;
      }
    } catch(e){ /* noop */ }
  };
  window.hasEditorFlag = hasEditorFlag; // optional external use

  // Self-run only when flag present
  if (hasEditorFlag()) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function(){
        try { init(); } catch(e) { /* noop */ }
      }, { once: true });
    } else {
      try { init(); } catch(e) { /* noop */ }
    }
  }
})();
