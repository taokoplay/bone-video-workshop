"""Actual workbench, real plugin and isolated private media; never calls providers."""
from pathlib import Path
import base64, hashlib, json, os, subprocess
from playwright.sync_api import sync_playwright, expect
from workbench_controls import select_value
ROOT = Path(__file__).resolve().parents[1]
SCRATCH = Path(os.environ.get('PI_SCRATCH_DIR', '/tmp'))
server = subprocess.Popen(['node', str(ROOT/'tests/generation-panel-host.cjs')], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = server.stdout.readline()
    assert line, server.stderr.read()
    fixture = json.loads(line)
    origin = fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 980}, color_scheme='dark')
        page.set_default_timeout(10000)
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        def call(name, args):
            data = page.request.post(origin+'/tool', data={'name': name, 'args': args}).json()
            assert 'error' not in data, data
            return data['result']
        def read(): return call('get_production', {'id': fixture['id']})
        def invoke(channel, payload):
            data = page.request.post(origin+'/bridge', data={'channel':channel, 'payload':payload}).json()
            assert 'error' not in data, data
            return data['result']
        def open_editor(field='body'):
            page.locator(f'[data-shot="{fixture["shotId"]}"][data-edit="{field}"]').click()
            expect(page.locator('.bw-generation-dialog .rich-editor')).to_have_count(5)
            expect(page.get_by_role('textbox', name={'body':'画面描述 · 图片引用','effects':'音效'}[field], exact=True)).to_be_editable()
        def download(button):
            with page.expect_download() as event: button.click()
            return json.loads(Path(event.value.path()).read_text())
        def choose(editor, query, option):
            editor.fill(query)
            page.get_by_role('option', name=option, exact=True).click()
        # Registered asset versions remain available without importing inside the shot editor.
        blue = invoke('bone.media', {'id':fixture['id'], 'mediaId':fixture['blue']['mediaId']})
        invoke('bone.generation.import-image', {'id':fixture['id'], 'assetId':fixture['assets'][0]['id'], 'expectedProductionRevision':read()['production']['revision'], 'title':'alternate.png', 'mimeType':'image/png', 'data':blue['dataUrl'].split(',')[1]})
        page.goto(fixture['url'])
        initial = read()
        page.get_by_role('button', name='分镜', exact=True).click()
        expect(page.get_by_role('columnheader')).to_have_count(9)
        expect(page.locator('.bw-sidebar')).to_have_count(0)
        assert read()['production']['revision'] == initial['production']['revision']
        page.get_by_role('button', name='镜头 1 更多操作', exact=True).click()
        page.get_by_role('menuitem', name='编辑镜头', exact=True).click()
        panel = page.locator('.bw-generation-dialog')
        editor = panel.get_by_role('textbox', name='画面描述 · 图片引用', exact=True)
        expect(panel.locator('.rich-editor')).to_have_count(5)
        expect(panel.locator('input[type="file"], .bw-generation-import, .bw-generation-delivery')).to_have_count(0)
        expect(panel.get_by_role('button', name='准备生成请求', exact=True)).to_have_count(0)
        expect(panel.get_by_role('button', name='复制交接指令', exact=True)).to_have_count(0)
        expect(panel.locator('.bw-generation-recover')).to_be_hidden()
        expect(panel.locator('.bw-generation-footer button')).to_have_text(['取消', '导出当前输入包', '保存镜头'])
        editor.fill('@无')
        expect(panel.locator('.bw-generation-request')).to_contain_text('等待选择资产')
        expect(panel.get_by_role('button', name='导出当前输入包')).to_be_disabled()
        tabs = panel.get_by_role('tablist', name='引用用途', exact=True)
        expect(tabs.get_by_role('tab')).to_have_count(7)
        tabs.get_by_role('tab', name='角色参考', exact=True).click()
        page.get_by_role('option', name='无影人 · 当前图片', exact=True).click()
        editor.press('ControlOrMeta+End'); editor.press_sequentially('站在@青')
        page.get_by_role('option', name='青石巷 · 当前图片', exact=True).click()
        editor.press('ControlOrMeta+End'); editor.press_sequentially('。')
        select_value(page, '请求形式', 'image.reference')
        select_value(page, '景别', '中近景')
        panel.get_by_label('成片预算时长（秒）', exact=True).fill('5.25')
        panel.get_by_role('textbox', name='光影氛围', exact=True).fill('冷色侧光')
        panel.get_by_role('textbox', name='运镜', exact=True).fill('环绕人物')
        dialogue = panel.get_by_role('textbox', name='对白 · 旁白', exact=True)
        choose(dialogue, '@无', '无影人 · 当前图片')
        dialogue.press('ControlOrMeta+End'); dialogue.press_sequentially('：别回头。')
        effects = panel.get_by_role('textbox', name='音效', exact=True)
        choose(effects, '@青', '青石巷 · 当前图片')
        effects.press('ControlOrMeta+End'); effects.press_sequentially('：雨声。')
        prompt = panel.get_by_label('编译提示词', exact=True)
        assert '冷色侧光' in prompt.input_value() and '环绕人物' not in prompt.input_value()
        expect(panel).to_contain_text('内容仍会保存')
        draft_package = download(panel.get_by_role('button', name='导出当前输入包'))
        assert draft_package['saved'] is False and 'inputHash' in draft_package
        assert draft_package['draft']['soundDesign']['music'] == '保留镜头音乐'
        assert read()['production']['revision'] == initial['production']['revision']
        for image in draft_package['images']:
            assert hashlib.sha256(base64.b64decode(image['data'])).hexdigest() == image['sha256']
        select_value(page, '请求形式', 'video.reference')
        assert all(text in prompt.input_value() for text in ['环绕人物', '别回头', '雨声', '5.25', '7'])
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        expect(panel.get_by_role('button', name='保存镜头', exact=True)).to_be_disabled()
        work = read(); shot = work['production']['shots'][0]
        assert shot['scene'] == '无影人站在青石巷。'
        assert shot['duration'] == 5.25 and shot['scale'] == '中近景'
        assert shot['lighting'] == '冷色侧光' and shot['motion'] == '环绕人物'
        assert shot['soundDesign'] == {'music':'保留镜头音乐', 'effects':'青石巷：雨声。'}
        assert shot['productionPlan'] == initial['production']['shots'][0]['productionPlan']
        assert set(shot['referenceFields']) == {'lighting','motion','dialogue','effects'}
        args = {'id':fixture['id'],'shotId':fixture['shotId'],'expectedShotRevision':work['shotStates'][fixture['shotId']]['revision'],'operation':'video.reference','maxReferenceImages':8}
        prepared = call('prepare_shot_generation', args)
        assert prompt.input_value() == prepared['compiled']['prompt']
        assert prepared['compiled']['parameters']['editDurationSeconds'] == 5.25
        assert prepared['compiled']['parameters']['requestedDurationSeconds'] == 7
        assert len(prepared['compiled']['images']) == 2
        package = download(panel.get_by_role('button', name='导出当前输入包'))
        assert package['saved'] is True and package['requestHash'] == prepared['requestHash']
        visible = panel.locator('.bw-generation-image').evaluate_all('(nodes)=>nodes.map(n=>({id:n.dataset.mediaId,src:n.querySelector("img")?.src}))')
        for slot, ui in zip(package['images'], visible):
            assert slot['mediaId'] == ui['id'] and slot['data'] == ui['src'].split(',')[1]
            assert hashlib.sha256(base64.b64decode(slot['data'])).hexdigest() == slot['sha256']
        chip = editor.locator('.reference-token').filter(has_text='@无影人')
        expect(chip).to_have_text('@无影人')
        chip.scroll_into_view_if_needed()
        page.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        assert chip.bounding_box()['height'] < 24
        chip.hover(); tooltip = page.get_by_role('tooltip')
        expect(tooltip).to_contain_text('无影人 · 当前图片')
        expect(tooltip.locator('img')).to_have_attribute('src', visible[0]['src'])
        page.keyboard.press('Escape'); expect(tooltip).to_be_hidden(); expect(panel).to_be_visible()
        # A changed draft can choose a registered alternate; cancel does not save it.
        editor.press('ControlOrMeta+End'); editor.press_sequentially('草稿保留。')
        expect(panel.get_by_role('button', name='保存镜头', exact=True)).to_be_enabled()
        expect(editor).to_contain_text('草稿保留。')
        work = read(); asset = work['production']['assets'][0]
        assert asset['mediaId'] == fixture['red']['mediaId']
        assert len(asset['referenceMediaIds']) >= 1
        chip.click(); page.get_by_role('option', name='无影人 · 已关联图片', exact=True).click()
        expect(editor).to_contain_text('草稿保留。')
        panel.get_by_role('button', name='取消', exact=True).click()
        assert '草稿保留' not in read()['production']['shots'][0]['scene']
        # Conflict resolution preserves local body and uses fresh untouched motion.
        open_editor()
        editor = page.get_by_role('textbox', name='画面描述 · 图片引用', exact=True)
        editor.press('ControlOrMeta+End'); editor.press_sequentially('新增动作。')
        call('update_shot', {'id':fixture['id'],'shotId':fixture['shotId'],'motion':'External camera change','referenceFields':None})
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-body > .bw-generation-error')).to_contain_text('CONFLICT')
        expect(editor).to_contain_text('新增动作。')
        expect(panel.locator('.bw-generation-recover')).to_be_visible()
        panel.get_by_role('button', name='回读并核对', exact=True).click()
        panel.get_by_role('button', name='已核对，保留草稿继续编辑', exact=True).click()
        expect(panel.get_by_role('textbox', name='运镜', exact=True)).to_have_text('External camera change')
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        expect(panel.locator('.bw-generation-recover')).to_be_hidden()
        expect(panel.get_by_role('button', name='保存镜头', exact=True)).to_be_disabled()
        select_value(page, '请求形式', 'video.image')
        expect(panel.locator('.bw-generation-request')).to_contain_text('UNSUPPORTED_REFERENCE_MODE')
        expect(panel.get_by_role('button', name='导出当前输入包')).to_be_disabled()
        panel.get_by_role('button', name='取消', exact=True).click()
        page.reload(); page.get_by_role('button', name='分镜', exact=True).click()
        open_editor('effects')
        expect(page.get_by_role('textbox', name='音效', exact=True)).to_be_focused()
        page.get_by_role('textbox', name='音效', exact=True).fill('')
        page.get_by_role('textbox', name='对白 · 旁白', exact=True).fill('')
        panel.get_by_role('button', name='保存镜头', exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        expect(panel.get_by_role('button', name='保存镜头', exact=True)).to_be_disabled()
        final = read()['production']['shots'][0]
        assert final['dialogue'] == '' and final['soundDesign']['effects'] == ''
        assert final['soundDesign']['music'] == '保留镜头音乐'
        assert '别回头' not in panel.get_by_label('编译提示词', exact=True).input_value()
        panel.get_by_role('button', name='取消', exact=True).click()
        episode_package = download(page.get_by_role('button', name='导出本集输入包'))
        assert len(episode_package['inputs']) == 1 and episode_package['inputs'][0]['saved']
        # Exact quick scale menu and real add/move/delete paths.
        page.locator('[data-edit="scale"]').click()
        expect(page.locator('.bw-scale-chevron')).to_have_css('width', '14px')
        page.get_by_role('menuitemradio', name='特写', exact=True).click()
        expect(page.locator('[data-edit="scale"]')).to_contain_text('特写')
        page.get_by_role('button', name='＋ 添加镜头', exact=True).click()
        add = page.get_by_role('dialog', name='添加镜头', exact=True)
        expect(add.get_by_role('combobox')).to_have_value('')
        add.get_by_role('combobox').select_option(read()['production']['episodes'][0]['script']['beats'][0]['id'])
        add.get_by_label('镜头标题').fill('New real shot')
        add.get_by_label('画面描述 · 生成正文').fill('A new scene')
        add.get_by_role('button', name='添加镜头', exact=True).click()
        expect(page.locator('.bw-shot-table tbody tr')).to_have_count(2)
        added = next(s for s in read()['production']['shots'] if s['title'] == 'New real shot')
        page.get_by_role('button', name='镜头 2 更多操作', exact=True).click()
        page.get_by_role('menuitem', name='上移一镜', exact=True).click()
        expect(page.locator('.bw-shot-table tbody tr').first).to_have_attribute('data-shot', added['id'])
        page.get_by_role('button', name='镜头 1 更多操作', exact=True).click()
        page.get_by_role('menuitem', name='删除镜头…', exact=True).click()
        page.get_by_role('dialog', name='删除镜头').get_by_role('button', name='确认删除').click()
        expect(page.locator('.bw-shot-table tbody tr')).to_have_count(1)
        page.screenshot(path=str(SCRATCH/'real-storyboard-table.png'))
        page.get_by_role('button', name='卡片视图', exact=True).click()
        expect(page.get_by_role('complementary', name='镜头序列')).to_be_visible()
        expect(page.locator('.bw-card-inspector .bw-shot-workspace')).to_be_visible()
        expect(page.locator('.bw-storyboard details')).to_have_count(0)
        page.get_by_role('button', name='剧本大表', exact=True).click()
        open_editor()
        page.screenshot(path=str(SCRATCH/'real-generation-panel.png'))
        page.set_viewport_size({'width':600,'height':850})
        assert panel.evaluate('(el)=>el.getBoundingClientRect().width') <= 576
        assert panel.locator('.bw-generation-grid').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.split(" ").length') == 1
        panel.get_by_role('button', name='取消', exact=True).click()
        assert not errors, errors
        print('PASS: focused workbench fields, roles, preview/prepare parity, verified export without manual handoff, draft cancel, registered image versions, conditional conflict recovery, clearing/reload, episode export, CRUD and responsive layout.', flush=True)
        browser.close()
finally:
    server.terminate()
    try: server.wait(timeout=10)
    except subprocess.TimeoutExpired: server.kill(); server.wait()
