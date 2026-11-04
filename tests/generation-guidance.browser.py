"""Actionable generation feedback and real multi-episode custom dropdown navigation."""
from pathlib import Path
import json, os, subprocess
from playwright.sync_api import sync_playwright, expect
from workbench_controls import select_value
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('PI_SCRATCH_DIR','/tmp'))
server=subprocess.Popen(['node',str(ROOT/'tests/generation-panel-host.cjs')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    line=server.stdout.readline();assert line,server.stderr.read()
    fixture=json.loads(line);origin=fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':1100,'height':850},color_scheme='dark');page.set_default_timeout(8000)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        def call(name,args):
            data=page.request.post(origin+'/tool',data={'name':name,'args':args}).json();assert 'error' not in data,data
            return data['result']
        def read():return call('get_production',{'id':fixture['id']})
        second=call('write_script',{'id':fixture['id'],'title':'Departure','prose':'A second episode.'})['episodeId']
        call('write_episodes',{'id':fixture['id'],'episodes':[{'episodeId':second,'title':'Departure','beats':[{'title':'Departure beat'}]}]})
        beat=next(ep for ep in read()['production']['episodes'] if ep['id']==second)['script']['beats'][0]['id']
        second_shot=call('add_shots',{'id':fixture['id'],'episodeId':second,'shots':[{'title':'Departure shot','scene':'Leave the alley.','beatId':beat,'duration':9}]})['shots'][0]['id']
        empty=call('write_script',{'id':fixture['id'],'title':'Empty episode','prose':'No shots yet.'})['episodeId']
        page.goto(fixture['url']);page.get_by_role('button',name='分镜',exact=True).click()
        select_value(page,'选择剧集',fixture['episodeId'])
        picker=page.get_by_role('combobox',name='选择剧集',exact=True)
        expect(page.locator('select.bw-episode-picker')).to_have_count(0)
        picker.click();menu=page.get_by_role('listbox',name='选择剧集',exact=True)
        expect(menu.get_by_role('option')).to_have_count(3)
        assert menu.evaluate('(el)=>el.matches(":popover-open")')
        picker.press('End');picker.press('Escape');expect(picker).to_have_attribute('value',fixture['episodeId'])
        picker.press('ArrowDown');picker.press('Home');picker.press('ArrowDown');picker.press('Enter')
        expect(picker).to_have_attribute('value',second)
        expect(page.locator('.bw-shot-table tbody tr')).to_have_attribute('data-shot',second_shot)
        expect(page.locator('.bw-count')).to_contain_text('9s')
        page.get_by_role('button',name='卡片视图',exact=True).click()
        expect(page.locator('.bw-card-head h2')).to_have_text('Departure shot')
        select_value(page,'选择剧集',empty)
        expect(page.locator('.bw-count')).to_contain_text('0 个镜头')
        expect(page.locator('.bw-storyboard')).to_contain_text('这一集还没有分镜')
        select_value(page,'选择剧集',fixture['episodeId'])
        expect(page.locator('.bw-card-head h2')).to_have_text('Reference shot')
        picker.click();page.get_by_role('button',name='项目',exact=True).click()
        expect(page.locator('.bw-select-menu')).to_have_count(0)
        page.get_by_role('button',name='分镜',exact=True).click()
        page.locator('[data-edit="body"]').click()
        panel=page.locator('.bw-generation-dialog');editor=panel.get_by_role('textbox',name='画面描述 · 图片引用',exact=True)
        expect(panel.locator('.rich-editor')).to_have_count(5)
        baseline=read()['production']['revision']
        editor.fill('@无');page.get_by_role('option',name='无影人 · 当前图片',exact=True).click()
        feedback=panel.locator('.bw-generation-request .bw-generation-error')
        expect(feedback).to_contain_text('已添加参考图片，请切换为“参考图生视频”，或移除图片引用。')
        assert 'UNSUPPORTED_REFERENCE_MODE' not in feedback.inner_text()
        expect(feedback.locator('details')).not_to_have_attribute('open','')
        feedback.locator('summary').click();expect(feedback.locator('pre')).to_be_visible()
        expect(feedback.locator('pre')).to_contain_text('UNSUPPORTED_REFERENCE_MODE')
        feedback.get_by_role('button',name='切换为参考图生视频',exact=True).click()
        expect(panel.get_by_role('combobox',name='请求形式')).to_have_attribute('value','video.reference')
        expect(panel.get_by_label('编译提示词',exact=True)).to_be_visible()
        expect(editor.locator('.reference-token')).to_have_text('@无影人')
        assert read()['production']['revision']==baseline
        select_value(page,'请求形式','image.generate')
        expect(feedback).to_contain_text('切换为“参考图生图”')
        feedback.get_by_role('button',name='切换为参考图生图',exact=True).click()
        expect(panel.get_by_role('button',name='导出当前输入包')).to_be_enabled()
        select_value(page,'请求形式','video.image')
        expect(feedback).to_contain_text('需要且仅能使用一张图片')
        expect(feedback).to_contain_text('角色或场景参考不能直接作为首帧')
        expect(panel.get_by_role('button',name='导出当前输入包')).to_be_disabled()
        select_value(page,'请求形式','video.first-last')
        expect(feedback).to_contain_text('两张内容不同的图片')
        select_value(page,'请求形式','video.reference')
        editor.press('ControlOrMeta+End');editor.press_sequentially(' @青')
        page.get_by_role('option',name='青石巷 · 当前图片',exact=True).click()
        select_value(page,'图片上限','1')
        expect(feedback).to_contain_text('当前图片数量超过上限（1 张）')
        expect(feedback).to_contain_text('请调高“图片上限”')
        select_value(page,'图片上限','8')
        editor.fill('无图片的文字。')
        expect(feedback).to_contain_text('至少需要一张参考图片')
        feedback.get_by_role('button',name='切换为文生视频',exact=True).click()
        expect(panel.get_by_label('编译提示词',exact=True)).to_be_visible()
        panel.get_by_role('button',name='取消',exact=True).click()
        assert read()['production']['revision']==baseline
        page.set_viewport_size({'width':390,'height':760})
        picker.click();rect=menu.bounding_box();assert rect['x']>=8 and rect['x']+rect['width']<=382
        expect(picker.locator('svg')).to_have_css('width','14px')
        page.screenshot(path=str(OUT/'episode-custom-dropdown.png'))
        assert not errors,errors
        print('PASS: Chinese mode/count/frame guidance, collapsed diagnostics, explicit draft-only mode switch, multi-episode mouse/keyboard/card/empty switching and dropdown cleanup/viewport.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
