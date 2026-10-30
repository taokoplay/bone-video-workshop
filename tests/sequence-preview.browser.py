"""Decode real fixture media and exercise trimmed/retimed sequential playback."""
import argparse,json
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
parser=argparse.ArgumentParser();parser.add_argument('fixture',type=Path);args=parser.parse_args()
checks=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,channel='chrome')
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(args.fixture.resolve().as_uri(),wait_until='networkidle')
    page.evaluate('''() => {
      const fixture=window.__fixture.snapshot;
      const video=fixture.media.find(m=>m.kind==='video'), audio=fixture.media.find(m=>m.kind==='audio');
      window.__cutPlan={stale:false,clips:[
        {clipId:'clip-a',shotId:fixture.document.shots[0].id,mediaId:video.id,inSeconds:0.25,outSeconds:2.25,speed:2,includeSourceAudio:false},
        {clipId:'clip-b',shotId:fixture.document.shots[0].id,mediaId:video.id,inSeconds:1,outSeconds:2,speed:1,includeSourceAudio:false}],
        audioTracks:[{trackId:'voice',mediaId:audio.id,role:'effects',startSeconds:0,inSeconds:0,outSeconds:2,gain:0.1}]};
      const host=document.createElement('div');host.id='preview-test-host';host.style='position:fixed;inset:0;background:#222;z-index:10000;overflow:auto;padding:20px';document.body.append(host);
      window.__openPreview=(plan=window.__cutPlan,from=0,to=1,load=args=>window.pluginBridge.invoke('bone.media',args))=>{
        BoneMediaPreview.beginRender();BoneSequencePreview.beginRender();
        host.replaceChildren(BoneSequencePreview.create({productionId:fixture.document.id,plan,media:fixture.media,from,to,load}));
      };
      window.__openPreview();
    }''')
    preview=page.get_by_role('region',name='剪辑段落预览')
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.ready==='true'")
    expect(preview).to_contain_text('剪辑占用 2s')
    assert preview.locator('video').evaluate('v=>v.duration>=3&&v.playbackRate===2&&v.currentTime>=0.24&&v.currentTime<=0.27')
    checks.append('Real source length decoded; two selected ranges at 2x/1x produce a 2s plan')
    preview.get_by_role('button',name='播放段落',exact=True).click()
    page.wait_for_function("Number(document.querySelector('.bw-sequence-preview').dataset.position)>0.2")
    assert preview.locator('audio').evaluate('e=>!e.paused&&e.volume===0.1')
    preview.get_by_role('button',name='暂停段落',exact=True).click()
    assert preview.locator('video').evaluate('e=>e.paused') and preview.locator('audio').evaluate('e=>e.paused')
    checks.append('Video and independent audio advance and pause together')
    preview.get_by_role('slider',name='段落播放进度').fill('1.4')
    page.wait_for_function("Math.abs(document.querySelector('.bw-sequence-preview video').currentTime-1.4)<0.03")
    assert preview.locator('video').evaluate('e=>e.playbackRate===1')
    preview.get_by_role('button',name='播放段落',exact=True).click()
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.playing==='false'&&Number(document.querySelector('.bw-sequence-preview').dataset.position)===2")
    assert preview.locator('audio').evaluate('e=>e.paused')
    checks.append('Seek maps to the selected source interval and playback stops at the final out point')
    preview.get_by_role('button',name='播放段落',exact=True).click()
    page.wait_for_function("Number(document.querySelector('.bw-sequence-preview').dataset.position)>1.1")
    assert preview.locator('video').evaluate('e=>e.playbackRate===1')
    checks.append('Playback crosses the cut from first source interval to second without replaying full source')
    preview.get_by_role('button',name='关闭预览').click()
    expect(preview).to_have_count(0)
    page.evaluate('window.__openPreview(window.__cutPlan,1,1)')
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.ready==='true'")
    expect(preview).to_contain_text('剪辑占用 1s')
    checks.append('Contiguous subset rebases video and overlapping sound on its local timeline')
    for width in [1440,900,600,390]:
        page.set_viewport_size({'width':width,'height':800})
        assert preview.evaluate('e=>e.getBoundingClientRect().right<=innerWidth')
    checks.append('Preview controls fit 1440/900/600/390px')
    page.evaluate('''() => {
      window.__nativePlay=HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play=function(){
        const result=window.__nativePlay.call(this);
        return this.tagName==='AUDIO' ? result.then(()=>new Promise(r=>window.__releaseAudioPlay=r)) : result;
      };
      window.__openPreview();
    }''')
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.ready==='true'")
    preview.get_by_role('button',name='播放段落',exact=True).click()
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.playing==='false'&&Number(document.querySelector('.bw-sequence-preview').dataset.position)===2",timeout=5000)
    assert preview.locator('video').evaluate('e=>e.paused&&e.currentTime<=2.12')
    assert preview.locator('audio').evaluate('e=>e.paused')
    page.evaluate('HTMLMediaElement.prototype.play=window.__nativePlay;window.__releaseAudioPlay?.()')
    checks.append('Delayed audio play promise cannot freeze boundary monitoring or overrun the saved video out-point')
    page.evaluate("window.__openPreview({...window.__cutPlan,stale:true})")
    expect(preview).to_contain_text('依据已变更')
    expect(preview.get_by_role('button',name='播放段落')).to_be_disabled()
    page.evaluate("window.__openPreview({...window.__cutPlan,clips:[{...window.__cutPlan.clips[0],outSeconds:99}]},0,0)")
    expect(preview).to_contain_text('超出实际视频长度')
    checks.append('Stale plan and range beyond actually decoded source are blocked')
    page.evaluate('''() => {
      window.__openPreview(window.__cutPlan,0,1,()=>new Promise(r=>window.__lateResolve=r));
    }''')
    page.wait_for_function("typeof window.__lateResolve==='function'")
    preview.get_by_role('button',name='关闭预览').click()
    page.evaluate("window.__lateResolve(Object.values(window.__media).find(v=>v.kind==='video'))")
    page.evaluate('()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
    expect(preview).to_have_count(0)
    assert page.locator('#preview-test-host video').count()==0
    checks.append('Late media reads cannot revive a closed preview')
    page.evaluate('window.__openPreview()')
    page.wait_for_function("document.querySelector('.bw-sequence-preview')?.dataset.ready==='true'")
    preview.get_by_role('button',name='播放段落').click()
    page.wait_for_function("Number(document.querySelector('.bw-sequence-preview').dataset.position)>0.1")
    page.evaluate("window.__oldSequenceMedia=[...document.querySelectorAll('#preview-test-host video,#preview-test-host audio')];BoneSequencePreview.beginRender()")
    assert page.evaluate("window.__oldSequenceMedia.every(e=>e.paused&&!e.hasAttribute('src'))")
    checks.append('Render disposal pauses all sources and releases their bytes')
    assert not errors,errors
    browser.close()
print(json.dumps({'passed':len(checks),'checks':checks},ensure_ascii=False,indent=2))
