"""Matched-content geometry plus draft-export boundary checks for the real port."""
from pathlib import Path
import json, os, subprocess
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('PI_SCRATCH_DIR','/tmp'))
server=subprocess.Popen(['node',str(ROOT/'tests/generation-panel-host.cjs')],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
try:
    line=server.stdout.readline(); assert line,server.stderr.read()
    fixture=json.loads(line); origin=fixture['url'].split('/views/')[0]
    with sync_playwright() as p:
        browser=p.chromium.launch(channel='chrome',headless=True)
        context=browser.new_context(viewport={'width':1440,'height':980},color_scheme='dark')
        actual=context.new_page(); prototype=context.new_page()
        actual.goto(fixture['url']); actual.get_by_role('button',name='分镜',exact=True).click()
        production=actual.request.post(origin+'/tool',data={'name':'get_production','args':{'id':fixture['id']}}).json()['result']
        shot=production['production']['shots'][0]
        state={'schema':1,'assets':[],'media':[],'shots':[{'id':'shot-1','title':shot['title'],'brief':{'schemaVersion':1,'nodes':[{'type':'text','text':shot['scene']}]},'duration':shot['duration'],'scale':'','light':'','motion':shot['motion'],'dialogue':shot['dialogue'],'sfx':shot['soundDesign']['effects'],'operation':'video.text','revision':1}]}
        prototype.add_init_script('localStorage.setItem("film-reference-handoff-v1",'+json.dumps(json.dumps(state))+')')
        prototype.goto(origin+'/views/shot-table-prototype.html')
        expect(prototype.locator('.shot-table tbody tr')).to_have_count(1)
        def styles(page,selector,props):
            return page.locator(selector).first.evaluate('(el,props)=>Object.fromEntries(props.map(p=>[p,getComputedStyle(el)[p]]))',props)
        for before,after,props in [
            ('.shot-table th','.bw-shot-table th',['fontSize','padding','position','backgroundColor']),
            ('.shot-table td','.bw-shot-table td',['padding','backgroundColor']),
            ('.scale-chevron','.bw-scale-chevron',['width','height']),
            ('.segment','.bw-segment',['borderRadius','padding']),
        ]:
            assert styles(prototype,before,props)==styles(actual,after,props),(before,styles(prototype,before,props),styles(actual,after,props))
        for page,selector in [(actual,'.bw-sheet-scroll'),(prototype,'.sheet-scroll')]:
            page.locator(selector).evaluate('(el)=>el.scrollLeft=600')
            first=page.locator('tbody td').first.bounding_box(); last=page.locator('tbody td').last.bounding_box(); box=page.locator(selector).bounding_box()
            assert abs(first['x']-box['x'])<2 and abs(last['x']+last['width']-box['x']-box['width'])<2
        actual.screenshot(path=str(OUT/'port-table-actual.png')); prototype.screenshot(path=str(OUT/'port-table-reference.png'))
        actual.locator('[data-edit="body"]').click()
        prototype.get_by_role('button',name='镜头 1 更多操作',exact=True).click()
        prototype.get_by_role('menuitem',name='编辑镜头',exact=True).click()
        expect(actual.locator('.rich-editor')).to_have_count(5)
        for before,after,props in [
            ('.request-dialog','.bw-generation-dialog',['width','maxHeight','borderRadius','backgroundColor']),
            ('.request-grid','.bw-generation-grid',['gridTemplateColumns','gap']),
            ('#editorHost .rich-editor','[data-field="body"] .rich-editor',['minHeight','fontSize','padding','lineHeight']),
            ('.request-shot-settings','.bw-generation-settings',['gap','marginTop','paddingTop']),
            ('#lightEditorHost .rich-editor','[data-field="lighting"] .rich-editor',['minHeight','fontSize','padding','lineHeight']),
            ('#dialogueEditorHost .rich-editor','[data-field="dialogue"] .rich-editor',['minHeight','fontSize']),
        ]:
            assert styles(prototype,before,props)==styles(actual,after,props),(before,styles(prototype,before,props),styles(actual,after,props))
        actual.screenshot(path=str(OUT/'port-editor-actual.png')); prototype.screenshot(path=str(OUT/'port-editor-reference.png'))
        # Use real persisted records, introducing only the stale source metadata at the external snapshot boundary.
        result=actual.evaluate('''async work=>{
          const snapshot={document:work.production,media:work.media,shotStates:work.shotStates};
          const shot=snapshot.document.shots[0],asset=snapshot.document.assets[0],record=snapshot.media.find(x=>x.id===asset.mediaId);
          const draft=FilmShotAuthoring.fromShot(shot,snapshot.document);
          draft.body={schemaVersion:1,nodes:[{type:'reference',assetId:asset.id,mediaId:record.id,role:'identity'}]};draft.operation='image.reference';
          let reads=0;
          const actions={onRefreshGeneration:async()=>({snapshot}),loadMedia:async()=>{reads++;throw Error('Must not read stale source bytes');}};
          record.shotId=shot.id;record.shotRevision=snapshot.shotStates[shot.id].revision-1;
          try{await BoneGenerationInputs.draftPackage({shot,snapshot,draft,actions,live:()=>true});return {accepted:true};}
          catch(error){return {code:error.code,reads};}
        }''',production)
        assert result=={'code':'CONFLICT','reads':0},result
        result=actual.evaluate('''async work=>{
          const snapshot={document:work.production,media:work.media,shotStates:work.shotStates},shot=work.production.shots[0];
          const draft=FilmShotAuthoring.fromShot(shot,snapshot.document);draft.operation='image.generate';let checks=0;
          const actions={onRefreshGeneration:async()=>{checks++;const fresh=structuredClone(snapshot);if(checks===2)fresh.document.revision++;return {snapshot:fresh};}};
          try{await BoneGenerationInputs.draftPackage({shot,snapshot,draft,actions,live:()=>true});return {accepted:true};}
          catch(error){return {code:error.code,checks};}
        }''',production)
        assert result=={'code':'CONFLICT','checks':2},result
        print('PASS: matched prototype table/editor geometry, fixed columns, stale-source draft rejection and final draft-export revision guard.',flush=True)
        browser.close()
finally:
    server.terminate()
    try:server.wait(timeout=10)
    except subprocess.TimeoutExpired:server.kill();server.wait()
