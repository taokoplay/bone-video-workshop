"""Always-visible AI workbench fields and episode editing with real fixture media."""
from pathlib import Path
import json, os, subprocess
from playwright.sync_api import sync_playwright, expect
from workbench_controls import select_value
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('PI_SCRATCH_DIR','/tmp'))
server=subprocess.Popen(['node',str(ROOT/'tests/generation-panel-host.cjs'),'--editorial'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    line=server.stdout.readline();assert line,server.stderr.read()
    fixture=json.loads(line);origin=fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        page=browser.new_page(viewport={'width':1440,'height':1000},color_scheme='dark');page.set_default_timeout(10000)
        errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
        def read():
            data=page.request.post(origin+'/tool',data={'name':'get_production','args':{'id':fixture['id']}}).json();assert 'error' not in data,data
            return data['result']
        def saved_state():
            value=read();return {key:value.get(key) for key in ['production','shotStates','media','mediaInspections','editPlans','reviews']}
        before=saved_state()
        page.goto(fixture['url']);page.get_by_role('button',name='分镜',exact=True).click()
        select_value(page,'选择剧集',fixture['episodeId'])
        page.get_by_role('button',name='卡片视图',exact=True).click()
        card=page.locator('.bw-card-inspector');episode=page.locator('.bw-episode-workbench')
        expect(page.locator('.bw-main details, .bw-episode-dialog')).to_have_count(0)
        expect(card.get_by_role('heading',name='生成输入',exact=True)).to_be_visible()
        expect(card.get_by_role('heading',name='素材结果',exact=True)).to_be_visible()
        assert card.locator('.bw-shot-workspace').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==2
        expect(card.get_by_text('Keep arrival',exact=True)).to_have_count(1)
        expect(card.get_by_text('原有对白',exact=True)).to_have_count(1)
        expect(card.get_by_text('原有音效',exact=True)).to_have_count(1)
        expect(card.get_by_text('保留镜头音乐',exact=True)).to_have_count(1)
        expect(page.locator('.bw-card-preview video')).to_have_count(1)
        expect(card.locator('.bw-reference-card[data-role="first"]')).to_have_count(1)
        expect(card.locator('.bw-reference-card[data-role="last"]')).to_have_count(1)
        expect(card.locator('.bw-input-context')).to_contain_text('文生视频 · 无参考图（默认）')
        expect(card.locator('.bw-input-context')).to_contain_text('8 张（默认）')
        expect(card.locator('.bw-narrative-context')).to_contain_text('首尾帧驱动')
        planning=card.get_by_role('region',name='制作约束',exact=True)
        expect(planning).to_contain_text('计划源片长度')
        expect(planning).to_contain_text('7s')
        expect(planning.locator('[data-edit="duration"]')).to_have_text('4s')
        expect(planning).to_contain_text('片头留量')
        expect(planning).to_contain_text('1s')
        output=card.get_by_role('region',name='输出与源素材',exact=True)
        expect(output.locator(':scope > header')).to_contain_text('本镜关联 2 项')
        expect(output.locator(':scope > .bw-source-grid > .bw-source-item')).to_have_count(2)
        audio=output.locator(f'.bw-source-item[data-media-id="{fixture["audio"]["mediaId"]}"]')
        expect(audio.locator('.bw-source-heading')).to_contain_text('本镜已采用')
        audio.scroll_into_view_if_needed();expect(audio.locator('audio')).to_have_count(1)
        expect(audio).to_contain_text('已报告素材时长')
        expect(audio).to_contain_text('2s')
        shared=output.get_by_role('region',name='共享素材',exact=True)
        expect(shared.locator('.bw-source-item')).to_have_count(2)
        red=shared.locator(f'.bw-source-item[data-media-id="{fixture["red"]["mediaId"]}"]')
        expect(red.get_by_text('已报告素材时长',exact=True)).to_have_count(0)
        expect(red.locator('.bw-source-heading')).to_contain_text('资产已采用')
        red.get_by_role('button',name='查看实际素材',exact=True).click()
        page.wait_for_function('(id)=>document.querySelector(`.bw-source-item[data-media-id="${id}"] img`)?.naturalWidth>0',arg=fixture['red']['mediaId'])
        expect(card.locator('.bw-shot-review')).to_contain_text('Shot review fixture')
        expect(card.locator('.bw-shot-review')).not_to_contain_text('Episode review fixture')
        planning.scroll_into_view_if_needed();page.screenshot(path=str(OUT/'unified-ai-planning.png'))
        page.get_by_role('button',name='本集剪辑与审核',exact=True).click()
        expect(episode.locator('h2')).to_be_focused()
        expect(page.locator('dialog[open]')).to_have_count(0)
        expect(episode.locator('.bw-episode-heading')).to_contain_text('Arrival')
        expect(episode.locator('.bw-edit-clip')).to_have_count(2)
        expect(episode).to_contain_text('声音轨 music-track')
        expect(episode).to_contain_text('Episode review fixture')
        expect(episode).not_to_contain_text('Shot review fixture')
        episode.get_by_role('button',name='复制本集文本评审指令',exact=True).click()
        copied=page.request.get(origin+'/fixture').json()['clipboard']
        assert fixture['episodeId'] in copied and 'scope={kind:"episode"' in copied
        episode.get_by_role('button',name='预览选中段落',exact=True).click()
        expect(episode.get_by_role('button',name='播放段落',exact=True)).to_be_enabled()
        page.evaluate('window.editorialPlayers=[...document.querySelectorAll(".bw-sequence-preview video,.bw-sequence-preview audio")]')
        episode.get_by_role('button',name='播放段落',exact=True).click()
        expect(episode.locator('.bw-sequence-preview')).to_have_attribute('data-playing','true')
        page.get_by_role('button',name='下一镜头',exact=True).click()
        expect(page.locator('.bw-card-head h2')).to_have_text('Second shot')
        assert page.evaluate('editorialPlayers.length>0&&editorialPlayers.every(player=>player.paused&&!player.getAttribute("src"))')
        expect(card.get_by_role('region',name='输出与源素材').locator(':scope > header')).to_contain_text('本镜关联 0 项')
        expect(card).not_to_contain_text('Shot review fixture')
        page.get_by_role('button',name='剧本大表',exact=True).click()
        expect(episode.locator('.bw-edit-clip')).to_have_count(2)
        expect(page.locator('.bw-main details')).to_have_count(0)
        page.get_by_role('button',name='本集剪辑与审核',exact=True).click();expect(episode.locator('h2')).to_be_focused()
        select_value(page,'选择剧集',fixture['emptyEpisodeId'])
        expect(episode.locator('.bw-episode-heading')).to_contain_text('Other episode')
        expect(episode).to_contain_text('尚未保存本集剪辑方案')
        expect(episode).not_to_contain_text('Episode review fixture')
        select_value(page,'选择剧集',fixture['episodeId'])
        page.get_by_role('button',name='卡片视图',exact=True).click()
        page.locator('.bw-card-head').scroll_into_view_if_needed();page.screenshot(path=str(OUT/'unified-ai-workbench.png'))
        page.set_viewport_size({'width':600,'height':820})
        assert card.locator('.bw-shot-workspace').evaluate('(el)=>getComputedStyle(el).gridTemplateColumns.split(" ").length')==1
        page.get_by_role('button',name='本集剪辑与审核',exact=True).click()
        expect(episode.locator('h2')).to_be_in_viewport()
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        page.screenshot(path=str(OUT/'unified-ai-workbench-mobile.png'))
        assert saved_state()==before,'Browsing or playing changed persisted production data'
        assert not errors,errors
        print('PASS: always-visible input/result/constraint/review layout, real field meanings and source scopes, frame/audio retention, inline episode editing, playback cleanup on shot switch, responsive layout and unchanged data.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
