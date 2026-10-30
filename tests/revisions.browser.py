"""Revision panel paths using snapshots produced by registered tools in isolation."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
parser = argparse.ArgumentParser()
parser.add_argument('fixture', type=Path)
parser.add_argument('--screenshot', type=Path)
args = parser.parse_args()
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome')
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(args.fixture.resolve().as_uri(), wait_until='networkidle')
    page.get_by_role('button', name='制作配置', exact=True).click()
    card = page.get_by_role('region', name='评审与修订', exact=True)
    expect(card).to_contain_text('尚无修订方案')
    before = page.evaluate('JSON.stringify(window.__fixture)')
    card.get_by_role('button', name='复制仅评审指令').click()
    prompt = page.evaluate('window.__lastCopy')
    assert '本次仅评审' in prompt and '不改项目' in prompt
    card.get_by_role('button', name='复制修订方案指令').click()
    prompt = page.evaluate('window.__lastCopy')
    assert 'save_revision_plan' in prompt and '不执行改写' in prompt
    assert page.evaluate('JSON.stringify(window.__fixture)') == before
    checks.append('Empty state and review/proposal actions copy scoped instructions without mutation')

    def load(state):
        page.evaluate('(s)=>window.__fixture=structuredClone(window.__revisionFixtures[s])', state)
        page.get_by_role('button', name='刷新', exact=True).click()
        expect(card.locator('.bw-revision-plan')).to_have_count(2 if state == 'stale' else 1)
        plan = card.locator('.bw-revision-plan').first
        plan.locator(':scope > summary').click()
        return plan

    plan = load('proposed')
    expect(plan.get_by_role('button', name='复制执行此方案指令')).to_be_enabled()
    expect(plan.get_by_role('button', name='复制恢复此方案指令')).to_be_disabled()
    change = plan.locator('.bw-revision-change').first
    change.locator(':scope > summary').click()
    expect(change.locator('pre').nth(1)).to_have_text('车票上的名字，是我的。')
    expect(plan).to_contain_text('Keep all IDs')
    plan.get_by_role('button', name='复制执行此方案指令').click()
    prompt = page.evaluate('window.__lastCopy')
    assert '我明确要求执行' in prompt and 'apply_revision_plan' in prompt and 'confirm=true' in prompt
    assert '回读每个修改字段' in prompt
    plan.get_by_role('button', name='复制方案 ID').click()
    assert page.evaluate('window.__lastCopy') == page.evaluate('window.__fixture.snapshot.revisionPlans[0].id')
    checks.append('Proposed plan exposes actual before/after, preservation commitments and explicit application instruction')

    plan = load('applied')
    expect(plan.get_by_role('button', name='复制执行此方案指令')).to_be_disabled()
    expect(plan.get_by_role('button', name='复制恢复此方案指令')).to_be_enabled()
    expect(plan).to_contain_text('已应用 · 待复核')
    plan.get_by_role('button', name='复制恢复此方案指令').click()
    assert 'restore_revision_plan' in page.evaluate('window.__lastCopy')
    assert '不覆盖新内容' in page.evaluate('window.__lastCopy')
    checks.append('Applied state allows a scoped restoration request and does not imply review approval')

    plan = load('restored')
    expect(plan).to_contain_text('已恢复')
    expect(plan.get_by_role('button', name='复制执行此方案指令')).to_be_disabled()
    expect(plan.get_by_role('button', name='复制恢复此方案指令')).to_be_disabled()
    checks.append('Restored state blocks repeated application and restoration')

    plan = load('stale')
    expect(plan).to_contain_text('作品内容或镜头版本已改变')
    expect(plan.get_by_role('button', name='复制执行此方案指令')).to_be_disabled()
    expect(plan.get_by_role('button', name='复制恢复此方案指令')).to_be_disabled()
    checks.append('Subsequent content edits visibly block stale plans')

    load('proposed')
    page.evaluate(r'''() => {
      const p=window.__fixture.snapshot.revisionPlans[0];
      p.changes[0].before='<img src=x onerror="window.__xss=true">'+'LongText'.repeat(1000);
      p.changes[0].after='多行完整正文\n'.repeat(500);
    }''')
    page.get_by_role('button', name='刷新', exact=True).click()
    plan = card.locator('.bw-revision-plan').first
    plan.locator(':scope > summary').click()
    plan.locator('.bw-revision-change > summary').first.click()
    assert not page.evaluate('Boolean(window.__xss)')
    expect(plan.locator('.bw-revision-diff img')).to_have_count(0)
    assert plan.locator('pre').first.evaluate('e=>e.scrollHeight>e.clientHeight')
    checks.append('Untrusted and long revision text stays literal and scrollable')
    for width in [1440, 900, 600, 390]:
        page.set_viewport_size({'width': width, 'height': 1000})
        for theme in ['dark', 'light']:
            page.evaluate('(t)=>document.documentElement.dataset.theme=t', theme)
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (width, theme)
            assert card.evaluate('e=>e.getBoundingClientRect().right<=innerWidth'), (width, theme)
        if width <= 600:
            assert plan.locator('.bw-revision-diff').evaluate('e=>getComputedStyle(e).gridTemplateColumns.split(" ").length') == 1
        checks.append(f'{width}px diff and actions fit light and dark themes')
    assert not any(c in ['bone.create', 'bone.update', 'bone.delete'] for c in page.evaluate('window.__calls'))
    assert not errors, errors
    checks.append('All interactions remain read/copy-only with no browser errors')
    if args.screenshot:
        page.set_viewport_size({'width': 1440, 'height': 1000})
        page.evaluate('document.documentElement.dataset.theme="dark"')
        card.scroll_into_view_if_needed()
        page.screenshot(path=str(args.screenshot))
    browser.close()
print(json.dumps({'passed': len(checks), 'checks': checks}, ensure_ascii=False, indent=2))
