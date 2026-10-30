"""User-path checks against a fixture produced by the real registered tools."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('fixture',type=Path);parser.add_argument('--screenshot',type=Path);args=parser.parse_args()
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome')
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.fixture.resolve().as_uri(),wait_until='networkidle')
    page.get_by_role('button',name='分镜',exact=True).click()
    region=page.locator('.bw-editorial')
    plan=region.locator('details.bw-editorial-section').filter(has=page.locator('summary').filter(has_text='制作计划与剪辑空间')).first
    expect(plan).to_contain_text('1.5s');expect(plan).to_contain_text('8s')
    expect(plan).to_contain_text('人物看向车票')
    plan.get_by_role('button',name='复制制作计划指令').click()
    assert 'productionPlan' in page.evaluate('window.__lastCopy') and 'duration 是成片预算' in page.evaluate('window.__lastCopy')
    checks.append('Saved productionPlan shows precise edit budget, planned source duration and required events')
    sources=region.locator('details.bw-editorial-section').filter(has=page.locator('summary').filter(has_text='源素材与候选')).first
    sources.locator(':scope > summary').click()
    item=sources.locator('.bw-source-item').filter(has=page.locator('summary').filter(has_text='video')).first
    item.locator('summary').click()
    expect(item).to_contain_text('3s')
    item.get_by_role('button',name='查看实际素材').click()
    page.wait_for_function("document.querySelector('.bw-source-preview video')?.readyState>=1")
    expect(item).to_contain_text('浏览器实际测时：3s')
    item.get_by_role('button',name='复制测时与标注指令').click()
    prompt=page.evaluate('window.__lastCopy')
    assert 'record_media_inspection' in prompt and 'durationSeconds=3' in prompt and 'sha256' in prompt
    checks.append('Candidate opens actual file and copies measured metadata rather than planned length')
    edit=region.locator('details.bw-editorial-section').filter(has=page.locator('summary').filter(has_text='剪辑方案与衔接')).first
    edit.locator(':scope > summary').click()
    expect(edit).to_contain_text('选段合计');expect(edit).to_contain_text('2s')
    expect(edit.locator('.bw-edit-clip')).to_have_count(2)
    edit.get_by_role('button',name='复制剪辑方案指令').click()
    assert 'save_edit_plan' in page.evaluate('window.__lastCopy')
    cuts=edit.locator('details.bw-editorial-section')
    cuts.locator(':scope > summary').click()
    expect(cuts).to_contain_text('未验证')
    cuts.get_by_role('button',name='复制切点评审指令').click()
    prompt=page.evaluate('window.__lastCopy');assert 'clip-a' in prompt and 'clip-b' in prompt and 'record_review' in prompt
    cuts.get_by_role('button',name='预览这两段').click()
    preview=edit.locator('.bw-sequence-preview')
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.ready==='true'")
    preview.get_by_role('button',name='播放段落',exact=True).click()
    page.wait_for_function("Number(document.querySelector('.bw-sequence-preview').dataset.position)>0.15")
    preview.get_by_role('button',name='暂停段落',exact=True).click()
    checks.append('Saved adjacent selections and explicit review status lead to real pair playback')
    for width in [1440,900,600,390]:
        page.set_viewport_size({'width':width,'height':1000})
        for theme in ['dark','light']:
            page.evaluate('(t)=>document.documentElement.dataset.theme=t',theme)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),(width,theme)
            assert region.evaluate('e=>e.getBoundingClientRect().right<=innerWidth'),(width,theme)
        checks.append(f'{width}px planning, candidates, cut list and preview fit both themes')
    page.get_by_role('button',name='制作配置',exact=True).click()
    expect(page.get_by_role('region',name='Agent 创作流程')).to_contain_text('分镜预算 1.5 秒，目标 2 秒')
    expect(page.get_by_role('region',name='Agent 创作流程')).to_contain_text('1 未验证')
    checks.append('Configuration distinguishes saved text, planning, adoption, editing and review plus budget warning')
    page.evaluate('window.__fixture=structuredClone(window.__staleFixture)')
    page.get_by_role('button',name='刷新',exact=True).click()
    page.get_by_role('button',name='分镜',exact=True).click()
    edit=page.locator('.bw-editorial > details').filter(has=page.locator('summary').filter(has_text='剪辑方案与衔接')).first
    edit.locator(':scope > summary').click()
    expect(edit).to_contain_text('依据变更，需复核')
    expect(edit.get_by_role('button',name='预览选中段落')).to_be_disabled()
    cuts=edit.locator('details.bw-editorial-section');cuts.locator(':scope > summary').click()
    expect(cuts).to_contain_text('依据已变更 · 需复核')
    checks.append('Real backend invalidation appears after refresh and blocks stale preview')
    assert not errors,errors
    if args.screenshot:
        page.set_viewport_size({'width':1440,'height':1000});edit.scroll_into_view_if_needed();page.screenshot(path=str(args.screenshot))
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
