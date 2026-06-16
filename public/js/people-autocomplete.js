// People Tag Autocomplete
// AI-6: Provides autocomplete for person name inputs
(function() {
  'use strict';

  // Minimum characters before showing suggestions
  const MIN_QUERY_LENGTH = 2;

  // Debounce timer for input events
  let timer = null;

  // Initialize people autocomplete on an input element
  function initPeopleAutocomplete(input, options) {
    options = options || {};
    
    var wrap = input.parentNode;
    var drop = null;
    var active = -1;
    
    // Create dropdown container
    function close() {
      if (drop) { drop.remove(); drop = null; active = -1; }
    }
    
    // Open dropdown with matching people
    function open(items) {
      close();
      if (!items.length) return;
      
      drop = document.createElement('div');
      drop.className = 'tag-ac';
      
      items.forEach(function(item, i) {
        var d = document.createElement('div');
        d.className = 'tag-ac-item';
        d.textContent = item.name;
        d.addEventListener('mousedown', function(e) {
          e.preventDefault();
          pick(item);
        });
        drop.appendChild(d);
      });
      
      wrap.appendChild(drop);
      
      // Position dropdown below input
      var inputRect = input.getBoundingClientRect();
      var wrapRect = wrap.getBoundingClientRect();
      drop.style.position = 'absolute';
      drop.style.left = (inputRect.left - wrapRect.left) + 'px';
      drop.style.top = (inputRect.bottom - wrapRect.top + 2) + 'px';
      drop.style.minWidth = inputRect.width + 'px';
    }
    
    // Pick a suggestion
    function pick(item) {
      input.value = item.name;
      close();
      input.focus();
      
      // Trigger change event for form validation
      var event = new Event('change', { bubbles: true });
      input.dispatchEvent(event);
      
      // If there's a callback, call it
      if (options.onSelect) {
        options.onSelect(item);
      }
    }
    
    // Highlight active item
    function highlight(i) {
      if (!drop) return;
      var items = drop.querySelectorAll('.tag-ac-item');
      items.forEach(function(el, j) { 
        el.classList.toggle('active', j === i); 
      });
      active = i;
    }
    
    // Fetch people from API
    function fetchPeople(query, callback) {
      if (query.length < MIN_QUERY_LENGTH) {
        callback([]);
        return;
      }
      
      clearTimeout(timer);
      timer = setTimeout(function() {
        fetch('/api/people/autocomplete?q=' + encodeURIComponent(query))
          .then(function(r) { return r.json(); })
          .then(function(items) { 
            // Add "Create new" option if there are results and query doesn't match any
            const hasExactMatch = items.some(item => item.name.toLowerCase() === query.toLowerCase());
            if (!hasExactMatch && items.length > 0) {
              items.push({ id: '__new__', name: 'Create: "' + query + '"' });
            } else if (items.length === 0) {
              items.push({ id: '__new__', name: 'Create: "' + query + '"' });
            }
            callback(items);
          })
          .catch(function(err) { 
            console.error('[people-autocomplete] Fetch error:', err);
            callback([]);
          });
      }, 200); // 200ms debounce
    }
    
    // Handle input
    input.addEventListener('input', function() {
      var q = this.value.trim();
      if (!q) { close(); return; }
      fetchPeople(q, open);
    });
    
    // Handle keyboard navigation
    input.addEventListener('keydown', function(e) {
      if (!drop) return;
      var items = drop.querySelectorAll('.tag-ac-item');
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlight(Math.min(active + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlight(Math.max(active - 1, 0));
      } else if (e.key === 'Enter' && active >= 0) {
        e.preventDefault();
        var selectedItem = { name: items[active].textContent, id: items[active].dataset.id || items[active].textContent };
        if (selectedItem.id === '__new__') {
          // Keep the current value
          close();
        } else {
          pick(selectedItem);
        }
      } else if (e.key === 'Escape') {
        close();
      }
    });
    
    // Close on blur (with slight delay to allow click on dropdown)
    input.addEventListener('blur', function() {
      setTimeout(close, 150);
    });
    
    // Close when clicking outside
    document.addEventListener('click', function(e) {
      if (!wrap.contains(e.target)) {
        close();
      }
    });
    
    // Add special styling class to the input for targeting
    input.classList.add('people-autocomplete-input');
    wrap.classList.add('people-ac-wrap');
    
    // Add CSS for the dropdown
    if (!document.getElementById('people-autocomplete-css')) {
      var style = document.createElement('style');
      style.id = 'people-autocomplete-css';
      style.textContent = `
        .people-ac-wrap {
          position: relative;
        }
        .people-ac-wrap .tag-ac {
          position: absolute;
          background: var(--paper);
          border: 1px solid var(--border);
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 1000;
          max-height: 300px;
          overflow-y: auto;
        }
        .people-ac-wrap .tag-ac-item {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .people-ac-wrap .tag-ac-item:hover,
        .people-ac-wrap .tag-ac-item.active {
          background: var(--bg-light);
        }
        .people-ac-wrap .tag-ac-item.active {
          color: var(--accent);
        }
      `;
      document.head.appendChild(style);
    }
  }
  
  // Auto-initialize on inputs with data-people-autocomplete attribute
  function initAuto() {
    var inputs = document.querySelectorAll('input[data-people-autocomplete="true"]');
    inputs.forEach(function(input) {
      if (!input.classList.contains('people-autocomplete-initialized')) {
        initPeopleAutocomplete(input);
        input.classList.add('people-autocomplete-initialized');
      }
    });
  }
  
  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuto);
  } else {
    initAuto();
  }
  
  // Expose for manual initialization
  window.initPeopleAutocomplete = initPeopleAutocomplete;
})();
