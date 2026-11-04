"""Real editor custom-dropdown interaction, persistence, dismissal and viewport checks."""
from pathlib import Path
import json, os, re, subprocess
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
        page=browser.new_page(viewport={'width':1100,'height':850},color_scheme='dark')
        page.set_default_timeout(8000)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        def read():
            return page.request.post(origin+'/tool',data={'name':'get_production','args':{'id':fixture['id']}}).json()['result']
        page.goto(fixture['url']);page.get_by_role('button',name='分镜',exact=True).click()
        page.locator('[data-edit="body"]').click()
        panel=page.locator('.bw-generation-dialog')
        expect(panel.locator('.rich-editor')).to_have_count(5)
        expect(panel.locator('select')).to_have_count(0)
        expect(panel.get_by_role('combobox')).to_have_count(3)
        scale=panel.get_by_role('combobox',name='景别',exact=True)
        mode=panel.get_by_role('combobox',name='请求形式',exact=True)
        cap=panel.get_by_role('combobox',name='图片上限',exact=True)
        original=read()['production']['revision']
        scale.click()
        menu=page.get_by_role('listbox',name='景别',exact=True)
        expect(menu).to_be_visible();expect(menu.get_by_role('option')).to_have_count(9)
        assert menu.evaluate('(el)=>el.matches(":popover-open")')
        expect(menu.get_by_role('option',name='未指定',exact=True)).to_have_attribute('aria-selected','true')
        expect(scale.locator('svg')).to_have_css('width','14px')
        scale.press('End');scale.press('Escape')
        expect(menu).to_have_count(0);expect(panel).to_be_visible();expect(scale).to_be_focused()
        expect(scale).to_have_attribute('value','')
        assert read()['production']['revision']==original
        scale.press('ArrowDown');scale.press('End');scale.press('ArrowUp');scale.press('Enter')
        expect(scale).to_have_attribute('value','特写')
        expect(panel.get_by_label('编译提示词',exact=True)).to_have_value(re.compile('Scale: 特写'))
        mode.click();cap.click()
        expect(page.get_by_role('listbox',name='请求形式',exact=True)).to_have_count(0)
        expect(page.get_by_role('listbox',name='图片上限',exact=True)).to_be_visible()
        cap.press('Home');cap.press('ArrowDown');cap.press('Enter');expect(cap).to_have_attribute('value','2')
        select_value(page,'请求形式','image.generate')
        mode.click();page.get_by_role('heading',name='编译提示词',exact=True).click()
        expect(mode).to_have_attribute('aria-expanded','false')
        cap.click();cap.press('Tab');expect(page.locator('.bw-select-menu')).to_have_count(0)
        panel.get_by_role('button',name='取消',exact=True).click()
        assert read()['production']['revision']==original
        page.locator('[data-edit="body"]').click();expect(panel.locator('.rich-editor')).to_have_count(5)
        expect(scale).to_have_attribute('value','');expect(mode).to_have_attribute('value','video.text');expect(cap).to_have_attribute('value','8')
        select_value(page,'景别','近景');select_value(page,'请求形式','image.generate');select_value(page,'图片上限','3')
        panel.get_by_role('button',name='保存镜头',exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        shot=read()['production']['shots'][0]
        assert shot['scale']=='近景' and shot['generationSettings']=={'operation':'image.generate','maxReferenceImages':3}
        panel.get_by_role('button',name='取消',exact=True).click();page.reload()
        page.get_by_role('button',name='分镜',exact=True).click();page.locator('[data-edit="body"]').click()
        expect(scale).to_have_attribute('value','近景');expect(mode).to_have_attribute('value','image.generate');expect(cap).to_have_attribute('value','3')
        mode.click();page.screenshot(path=str(OUT/'custom-select-desktop.png'))
        assert page.get_by_role('listbox',name='请求形式').locator('.bw-select-option > span').evaluate_all('(nodes)=>nodes.every(el=>el.getBoundingClientRect().height<=19)')
        page.set_viewport_size({'width':390,'height':760})
        expect(page.locator('.bw-select-menu')).to_have_count(0)
        mode.click();menu=page.get_by_role('listbox',name='请求形式',exact=True)
        rect=menu.bounding_box();assert rect['x']>=8 and rect['x']+rect['width']<=382 and rect['y']>=8 and rect['y']+rect['height']<=752
        mode.press('Escape');scale.click();menu=page.get_by_role('listbox',name='景别',exact=True)
        menu.evaluate('(el)=>el.scrollTop=el.scrollHeight')
        expect(menu).to_be_visible()
        scale.press('End');scale.press('Enter');expect(scale).to_have_attribute('value','极特写')
        page.screenshot(path=str(OUT/'custom-select-mobile.png'))
        cap.click();panel.get_by_role('button',name='取消',exact=True).click()
        expect(page.locator('.bw-select-menu')).to_have_count(0)
        assert not errors,errors
        print('PASS: custom HTML dropdowns, keyboard confirm/cancel, outside/Tab/resize dismissal, one menu, draft cancel, save/reload, scrolling, viewport and cleanup.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
