"""A saved export must match the project settings the user actually reviewed."""
from pathlib import Path
import json,re,subprocess
from playwright.sync_api import sync_playwright,expect
ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen(['node',str(ROOT/'tests/generation-panel-host.cjs')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    line=server.stdout.readline();assert line,server.stderr.read()
    fixture=json.loads(line);origin=fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':980})
        page.goto(fixture['url']);page.get_by_role('button',name='分镜',exact=True).click()
        page.locator('[data-edit="body"]').click()
        panel=page.locator('.bw-generation-dialog')
        panel.get_by_role('button',name='保存镜头',exact=True).click()
        expect(panel.locator('.bw-generation-status')).to_have_text('已保存')
        expect(panel.locator('.bw-generation-recover')).to_be_hidden()
        before=panel.get_by_label('编译提示词',exact=True).input_value()
        result=page.request.post(origin+'/tool',data={'name':'update_production','args':{'id':fixture['id'],'style':'Changed project style'}}).json()
        assert 'error' not in result,result
        downloads=[];page.on('download',lambda item:downloads.append(item))
        panel.get_by_role('button',name='导出当前输入包',exact=True).click()
        expect(panel.locator('.bw-generation-body > .bw-generation-error')).to_contain_text('CONFLICT')
        assert not downloads
        assert panel.get_by_label('编译提示词',exact=True).input_value()==before
        expect(panel.locator('.bw-generation-recover')).to_be_visible()
        panel.get_by_role('button',name='回读并核对',exact=True).click()
        panel.get_by_role('button',name='已核对，保留草稿继续编辑',exact=True).click()
        expect(panel.get_by_label('编译提示词',exact=True)).to_have_value(re.compile('Changed project style'))
        expect(panel.locator('.bw-generation-recover')).to_be_hidden()
        with page.expect_download() as event:panel.get_by_role('button',name='导出当前输入包',exact=True).click()
        package=json.loads(Path(event.value.path()).read_text())
        assert package['compiled']['prompt']==panel.get_by_label('编译提示词',exact=True).input_value()
        assert package['compiled']['parameters']['style']=='Changed project style'
        print('PASS: project-setting change blocks stale saved export; explicit reread restores preview/export equality.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
