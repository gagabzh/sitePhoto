function renderCombinatorScript(SECTIONS, DEFAULT_LOGIC, state) {
  return `<script>(function(){
      var SECTIONS=${JSON.stringify(SECTIONS)};
      var DEF_LOGIC=${JSON.stringify(DEFAULT_LOGIC)};
      var state=${JSON.stringify({sections:state.sections,sort:state.sort,view:state.view})};

      function qs(st){
        var p=[];
        SECTIONS.forEach(function(sec){
          var s=st.sections[sec];
          if(s.on.length) p.push(sec+'='+s.on.map(encodeURIComponent).join(','));
          if(s.not.length) p.push(sec+'.not='+s.not.map(encodeURIComponent).join(','));
          if((s.on.length||s.not.length)&&s.logic!==DEF_LOGIC[sec]) p.push('logic.'+sec+'='+s.logic);
        });
        p.push('sort='+st.sort,'view='+st.view);
        return p.join('&');
      }
      function e(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

      var timer=null;
      function schedule(){clearTimeout(timer);timer=setTimeout(go,150);}

      function go(){
        var q=qs(state);
        history.replaceState(null,'','/tags?'+q);
        updateBar();
        updateSaveBtn();
        var grid=document.getElementById('cb-grid');
        if(grid) grid.classList.add('cb-loading');
        Promise.all([
          fetch('/api/photos/combinator?'+q).then(function(r){return r.json();}),
          fetch('/api/tags/counts?'+q).then(function(r){return r.json();})
        ]).then(function(res){
          paintGrid(res[0]);
          paintCounts(res[1]);
        }).catch(function(){
          if(grid) grid.classList.remove('cb-loading');
        });
      }

      function paintGrid(data){
        var hasF=SECTIONS.some(function(s){return state.sections[s].on.length>0||state.sections[s].not.length>0;});
        var h3=document.querySelector('.cb-result-head h3');
        if(h3) h3.innerHTML='<em id="cb-count">'+(hasF?data.total:'')+'</em>'+(hasF?' photo'+(data.total!==1?'s':'')+' match.':'');
        var old=document.getElementById('cb-grid');
        var newG=document.createElement('div');
        newG.id='cb-grid';
        if(!hasF){
          newG.className='';
          newG.innerHTML='<div class="cb-no-filter">no filters yet — tick a tag on the left to begin.</div>';
        } else if(!data.photos.length){
          newG.className='';
          newG.innerHTML='<div class="cb-no-results">nothing matches this recipe yet. loosen a filter?</div>';
        } else {
          newG.className='cb-grid view-'+state.view;
          data.photos.forEach(function(p){
            var t=document.createElement('div');
            t.className='cb-tile'; t.dataset.id=p.id;
            if(state.view==='list'){
              t.innerHTML='<a href="/photos/'+p.id+'"><img src="/uploads/'+e(p.filename)+'" alt="'+e(p.title)+'" loading="lazy"></a>'+
                '<div class="cb-list-meta"><strong>'+e(p.title)+'</strong><small>by '+e(p.uploader)+'</small></div>';
            } else {
              t.innerHTML='<a href="/photos/'+p.id+'"><img src="/uploads/'+e(p.filename)+'" alt="'+e(p.title)+'" loading="lazy">'+
                '<div class="cb-tile-overlay">'+e(p.title)+'</div></a>';
            }
            newG.appendChild(t);
          });
        }
        if(old) old.parentNode.replaceChild(newG,old);
        else document.querySelector('.cb-main').appendChild(newG);
      }

      function paintCounts(counts){
        document.querySelectorAll('.cb-count[data-tag]').forEach(function(el){
          var c=counts[el.dataset.section];
          if(c&&c[el.dataset.tag]!==undefined) el.textContent=c[el.dataset.tag];
        });
      }

      function updateBar(){
        var el=document.getElementById('cb-pills'); if(!el) return;
        var pills=[]; var i=0;
        SECTIONS.forEach(function(sec){
          var s=state.sections[sec];
          s.on.forEach(function(tag){
            var op=i>0?'<span class="cb-pill-op">AND</span> ':'';
            pills.push(op+'<span class="cb-pill" data-tag="'+e(tag)+'" data-section="'+sec+'" data-state="on">'+e(tag)+'<button class="cb-pill-x">\xd7</button></span>');
            i++;
          });
          s.not.forEach(function(tag){
            var op=i>0?'<span class="cb-pill-op">AND NOT</span> ':'';
            pills.push(op+'<span class="cb-pill not" data-tag="'+e(tag)+'" data-section="'+sec+'" data-state="not">'+e(tag)+'<button class="cb-pill-x">\xd7</button></span>');
            i++;
          });
        });
        el.innerHTML=i?pills.join(' '):'<span class="cb-empty-hint">no filters yet — tick a tag on the left to begin.</span>';
      }

      function updateSaveBtn(){
        var hasF=!SECTIONS.some(function(s){return state.sections[s].on.length>0||state.sections[s].not.length>0;});
        var btn=document.getElementById('cb-save-btn'); if(btn) btn.disabled=hasF;
        var shr=document.getElementById('cb-share-btn'); if(shr) shr.disabled=hasF;
      }

      /* Update the section header live count */
      function updateSectionStatus(sec){
        var statusEl=document.querySelector('.cb-section-status[data-section="'+sec+'"]');
        if(!statusEl) return;
        var s=state.sections[sec];
        var onCount=s.on.length, notCount=s.not.length;
        var hasSel=onCount>0||notCount>0;
        var html;
        if(sec==='years'){
          html=notCount>0?'<span class="cb-status-on">'+notCount+'</span> excluded'
              :onCount>0?'<span class="cb-status-on">'+onCount+'</span> included'
              :'all years';
        } else {
          var rows=document.querySelectorAll('[data-list="'+sec+'"] .cb-row');
          var total=rows.length;
          var notPart=notCount>0?' · <span class="cb-status-not">'+notCount+'</span> off':'';
          html=hasSel?'<span class="cb-status-on">'+onCount+'</span> of '+total+' on'+notPart:'0 of '+total;
        }
        statusEl.innerHTML=html;
        var cl=statusEl.parentNode&&statusEl.parentNode.querySelector('.cb-clear');
        if(cl) cl.classList.toggle('visible',hasSel);
      }

      /* Move a row to/from the pinned block at the top of its section list */
      function pinTagRow(el,toActive){
        var list=document.querySelector('[data-list="'+el.dataset.section+'"]');
        if(!list) return;
        var sep=list.querySelector('.cb-pinned-sep');
        if(toActive){
          if(!sep){
            var firstUnsel=list.querySelector('.cb-row[data-state="off"]');
            if(firstUnsel){
              sep=document.createElement('hr');
              sep.className='cb-pinned-sep';
              list.insertBefore(sep,firstUnsel);
            }
          }
          if(sep) list.insertBefore(el,sep);
          else list.insertBefore(el,list.firstChild);
        } else {
          /* place el back into unselected block sorted by count desc */
          var count=parseInt(el.dataset.count,10)||0;
          var unsel=Array.from(list.querySelectorAll('.cb-row[data-state="off"]')).filter(function(r){return r!==el;});
          var ins=null;
          for(var i=0;i<unsel.length;i++){
            if((parseInt(unsel[i].dataset.count,10)||0)<count){ins=unsel[i];break;}
          }
          if(ins) list.insertBefore(el,ins);
          else list.appendChild(el);
          /* remove separator when no active rows remain */
          var stillActive=list.querySelector('.cb-row[data-state="on"],.cb-row[data-state="not"]');
          if(sep&&!stillActive) sep.remove();
        }
      }

      /* Three-state cycle: off → on → not → off; shift-click jumps to not */
      function toggleTag(el,forceNot){
        var tag=el.dataset.tag,sec=el.dataset.section,cur=el.dataset.state||'off',next;
        if(forceNot){
          next=cur==='not'?'off':'not';
        } else {
          next=cur==='off'?'on':cur==='on'?'not':'off';
        }
        var wasActive=(cur!=='off'),isActive=(next!=='off');
        el.dataset.state=next;
        var s=state.sections[sec];
        s.on=s.on.filter(function(t){return t!==tag;});
        s.not=s.not.filter(function(t){return t!==tag;});
        if(next==='on') s.on.push(tag);
        if(next==='not') s.not.push(tag);
        if(el.classList.contains('cb-row')){
          if(!wasActive&&isActive) pinTagRow(el,true);
          else if(wasActive&&!isActive) pinTagRow(el,false);
        }
        updateSectionStatus(sec);
        schedule();
      }

      document.addEventListener('click',function(e){
        var el=e.target.closest&&e.target.closest('[data-tag][data-section]');
        if(el&&(el.classList.contains('cb-row')||el.classList.contains('cb-chip'))){
          e.preventDefault(); toggleTag(el,e.shiftKey); return;
        }
        if(e.target.classList.contains('cb-pill-x')){
          var pill=e.target.closest('.cb-pill'); if(!pill) return;
          var tag=pill.dataset.tag,sec=pill.dataset.section,s=state.sections[sec];
          s.on=s.on.filter(function(t){return t!==tag;});
          s.not=s.not.filter(function(t){return t!==tag;});
          /* sync sidebar row state and move it back to unselected block */
          var rowEl=document.querySelector('.cb-row[data-section="'+sec+'"][data-tag="'+CSS.escape(tag)+'"]');
          if(rowEl){ rowEl.dataset.state='off'; pinTagRow(rowEl,false); }
          var chipEl=document.querySelector('.cb-chip[data-section="'+sec+'"][data-tag="'+CSS.escape(tag)+'"]');
          if(chipEl) chipEl.dataset.state='off';
          updateSectionStatus(sec);
          schedule(); return;
        }
        if(e.target.classList.contains('cb-clear')){
          e.preventDefault();
          var sec=e.target.dataset.section,s=state.sections[sec];
          s.on=[];s.not=[];
          var list=document.querySelector('[data-list="'+sec+'"]');
          if(list){
            var listSep=list.querySelector('.cb-pinned-sep');
            if(listSep) listSep.remove();
            /* reset all rows and re-sort by count desc */
            var rows=Array.from(list.querySelectorAll('.cb-row'));
            rows.forEach(function(r){r.dataset.state='off';});
            rows.sort(function(a,b){return (parseInt(b.dataset.count,10)||0)-(parseInt(a.dataset.count,10)||0);});
            rows.forEach(function(r){list.appendChild(r);});
          }
          /* reset chips */
          document.querySelectorAll('.cb-chip[data-section="'+sec+'"]').forEach(function(c){c.dataset.state='off';});
          updateSectionStatus(sec);
          schedule(); return;
        }
      });

      document.querySelectorAll('.cb-logic').forEach(function(lg){
        var sec=lg.dataset.section;
        lg.querySelectorAll('.cb-logic-btn').forEach(function(btn){
          btn.addEventListener('click',function(){
            state.sections[sec].logic=btn.dataset.logic;
            lg.querySelectorAll('.cb-logic-btn').forEach(function(b){b.classList.toggle('active',b===btn);});
            schedule();
          });
        });
      });

      document.getElementById('cb-sort').addEventListener('change',function(){state.sort=this.value;schedule();});
      document.getElementById('cb-view').addEventListener('change',function(){state.view=this.value;schedule();});

      document.querySelectorAll('.cb-search').forEach(function(inp){
        inp.addEventListener('input',function(){
          var q=this.value.toLowerCase(),sec=this.dataset.section;
          var list=document.querySelector('[data-list="'+sec+'"]');
          if(!list) return;
          list.querySelectorAll('.cb-row').forEach(function(row){
            var matches=row.dataset.tag.toLowerCase().indexOf(q)!==-1;
            var isActive=row.dataset.state!=='off';
            row.hidden=q.length>0&&!matches&&!isActive;
          });
          /* hide separator if no visible unselected rows */
          var sep=list.querySelector('.cb-pinned-sep');
          if(sep){
            var hasVisibleUnsel=Array.from(list.querySelectorAll('.cb-row[data-state="off"]')).some(function(r){return !r.hidden;});
            sep.hidden=!hasVisibleUnsel;
          }
        });
      });

      /* save dialog */
      function openDlg(){document.getElementById('cb-dialog').classList.add('open');document.getElementById('cb-recipe-name').value='';document.getElementById('cb-recipe-name').focus();}
      function closeDlg(){document.getElementById('cb-dialog').classList.remove('open');}
      document.getElementById('cb-open-save').addEventListener('click',openDlg);
      document.getElementById('cb-save-btn').addEventListener('click',function(){if(!this.disabled)openDlg();});
      document.getElementById('cb-dialog-cancel').addEventListener('click',closeDlg);
      document.getElementById('cb-dialog').addEventListener('click',function(e){if(e.target===this)closeDlg();});
      document.getElementById('cb-dialog-save').addEventListener('click',function(){
        var name=document.getElementById('cb-recipe-name').value.trim();
        if(!name) return;
        closeDlg();
        fetch('/api/recipes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name,query:state})})
          .then(function(r){return r.json();}).then(function(d){
            if(!d.id) return;
            var row=document.createElement('div');
            row.className='cb-recipe-row';row.dataset.id=d.id;row.dataset.query=JSON.stringify(state);
            row.innerHTML='★ <span class="cb-recipe-n">'+e(name)+'</span>'
              +'<button class="cb-recipe-album" data-recipe-id="'+d.id+'" title="Create album" aria-label="Create album">📁</button>'
              +'<button class="cb-recipe-del">\xd7</button>';
            bindRow(row);
            document.getElementById('cb-open-save').insertAdjacentElement('beforebegin',row);
          });
      });
      document.addEventListener('keydown',function(e){
        if(e.key==='Escape'){closeDlg();closeAlbumDlg();}
        if(e.key==='/'&&document.activeElement.tagName!=='INPUT'){e.preventDefault();var f=document.querySelector('.cb-search');if(f)f.focus();}
      });

      /* album dialog */
      var _albumRecipeId=null;
      function openAlbumDlg(recipeId){
        _albumRecipeId=recipeId;
        document.getElementById('cb-album-dialog').classList.add('open');
        document.getElementById('cb-album-name').value='';
        document.getElementById('cb-album-name').focus();
      }
      function closeAlbumDlg(){document.getElementById('cb-album-dialog').classList.remove('open');}
      document.getElementById('cb-album-dialog-cancel').addEventListener('click',closeAlbumDlg);
      document.getElementById('cb-album-dialog').addEventListener('click',function(e){if(e.target===this)closeAlbumDlg();});
      document.getElementById('cb-album-dialog-create').addEventListener('click',function(){
        var name=document.getElementById('cb-album-name').value.trim();
        if(!name||!_albumRecipeId) return;
        closeAlbumDlg();
        fetch('/api/recipes/'+_albumRecipeId+'/album',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name})})
          .then(function(r){return r.json();})
          .then(function(d){if(d.id) location.href='/albums/'+d.id;})
          .catch(function(){showToast('failed to create album');});
      });
      document.getElementById('cb-album-name').addEventListener('keydown',function(e){
        if(e.key==='Enter') document.getElementById('cb-album-dialog-create').click();
      });

      function bindRow(row){
        row.addEventListener('click',function(e2){
          if(e2.target.classList.contains('cb-recipe-del')){
            fetch('/api/recipes/'+row.dataset.id,{method:'DELETE'}).then(function(r){if(r.status===204)row.remove();});
            return;
          }
          if(e2.target.classList.contains('cb-recipe-album')){
            e2.stopPropagation();
            openAlbumDlg(row.dataset.id);
            return;
          }
          var q=JSON.parse(row.dataset.query);
          if(q.sections) SECTIONS.forEach(function(s){if(q.sections[s])state.sections[s]=q.sections[s];});
          if(q.sort) state.sort=q.sort;
          if(q.view) state.view=q.view;
          SECTIONS.forEach(function(s){
            var ss=state.sections[s],onS=new Set(ss.on),notS=new Set(ss.not);
            document.querySelectorAll('[data-section="'+s+'"][data-tag]').forEach(function(el){
              el.dataset.state=onS.has(el.dataset.tag)?'on':notS.has(el.dataset.tag)?'not':'off';
            });
            document.querySelectorAll('.cb-logic[data-section="'+s+'"] .cb-logic-btn').forEach(function(b){
              b.classList.toggle('active',b.dataset.logic===ss.logic);
            });
            updateSectionStatus(s);
            /* re-pin rows to match loaded recipe */
            var list=document.querySelector('[data-list="'+s+'"]');
            if(list){
              var listSep=list.querySelector('.cb-pinned-sep');
              if(listSep) listSep.remove();
              var allRows=Array.from(list.querySelectorAll('.cb-row'));
              var pinned=allRows.filter(function(r){return r.dataset.state!=='off';});
              var unpinned=allRows.filter(function(r){return r.dataset.state==='off';});
              unpinned.sort(function(a,b){return (parseInt(b.dataset.count,10)||0)-(parseInt(a.dataset.count,10)||0);});
              pinned.forEach(function(r){list.insertBefore(r,list.firstChild);});
              if(pinned.length>0&&unpinned.length>0){
                var newSep=document.createElement('hr');newSep.className='cb-pinned-sep';
                list.insertBefore(newSep,unpinned[0]);
              }
            }
          });
          var so=document.getElementById('cb-sort'),vi=document.getElementById('cb-view');
          if(so)so.value=state.sort; if(vi)vi.value=state.view;
          go();
        });
      }
      document.querySelectorAll('.cb-recipe-row').forEach(bindRow);

      /* mobile: collapsible sections — inactive ones start collapsed */
      if (window.innerWidth <= 900) {
        document.querySelectorAll('.cb-section').forEach(function(secEl) {
          var sec = secEl.dataset.section;
          var hasActive = state.sections[sec].on.length > 0 || state.sections[sec].not.length > 0;
          if (!hasActive) secEl.classList.add('cb-collapsed');
          secEl.querySelector('.cb-section-head').addEventListener('click', function(ev) {
            if (ev.target.closest('.cb-clear')) return;
            secEl.classList.toggle('cb-collapsed');
          });
        });
      }

      /* share current filter (recipe bar) */
      function showToast(msg){
        var t=document.getElementById('cb-toast');
        if(!t){t=document.createElement('div');t.id='cb-toast';t.className='tm-toast';document.body.appendChild(t);}
        t.textContent=msg;t.classList.add('show');setTimeout(function(){t.classList.remove('show');},2200);
      }
      var shrBtn=document.getElementById('cb-share-btn');
      if(shrBtn) shrBtn.addEventListener('click',function(){
        if(this.disabled) return;
        var link=location.href.replace(/[?&]_shared=[^&]*/,'');
        if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){showToast('link copied ✓');});}
        else{prompt('share link:',link);}
      });

      /* share button on sidebar recipe rows */
      document.addEventListener('click',function(ev){
        var btn=ev.target.closest('.cb-recipe-share');
        if(!btn) return;
        ev.stopPropagation();
        var id=btn.dataset.shareId;
        fetch('/api/recipes/'+id+'/share',{method:'POST'})
          .then(function(r){return r.json();})
          .then(function(d){
            if(!d.token) return;
            var link=location.origin+'/tags/recipes/fork/'+d.token;
            if(navigator.clipboard){navigator.clipboard.writeText(link).then(function(){showToast('link copied ✓');});}
            else{prompt('share link:',link);}
          });
      });

      /* fork banner: add shared recipe to my collection */
      var forkBtn=document.querySelector('.cb-banner-fork');
      if(forkBtn) forkBtn.addEventListener('click',function(){
        this.disabled=true;
        var token=this.dataset.token;
        fetch('/api/recipes/fork/'+token,{method:'POST'})
          .then(function(r){return r.json();})
          .then(function(d){
            if(d.id){showToast('added to my recipes ✓');setTimeout(function(){location.href='/tags/recipes';},900);}
          });
      });
    })();</script>`;
}

module.exports = { renderCombinatorScript };
