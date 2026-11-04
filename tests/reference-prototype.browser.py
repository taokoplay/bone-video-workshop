"""Exercise inline references and verify downloaded prompt/image bytes together."""
from pathlib import Path
import base64, hashlib, json, os
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('PI_SCRATCH_DIR','/tmp'))
URL=(ROOT/'views/shot-table-prototype.html').as_uri()
with sync_playwright() as p:
    browser=p.chromium.launch(channel='chrome',headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000},accept_downloads=True)
    page.set_default_timeout(6000)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(URL)
    expect(page.locator('tbody tr')).to_have_count(7)
    expect(page.locator('tr[data-shot="shot-2"] .inline-scene [data-node]')).to_have_count(3)
    assert page.locator('tbody .refs').count()==0
    expect(page.get_by_role('columnheader',name='生成输入',exact=True)).to_have_count(0)
    expect(page.get_by_role('columnheader')).to_have_count(9)
    expect(page.locator('tbody tr').first.locator('td')).to_have_count(9)
    expect(page.get_by_role('button',name='编辑正文',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='提示词与参考图',exact=True)).to_have_count(0)
    table_ref=page.locator('tr[data-shot="shot-1"] [data-media="a-alley-image-1"]')
    expect(table_ref).to_have_text('@青石巷')
    expect(page.locator('.inline-scene img')).to_have_count(0)
    table_ref.hover()
    expect(page.get_by_role('tooltip')).to_contain_text('青石巷 · 版本 1')
    table_image=page.get_by_role('tooltip').locator('img').get_attribute('src')
    page.locator('.header').hover()
    expect(page.get_by_role('tooltip')).to_be_hidden()
    # The picker can associate one registered image with several assets.
    # Clipboard round-trips must preserve the exact asset/media pair for each chip.
    page.evaluate('''(src) => {
        const assets = [{id:'first',name:'First',kind:'character'}, {id:'second',name:'Second',kind:'character'}];
        const record = {id:'shared',kind:'image',mimeType:'image/png',sha256:'a'.repeat(64),byteLength:1,
            src,title:'Shared image',variant:'current'};
        const media = assets.map(a => ({...record,assetId:a.id}));
        const original = {schemaVersion:1,nodes:[
            {type:'reference',assetId:'first',mediaId:'shared',role:'identity'},
            {type:'text',text:' meets '},
            {type:'reference',assetId:'second',mediaId:'shared',role:'identity'}
        ]};
        const handle = FilmReferenceEditor.create({document:original,assets,media,onChange:()=>{}});
        document.body.append(handle.element);
        const selectAll = () => {
            handle.editor.focus();
            const range = document.createRange(); range.selectNodeContents(handle.editor);
            getSelection().removeAllRanges(); getSelection().addRange(range);
        };
        try {
            for (const action of ['copy','cut']) {
                selectAll();
                const clipboard = new DataTransfer();
                handle.editor.dispatchEvent(new ClipboardEvent(action,{clipboardData:clipboard,bubbles:true,cancelable:true}));
                if (action==='cut' && handle.getDocument().nodes.length) throw Error('Cut did not remove references');
                handle.editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));
                const restored = handle.getDocument();
                if (JSON.stringify(restored)!==JSON.stringify(original)) throw Error('Shared-image '+action+' lost an asset binding');
                const result = FilmReferenceDocument.compile({document:restored,assets,media:[record],operation:'image.reference'});
                if (result.images.length!==1 || result.referenceCount!==2 || result.images[0].assetIds.join(',')!=='first,second') throw Error('Clipboard changed compiled image inputs');
            }
            selectAll();
            const invalid = new DataTransfer();
            invalid.setData('application/x-film-reference+json',JSON.stringify({schemaVersion:1,nodes:[
                {type:'reference',assetId:'second',mediaId:'unassociated',role:'identity'}
            ]}));
            invalid.setData('text/plain','@Second');
            handle.editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:invalid,bubbles:true,cancelable:true}));
            const fallback = handle.getDocument();
            if (fallback.nodes.some(n=>n.type==='reference') || fallback.nodes[0]?.text!=='@Second') throw Error('Invalid clipboard binding was accepted');
        } finally { handle.destroy(); handle.element.remove(); getSelection().removeAllRanges(); }
    }''',table_image)
    def open_shot(n=1):
        page.locator(f'tr[data-shot="shot-{n}"] .more').click()
        expect(page.get_by_role('menu',name='镜头操作')).to_be_visible()
        expect(page.get_by_role('menuitem')).to_have_count(4)
        page.get_by_role('menuitem',name='编辑镜头',exact=True).click()
        expect(page.locator('#editorHost .rich-editor')).to_be_visible()
    def export(name):
        preview=page.locator('#compiledPrompt').inner_text()
        slots=page.locator('.request-image').evaluate_all('(nodes)=>nodes.map(n=>({id:n.dataset.media,slot:Number(n.dataset.slot),src:n.querySelector("img").src}))')
        with page.expect_download() as info:
            page.get_by_role('button',name='导出当前输入包',exact=True).click()
        dest=OUT/(name+'.json');info.value.save_as(dest)
        payload=json.loads(dest.read_text())
        assert payload['prompt']==preview
        assert len(payload['images'])==len(slots)
        for entry,ui in zip(payload['images'],slots):
            assert entry['slot']==ui['slot'] and entry['mediaId']==ui['id']
            assert entry['data']==ui['src'].split(',')[1]
            data=base64.b64decode(entry['data'])
            assert hashlib.sha256(data).hexdigest()==entry['sha256']
            assert len(data)==entry['byteLength'] and data.startswith(b'\x89PNG')
            assert f'图{entry["slot"]}' in payload['prompt']
        assert payload['providerSubmitted'] is False
        return payload
    # The consolidated menu supports keyboard entry, dismissal and focus return.
    trigger=page.locator('tr[data-shot="shot-2"] .more')
    trigger.focus();trigger.press('Enter')
    expect(page.get_by_role('menuitem',name='编辑镜头',exact=True)).to_be_focused()
    page.keyboard.press('ArrowDown')
    expect(page.get_by_role('menuitem',name='上移一镜',exact=True)).to_be_focused()
    page.keyboard.press('Escape')
    expect(page.get_by_role('menu',name='镜头操作')).to_be_hidden()
    expect(trigger).to_be_focused()
    trigger.press('Enter');page.keyboard.press('Enter')
    expect(page.locator('#dialog .dialog-head .hint')).to_contain_text('无影人入画')
    expect(page.get_by_label('成片时长（秒）',exact=True)).to_have_value('7')
    page.get_by_role('button',name='取消',exact=True).click()
    expect(trigger).to_be_focused()
    open_shot()
    baseline=export('reference-before')
    def check_compact_preview(version,data):
        chip=page.locator('.reference-token').filter(has_text='@青石巷')
        expect(chip).to_have_text('@青石巷')
        expect(page.locator('.reference-token img, .reference-token small')).to_have_count(0)
        assert chip.bounding_box()['height'] < 24
        chip.hover()
        tooltip=page.get_by_role('tooltip')
        expect(tooltip).to_contain_text('青石巷 · 版本 '+str(version))
        expect(tooltip).to_contain_text('场景参考')
        expect(tooltip.locator('img')).to_have_attribute('src','data:image/png;base64,'+data)
        tooltip.hover()
        expect(tooltip).to_be_visible()
        page.locator('#operation').hover()
        expect(tooltip).to_be_hidden()
        chip.focus()
        expect(tooltip).to_be_visible()
        chip.press('Escape')
        expect(tooltip).to_be_hidden()
        expect(page.locator('#dialog')).to_be_visible()
    check_compact_preview(1,baseline['images'][0]['data'])
    assert export('reference-hover-unchanged')==baseline
    editor=page.locator('#editorHost .rich-editor')
    editor.click();editor.press('End');editor.press('ControlOrMeta+End');editor.press_sequentially(' 新增动作：抬起右手。')
    expect(page.locator('#compiledPrompt')).to_contain_text('新增动作：抬起右手。')
    text_changed=export('reference-text-changed')
    assert text_changed['requestHash']!=baseline['requestHash']
    assert text_changed['images']==baseline['images']
    page.get_by_role('button',name='更换引用 青石巷 · 正面参考',exact=True).click()
    page.get_by_role('option',name='青石巷 · 版本 2',exact=True).click()
    expect(page.locator('.request-image[data-slot="1"]')).to_have_attribute('data-media','a-alley-image-2')
    replaced=export('reference-image-replaced')
    assert replaced['images'][0]['sha256']!=baseline['images'][0]['sha256']
    assert replaced['requestHash']!=text_changed['requestHash']
    check_compact_preview(2,replaced['images'][0]['data'])
    page.get_by_role('button',name='更换引用 青石巷 · 侧光参考',exact=True).click()
    page.get_by_role('button',name='删除此处引用',exact=True).click()
    deleted=export('reference-deleted')
    assert len(deleted['images'])==2 and all(x['mediaId']!='a-alley-image-2' for x in deleted['images'])
    editor.click();editor.press('ControlOrMeta+End');editor.press_sequentially(' @红')
    expect(page.locator('#exportRequest')).to_be_disabled()
    page.get_by_role('option',name='红灯笼 · 版本 1',exact=True).click()
    duplicate=export('reference-dedup')
    assert len(duplicate['images'])==2 and duplicate['referenceCount']==3
    page.get_by_role('button',name='保存镜头修改',exact=True).click()
    page.reload();open_shot()
    reloaded=export('reference-reloaded')
    assert reloaded['images']==duplicate['images'] and reloaded['prompt']==duplicate['prompt']
    page.locator('#operation').select_option('video.image')
    expect(page.locator('#exportRequest')).to_be_disabled()
    expect(page.locator('.request-error')).to_contain_text('不匹配')
    page.locator('#operation').select_option('image.reference')
    page.locator('#maxImages').select_option('1')
    expect(page.locator('#exportRequest')).to_be_disabled()
    page.locator('#maxImages').select_option('8')
    page.locator('#editorHost .rich-editor').fill('正文改写，普通名字沈青不会绑定。 @不存在')
    expect(page.locator('#referencePending')).to_contain_text('未绑定')
    expect(page.locator('#exportRequest')).to_be_disabled()
    page.get_by_role('button',name='取消',exact=True).click()
    open_shot()
    expect(page.locator('#compiledPrompt')).not_to_contain_text('不存在')
    page.get_by_role('button',name='取消',exact=True).click()
    # Verify a name change never substitutes another picture or loses the binding.
    page.locator('tr[data-shot="shot-1"] [data-media="a-shadow-image-1"]').first.click()
    page.locator('#assetName').fill('无影人·黑衣')
    page.get_by_role('button',name='保存名称',exact=True).click()
    open_shot();renamed=export('reference-renamed')
    assert '无影人·黑衣' in renamed['prompt']
    assert renamed['images']==reloaded['images']
    # A real first-frame request requires one explicitly assigned first-frame image.
    editor=page.locator('#editorHost .rich-editor');editor.fill('从首帧开始：@无')
    page.get_by_role('tab',name='视频首帧',exact=True).click()
    page.get_by_role('option',name='无影人·黑衣 · 版本 1',exact=True).click()
    page.locator('#operation').select_option('video.image')
    first=export('reference-first-frame')
    assert len(first['images'])==1 and first['images'][0]['roles']==['first-frame']
    # Mention tail first; compiled file slots must still be first-frame then last-frame.
    editor.fill('结束画面：@无')
    page.get_by_role('tab',name='视频尾帧',exact=True).click()
    page.get_by_role('option',name='无影人·黑衣 · 版本 2',exact=True).click()
    editor.press('ControlOrMeta+End');editor.press_sequentially(' 起始画面：@无')
    page.get_by_role('tab',name='视频首帧',exact=True).click()
    page.get_by_role('option',name='无影人·黑衣 · 版本 1',exact=True).click()
    page.locator('#operation').select_option('video.first-last')
    pair=export('reference-frame-pair')
    assert [x['roles'][0] for x in pair['images']]==['first-frame','last-frame']
    assert '结束画面：无影人·黑衣〔图2〕' in pair['prompt']
    assert '起始画面：无影人·黑衣〔图1〕' in pair['prompt']
    # Reimporting identical bytes for the same asset must reuse one candidate ID.
    page.locator('#operation').select_option('image.reference')
    page.locator('#importAsset').select_option('a-shadow')
    uploaded=base64.b64decode(baseline['images'][0]['data'])
    def import_image():
        page.locator('#importImage').set_input_files([])
        old_editor=page.locator('#editorHost .rich-editor').element_handle()
        page.locator('#importImage').set_input_files({'name':'shared-fixture.png','mimeType':'image/png','buffer':uploaded})
        page.wait_for_function('(editor)=>!editor.isConnected',arg=old_editor)
    for _ in range(2): import_image()
    editor=page.locator('#editorHost .rich-editor');editor.fill('自选图片：@无')
    expect(page.get_by_role('option',name='无影人·黑衣 · 自选图',exact=True)).to_have_count(1)
    page.get_by_role('option',name='无影人·黑衣 · 自选图',exact=True).click()
    imported=export('reference-repeat-import')
    assert len(imported['images'])==1 and imported['images'][0]['data']==baseline['images'][0]['data']
    # Identical bytes associated with another asset remain independently selectable.
    page.locator('#importAsset').select_option('a-shen')
    import_image()
    editor.press('ControlOrMeta+End');editor.press_sequentially(' 与@沈')
    page.get_by_role('option',name='沈青 · 自选图',exact=True).click()
    shared_import=export('reference-cross-asset-import')
    assert len(shared_import['images'])==2
    assert shared_import['images'][0]['mediaId']!=shared_import['images'][1]['mediaId']
    assert shared_import['images'][0]['data']==shared_import['images'][1]['data']==baseline['images'][0]['data']
    page.get_by_role('button',name='取消',exact=True).click()
    # Existing dialogue must be editable and included in the actual compiled input.
    open_shot(5)
    expect(page.get_by_label('对白·旁白',exact=True)).to_have_text('罗洛：小心上面！')
    assert '对白·旁白：罗洛：小心上面！' in export('reference-existing-dialogue')['prompt']
    page.get_by_role('button',name='取消',exact=True).click()
    # Shot settings share the prompt draft: live preview/export, discard, save and reload.
    open_shot(2)
    settings_before=export('reference-settings-before')
    original_settings={name:page.locator('#'+name).evaluate('(el)=>el.isContentEditable?el.textContent:el.value') for name in ['requestScale','requestDuration','requestLight','requestMotion','requestDialogue']}
    dialogue='罗洛：别回头。\n旁白：巷口的灯熄灭了。'
    page.get_by_label('对白·旁白',exact=True).fill(dialogue)
    dialogue_only=export('reference-dialogue-edited')
    assert '对白·旁白：'+dialogue in dialogue_only['prompt']
    assert dialogue_only['images']==settings_before['images']
    assert dialogue_only['requestHash']!=settings_before['requestHash']
    def edit_settings():
        page.get_by_label('景别',exact=True).select_option('特写')
        page.get_by_label('成片时长（秒）',exact=True).fill('8.5')
        page.get_by_label('光影',exact=True).fill('暖色侧光，背景保持暗部。')
        page.get_by_label('运镜',exact=True).fill('缓慢环绕人物半周。')
        page.get_by_label('对白·旁白',exact=True).fill(dialogue)
    edit_settings()
    settings_changed=export('reference-settings-edited')
    for line in ['景别：特写','光影：暖色侧光，背景保持暗部。','运镜：缓慢环绕人物半周。','成片预算：8.5秒','对白·旁白：'+dialogue]:
        assert line in settings_changed['prompt']
    assert settings_changed['requestHash']!=settings_before['requestHash']
    assert settings_changed['images']==settings_before['images']
    for invalid in ['', '0', '-1', '601']:
        page.get_by_label('成片时长（秒）',exact=True).fill(invalid)
        expect(page.locator('#requestSettingsError')).to_be_visible()
        expect(page.locator('#saveBrief')).to_be_disabled()
        expect(page.locator('#exportRequest')).to_be_disabled()
        expect(page.locator('#compiledPrompt')).to_have_count(0)
    page.get_by_label('成片时长（秒）',exact=True).fill('8.5')
    expect(page.locator('#saveBrief')).to_be_enabled()
    page.get_by_role('button',name='取消',exact=True).click()
    open_shot(2)
    for name,value in original_settings.items():
        if name in ['requestScale','requestDuration']: expect(page.locator('#'+name)).to_have_value(value)
        else: expect(page.locator('#'+name)).to_have_text(value)
    assert export('reference-settings-cancelled')==settings_before
    edit_settings()
    page.get_by_role('button',name='保存镜头修改',exact=True).click()
    row=page.locator('tr[data-shot="shot-2"]')
    expect(row.locator('[data-edit="duration"]')).to_have_text('8.5s')
    expect(row.locator('[data-edit="scale"]')).to_have_text('特写')
    expect(row.locator('[data-edit="light"]')).to_have_text('暖色侧光，背景保持暗部。')
    expect(row.locator('[data-edit="motion"]')).to_have_text('缓慢环绕人物半周。')
    expect(row.locator('[data-edit="dialogue"]')).to_have_text(dialogue)
    page.reload();open_shot(2)
    settings_saved=export('reference-settings-saved')
    assert settings_saved['prompt']==settings_changed['prompt']
    assert settings_saved['images']==settings_changed['images']
    assert settings_saved['shotRevision']==settings_before['shotRevision']+1
    expect(page.get_by_label('成片时长（秒）',exact=True)).to_have_value('8.5')
    expect(page.get_by_label('对白·旁白',exact=True)).to_have_text(dialogue)
    page.get_by_label('对白·旁白',exact=True).fill('')
    cleared=export('reference-dialogue-cleared')
    assert '对白·旁白：' not in cleared['prompt'] and dialogue not in cleared['prompt']
    assert cleared['images']==settings_saved['images']
    page.get_by_role('button',name='保存镜头修改',exact=True).click()
    expect(page.locator('tr[data-shot="shot-2"] [data-edit="dialogue"]')).to_have_text('—')
    page.reload();open_shot(2)
    expect(page.get_by_label('对白·旁白',exact=True)).to_have_text('')
    expect(page.locator('#compiledPrompt')).not_to_contain_text('对白·旁白：')
    page.get_by_role('button',name='取消',exact=True).click()
    # The new-shot entry uses the same controls without requiring any reference image.
    page.locator('#addBtn').click()
    page.locator('#editorHost .rich-editor').fill('32132')
    edit_settings()
    new_shot=export('reference-new-shot-settings')
    assert new_shot['prompt'].startswith('32132') and '成片预算：8.5秒' in new_shot['prompt']
    assert new_shot['operation']=='image.generate' and new_shot['images']==[]
    page.get_by_role('button',name='保存镜头修改',exact=True).click()
    expect(page.locator('tbody tr')).to_have_count(8)
    page.get_by_role('button',name='卡片视图',exact=True).click()
    expect(page.get_by_role('button',name='编辑正文',exact=True)).to_have_count(0)
    expect(page.get_by_role('button',name='提示词与参考图',exact=True)).to_have_count(0)
    page.locator('.inspector .more').click()
    page.get_by_role('menuitem',name='编辑镜头',exact=True).click()
    expect(page.locator('#editorHost .rich-editor')).to_have_text('32132')
    expect(page.get_by_label('成片时长（秒）',exact=True)).to_have_value('8.5')
    expect(page.get_by_label('对白·旁白',exact=True)).to_have_text(dialogue)
    page.get_by_role('button',name='取消',exact=True).click()
    page.get_by_role('button',name='剧本大表',exact=True).click()
    for width in [1440,944,390]:
        page.set_viewport_size({'width':width,'height':1000})
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.set_viewport_size({'width':1440,'height':1000});open_shot(2)
    page.screenshot(path=str(OUT/'reference-handoff-preview.png'),full_page=False)
    assert not errors, errors
    print('PASS: compact references and matching hover images; clipboard, edits, replacement, deletion and imports; exact exported bytes; frame roles and mode limits; editable shot settings update preview/export; invalid durations block; cancel preserves settings; save/reload updates table; new-shot parameter flow. No browser errors.')
    browser.close()
