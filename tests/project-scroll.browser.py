"""Real wheel-event regression for nested project-card scroll chaining."""
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument('fixture', type=Path)
args = parser.parse_args()
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chrome')
    for width in [1440, 390]:
        for case in ['short-down', 'short-up', 'long-inside-down', 'long-inside-up', 'long-bottom', 'long-top', 'asset-down']:
            page = browser.new_page(viewport={'width': width, 'height': 800})
            page.goto(args.fixture.resolve().as_uri(), wait_until='networkidle')
            page.evaluate('''(longText) => {
                const doc = window.__fixture.snapshot.document;
                doc.projectBible = { background: longText ? 'A line of project context.\\n'.repeat(200) : 'Short project context.' };
                doc.assets = Array.from({length:24}, (_,i)=>({id:'scroll-'+i,name:'Asset '+i,type:'道具'}));
            }''', case.startswith('long'))
            page.get_by_role('button', name='项目', exact=True).click()
            page.get_by_role('button', name='刷新', exact=True).click()
            panel = page.locator('.bw-bible-panel')
            page.wait_for_function("document.querySelector('.bw-bible-prose')?.textContent.includes('context')")
            page.evaluate('async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
            target = page.locator('.asset-card-preview').first if case == 'asset-down' else panel
            # Establish a starting position; subsequent motion must come from wheel input.
            target.evaluate('''el => {
                const body=document.querySelector('.vp-body');
                body.scrollTop += el.getBoundingClientRect().top-body.getBoundingClientRect().top-80;
            }''')
            if case == 'long-bottom':
                panel.hover()
                panel.evaluate("e=>{window.__innerSettled=false;e.addEventListener('scrollend',()=>window.__innerSettled=true,{once:true})}")
                page.mouse.wheel(0,100000)
                page.wait_for_function("window.__innerSettled && Math.abs(document.querySelector('.bw-bible-panel').scrollHeight-document.querySelector('.bw-bible-panel').clientHeight-document.querySelector('.bw-bible-panel').scrollTop)<2")
            elif case == 'long-inside-up': panel.evaluate('e=>e.scrollTop=300')
            else: panel.evaluate('e=>e.scrollTop=0')
            page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            start = page.evaluate("({outer:document.querySelector('.vp-body').scrollTop,inner:document.querySelector('.bw-bible-panel').scrollTop})")
            if case.startswith('short'): assert panel.evaluate('e=>e.scrollHeight<=e.clientHeight')
            assert start['outer'] > 100
            box = target.bounding_box()
            page.mouse.move(box['x']+box['width']/2, box['y']+min(50, box['height']/2))
            direction = -1 if case in ['short-up','long-inside-up','long-top'] else 1
            page.mouse.wheel(0, direction*180)
            expected = 'inner' if 'inside' in case else 'outer'
            selector = '.bw-bible-panel' if expected == 'inner' else '.vp-body'
            try:
                page.wait_for_function('''([selector, initial, direction]) =>
                    (document.querySelector(selector).scrollTop-initial)*direction>20
                ''', arg=[selector, start[expected], direction], timeout=2500)
            except Exception as error:
                actual = page.evaluate("({outer:document.querySelector('.vp-body').scrollTop,inner:document.querySelector('.bw-bible-panel').scrollTop,height:document.querySelector('.bw-bible-panel').clientHeight,scrollHeight:document.querySelector('.bw-bible-panel').scrollHeight,overscroll:getComputedStyle(document.querySelector('.bw-bible-panel')).overscrollBehaviorY})")
                raise AssertionError(f'{width}px {case}: expected {expected} movement, start={start}, actual={actual}') from error
            if expected == 'inner':
                assert page.locator('.vp-body').evaluate('e=>e.scrollTop') == start['outer']
            checks.append(f'{width}px {case}: wheel moves {expected} in the correct direction')
            page.close()
        # A modal's boundary must still contain wheel gestures.
        page = browser.new_page(viewport={'width':width,'height':800})
        page.goto(args.fixture.resolve().as_uri(),wait_until='networkidle')
        page.get_by_role('button',name='项目',exact=True).click()
        page.evaluate("window.__fixture.snapshot.document.projectBible.characters='Character history.\\n'.repeat(300)")
        page.get_by_role('button',name='刷新',exact=True).click()
        page.get_by_role('button',name='查看待归档人物资料',exact=True).click()
        body = page.locator('.bw-legacy-dialog-body')
        outer = page.locator('.vp-body').evaluate('e=>e.scrollTop')
        body.hover(); page.mouse.wheel(0,200)
        page.wait_for_function("document.querySelector('.bw-legacy-dialog-body').scrollTop>20")
        assert page.locator('.vp-body').evaluate('e=>e.scrollTop')==outer
        body.evaluate('e=>e.scrollTop=e.scrollHeight')
        # Observe wheel delivery and successive compositor frames before checking the boundary.
        body.evaluate("e=>{window.__wheelObserved=false;e.addEventListener('wheel',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.__wheelObserved=true)),{once:true})}")
        page.mouse.wheel(0,200)
        page.wait_for_function('window.__wheelObserved')
        assert page.locator('.vp-body').evaluate('e=>e.scrollTop')==outer
        checks.append(f'{width}px modal scrolls internally without moving the project page')
        page.close()
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks},indent=2))
