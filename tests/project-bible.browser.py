import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser=argparse.ArgumentParser(description='Verify project bible UI against an isolated workshop bridge fixture.')
parser.add_argument('fixture',type=Path)
parser.add_argument('--screenshot',type=Path)
args=parser.parse_args()
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome')
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda error:errors.append(str(error)))
    page.goto(args.fixture.resolve().as_uri(),wait_until='networkidle')
    page.get_by_role('button',name='项目',exact=True).click()
    card=page.get_by_role('region',name='项目设定',exact=True)
    expect(card).to_be_visible()
    expect(card).to_contain_text('已填写 4 / 4')
    expected=page.evaluate('window.__fixture.snapshot.document')
    fields=[('background','世界背景'),('rules','世界规则'),('timeline','历史时间线'),('arc','全剧主线')]
    for key,label in fields:
        tab=card.get_by_role('tab',name=label,exact=False)
        tab.click()
        expect(tab).to_have_attribute('aria-selected','true')
        value=expected['arc'] if key=='arc' else expected['projectBible'][key]
        assert card.locator('.bw-bible-prose').inner_text()==value
        card.get_by_role('button',name=f'复制{label}完善指令',exact=True).click()
        prompt=page.evaluate('window.__lastCopy')
        assert expected['id'] in prompt and 'update_production' in prompt
        assert ('arc' if key=='arc' else f'projectBible.{key}') in prompt
    checks.append('Four persisted project sections render exactly and copy correct scoped update instructions')
    tab=card.get_by_role('tab',name='全剧主线',exact=False)
    tab.focus(); tab.press('Home')
    expect(card.get_by_role('tab',name='世界背景',exact=False)).to_be_focused()
    page.keyboard.press('ArrowRight')
    expect(card.get_by_role('tab',name='世界规则',exact=False)).to_be_focused()
    page.keyboard.press('End')
    expect(card.get_by_role('tab',name='全剧主线',exact=False)).to_be_focused()
    assert card.locator('[role=tab][tabindex="0"]').count()==1
    checks.append('Keyboard arrows, Home/End, focus and tabpanel relationships work')
    page.get_by_role('button',name='剧本',exact=True).click()
    page.get_by_role('button',name='项目',exact=True).click()
    expect(card.get_by_role('tab',name='全剧主线',exact=False)).to_have_attribute('aria-selected','true')
    checks.append('Selected section survives app tab navigation')
    page.evaluate("window.__fixture.snapshot.document.projectBible.rules='Revised rule from persisted fixture'")
    page.get_by_role('button',name='刷新',exact=True).click()
    card.get_by_role('tab',name='世界规则',exact=False).click()
    expect(card.locator('.bw-bible-prose')).to_have_text('Revised rule from persisted fixture')
    checks.append('Refresh reads updated project data')
    page.evaluate("delete window.__fixture.snapshot.document.projectBible")
    page.get_by_role('button',name='刷新',exact=True).click()
    expect(card).to_contain_text('已填写 1 / 4')
    expect(card).to_contain_text('尚未填写世界规则')
    card.get_by_role('tab',name='全剧主线',exact=False).click()
    assert card.locator('.bw-bible-prose').inner_text()==expected['arc']
    card.get_by_role('tab',name='世界背景',exact=False).click()
    card.get_by_role('button',name='复制世界背景补充指令',exact=True).click()
    assert 'projectBible.background' in page.evaluate('window.__lastCopy')
    checks.append('Legacy work keeps its arc, missing sections remain empty with useful copy actions')
    page.evaluate("window.__fixture.snapshot.document.projectBible={background:'<img src=x onerror=window.__xss=1>\\n'+('完整背景内容。'.repeat(2500))}")
    page.get_by_role('button',name='刷新',exact=True).click()
    expect(card.locator('.bw-bible-prose')).to_contain_text('<img src=x onerror=window.__xss=1>')
    assert card.locator('img').count()==0 and not page.evaluate('Boolean(window.__xss)')
    assert card.locator('[role=tabpanel]').evaluate('e=>e.scrollHeight>e.clientHeight')
    checks.append('Long content scrolls within panel and HTML-like text cannot execute')
    for width in [1440,900,600,390]:
        page.set_viewport_size({'width':width,'height':1000})
        for theme in ['dark','light']:
            page.evaluate('(theme)=>document.documentElement.dataset.theme=theme',theme)
            for key,label in fields:
                card.get_by_role('tab',name=label,exact=False).click()
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme,label)
                assert card.locator('[role=tabpanel]').evaluate('(e)=>e.getBoundingClientRect().right<=innerWidth'),(width,theme)
        checks.append(f'{width}px: all sections fit in both themes')
    assert not errors,errors
    page.reload(wait_until='networkidle')
    page.set_viewport_size({'width':1440,'height':1000})
    page.get_by_role('button',name='项目',exact=True).click()
    page.evaluate("document.documentElement.dataset.theme='dark'")
    if args.screenshot: page.screenshot(path=str(args.screenshot),full_page=True)
    checks.append('No uncaught browser errors')
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
