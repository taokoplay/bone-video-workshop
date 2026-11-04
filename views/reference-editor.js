/* Inline reference editor. Persistence and provider execution belong to the caller. */
(() => {
  'use strict';
  const textNode = text => ({type:'text',text});
  const roles = {identity:'角色参考',scene:'场景参考',prop:'道具参考',style:'风格参考','first-frame':'视频首帧','last-frame':'视频尾帧'};
  let instance=0;
  function create({document: initial, assets, media, onChange, label='镜头正文与图片引用', placeholder='输入正文，使用 @ 选择资产'}) {
    const host = document.createElement('div'); host.className='reference-editor';
    const editor = document.createElement('div'); editor.className='rich-editor control';
    editor.contentEditable='true'; editor.setAttribute('role','textbox'); editor.setAttribute('aria-label',label); editor.setAttribute('aria-multiline','true');
    editor.setAttribute('data-placeholder',placeholder);
    const hint = document.createElement('p'); hint.className='hint'; hint.textContent='输入 @ 关联资产 · 悬停查看图片 · 点击引用更换图片或用途';
    host.append(editor,hint);
    const tokens = new Map(); let counter=0, picker=null, captured=null, replaceToken=null, selected=0, choices=[], activeRole=null;
    let composing=false, alive=true;
    let preview=null, previewTarget=null, previewTimer;
    const previewId='reference-preview-'+(++instance);
    const optionPrefix=previewId+'-option-';
    const asset = id => assets.find(a=>a.id===id);
    const image = id => media.find(m=>m.id===id);
    const category = a => ({'角色':'identity','场景':'scene','道具':'prop','产品':'prop','风格':'style'})[a?.type] || ({character:'identity',scene:'scene',prop:'prop',style:'style'})[a?.kind] || null;
    const defaultRole = a => category(a)||'identity';
    function normalize(nodes) {
      const merged=[];
      for (const n of nodes) {
        if (n.type==='text') {
          if (!n.text) continue;
          if (merged.at(-1)?.type==='text') merged.at(-1).text+=n.text; else merged.push({...n});
        } else merged.push({...n});
      }
      return {schemaVersion:1,nodes:merged};
    }
    function readTree(root) {
      const nodes=[];
      function visit(n) {
        if(n.nodeType===Node.TEXT_NODE){nodes.push(textNode(n.textContent));return;}
        if(n.nodeType!==Node.ELEMENT_NODE&&n.nodeType!==Node.DOCUMENT_FRAGMENT_NODE)return;
        if(n.nodeType===Node.ELEMENT_NODE&&n.dataset?.mentionKey){
          const value=tokens.get(n.dataset.mentionKey);
          if(value)nodes.push({...value}); else nodes.push(textNode(n.textContent));
          return;
        }
        if(n.nodeName==='BR'){nodes.push(textNode('\n'));return;}
        const block=['DIV','P'].includes(n.nodeName)&&n!==root;
        if(block&&nodes.length&&!(nodes.at(-1)?.text||'').endsWith('\n'))nodes.push(textNode('\n'));
        n.childNodes.forEach(visit);
      }
      visit(root);return normalize(nodes);
    }
    function getDocument(){return editor.textContent?readTree(editor):{schemaVersion:1,nodes:[]};}
    function emit(){closePreview();if(alive)onChange(getDocument());}
    function token(node) {
      const key='mention-'+(++counter);tokens.set(key,{...node});
      const a=asset(node.assetId),m=image(node.mediaId);
      const chip=document.createElement('span'); chip.className='reference-token '+(a?.kind||'missing'); chip.contentEditable='false';chip.dataset.mentionKey=key;
      chip.setAttribute('role','button');chip.tabIndex=0;chip.setAttribute('aria-label',`更换引用 ${a?.name||'资产缺失'} · ${m?.title||'图片缺失'}`);
      chip.textContent='@'+(a?.name||'资产缺失');
      return chip;
    }
    function appendNodes(fragment,nodes){nodes.forEach(n=>fragment.append(n.type==='text'?document.createTextNode(n.text):token(n)));}
    appendNodes(editor,initial.nodes);
    function closePicker(){picker?.remove();picker=null;captured=null;replaceToken=null;editor.removeAttribute('aria-activedescendant');}
    function caretAfter(n){const range=document.createRange();range.setStartAfter(n);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);}
    function pickerBounds() {
      if(replaceToken?.isConnected)return replaceToken.getBoundingClientRect();
      if(!captured)return null;
      const caret=captured.cloneRange();caret.collapse(false);
      const rect=caret.getClientRects()[0];
      if(rect?.height)return rect;
      const end=captured.endContainer,offset=captured.endOffset;
      if(end.nodeType===Node.TEXT_NODE&&offset>0){
        caret.setStart(end,offset-1);caret.setEnd(end,offset);
        const last=[...caret.getClientRects()].at(-1);
        if(last?.height)return {left:last.right,right:last.right,top:last.top,bottom:last.bottom,height:last.height};
      }
      return null;
    }
    function placePicker() {
      if(!picker)return;
      const bounds=pickerBounds();if(!bounds){closePicker();return;}
      let top=0,bottom=innerHeight,left=0,right=innerWidth;
      for(let parent=editor;parent;parent=parent.parentElement){
        const style=getComputedStyle(parent),rect=parent.getBoundingClientRect();
        if(/auto|scroll|hidden|clip/.test(style.overflowY)){top=Math.max(top,rect.top);bottom=Math.min(bottom,rect.bottom);}
        if(/auto|scroll|hidden|clip/.test(style.overflowX)){left=Math.max(left,rect.left);right=Math.min(right,rect.right);}
      }
      if(bounds.bottom<=top||bounds.top>=bottom||bounds.right<left||bounds.left>right){closePicker();return;}
      picker.style.maxHeight='';
      const below=innerHeight-bounds.bottom-14,above=bounds.top-14;
      const preferBelow=below>=picker.getBoundingClientRect().height||below>=above;
      picker.style.maxHeight=Math.min(parseFloat(getComputedStyle(picker).maxHeight)||innerHeight,Math.max(0,preferBelow?below:above))+'px';
      const box=picker.getBoundingClientRect();
      picker.style.left=Math.max(8,Math.min(bounds.left,innerWidth-box.width-8))+'px';
      picker.style.top=Math.max(8,Math.min(preferBelow?bounds.bottom+6:bounds.top-box.height-6,innerHeight-box.height-8))+'px';
    }
    function closePreview() {
      clearTimeout(previewTimer);previewTarget?.removeAttribute('aria-describedby');
      preview?.remove();preview=null;previewTarget=null;
    }
    function showPreview(chip) {
      clearTimeout(previewTimer);
      if(!alive||picker||composing||previewTarget===chip)return;
      const value=tokens.get(chip.dataset.mentionKey);if(!value)return;
      closePreview();previewTarget=chip;
      const a=asset(value.assetId),m=media.find(item=>item.id===value.mediaId&&item.assetId===value.assetId);
      preview=document.createElement('div');preview.className='reference-preview';preview.id=previewId;preview.setAttribute('role','tooltip');
      if(m?.src){const img=document.createElement('img');img.src=m.src;img.alt=a?.name||'参考图';preview.append(img);}
      const name=document.createElement('strong');name.textContent=(a?.name||'资产缺失')+' · '+(m?.variant||'图片缺失');
      const detail=document.createElement('p');detail.textContent=[m?.title,roles[value.role]||'用途缺失'].filter(Boolean).join(' · ');
      preview.append(name,detail);host.append(preview);chip.setAttribute('aria-describedby',previewId);
      const bounds=chip.getBoundingClientRect(),box=preview.getBoundingClientRect();
      preview.style.left=Math.max(8,Math.min(bounds.left,innerWidth-box.width-8))+'px';
      preview.style.top=Math.max(8,Math.min(bounds.bottom+box.height+8>innerHeight?bounds.top-box.height-6:bounds.bottom+6,innerHeight-box.height-8))+'px';
    }
    host.addEventListener('pointerover',e=>{
      if(preview?.contains(e.target)){clearTimeout(previewTimer);return;}
      const chip=e.target.closest('[data-mention-key]');if(chip&&editor.contains(chip))showPreview(chip);
    });
    host.addEventListener('pointerout',e=>{
      if(preview&&(preview.contains(e.relatedTarget)||previewTarget?.contains(e.relatedTarget)))return;
      clearTimeout(previewTimer);previewTimer=setTimeout(closePreview,120);
    });
    editor.addEventListener('focusin',e=>{const chip=e.target.closest('[data-mention-key]');if(chip)showPreview(chip);});
    editor.addEventListener('focusout',closePreview);
    host.addEventListener('focusout',e=>{if(e.relatedTarget&&!host.contains(e.relatedTarget)){closePreview();closePicker();}});
    function choose(m) {
      const a=asset(m.assetId); if(!a)return;
      const role=activeRole||defaultRole(a);
      const chip=token({type:'reference',assetId:a.id,mediaId:m.id,role});
      if(replaceToken?.isConnected)replaceToken.replaceWith(chip);
      else if(captured){captured.deleteContents();captured.insertNode(chip);} else return;
      closePicker();editor.focus();caretAfter(chip);emit();
    }
    function showPicker(query,range,replacing=null) {
      const continuing=picker&&range&&captured&&!replacing&&range.startContainer===captured.startContainer&&range.startOffset===captured.startOffset;
      const retainedRole=continuing?activeRole:null;
      closePreview();closePicker();captured=range;replaceToken=replacing;
      const previous=replacing?tokens.get(replacing.dataset.mentionKey):null;
      activeRole=previous?.role||retainedRole;
      picker=document.createElement('div');picker.className='reference-picker';picker.setAttribute('aria-label','选择图片引用');
      const heading=document.createElement('div');heading.className='mention-title';heading.textContent=replacing?'更换图片 · 保留引用位置':'选择关联资产 · ↑↓ 选择 · Enter 插入';picker.append(heading);
      const tabs=document.createElement('div');tabs.className='picker-role-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','引用用途');
      const panel=document.createElement('div');panel.id=previewId+'-role-panel';panel.setAttribute('role','tabpanel');
      const list=document.createElement('div');list.className='picker-options';list.setAttribute('role','listbox');list.setAttribute('aria-label','参考图片');panel.append(list);
      const roleOptions=[['','按资产类型'],['identity','角色'],['scene','场景'],['prop','道具'],['style','风格'],['first-frame','首帧'],['last-frame','尾帧']];
      const roleTabs=[];
      function renderChoices(){
        list.replaceChildren();
        const filter=['identity','scene','prop','style'].includes(activeRole)?activeRole:null;
        choices=media.filter(m=>m.kind==='image'&&asset(m.assetId)&&(!filter||category(asset(m.assetId))===filter)&&((asset(m.assetId).name+' '+m.title).includes(query)));
        selected=Math.max(0,choices.findIndex(m=>m.id===previous?.mediaId&&m.assetId===previous?.assetId));
        choices.forEach((m,i)=>{
          const a=asset(m.assetId),button=document.createElement('button');button.type='button';button.className='mention-option';button.id=optionPrefix+i;
          button.setAttribute('role','option');button.setAttribute('aria-selected',String(i===selected));button.setAttribute('aria-label',a.name+' · '+m.variant);
          const img=document.createElement('img');img.src=m.src;img.alt='';
          const body=document.createElement('span'),name=document.createElement('strong'),note=document.createElement('small');
          name.textContent=a.name+' · '+m.variant;note.textContent=a.type+' · '+m.title;
          body.append(name,note);button.append(img,body);button.onmousedown=e=>e.preventDefault();button.onclick=()=>choose(m);list.append(button);
        });
        if(choices.length)editor.setAttribute('aria-activedescendant',optionPrefix+selected);
        else{editor.removeAttribute('aria-activedescendant');const empty=document.createElement('p');empty.className='hint';empty.textContent='没有匹配的图片，试试其他标签或名称。';list.append(empty);}
      }
      function selectRole(value,focus=false){
        activeRole=value||null;
        roleTabs.forEach((tab,i)=>{const selected=roleOptions[i][0]===value;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;if(selected){panel.setAttribute('aria-labelledby',tab.id);if(focus)tab.focus({preventScroll:true});}});
        renderChoices();if(picker.isConnected)placePicker();
      }
      roleOptions.forEach(([value,label],i)=>{
        const tab=document.createElement('button');tab.type='button';tab.className='picker-role-tab';tab.textContent=label;
        tab.id=previewId+'-role-'+i;tab.setAttribute('role','tab');tab.setAttribute('aria-label',roles[value]||label);tab.setAttribute('aria-controls',panel.id);
        tab.onmousedown=e=>e.preventDefault();tab.onclick=()=>selectRole(value);roleTabs.push(tab);tabs.append(tab);
      });
      tabs.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();const i=roleTabs.indexOf(document.activeElement);
        const next=e.key==='Home'?0:e.key==='End'?roleTabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+roleTabs.length)%roleTabs.length;
        selectRole(roleOptions[next][0],true);
      };
      picker.append(tabs,panel);
      picker.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker();editor.focus();}});
      if(replacing){const remove=document.createElement('button');remove.className='btn danger';remove.type='button';remove.textContent='删除此处引用';remove.onclick=()=>{const n=replaceToken;closePicker();n?.remove();editor.focus();emit();};picker.append(remove);}
      host.append(picker);selectRole(activeRole||'');
    }
    function queryAtCaret() {
      if(composing)return;
      const selection=getSelection();if(!selection?.rangeCount||!selection.isCollapsed){closePicker();return;}
      const range=selection.getRangeAt(0),node=range.startContainer;
      if(!editor.contains(node)||node.nodeType!==Node.TEXT_NODE){closePicker();return;}
      const prefix=node.textContent.slice(0,range.startOffset),match=prefix.match(/@([^\s@]{0,30})$/);
      if(!match){closePicker();return;}
      const capturedRange=range.cloneRange();capturedRange.setStart(node,range.startOffset-match[0].length);showPicker(match[1],capturedRange);
    }
    editor.addEventListener('compositionstart',()=>{composing=true;closePicker();});
    editor.addEventListener('compositionend',()=>{composing=false;emit();queryAtCaret();});
    editor.addEventListener('input',()=>{if(!composing){emit();queryAtCaret();}});
    editor.addEventListener('click',e=>{const chip=e.target.closest('[data-mention-key]');if(chip){showPicker('',null,chip);return;}queryAtCaret();});
    editor.addEventListener('keydown',e=>{
      if(composing||e.isComposing)return;
      if(picker){
        if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closePicker();return;}
        if(['ArrowDown','ArrowUp'].includes(e.key)&&choices.length){e.preventDefault();selected=(selected+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;picker.querySelectorAll('[role=option]').forEach((b,i)=>b.setAttribute('aria-selected',String(i===selected)));editor.setAttribute('aria-activedescendant',optionPrefix+selected);picker.querySelector('#'+optionPrefix+selected)?.scrollIntoView({block:'nearest'});return;}
        if(e.key==='Enter'&&choices.length){e.preventDefault();choose(choices[selected]);return;}
        if(e.key==='Tab'){if(!e.shiftKey){e.preventDefault();picker.querySelector('[role=tab][aria-selected=true]')?.focus();return;}closePicker();}
      }
      const chip=e.target.closest?.('[data-mention-key]');
      if(chip&&['Enter',' '].includes(e.key)){e.preventDefault();showPicker('',null,chip);return;}
      if(chip&&['Backspace','Delete'].includes(e.key)){e.preventDefault();chip.remove();editor.focus();emit();return;}
      if(['Backspace','Delete'].includes(e.key)) {
        const selection=getSelection();if(!selection?.isCollapsed||!selection.rangeCount)return;
        const r=selection.getRangeAt(0);let neighbor=null;
        if(r.startContainer.nodeType===Node.TEXT_NODE){if(e.key==='Backspace'&&r.startOffset===0)neighbor=r.startContainer.previousSibling;if(e.key==='Delete'&&r.startOffset===r.startContainer.length)neighbor=r.startContainer.nextSibling;}
        else if(r.startContainer===editor)neighbor=editor.childNodes[r.startOffset+(e.key==='Backspace'?-1:0)];
        if(neighbor?.dataset?.mentionKey){e.preventDefault();neighbor.remove();emit();}
      }
    });
    function insertDocument(doc) {
      const selection=getSelection();let range=selection?.rangeCount?selection.getRangeAt(0):null;
      if(!range||!editor.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(editor);range.collapse(false);}
      const fragment=document.createDocumentFragment();appendNodes(fragment,doc.nodes);const last=fragment.lastChild;
      range.deleteContents();range.insertNode(fragment);if(last)caretAfter(last);emit();
    }
    editor.addEventListener('paste',e=>{
      e.preventDefault();closePicker();
      const structured=e.clipboardData.getData('application/x-film-reference+json');
      if(structured){try{const doc=FilmReferenceDocument.validateDocument(JSON.parse(structured));if(doc.nodes.every(n=>n.type==='text'||asset(n.assetId)&&media.some(m=>m.id===n.mediaId&&m.assetId===n.assetId))){insertDocument(doc);return;}}catch{/* Fall back to unbound plain text. */}}
      insertDocument({schemaVersion:1,nodes:[textNode(e.clipboardData.getData('text/plain'))]});queryAtCaret();
    });
    function copySelection(e,cut) {
      const selection=getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;
      const range=selection.getRangeAt(0);if(!editor.contains(range.commonAncestorContainer))return;
      const doc=readTree(range.cloneContents());e.preventDefault();
      e.clipboardData.setData('application/x-film-reference+json',JSON.stringify(doc));
      e.clipboardData.setData('text/plain',doc.nodes.map(n=>n.type==='text'?n.text:'@'+(asset(n.assetId)?.name||'缺失引用')).join(''));
      if(cut){range.deleteContents();emit();}
    }
    editor.addEventListener('copy',e=>copySelection(e,false));editor.addEventListener('cut',e=>copySelection(e,true));
    editor.addEventListener('drop',e=>e.preventDefault());
    const outside=e=>{if(!host.contains(e.target)){closePreview();if(picker)closePicker();}};
    const onResize=()=>{closePreview();closePicker();};
    const onScroll=e=>{closePreview();if(picker&&!picker.contains(e.target))placePicker();};
    const dismissPreview=e=>{if(e.key==='Escape'&&preview){e.preventDefault();e.stopPropagation();closePreview();}};
    document.addEventListener('pointerdown',outside);window.addEventListener('resize',onResize);
    window.addEventListener('scroll',onScroll,true);document.addEventListener('keydown',dismissPreview,true);
    return {element:host,editor,getDocument,focus:()=>editor.focus(),destroy(){alive=false;closePreview();closePicker();document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',onResize);window.removeEventListener('scroll',onScroll,true);document.removeEventListener('keydown',dismissPreview,true);}};
  }
  globalThis.FilmReferenceEditor=Object.freeze({create});
})();
