"""Real workbench regressions for caret-anchored, category-filtered reference picking."""
from pathlib import Path
import json, os, subprocess
from playwright.sync_api import sync_playwright, expect
from workbench_controls import select_value
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('PI_SCRATCH_DIR', '/tmp'))
server = subprocess.Popen(['node', str(ROOT/'tests/generation-panel-host.cjs')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = server.stdout.readline(); assert line, server.stderr.read()
    fixture = json.loads(line); origin = fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width':1100, 'height':850}, color_scheme='dark')
        page.set_default_timeout(8000)
        errors = []; page.on('pageerror', lambda error: errors.append(str(error)))
        def call(name, args):
            result = page.request.post(origin+'/tool', data={'name':name, 'args':args}).json()
            assert 'error' not in result, result
            return result['result']
        created = call('add_assets', {'id':fixture['id'], 'assets':[{'name':'红灯笼','type':'道具'}, {'name':'相机','type':'产品'}, {'name':'水墨','type':'风格'}]})['assets']
        for asset in created:
            call('adopt_media', {'id':fixture['id'], 'assetId':asset['id'], 'mediaId':fixture['red']['mediaId']})
        page.goto(fixture['url']); page.get_by_role('button', name='分镜', exact=True).click()
        page.locator('[data-edit="body"]').click()
        panel = page.locator('.bw-generation-dialog')
        editor = panel.get_by_role('textbox', name='画面描述 · 图片引用', exact=True)
        expect(panel.locator('.rich-editor')).to_have_count(5)
        picker = panel.locator('.reference-picker')
        def type_mention(text):
            editor.fill(text); editor.press('ControlOrMeta+End')
            editor.press_sequentially('@')
            expect(picker).to_be_visible()
        def geometry():
            return editor.evaluate('''el=>{
              const selection=getSelection(), range=selection.getRangeAt(0).cloneRange();range.collapse(false);
              const caret=range.getBoundingClientRect(),menu=document.querySelector('.reference-picker').getBoundingClientRect();
              return {caret:{left:caret.left,right:caret.right,top:caret.top,bottom:caret.bottom},menu:{left:menu.left,right:menu.right,top:menu.top,bottom:menu.bottom},vw:innerWidth,vh:innerHeight};
            }''')
        type_mention('无影人站在青石巷。')
        expect(picker.get_by_role('option')).to_have_count(5)
        rect = geometry()
        tabs = picker.get_by_role('tablist', name='引用用途')
        tabs.get_by_role('tab', name='角色参考', exact=True).click()
        # Gather both original failures before asserting, so the baseline is explicit.
        baseline = {'anchorGap':rect['menu']['top']-rect['caret']['bottom'], 'anchorX':rect['menu']['left']-rect['caret']['right'], 'characterChoices':picker.get_by_role('option').count()}
        print('Picker baseline:', json.dumps(baseline), flush=True)
        assert abs(baseline['anchorGap']-6) < 2 and abs(baseline['anchorX']) < 2 and baseline['characterChoices'] == 1, baseline
        expect(picker.get_by_role('option')).to_have_text(['无影人 · 当前图片角色 · 红色参考'])
        for role, count in [('场景参考',1), ('道具参考',2), ('风格参考',1), ('视频首帧',5), ('视频尾帧',5), ('按资产类型',5)]:
            tabs.get_by_role('tab', name=role, exact=True).click()
            expect(picker.get_by_role('option')).to_have_count(count)
        expect(editor.locator('.reference-token')).to_have_count(0)
        # Filtering survives returning to the same mention and typing more query text.
        tabs.get_by_role('tab', name='角色参考', exact=True).click()
        editor.press('ControlOrMeta+End'); editor.press_sequentially('青')
        expect(tabs.get_by_role('tab', name='角色参考', exact=True)).to_have_attribute('aria-selected','true')
        expect(picker.get_by_role('option')).to_have_count(0)
        expect(picker).to_contain_text('没有匹配的图片')
        tabs.get_by_role('tab', name='场景参考', exact=True).click()
        expect(picker.get_by_role('option')).to_have_count(1)
        picker.get_by_role('option', name='青石巷 · 当前图片', exact=True).click()
        expect(editor.locator('.reference-token')).to_have_text('@青石巷')
        # Replacement stays anchored to the actual chip, retains role, and may change category.
        chip = editor.locator('.reference-token'); chip.click()
        expect(tabs.get_by_role('tab', name='场景参考', exact=True)).to_have_attribute('aria-selected','true')
        expect(picker.get_by_role('option')).to_have_count(1)
        bounds = chip.bounding_box(); popup = picker.bounding_box()
        assert abs(bounds['x']-popup['x']) < 2 and abs(bounds['y']+bounds['height']+6-popup['y']) < 2
        tabs.get_by_role('tab', name='风格参考', exact=True).click()
        expect(picker.get_by_role('option')).to_have_count(1)
        picker.get_by_role('option', name='水墨 · 当前图片', exact=True).click()
        select_value(page, '请求形式', 'image.reference')
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        saved = call('get_production', {'id':fixture['id']})['production']['shots'][0]
        reference = next(node for node in saved['generationBrief']['nodes'] if node['type']=='reference')
        assert reference == {'type':'reference','assetId':created[2]['id'],'mediaId':fixture['red']['mediaId'],'role':'style'}
        # Auto-by-type must also assign style correctly.
        type_mention('')
        editor.press_sequentially('水墨')
        picker.get_by_role('option', name='水墨 · 当前图片', exact=True).click()
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        assert call('get_production', {'id':fixture['id']})['production']['shots'][0]['generationBrief']['nodes'][0]['role'] == 'style'
        # Keyboard filter navigation, selection and explicit frame purpose.
        type_mention('')
        editor.press('Tab'); page.keyboard.press('End')
        expect(tabs.get_by_role('tab', name='视频尾帧', exact=True)).to_be_focused()
        expect(picker.get_by_role('option')).to_have_count(5)
        picker.get_by_role('option', name='青石巷 · 当前图片', exact=True).click()
        editor.locator('.reference-token').click()
        expect(tabs.get_by_role('tab', name='视频尾帧', exact=True)).to_have_attribute('aria-selected','true')
        page.keyboard.press('Escape'); expect(picker).to_have_count(0)
        # Wrapped query follows the last visual line and stays within the viewport.
        type_mention('镜头描述。'*50)
        editor.press_sequentially('无')
        rect = geometry()
        assert abs(rect['menu']['left']-min(rect['caret']['right'],rect['vw']-(rect['menu']['right']-rect['menu']['left'])-8)) < 2
        assert 0 <= rect['menu']['top'] < rect['menu']['bottom'] <= rect['vh']
        assert min(abs(rect['menu']['top']-rect['caret']['bottom']-6),abs(rect['caret']['top']-rect['menu']['bottom']-6)) < 2
        # Scrolling moves the anchor (or dismisses it once it is out of view).
        panel.locator('.bw-generation-body').evaluate('(el)=>el.scrollTop=el.scrollHeight')
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        if picker.count():
            rect = geometry()
            assert min(abs(rect['menu']['top']-rect['caret']['bottom']-6),abs(rect['caret']['top']-rect['menu']['bottom']-6)) < 2
            page.keyboard.press('Escape')
        expect(picker).to_have_count(0)
        effects = panel.get_by_role('textbox', name='音效', exact=True)
        effects.fill('雨声'); effects.press('ControlOrMeta+End'); effects.press_sequentially('@')
        expect(picker).to_be_visible()
        page.screenshot(path=str(OUT/'reference-picker-effects.png'))
        effects_bounds = effects.bounding_box(); popup = picker.bounding_box()
        assert popup['y'] >= 0 and popup['y']+popup['height'] <= 850
        page.keyboard.press('Escape')
        panel.get_by_role('button', name='取消', exact=True).click()
        page.set_viewport_size({'width':390,'height':760})
        page.locator('[data-edit="body"]').click()
        expect(panel.locator('.rich-editor')).to_have_count(5)
        type_mention('无影人站在青石巷。')
        rect=geometry()
        assert rect['menu']['left'] >= 8 and rect['menu']['right'] <= 382
        assert rect['menu']['top'] >= 0 and rect['menu']['bottom'] <= 760
        page.screenshot(path=str(OUT/'reference-picker-mobile.png'))
        assert not errors,errors
        print('PASS: caret/chip anchoring, category + text filtering, empty choices, keyboard/frame roles, saved style binding, wrapping, scroll dismissal and narrow viewport.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
