"""Verify explicit @ selection and shared image inputs across authored text fields."""
from pathlib import Path
import base64, hashlib, json, os
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('PI_SCRATCH_DIR', '/tmp'))
with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
    page.set_default_timeout(6000)
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto((ROOT / 'views/shot-table-prototype.html').as_uri())

    def open_shot():
        page.locator('tr[data-shot="shot-4"] .more').click()
        page.get_by_role('menuitem', name='编辑镜头', exact=True).click()
        expect(page.get_by_label('对白·旁白', exact=True)).to_be_visible()

    def export(name):
        prompt = page.locator('#compiledPrompt').inner_text()
        images = page.locator('.request-image').evaluate_all('(nodes)=>nodes.map(n=>({id:n.dataset.media,src:n.querySelector("img").src}))')
        with page.expect_download() as pending:
            page.get_by_role('button', name='导出当前输入包', exact=True).click()
        path = OUT / (name + '.json')
        pending.value.save_as(path)
        result = json.loads(path.read_text())
        assert result['prompt'] == prompt and len(result['images']) == len(images)
        for slot, visible in zip(result['images'], images):
            assert slot['mediaId'] == visible['id']
            assert slot['data'] == visible['src'].split(',')[1]
            data = base64.b64decode(slot['data'])
            assert len(data) == slot['byteLength']
            assert hashlib.sha256(data).hexdigest() == slot['sha256']
        return result
    # Sound-effect cells open the full editor and focus the selected field.
    sound_cell = page.locator('tr[data-shot="shot-6"] [data-edit="sfx"]')
    sound_cell.click()
    expect(page.get_by_role('heading', name='编辑提示词与参考图', exact=True)).to_be_visible()
    sound = page.get_by_label('音效', exact=True)
    expect(sound).to_be_focused()
    assert sound.evaluate('(el)=>{const r=el.getBoundingClientRect(),body=el.closest(".dialog-body").getBoundingClientRect();return r.top>=body.top&&r.bottom<=body.bottom;}')
    expect(sound).to_have_text('脚步声靠近，雨声连续。')
    sound_before = export('reference-sound-before')
    assert '音效：脚步声靠近，雨声连续。' in sound_before['prompt']
    sound.fill('脚步靠近，雨声渐弱。')
    changed_sound = export('reference-sound-draft')
    assert '音效：脚步靠近，雨声渐弱。' in changed_sound['prompt']
    assert changed_sound['images'] == sound_before['images']
    assert changed_sound['requestHash'] != sound_before['requestHash']
    page.get_by_role('button', name='取消', exact=True).click()
    expect(sound_cell).to_have_text('脚步声靠近，雨声连续。')
    sound_cell.click()
    expect(sound).to_have_text('脚步声靠近，雨声连续。')
    sound.fill('@红')
    page.get_by_role('option', name='红灯笼 · 版本 1', exact=True).click()
    sound.press('ControlOrMeta+End'); sound.press_sequentially('轻响，雨声渐弱。')
    referenced_sound = export('reference-sound-selected')
    assert '音效：红灯笼〔图4〕轻响，雨声渐弱。' in referenced_sound['prompt']
    assert len(referenced_sound['images']) == 4
    page.get_by_role('button', name='保存镜头修改', exact=True).click()
    expect(sound_cell).to_have_text('@红灯笼轻响，雨声渐弱。')
    page.reload(); sound_cell.click()
    expect(sound.locator('.reference-token')).to_have_text('@红灯笼')
    restored_sound = export('reference-sound-reloaded')
    assert restored_sound['prompt'] == referenced_sound['prompt']
    assert restored_sound['images'] == referenced_sound['images']
    sound.fill('')
    cleared_sound = export('reference-sound-cleared')
    assert '音效：' not in cleared_sound['prompt'] and len(cleared_sound['images']) == 3
    page.get_by_role('button', name='保存镜头修改', exact=True).click()
    expect(sound_cell).to_have_text('—')

    open_shot()
    speech = page.get_by_label('对白·旁白', exact=True)
    speech.fill('@')
    expect(page.get_by_role('listbox', name='参考图片', exact=True)).to_be_visible()
    expect(page.locator('.reference-picker [role="option"]')).to_have_count(16)
    expect(speech.locator('.reference-token')).to_have_count(0)
    expect(page.locator('#requestStatus')).to_have_text('等待选择资产')
    expect(page.locator('.request-error')).to_have_count(0)
    expect(page.locator('#exportRequest')).to_be_disabled()
    tabs = page.get_by_role('tablist', name='引用用途', exact=True)
    expect(tabs.get_by_role('tab')).to_have_count(7)
    expect(page.get_by_role('combobox', name='引用用途', exact=True)).to_have_count(0)
    auto = tabs.get_by_role('tab', name='按资产类型', exact=True)
    expect(auto).to_have_attribute('aria-selected', 'true')
    speech.press('Tab'); expect(auto).to_be_focused(); auto.press('ArrowRight')
    identity = tabs.get_by_role('tab', name='角色参考', exact=True)
    expect(identity).to_be_focused()
    expect(identity).to_have_attribute('aria-selected', 'true')
    identity.press('End')
    expect(tabs.get_by_role('tab', name='视频尾帧', exact=True)).to_be_focused()
    page.keyboard.press('Home')
    expect(auto).to_be_focused()
    expect(auto).to_have_attribute('aria-selected', 'true')
    page.keyboard.press('Escape')
    expect(page.locator('.reference-picker')).to_have_count(0)
    expect(speech).to_be_focused()
    speech.press('ControlOrMeta+End'); speech.press_sequentially('白')
    page.get_by_role('tab', name='风格参考', exact=True).click()
    expect(page.get_by_role('tab', name='风格参考', exact=True)).to_have_attribute('aria-selected', 'true')
    expect(speech.locator('.reference-token')).to_have_count(0)
    expect(page.locator('.reference-picker [role="option"]')).to_have_count(0)
    expect(page.locator('.reference-picker')).to_contain_text('没有匹配的图片')
    page.get_by_role('tab', name='角色参考', exact=True).click()
    page.get_by_role('option', name='白絮 · 版本 1', exact=True).click()
    speech.press('ControlOrMeta+End')
    speech.press_sequentially('：等我。')
    selected = export('reference-dialogue-selected')
    assert '对白·旁白：白絮〔图4〕：等我。' in selected['prompt']
    assert len(selected['images']) == 4 and selected['images'][-1]['mediaId'] == 'a-bai-image-1'
    assert selected['images'][-1]['roles'] == ['identity']
    speech.get_by_role('button', name='更换引用 白絮 · 正面参考', exact=True).click()
    expect(page.get_by_role('tab', name='角色参考', exact=True)).to_have_attribute('aria-selected', 'true')
    page.get_by_role('option', name='白絮 · 版本 2', exact=True).click()
    replaced = export('reference-dialogue-picture-replaced')
    assert replaced['images'][-1]['mediaId'] == 'a-bai-image-2'
    assert replaced['images'][-1]['sha256'] != selected['images'][-1]['sha256']
    assert replaced['images'][-1]['roles'] == ['identity']
    page.get_by_role('button', name='保存镜头修改', exact=True).click()
    page.reload()
    open_shot()
    speech = page.get_by_label('对白·旁白', exact=True)
    expect(speech.locator('.reference-token')).to_have_text('@白絮')
    assert export('reference-dialogue-reference-reloaded')['prompt'] == replaced['prompt']
    speech.get_by_role('button', name='更换引用 白絮 · 侧光参考', exact=True).click()
    page.get_by_role('button', name='删除此处引用', exact=True).click()
    deleted = export('reference-dialogue-reference-deleted')
    assert len(deleted['images']) == 3 and all(x['mediaId'] != 'a-bai-image-2' for x in deleted['images'])
    speech.fill('@罗')
    page.get_by_role('option', name='罗洛 · 版本 1', exact=True).click()
    dedup = export('reference-dialogue-shared-reference')
    assert len(dedup['images']) == 3 and dedup['referenceCount'] == 4
    page.get_by_label('光影', exact=True).fill('@红')
    expect(page.get_by_role('listbox', name='参考图片', exact=True)).to_have_count(1)
    page.get_by_role('option', name='红灯笼 · 版本 1', exact=True).click()
    page.get_by_label('运镜', exact=True).fill('@青')
    page.get_by_role('option', name='青石巷 · 版本 1', exact=True).click()
    combined = export('reference-all-text-fields')
    assert len(combined['images']) == 5 and combined['referenceCount'] == 6
    assert '光影：红灯笼〔图4〕' in combined['prompt']
    assert '运镜：青石巷〔图5〕' in combined['prompt']
    assert '对白·旁白：罗洛〔图1〕' in combined['prompt']
    page.get_by_role('button', name='保存镜头修改', exact=True).click()
    page.reload()
    open_shot()
    restored = export('reference-all-text-fields-reloaded')
    assert restored['prompt'] == combined['prompt'] and restored['images'] == combined['images']
    page.get_by_role('button', name='取消', exact=True).click()
    page.locator('tr[data-shot="shot-4"] [data-edit="dialogue"]').click()
    expect(page.get_by_label('对白·旁白', exact=True).locator('.reference-token')).to_have_text('@罗洛')
    page.get_by_role('button', name='取消', exact=True).click()
    expect(page.locator('.reference-picker')).to_have_count(0)
    assert not errors, errors
    print('PASS: @ opens all asset candidates; manual choice binds bytes; replacement/deletion; shared references deduplicate; lighting/motion/dialogue persist and export exact ordered inputs; table shortcuts retain bindings; no browser errors.')
    browser.close()
