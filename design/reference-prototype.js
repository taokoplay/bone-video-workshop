/* Standalone review app. Uses the same reference compiler and editor as the plugin. */
(async () => {
  'use strict';
  const $=id=>document.getElementById(id),clone=x=>JSON.parse(JSON.stringify(x));
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compiler=globalThis.FilmReferenceDocument;
  const key='film-reference-handoff-v1';
  let assets=[
    {id:'a-alley',name:'青石巷',type:'场景',kind:'scene'}, {id:'a-lantern',name:'红灯笼',type:'道具',kind:'prop'},
    {id:'a-shadow',name:'无影人',type:'角色',kind:'character'}, {id:'a-luo',name:'罗洛',type:'角色',kind:'character'},
    {id:'a-umbrella',name:'机关伞',type:'道具',kind:'prop'}, {id:'a-shen',name:'沈青',type:'角色',kind:'character'},
    {id:'a-paper',name:'纸伞',type:'道具',kind:'prop'}, {id:'a-bai',name:'白絮',type:'角色',kind:'character'}
  ];
  const operations={'image.reference':'生图 · 多参考图','image.generate':'生图 · 纯文字','video.reference':'视频 · 多参考图','video.image':'视频 · 单首帧','video.first-last':'视频 · 首尾帧','video.text':'视频 · 纯文字'};
  const roleNames={identity:'角色',scene:'场景',prop:'道具',style:'风格','first-frame':'首帧','last-frame':'尾帧'};
  const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
  const decode=src=>Uint8Array.from(atob(src.split(',')[1]),x=>x.charCodeAt(0));
  const asset=id=>assets.find(a=>a.id===id), image=id=>media.find(m=>m.id===id);
  const text=text=>({type:'text',text});
  const ref=(id,variant=1,role)=>({type:'reference',assetId:id,mediaId:id+'-image-'+variant,role:role||(asset(id).kind==='scene'?'scene':asset(id).kind==='prop'?'prop':'identity')});
  const brief=(...nodes)=>({schemaVersion:1,nodes:nodes.map(n=>typeof n==='string'?text(n):n)});
  const fieldBrief=(s,field)=>compiler.validateDocument(s.referenceFields?.[field]||brief(s[field]||''));
  const displayDocument=doc=>doc.nodes.map(n=>n.type==='text'?n.text:'@'+(asset(n.assetId)?.name||'引用缺失')).join('');
  // Generated locally for reproducible byte-level testing; never presented as production artwork.
  async function sample(a,variant,index) {
    const c=document.createElement('canvas');c.width=256;c.height=176;const ctx=c.getContext('2d');
    ctx.fillStyle=variant===1?'#29343a':'#534336';ctx.fillRect(0,0,256,176);
    ctx.fillStyle=['#a8b5a0','#b75d48','#4d5960','#758c95','#9d9a88','#738a85','#bbac91','#c0c3ba'][index];
    if(a.kind==='character'){ctx.beginPath();ctx.arc(128,55,25,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(82,109);ctx.lineTo(128,76);ctx.lineTo(174,109);ctx.lineTo(199,176);ctx.lineTo(57,176);ctx.closePath();ctx.fill();}
    else if(a.id==='a-lantern'){ctx.beginPath();ctx.ellipse(128,85,40,55,0,0,Math.PI*2);ctx.fill();ctx.fillRect(124,0,8,35);ctx.fillRect(124,132,8,34);}
    else if(a.kind==='prop'){ctx.beginPath();ctx.moveTo(45,96);ctx.quadraticCurveTo(128,0,211,96);ctx.closePath();ctx.fill();ctx.fillRect(125,80,6,85);}
    else {ctx.fillRect(12,10,55,166);ctx.fillRect(189,10,55,166);ctx.beginPath();ctx.moveTo(109,60);ctx.lineTo(147,60);ctx.lineTo(200,176);ctx.lineTo(56,176);ctx.closePath();ctx.fill();}
    ctx.fillStyle=variant===1?'#789bab':'#d5ad71';ctx.fillRect(0,164,256,12);
    const src=c.toDataURL('image/png'),bytes=decode(src);
    return {id:a.id+'-image-'+variant,assetId:a.id,title:variant===1?'正面参考':'侧光参考',variant:'版本 '+variant,kind:'image',mimeType:'image/png',byteLength:bytes.length,sha256:await hash(bytes),src,demo:true};
  }
  let media=[];
  for(const [i,a] of assets.entries())for(const version of [1,2])media.push(await sample(a,version,i));
  let shots=[
    {id:'shot-1',title:'雨巷建立',duration:6,brief:brief('雨夜',ref('a-alley'),'中，积水映出门前的',ref('a-lantern'),'。',ref('a-shadow'),'从画面左侧缓慢走入，停在旧门前抬头。'),scale:'全景',light:'冷暗青光与灯笼暖光交错。',dialogue:'',sfx:'雨声、脚步落水声。',motion:'固定低机位，缓慢向前推进。'},
    {id:'shot-2',title:'无影人入画',duration:7,brief:brief(ref('a-shadow'),'身体一僵，双眼瞬间失焦。夜雾沿着',ref('a-alley'),'漫开，',ref('a-shen'),'在画面后方停下脚步。'),scale:'中景',light:'弱月光与门内红光交错。',dialogue:'',sfx:'脚步戛然而止，衣料摩擦。',motion:'跟随人物，停在同一侧轴线。'},
    {id:'shot-3',title:'红光闪现',duration:8,brief:brief(ref('a-lantern'),'猛然摇晃，红光沿雨水铺开。',ref('a-umbrella'),'的伞尖挡住光线前缘。'),scale:'中近景',light:'红光与青色暗部对比。',dialogue:'',sfx:'绳索绷紧的响声。',motion:'从灯笼向下摇至地面。'},
    {id:'shot-4',title:'罗洛撑伞',duration:6,brief:brief(ref('a-luo'),'从石阶跳下，落地后展开',ref('a-umbrella'),'，挡在',ref('a-shen'),'与无影人之间。'),scale:'全景',light:'金属伞骨反射冷光。',dialogue:'',sfx:'落地声、伞骨的机械声。',motion:'跟随下落后稳定为平视。'},
    {id:'shot-5',title:'罗洛示警',duration:8,brief:brief(ref('a-luo'),'紧握伞柄，转头看向身后的',ref('a-shen'),'。雨水沿额头流下，他压低重心防止伞被掀开。'),scale:'近景',light:'红光从伞边漏入。',dialogue:'罗洛：小心上面！',sfx:'伞面雨声加重。',motion:'轻微手持，保持视线方向。'},
    {id:'shot-6',title:'白絮现身',duration:7,brief:brief('一把',ref('a-paper'),'从画面右侧缓缓入画。',ref('a-bai'),'走到',ref('a-shadow'),'身旁。'),scale:'半身景',light:'柔和侧光照亮伞面。',dialogue:'',sfx:'脚步声靠近，雨声连续。',motion:'平稳向右移镜。'},
    {id:'shot-7',title:'指向水面',duration:5,brief:brief(ref('a-bai'),'低头微笑，食指向下，指向',ref('a-alley'),'的积水中一处没有对应实体的倒影。'),scale:'特写',light:'手指和水面高光清晰。',dialogue:'白絮：看水里。',sfx:'水滴落下的一声轻响。',motion:'固定机位，焦点移向水面。'}
  ].map(s=>({...s,operation:'image.reference',revision:1}));
  const fields={duration:'时长',scale:'景别',light:'光影氛围',dialogue:'对白·旁白',sfx:'音效',motion:'运镜'};
  const scales=['大远景','全景','中景','中近景','近景','半身景','特写','极特写'];
  const referenceFieldLabels={light:'光影',motion:'运镜',dialogue:'对白·旁白',sfx:'音效'};
  const referenceFieldNames=Object.keys(referenceFieldLabels);
  let mode='table',selectedId='shot-1',expanded=false,menu=null,menuTrigger=null,hover=null,hoverTimer,editorHandles=[],dialogEpoch=0;
  const dialog=$('dialog');
  function destroyEditors(){editorHandles.forEach(handle=>handle.destroy());editorHandles=[];}
  function flash(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(flash.timer);flash.timer=setTimeout(()=>$('toast').hidden=true,2200);}
  function persist(){try{localStorage.setItem(key,JSON.stringify({schema:1,shots,assets,media}));flash('修改已保存');}catch{flash('本地存储不可用，请导出输入包保留当前修改。');}}
  function load(){try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved?.schema===1&&Array.isArray(saved.shots)&&Array.isArray(saved.assets)&&Array.isArray(saved.media)){saved.shots.forEach(s=>{compiler.validateDocument(s.brief);referenceFieldNames.forEach(field=>fieldBrief(s,field));});shots=saved.shots;assets=saved.assets;media=saved.media;}}catch{flash('旧草稿格式不可读，已载入示例。');}}
  function compiled(s,doc=s.brief,operation=s.operation,maxReferenceImages=8){
    const document=clone(doc);
    function appendField(label,field,fallback){
      const part=fieldBrief(s,field),hasContent=part.nodes.some(n=>n.type==='reference'||n.text.trim());
      if(hasContent)document.nodes.push(text(`\n${label}：`),...part.nodes);
      else if(fallback)document.nodes.push(text(`\n${label}：${fallback}`));
    }
    document.nodes.push(text(`\n\n景别：${s.scale}`));
    appendField('光影','light','未指定');appendField('运镜','motion','未指定');
    document.nodes.push(text(`\n成片预算：${s.duration}秒`));appendField('对白·旁白','dialogue');appendField('音效','sfx');
    return compiler.compile({document,assets,media,operation,maxReferenceImages});
  }
  async function bundle(s,doc=s.brief,operation=s.operation,maxImages=8){
    const result=compiled(s,doc,operation,maxImages),images=[];
    for(const slot of result.images){const m=image(slot.mediaId);if(!m?.src)throw Error('参考图文件缺失：'+slot.mediaId);const bytes=decode(m.src);if(await hash(bytes)!==slot.sha256||bytes.length!==slot.byteLength)throw Error('图片字节已变化，请重新选择参考图。');images.push({...slot,encoding:'base64',data:m.src.split(',')[1]});}
    const requestHash=await hash(new TextEncoder().encode(JSON.stringify(result)));
    return {...result,shotId:s.id,shotRevision:s.revision,requestHash,images,source:'local-interaction-draft',providerSubmitted:false};
  }
  function download(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function closeHover(){clearTimeout(hoverTimer);hover?.remove();hover=null;}
  function position(el,target){const r=target.getBoundingClientRect(),b=el.getBoundingClientRect();el.style.left=Math.max(8,Math.min(r.left,innerWidth-b.width-8))+'px';el.style.top=Math.max(8,r.bottom+b.height+8>innerHeight?r.top-b.height-6:r.bottom+6)+'px';}
  function showHover(node,target){const a=asset(node.assetId),m=image(node.mediaId);closeHover();hover=document.createElement('div');hover.className='hover-card';hover.setAttribute('role','tooltip');hover.innerHTML=`${m?.src?`<img src="${esc(m.src)}" alt="${esc(a?.name)} ${esc(m.variant)}">`:'<p>图片缺失</p>'}<strong>${esc(a?.name||'资产缺失')} · ${esc(m?.variant||'缺图')}</strong><p>${esc(roleNames[node.role])} · ${m?.demo?'示例图片':'用户导入图片'}</p>`;document.body.append(hover);position(hover,target);hover.onpointerenter=()=>clearTimeout(hoverTimer);hover.onpointerleave=()=>closeHover();}
  function inline(doc){return doc.nodes.map((n,i)=>{if(n.type==='text')return esc(n.text);const a=asset(n.assetId),m=image(n.mediaId);return `<button class="ref ${esc(a?.kind)}" data-node="${i}" data-media="${esc(n.mediaId)}" aria-label="查看参考图 ${esc(a?.name)} ${esc(m?.variant)}">@${esc(a?.name||'引用缺失')}</button>`;}).join('');}
  function bindInline(root,s){root.querySelectorAll('[data-node]').forEach(b=>{const n=s.brief.nodes[Number(b.dataset.node)];b.onpointerenter=()=>showHover(n,b);b.onpointerleave=()=>{hoverTimer=setTimeout(closeHover,140);};b.onfocus=()=>showHover(n,b);b.onblur=closeHover;b.onclick=()=>openAsset(n);});}
  function closeMenu(focus=false){const trigger=menuTrigger;menu?.remove();menu=null;menuTrigger=null;trigger?.setAttribute('aria-expanded','false');if(focus&&trigger?.isConnected)trigger.focus({preventScroll:true});}
  function openScale(trigger,s){if(menuTrigger===trigger){closeMenu(true);return;}closeMenu();menuTrigger=trigger;trigger.setAttribute('aria-expanded','true');menu=document.createElement('div');menu.className='menu scale-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','选择景别');
    const buttons=scales.map(scale=>{const b=document.createElement('button');b.setAttribute('role','menuitemradio');b.setAttribute('aria-checked',String(scale===s.scale));b.setAttribute('aria-label',scale);b.innerHTML=esc(scale)+(scale===s.scale?'<span aria-hidden="true">✓</span>':'');b.onclick=()=>{if(scale!==s.scale){s.scale=scale;s.revision++;persist();render();}else closeMenu(true);};menu.append(b);return b;});document.body.append(menu);position(menu,trigger);buttons.find(b=>b.getAttribute('aria-checked')==='true')?.focus({preventScroll:true});menu.onkeydown=e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();buttons[(buttons.indexOf(document.activeElement)+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}};
  }
  function openDialog(title,subtitle,body,foot,wide=false){closeHover();closeMenu();destroyEditors();dialogEpoch++;if(dialog.open)dialog.close();dialog.classList.toggle('request-dialog',wide);dialog.innerHTML=`<div class="dialog-head"><div><h2 id="dialogTitle">${esc(title)}</h2><span class="hint">${esc(subtitle)}</span></div><button class="btn icon" id="closeDialog" aria-label="关闭">×</button></div><div class="dialog-body">${body}</div><div class="dialog-foot">${foot}</div>`;$('closeDialog').onclick=()=>dialog.close();dialog.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>dialog.close());dialog.showModal();}
  dialog.addEventListener('close',()=>{if(dialog.open)return;destroyEditors();dialogEpoch++;closeHover();});
  function openAsset(n){const a=asset(n.assetId),m=image(n.mediaId);openDialog(a?.name||'资产缺失','此引用已固定到具体图片版本',`${m?.src?`<img src="${esc(m.src)}" style="width:100%;max-height:260px;object-fit:contain" alt="参考图">`:''}<div><label for="assetName">显示名称</label><input class="control" id="assetName" value="${esc(a?.name)}"></div><p class="hint">${esc(m?.variant)} · ${esc(m?.sha256)}<br>改名保留资产 ID 和图片 ID，不会绑定到同名资产。</p>`,'<button class="btn" data-cancel>关闭</button><button class="btn primary" id="renameAsset">保存名称</button>');$('renameAsset').onclick=()=>{const name=$('assetName').value.trim();if(!name){flash('名称不能为空');return;}a.name=name;persist();dialog.close();render();};}
  function errorText(e){const messages={UNRESOLVED_REFERENCE:'有未绑定的 @ 文字，请通过选图菜单插入引用。',UNSUPPORTED_REFERENCE_MODE:'当前图片用途或数量与生成形式不匹配。单首帧需明确的首帧图片，不能用角色参考代替。',LIMIT_EXCEEDED:'图片数量或正文长度超出当前限制。',NOT_FOUND:'引用的资产或图片已缺失，请重新选择。',INVALID_ARGUMENT:'请求内容不完整或图片元信息不合法。'};return (messages[e.code]||'请求无法准备。')+' '+e.message;}
  function requestPanel(s,focusField=null){let draft=clone(s.brief),op=s.operation,maxImages=8,sequence=0,current=null,editorHandle=null;
    const fieldDrafts=Object.fromEntries(referenceFieldNames.map(field=>[field,fieldBrief(s,field)])),fieldEditors={};
    const scaleOptions=scales.includes(s.scale)?scales:[...scales,s.scale];
    openDialog('编辑提示词与参考图',s.title+' · 修改正文、图片或参数，右侧请求立即更新',`
      <div class="request-grid">
        <section class="request-side">
          <label>镜头正文 · @ 选择具体图片</label><div id="editorHost"></div>
          <div class="request-shot-settings" role="group" aria-label="镜头参数">
            <div><label for="requestScale">景别</label><select class="control" id="requestScale">${scaleOptions.map(value=>`<option value="${esc(value)}" ${value===s.scale?'selected':''}>${esc(value)}</option>`).join('')}</select></div>
            <div><label for="requestDuration">成片时长（秒）</label><input class="control" id="requestDuration" type="number" min="0.1" max="600" step="0.1" value="${s.duration}" aria-describedby="requestSettingsError"></div>
            <div><label for="requestLight">光影</label><div id="lightEditorHost"></div></div>
            <div><label for="requestMotion">运镜</label><div id="motionEditorHost"></div></div>
            <div class="request-dialogue"><label for="requestDialogue">对白·旁白</label><div id="dialogueEditorHost"></div></div>
            <div class="request-sound"><label for="requestSfx">音效</label><div id="sfxEditorHost"></div></div>
          </div>
          <p class="error" id="requestSettingsError" role="alert" hidden>请输入大于 0 且不超过 600 秒的有效时长。</p>
          <div class="import-row"><label for="importAsset">给资产添加参考图</label><select id="importAsset">${assets.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select><input id="importImage" aria-label="导入参考图" type="file" accept="image/png,image/jpeg"></div>
          <p class="hint">默认图片为可导出的 PNG 示例，可自选图片验证。</p>
        </section>
        <section class="request-side">
          <div class="request-options">
            <div><label for="operation">目标生成形式</label><select id="operation">${Object.entries(operations).map(([v,l])=>`<option value="${v}" ${v===op?'selected':''}>${l}</option>`).join('')}</select></div>
            <div><label for="maxImages">参考图上限</label><select id="maxImages">${[1,2,3,4,8].map(n=>`<option ${n===8?'selected':''}>${n}</option>`).join('')}</select></div>
          </div>
          <div id="requestStatus" class="request-state" aria-live="polite"></div><div id="requestPreview"></div>
          <p class="hint">这是交付给外部工具的输入；此处不会调用供应商或收费。</p>
        </section>
      </div>`, '<button class="btn" data-cancel>取消</button><button class="btn" id="exportRequest">导出当前输入包</button><button class="btn primary" id="saveBrief">保存镜头修改</button>',true);
    const epoch=dialogEpoch;
    function readSettings(){
      const duration=$('requestDuration').valueAsNumber,valid=Number.isFinite(duration)&&duration>0&&duration<=600;
      $('requestDuration').setAttribute('aria-invalid',String(!valid));$('requestSettingsError').hidden=valid;
      if(!valid)throw Object.assign(new Error('请输入大于 0 且不超过 600 秒的有效时长。'),{code:'INVALID_ARGUMENT'});
      const documents=Object.fromEntries(referenceFieldNames.map(field=>[field,compiler.validateDocument(fieldEditors[field].getDocument())]));
      return {scale:$('requestScale').value,...Object.fromEntries(referenceFieldNames.map(field=>[field,displayDocument(documents[field])])),referenceFields:documents,duration};
    }
    function refresh(){
      sequence++;current=null;const out=$('requestPreview');if(!out||dialogEpoch!==epoch)return;
      try{
        $('saveBrief').disabled=true;const settings=readSettings();$('saveBrief').disabled=false;
        const result=compiled({...s,...settings},draft,op,maxImages);current=result;
        $('requestStatus').textContent=`输入校验通过 · ${result.images.length} 张图 · 尚未生成`;
        out.innerHTML=`<pre class="request-prompt" id="compiledPrompt">${esc(result.prompt)}</pre><div class="request-images">${result.images.map(slot=>{const m=image(slot.mediaId);return `<div class="request-image" data-slot="${slot.slot}" data-media="${esc(slot.mediaId)}"><img src="${esc(m?.src)}" alt="图${slot.slot} ${esc(asset(m?.assetId)?.name)} ${esc(m?.variant)}"><strong>图${slot.slot} · ${esc(asset(m?.assetId)?.name)} · ${esc(m?.variant)}</strong><span class="hint">${slot.roles.map(r=>roleNames[r]).join(' / ')}</span><code>SHA ${slot.sha256.slice(0,16)}…</code></div>`;}).join('')}</div>`;
        $('exportRequest').disabled=false;
      }catch(e){
        const pending=e.code==='UNRESOLVED_REFERENCE';$('requestStatus').textContent=pending?'等待选择资产':'输入未就绪';
        out.innerHTML=pending?'<p class="hint" id="referencePending">请从 @ 菜单中选择要关联的资产。未绑定的 @ 文字需完成选择后才能导出。</p>':`<div class="request-error" role="alert">${esc(errorText(e))}</div>`;
        $('exportRequest').disabled=true;
      }
    }
    function attachEditor(hostId,options){const handle=FilmReferenceEditor.create({...options,assets,media});editorHandles.push(handle);$(hostId).replaceChildren(handle.element);return handle;}
    function mount(){
      referenceFieldNames.forEach(field=>{if(fieldEditors[field])fieldDrafts[field]=fieldEditors[field].getDocument();});
      destroyEditors();
      editorHandle=attachEditor('editorHost',{document:draft,onChange:value=>{draft=value;refresh();}});
      referenceFieldNames.forEach(field=>{
        fieldEditors[field]=attachEditor(field+'EditorHost',{document:fieldDrafts[field],label:referenceFieldLabels[field],placeholder:'输入'+referenceFieldLabels[field]+'，使用 @ 选择资产',onChange:value=>{fieldDrafts[field]=value;refresh();}});
        fieldEditors[field].editor.id='request'+field[0].toUpperCase()+field.slice(1);
      });
    }
    mount();refresh();$('operation').onchange=()=>{op=$('operation').value;refresh();};$('maxImages').onchange=()=>{maxImages=Number($('maxImages').value);refresh();};
    ['requestScale','requestDuration'].forEach(id=>$(id).addEventListener('input',refresh));
    if(focusField){fieldEditors[focusField].focus();fieldEditors[focusField].editor.scrollIntoView({block:'nearest'});}
    $('saveBrief').onclick=()=>{
      try{const settings=readSettings(),document=compiler.validateDocument(editorHandle.getDocument());Object.assign(s,settings,{brief:document,operation:op,revision:s.revision+1});persist();dialog.close();render();}
      catch(e){flash(e.message);}
    };
    $('exportRequest').onclick=async()=>{
      const version=sequence,snapshot=clone(editorHandle.getDocument()),operation=op;
      try{
        $('exportRequest').disabled=true;const shotSnapshot={...clone(s),...readSettings()};
        const payload=await bundle(shotSnapshot,snapshot,operation,maxImages);
        if(dialogEpoch!==epoch||!dialog.open||sequence!==version){flash('内容已变化，请重新导出当前请求。');return;}
        download(payload,s.id+'-generation-input.json');flash('已导出提示词和匹配的图片字节');
      }catch(e){if(dialogEpoch===epoch)flash(errorText(e));}
      finally{if(dialogEpoch===epoch&&dialog.open)$('exportRequest').disabled=!current;}
    };
    $('importImage').onchange=async e=>{const file=e.target.files[0],assetId=$('importAsset').value;if(!file)return;try{if(file.size>2*1024*1024)throw Error('原型导入上限为 2 MiB。');const bytes=new Uint8Array(await file.arrayBuffer());if(dialogEpoch!==epoch||!dialog.open)return;const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!png&&!jpg)throw Error('请选择 PNG 或 JPEG 图片。');const mimeType=png?'image/png':'image/jpeg',sha256=await hash(bytes);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);const src='data:'+mimeType+';base64,'+btoa(binary);const img=new Image();img.src=src;await img.decode();if(dialogEpoch!==epoch||!dialog.open)return;const id='import-'+sha256.slice(0,24)+'-'+assetId;if(!media.some(m=>m.id===id))media.push({id,assetId,title:file.name.slice(0,120),variant:'自选图',kind:'image',mimeType,sha256,byteLength:bytes.length,src,demo:false});draft=editorHandle.getDocument();mount();refresh();flash('图片已加入候选，输入 @ 选择引用。');}catch(err){flash(err.message);}};
  }
  function editField(s,f){if(referenceFieldNames.includes(f)){requestPanel(s,f);return;}const control=f==='duration'?`<input class="control" id="fieldInput" type="number" min="0.1" max="600" step="0.1" value="${s.duration}">`:`<textarea class="control" id="fieldInput">${esc(s[f])}</textarea>`;openDialog('编辑'+fields[f],s.title,`<label for="fieldInput">${fields[f]}</label>${control}<p class="error" id="error"></p>`,'<button class="btn" data-cancel>取消</button><button class="btn primary" id="saveField">保存修改</button>');$('saveField').onclick=()=>{let value=$('fieldInput').value;if(f==='duration'){value=Number(value);if(!Number.isFinite(value)||value<=0||value>600){$('error').textContent='请输入 0 到 600 之间的有效时长。';return;}}s[f]=value;s.revision++;persist();dialog.close();render();};}
  function cell(s,f){const value=referenceFieldNames.includes(f)?displayDocument(fieldBrief(s,f)):s[f];return `<button class="cell-read ${f==='duration'?'duration':''}" data-edit="${f}" data-shot="${s.id}" aria-label="编辑 ${esc(s.title)} 的${fields[f]}"><span class="cell-text">${esc(f==='duration'?s.duration+'s':value||'—')}</span></button>`;}
  function scene(s){return `<div class="inline-scene">${inline(s.brief)}</div>`;}
  function bind(root){root.querySelectorAll('[data-edit]').forEach(b=>{const s=shots.find(s=>s.id===b.dataset.shot);b.onclick=()=>b.dataset.edit==='scale'?openScale(b,s):editField(s,b.dataset.edit);if(b.dataset.edit==='scale'){b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');}});root.querySelectorAll('.more').forEach(b=>{b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');b.onclick=()=>rowMenu(b,shots.find(s=>s.id===b.dataset.shot));});}
  function table(){const root=document.createElement('section');root.className='sheet';root.innerHTML=`<div class="sheet-head"><div><strong>分镜脚本</strong><span class="hint">正文中的 @ 是图片引用，悬停可预览</span></div><button class="btn link" id="expandBtn">${expanded?'收起长文本':'展开全文'}</button></div><div class="sheet-scroll" tabindex="0" aria-label="分镜表格，可横向滚动"><table class="shot-table ${expanded?'expanded':''}" aria-label="本集分镜脚本"><colgroup>${[60,76,370,100,188,180,180,168,64].map(w=>`<col style="width:${w}px">`).join('')}</colgroup><thead><tr>${['镜号','时长','画面描述 · 图片引用','景别','光影氛围','对白·旁白','音效','运镜','操作'].map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody></tbody></table></div><div class="sheet-foot"><span class="hint">横向滚动查看完整字段 · 镜号与操作固定</span><span class="save-state">交互稿 · 未调用生成服务</span></div>`;
    const tbody=root.querySelector('tbody');shots.forEach((s,i)=>{const tr=document.createElement('tr');tr.dataset.shot=s.id;tr.innerHTML=`<td><button class="number" data-inspect="${s.id}">${String(i+1).padStart(2,'0')}</button></td><td>${cell(s,'duration')}</td><td class="scene-cell">${scene(s)}</td><td><button class="scale" data-edit="scale" data-shot="${s.id}" aria-label="编辑 ${s.title} 的景别">${esc(s.scale)}<svg class="scale-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg></button></td>${['light','dialogue','sfx','motion'].map(f=>`<td>${cell(s,f)}</td>`).join('')}<td><button class="btn icon more" data-shot="${s.id}" aria-label="镜头 ${i+1} 更多操作">···</button></td>`;tr.querySelector('[data-inspect]').onclick=()=>{selectedId=s.id;mode='cards';render();};bindInline(tr,s);tbody.append(tr);});bind(root);root.querySelector('#expandBtn').onclick=()=>{expanded=!expanded;root.querySelector('table').classList.toggle('expanded',expanded);root.querySelector('#expandBtn').textContent=expanded?'收起长文本':'展开全文';};root.querySelector('.sheet-scroll').onscroll=()=>{closeHover();closeMenu();};return root;}
  function inspector(){const s=shots.find(s=>s.id===selectedId),root=document.createElement('section');root.className='inspector';if(!s){root.innerHTML='<div class="empty">暂无镜头</div>';return root;}const i=shots.indexOf(s);root.innerHTML=`<div class="inspector-head"><span class="index">${String(i+1).padStart(2,'0')}</span><div><span class="hint">当前镜头 · ${s.duration}s</span><h1>${esc(s.title)}</h1></div><div class="nav"><button class="btn icon" id="prev" ${i===0?'disabled':''}>‹</button><button class="btn icon" id="next" ${i===shots.length-1?'disabled':''}>›</button></div></div><div class="preview"><strong>暂无镜头影片</strong><span class="hint">生成输入准备完成不等于已生成影片</span></div><div class="fields"><div class="field wide"><div class="field-head"><span>画面描述 · 生成正文</span></div>${scene(s)}</div>${Object.keys(fields).map(f=>`<div class="field"><div class="field-head"><span>${fields[f]}</span></div>${cell(s,f)}</div>`).join('')}</div><div class="inspector-foot"><span class="hint">修订 ${s.revision} · 素材未验证</span><button class="btn more" data-shot="${s.id}" aria-label="镜头 ${i+1} 更多操作">操作 ···</button></div>`;root.querySelector('#prev').onclick=()=>{selectedId=shots[i-1].id;render();};root.querySelector('#next').onclick=()=>{selectedId=shots[i+1].id;render();};bind(root);bindInline(root,s);return root;}
  function rowMenu(target,s){
    if(menuTrigger===target){closeMenu(true);return;}
    closeMenu();closeHover();menuTrigger=target;target.setAttribute('aria-expanded','true');
    menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','镜头操作');
    const i=shots.indexOf(s);
    menu.innerHTML=`<button role="menuitem" id="editShot">编辑镜头</button><button role="menuitem" data-move="-1" ${i===0?'disabled':''}>上移一镜</button><button role="menuitem" data-move="1" ${i===shots.length-1?'disabled':''}>下移一镜</button><button role="menuitem" class="danger" id="deleteShot">删除镜头…</button>`;
    document.body.append(menu);position(menu,target);
    const items=[...menu.querySelectorAll('button:not(:disabled)')];items[0].focus({preventScroll:true});
    menu.onkeydown=e=>{
      if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const index=items.indexOf(document.activeElement);items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();}
      if(e.key==='Tab')closeMenu(true);
    };
    $('editShot').onclick=()=>{closeMenu(true);requestPanel(s);};
    menu.querySelectorAll('[data-move]').forEach(b=>b.onclick=()=>{const to=i+Number(b.dataset.move);[shots[i],shots[to]]=[shots[to],shots[i]];persist();render();});
    $('deleteShot').onclick=()=>{closeMenu(true);openDialog('删除镜头',s.title,'<p>仅删除本地交互稿中的镜头。</p>','<button class="btn" data-cancel>取消</button><button class="btn danger" id="confirmDelete">删除</button>');$('confirmDelete').onclick=()=>{shots.splice(i,1);persist();dialog.close();render();};};
  }
  function render(){const sc=document.querySelector('.sheet-scroll'),scroll=sc?{x:sc.scrollLeft,y:sc.scrollTop}:null;closeMenu();closeHover();if(!shots.some(s=>s.id===selectedId))selectedId=shots[0]?.id;$('count').textContent=`${shots.length} 个镜头 · 预算 ${Number(shots.reduce((n,s)=>n+s.duration,0).toFixed(2))}s`;$('layout').classList.toggle('table-mode',mode==='table');$('tableMode').setAttribute('aria-pressed',String(mode==='table'));$('cardMode').setAttribute('aria-pressed',String(mode==='cards'));$('sideCount').textContent=String(shots.length).padStart(2,'0');$('shotList').innerHTML=shots.map((s,i)=>`<button class="shot-card" data-shot="${s.id}" aria-current="${s.id===selectedId}"><div class="shot-thumb"><span>${String(i+1).padStart(2,'0')}</span><span>${s.duration}s</span></div><span class="shot-title">${esc(s.title)}</span><span class="shot-state">文字已保存 · v${s.revision}</span></button>`).join('');$('shotList').querySelectorAll('button').forEach(b=>b.onclick=()=>{selectedId=b.dataset.shot;render();});$('main').replaceChildren(mode==='table'?table():inspector());const after=document.querySelector('.sheet-scroll');if(after&&scroll){after.scrollLeft=scroll.x;after.scrollTop=scroll.y;}}
  $('tableMode').onclick=()=>{mode='table';render();};$('cardMode').onclick=()=>{mode='cards';render();};$('refreshBtn').onclick=()=>{load();render();};
  $('batchBtn').onclick=async()=>{try{const snapshots=clone(shots),payload=[];for(const s of snapshots)payload.push(await bundle(s));if(JSON.stringify(snapshots)!==JSON.stringify(shots))throw Error('镜头内容已变化，请重新导出。');download({schemaVersion:1,requests:payload,providerSubmitted:false},'film-generation-inputs.json');flash('已导出本集请求与图片字节');}catch(e){flash(errorText(e));}};
  $('directoryBtn').onclick=()=>openDialog('作品目录','当前为独立交互稿','<p>雨巷追踪 · 原作品数据保持不变。</p>','<button class="btn" data-cancel>关闭</button>');
  $('addBtn').onclick=()=>{const s={id:'shot-'+Date.now(),title:'新镜头',duration:5,brief:brief(''),operation:'image.generate',scale:'中景',light:'',dialogue:'',sfx:'',motion:'',revision:1};shots.push(s);selectedId=s.id;persist();render();requestPanel(s);};
  document.addEventListener('pointerdown',e=>{if(menu&&!menu.contains(e.target)&&!menuTrigger?.contains(e.target)&&!e.target.closest('.more'))closeMenu();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeHover();closeMenu(true);}});window.addEventListener('resize',()=>{closeHover();closeMenu();});
  load();render();
})().catch(error=>{document.getElementById('main').textContent='交互稿加载失败：'+error.message;console.error(error);});
