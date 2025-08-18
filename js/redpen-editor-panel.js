(function(){
  // Expose a simple panel renderer for the RedPen editor
  function mount(container){
    if (!container || !container.appendChild) return;

    // Create editor container
    var editor = document.createElement('div');
    editor.className = 'redpen-editor';

    // Panel markup
    editor.innerHTML = ''+
      '<h2>Редактор аннотаций</h2>'+
      '<div class="redpen-editor-row">'+
        '<label for="redpen-type" style="display:block;margin-bottom:4px;">Тип аннотации</label>'+
        '<select id="redpen-type">'+
          '<option value="main" selected>main</option>'+
          '<option value="comment">comment</option>'+
          '<option value="general">general</option>'+
        '</select>'+
      '</div>'+
      '<div class="redpen-editor-row" id="redpen-coord-row" style="margin-top:10px;">'+
        '<label for="redpen-coord" style="display:block;margin-bottom:4px;">Координаты</label>'+
        '<input id="redpen-coord" type="text" placeholder="кликните по странице" readonly />'+
      '</div>'+
      '<div class="redpen-editor-row" style="margin-top:10px;">'+
        '<label for="redpen-content" style="display:block;margin-bottom:4px;">Текст</label>'+
        '<textarea id="redpen-content" rows="6" style="width:100%;"></textarea>'+
      '</div>'+
      '<div class="redpen-editor-actions" style="margin-top:10px;display:flex;gap:8px;">'+
        '<button id="redpen-save" disabled>Сохранить</button>'+
        '<button id="redpen-cancel">Отмена</button>'+
      '</div>'+
      '<div id="redpen-login" style="display:none;"></div>';

    container.appendChild(editor);

    // Bind change handler for type select
    var typeEl = document.getElementById('redpen-type');
    if (typeEl) {
      typeEl.addEventListener('change', function(){
        var newVal = typeEl.value;
        var prevVal = (window.RedPenEditor && window.RedPenEditor.state && window.RedPenEditor.state.draft && window.RedPenEditor.state.draft.annType) || 'comment';
        if (window.RedPenEditor && typeof window.RedPenEditor.onTypeChange === 'function') {
          var ok = true;
          try { ok = window.RedPenEditor.onTypeChange(newVal, prevVal); } catch(e){ ok = true; }
          if (!ok) {
            // revert UI selection
            typeEl.value = prevVal;
            toggleCoordVisibilityByType(prevVal);
            return;
          }
        }
        // Reflect coord visibility for resulting type
        var finalType = (window.RedPenEditor && window.RedPenEditor.state && window.RedPenEditor.state.draft && window.RedPenEditor.state.draft.annType) || newVal;
        toggleCoordVisibilityByType(finalType);
      });
    }
  }

  function toggleCoordVisibilityByType(annType){
    var coordEl = document.getElementById('redpen-coord');
    var coordRow = document.getElementById('redpen-coord-row');
    var isGen = annType === 'general';
    if (coordEl){ coordEl.disabled = isGen; if (isGen) coordEl.value=''; }
    if (coordRow){ coordRow.style.display = isGen ? 'none' : ''; }
  }

  // Helpers to sync form fields
  function setDraft(draft){
    try {
      var typeEl = document.getElementById('redpen-type');
      var coordEl = document.getElementById('redpen-coord');
      var contentEl = document.getElementById('redpen-content');
      if (typeEl && draft && draft.annType) typeEl.value = draft.annType;
      toggleCoordVisibilityByType(draft && draft.annType);
      if (coordEl) {
        if (draft && Array.isArray(draft.coords) && draft.coords.length === 2 &&
            Number.isFinite(draft.coords[0]) && Number.isFinite(draft.coords[1])) {
          coordEl.value = '[' + Math.round(draft.coords[0]) + ', ' + Math.round(draft.coords[1]) + ']';
        } else {
          coordEl.value = '';
        }
      }
      if (contentEl) contentEl.value = (draft && typeof draft.content === 'string') ? draft.content : '';
    } catch (e) { /* noop */ }
  }

  // Parse coordinates from string: supports "[x, y]" and "x,y"
  function parseCoords(str){
    if (!str) return undefined;
    try {
      var s = String(str).trim();
      // remove brackets and spaces
      s = s.replace(/^\[/, '').replace(/\]$/, '').replace(/\s+/g, '');
      var parts = s.split(',');
      if (parts.length < 2) return undefined;
      var x = parseInt(parts[0], 10);
      var y = parseInt(parts[1], 10);
      if (isNaN(x) || isNaN(y)) return undefined;
      return [x, y];
    } catch(e) {
      return undefined;
    }
  }

  function getDraft(){
    var typeEl = document.getElementById('redpen-type');
    var coordEl = document.getElementById('redpen-coord');
    var contentEl = document.getElementById('redpen-content');
    var currentId = (window.RedPenEditor && window.RedPenEditor.state && window.RedPenEditor.state.draft)
      ? window.RedPenEditor.state.draft.id
      : undefined;

    var annType = typeEl ? typeEl.value : 'comment';
    var content = contentEl ? contentEl.value : '';
    var coords = coordEl ? parseCoords(coordEl.value) : undefined;

    var res = { annType: annType, content: content };
    if (typeof currentId !== 'undefined') res.id = currentId;
    if (Array.isArray(coords)) res.coords = coords;
    return res;
  }

  // Global export
  window.RedPenEditorPanel = {
    mount: mount,
    setDraft: setDraft,
    getDraft: getDraft,
    parseCoords: parseCoords
  };
})();
