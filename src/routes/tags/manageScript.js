function renderManageScript(editTag) {
  return `<script>(function(){
    var selectedIds = new Set();

    function e(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function showToast(msg){
      var t=document.getElementById('tm-toast');
      t.textContent=msg||'saved ✓';
      t.classList.add('show');
      setTimeout(function(){t.classList.remove('show');},2000);
    }

    function updateBulkBar(){
      var bar=document.getElementById('tm-bulk');
      var n=document.getElementById('tm-sel-n');
      if(n) n.textContent=selectedIds.size;
      if(bar) bar.classList.toggle('show', selectedIds.size>0);
    }

    // Checkbox selection
    document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){
      ck.addEventListener('change',function(){
        if(this.checked) selectedIds.add(String(this.dataset.id));
        else selectedIds.delete(String(this.dataset.id));
        var row=this.closest('tr');
        if(row) row.classList.toggle('sel',this.checked);
        updateBulkBar();
      });
    });

    var ckAll=document.getElementById('tm-ck-all');
    if(ckAll){
      ckAll.addEventListener('change',function(){
        document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){
          ck.checked=ckAll.checked;
          var row=ck.closest('tr');
          if(row) row.classList.toggle('sel',ckAll.checked);
          if(ckAll.checked) selectedIds.add(String(ck.dataset.id));
          else selectedIds.delete(String(ck.dataset.id));
        });
        updateBulkBar();
      });
    }

    document.addEventListener('keydown',function(ev){
      if(ev.key==='Escape'){
        selectedIds.clear();
        document.querySelectorAll('.tm-ck[data-id]').forEach(function(ck){ck.checked=false;ck.closest('tr')&&ck.closest('tr').classList.remove('sel');});
        if(ckAll) ckAll.checked=false;
        updateBulkBar();
        closeDrawer();
      }
    });

    // ── Drawer ────────────────────────────────────────────────────────────────
    var drawer=document.getElementById('tm-drawer');
    var drawerClose=document.getElementById('tm-drawer-close');
    var backdrop=document.getElementById('tm-backdrop');

    function updateAiSection(category){
      var aiSection=document.getElementById('tm-dr-ai-section');
      if(aiSection) aiSection.style.display=category==='people'?'':'none';
      resetAiPicker();
    }

    function resetAiPicker(){
      var grid=document.getElementById('tm-dr-ai-grid');
      var genBtn=document.getElementById('tm-dr-ai-gen');
      if(grid){grid.innerHTML='';grid.style.display='none';}
      if(genBtn) genBtn.style.display='none';
      selectedPhotoIds=[];
    }

    var selectedPhotoIds=[];

    var aiPickBtn=document.getElementById('tm-dr-ai-pick');
    if(aiPickBtn){
      aiPickBtn.addEventListener('click',function(){
        var id=drawer&&drawer.dataset.id;
        if(!id) return;
        resetAiPicker();
        aiPickBtn.textContent='loading…';
        fetch('/api/tags/'+id+'/photos').then(function(r){return r.json();}).then(function(photos){
          aiPickBtn.textContent='✦ pick photos to describe';
          var grid=document.getElementById('tm-dr-ai-grid');
          var genBtn=document.getElementById('tm-dr-ai-gen');
          if(!grid) return;
          if(!photos.length){grid.innerHTML='<span style="font-family:Kalam,cursive;font-size:12px;color:var(--ink-faint);">no photos tagged yet</span>';grid.style.display='flex';return;}
          photos.forEach(function(p){
            var wrap=document.createElement('div');
            wrap.style.cssText='position:relative;width:56px;height:56px;cursor:pointer;border:2px solid transparent;border-radius:4px;overflow:hidden;flex-shrink:0;';
            var img=document.createElement('img');
            img.src='/uploads/'+p.filename;
            img.style.cssText='width:100%;height:100%;object-fit:cover;';
            img.title=p.title||'';
            var check=document.createElement('div');
            check.style.cssText='display:none;position:absolute;inset:0;background:rgba(0,0,0,0.4);align-items:center;justify-content:center;font-size:20px;color:#fff;';
            check.textContent='✓';
            wrap.appendChild(img);
            wrap.appendChild(check);
            wrap.addEventListener('click',function(){
              var idx=selectedPhotoIds.indexOf(p.id);
              if(idx===-1){
                selectedPhotoIds.push(p.id);
                wrap.style.borderColor='var(--accent)';
                check.style.display='flex';
              } else {
                selectedPhotoIds.splice(idx,1);
                wrap.style.borderColor='transparent';
                check.style.display='none';
              }
              if(genBtn) genBtn.style.display=selectedPhotoIds.length?'':'none';
            });
            grid.appendChild(wrap);
          });
          grid.style.display='flex';
        }).catch(function(){aiPickBtn.textContent='✦ pick photos to describe';});
      });
    }

    var aiGenBtn=document.getElementById('tm-dr-ai-gen');
    if(aiGenBtn){
      aiGenBtn.addEventListener('click',function(){
        var id=drawer&&drawer.dataset.id;
        if(!id||!selectedPhotoIds.length) return;
        aiGenBtn.textContent='generating…';
        aiGenBtn.disabled=true;
        fetch('/api/ai/describe-person',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tagId:parseInt(id),photoIds:selectedPhotoIds})})
          .then(function(r){return r.json();}).then(function(d){
            aiGenBtn.textContent='Generate description';
            aiGenBtn.disabled=false;
            if(d.error){showToast('AI error: '+d.error);return;}
            var descEl=document.getElementById('tm-dr-desc');
            if(descEl&&d.description){descEl.value=d.description;showToast('description generated ✓');}
          }).catch(function(){aiGenBtn.textContent='Generate description';aiGenBtn.disabled=false;showToast('network error');});
      });
    }

    function openDrawer(id){
      if(!drawer) return;
      var url=new URL(window.location.href);
      url.searchParams.set('edit',id);
      history.replaceState(null,'',url.toString());
      fetch('/api/tags/'+id+'/detail').then(function(r){return r.json();}).then(function(t){
        drawer.dataset.id=t.id;
        var titleEl=document.getElementById('tm-dr-title');
        var nameEl=document.getElementById('tm-dr-name');
        var kindEl=document.getElementById('tm-dr-kind');
        var descEl=document.getElementById('tm-dr-desc');
        if(titleEl) titleEl.textContent='#'+t.name;
        if(nameEl)  nameEl.value=t.name;
        if(kindEl)  kindEl.value=t.category||'';
        if(descEl)  descEl.value=t.description||'';
        renderAliasPills(t.aliases||[]);
        updateAiSection(t.category||'');
        drawer.classList.add('open');
        if(backdrop) backdrop.classList.add('show');
      }).catch(function(){
        drawer.classList.add('open');
        if(backdrop) backdrop.classList.add('show');
      });
    }

    function closeDrawer(){
      if(!drawer) return;
      drawer.classList.remove('open');
      if(backdrop) backdrop.classList.remove('show');
      var url=new URL(window.location.href);
      url.searchParams.delete('edit');
      history.replaceState(null,'',url.toString());
    }

    if(drawerClose) drawerClose.addEventListener('click', closeDrawer);
    if(backdrop) backdrop.addEventListener('click', closeDrawer);

    var saveBtn=document.getElementById('tm-dr-save');
    if(saveBtn) saveBtn.addEventListener('click', function(){
      doSave().then(function(){ location.reload(); });
    });

    var kindSelectEl=document.getElementById('tm-dr-kind');
    if(kindSelectEl){
      kindSelectEl.addEventListener('change',function(){
        updateAiSection(this.value);
      });
    }

    // Open drawer from row
    document.querySelectorAll('[data-edit]').forEach(function(el){
      el.addEventListener('click',function(ev){
        ev.preventDefault();
        openDrawer(this.dataset.edit);
      });
    });

    function doSave(){
      var id=drawer&&drawer.dataset.id;
      if(!id) return;
      var nameEl=document.getElementById('tm-dr-name');
      var kindEl=document.getElementById('tm-dr-kind');
      var descEl=document.getElementById('tm-dr-desc');
      var body={};
      if(nameEl) body.name=nameEl.value;
      if(kindEl) body.category=kindEl.value||null;
      if(descEl) body.description=descEl.value;
      body.aliases=currentAliases;
      return fetch('/api/tags/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
        .then(function(r){ if(r.ok) showToast('saved ✓'); });
    }

    // ── Alias pills ───────────────────────────────────────────────────────────
    var currentAliases=(${JSON.stringify((editTag && editTag.aliases) || [])}).slice();

    function renderAliasPills(aliases){
      currentAliases=aliases.slice();
      var container=document.getElementById('tm-alias-pills');
      if(!container) return;
      var addBtn=document.getElementById('tm-alias-add');
      container.innerHTML='';
      aliases.forEach(function(a){
        var sp=document.createElement('span');
        sp.className='tm-alias-pill';
        sp.innerHTML=e(a)+'<button type="button" class="tm-alias-rm" data-alias="'+e(a)+'" aria-label="Remove">×</button>';
        container.appendChild(sp);
      });
      container.appendChild(addBtn||createAddBtn());
    }

    function createAddBtn(){
      var btn=document.createElement('button');
      btn.type='button'; btn.className='tm-alias-add'; btn.id='tm-alias-add';
      btn.textContent='+ add';
      btn.addEventListener('click',showAliasInput);
      return btn;
    }

    function showAliasInput(){
      var inp=document.getElementById('tm-alias-input');
      if(!inp) return;
      inp.style.display='';
      inp.focus();
    }

    var aliasInput=document.getElementById('tm-alias-input');
    if(aliasInput){
      aliasInput.addEventListener('keydown',function(ev){
        if(ev.key==='Enter'){ev.preventDefault();commitAlias();}
        if(ev.key==='Escape'){this.value='';this.style.display='none';}
      });
      aliasInput.addEventListener('blur',function(){
        if(this.value.trim()) commitAlias();
        else this.style.display='none';
      });
    }

    function commitAlias(){
      var inp=document.getElementById('tm-alias-input');
      if(!inp) return;
      var val=inp.value.trim().toLowerCase();
      inp.value='';inp.style.display='none';
      if(!val||currentAliases.includes(val)) return;
      currentAliases.push(val);
      renderAliasPills(currentAliases);
      doSave();
    }

    document.addEventListener('click',function(ev){
      if(ev.target.classList.contains('tm-alias-rm')){
        var a=ev.target.dataset.alias;
        currentAliases=currentAliases.filter(function(x){return x!==a;});
        renderAliasPills(currentAliases);
        doSave();
      }
      var addBtn=ev.target.closest('#tm-alias-add');
      if(addBtn) showAliasInput();
    });

    // ── Delete row action ─────────────────────────────────────────────────────
    document.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click',function(){
        var id=this.dataset.id||this.dataset.del;
        var name=this.dataset.name||'this tag';
        if(!confirm('delete tag "'+name+'"? this cannot be undone.')) return;
        fetch('/api/tags/'+id,{method:'DELETE'}).then(function(r){
          if(r.status===204||r.ok){
            var row=document.querySelector('tr[data-id="'+id+'"]');
            if(row) row.remove();
            showToast('deleted');
          }
        });
      });
    });

    // ── Bulk delete ───────────────────────────────────────────────────────────
    var bulkDel=document.getElementById('tm-bulk-delete');
    if(bulkDel){
      bulkDel.addEventListener('click',function(){
        if(!selectedIds.size) return;
        if(!confirm('delete '+selectedIds.size+' tag(s)? this cannot be undone.')) return;
        var ids=Array.from(selectedIds);
        Promise.all(ids.map(function(id){return fetch('/api/tags/'+id,{method:'DELETE'});}))
          .then(function(){
            ids.forEach(function(id){
              var row=document.querySelector('tr[data-id="'+id+'"]');
              if(row) row.remove();
            });
            selectedIds.clear();
            updateBulkBar();
            showToast('deleted '+ids.length+' tag(s)');
          });
      });
    }

    // ── Bulk merge ────────────────────────────────────────────────────────────
    var mergeModal=document.getElementById('tm-merge-modal');
    var mergeCancel=document.getElementById('tm-merge-cancel');
    var mergeConfirm=document.getElementById('tm-merge-confirm');
    var mergeOptions=document.getElementById('tm-merge-options');
    var mergeTarget=null;

    var bulkMerge=document.getElementById('tm-bulk-merge');
    if(bulkMerge){
      bulkMerge.addEventListener('click',function(){
        if(selectedIds.size<2){alert('select at least 2 tags to merge.');return;}
        mergeOptions.innerHTML='';
        mergeTarget=null;
        selectedIds.forEach(function(id){
          var row=document.querySelector('tr[data-id="'+id+'"]');
          var name=row?row.querySelector('.tm-name').textContent.replace(/^#/,'').trim():id;
          var lbl=document.createElement('label');
          lbl.style.cssText='display:flex;gap:8px;align-items:center;font-family:Kalam,cursive;font-size:14px;cursor:pointer;';
          var radio=document.createElement('input');
          radio.type='radio';radio.name='merge-target';radio.value=id;
          radio.addEventListener('change',function(){mergeTarget=id;});
          lbl.appendChild(radio);
          lbl.appendChild(document.createTextNode('#'+name));
          mergeOptions.appendChild(lbl);
        });
        mergeModal.style.display='flex';
      });
    }

    if(mergeCancel) mergeCancel.addEventListener('click',function(){mergeModal.style.display='none';});
    if(mergeConfirm){
      mergeConfirm.addEventListener('click',function(){
        if(!mergeTarget){alert('pick a canonical tag.');return;}
        var sources=Array.from(selectedIds).filter(function(id){return id!==mergeTarget;});
        fetch('/api/tags/merge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetId:parseInt(mergeTarget),sourceIds:sources.map(Number)})})
          .then(function(r){return r.json();}).then(function(){
            mergeModal.style.display='none';
            selectedIds.clear();
            updateBulkBar();
            showToast('merged!');
            setTimeout(function(){location.reload();},800);
          });
      });
    }

    // ── New tag modal ─────────────────────────────────────────────────────────
    var newModal=document.getElementById('tm-new-modal');
    var newBtn=document.getElementById('tm-new-btn');
    var newCancel=document.getElementById('tm-new-cancel');
    var newSave=document.getElementById('tm-new-save');

    if(newBtn) newBtn.addEventListener('click',function(){newModal.style.display='flex';document.getElementById('tm-new-name').focus();});
    if(newCancel) newCancel.addEventListener('click',function(){newModal.style.display='none';});
    if(newSave){
      newSave.addEventListener('click',function(){
        var name=document.getElementById('tm-new-name').value.trim();
        var kind=document.getElementById('tm-new-kind').value;
        if(!name){alert('name required');return;}
        fetch('/api/tags',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,category:kind||null})})
          .then(function(r){return r.json();}).then(function(d){
            if(d.error){alert(d.error);return;}
            newModal.style.display='none';
            showToast('tag created!');
            setTimeout(function(){location.reload();},600);
          });
      });
    }

    // ── Open drawer if edit param ─────────────────────────────────────────────
    ${editTag ? `drawer && drawer.classList.add('open'); backdrop && backdrop.classList.add('show');` : ''}

  })();</script>`;
}

module.exports = { renderManageScript };
