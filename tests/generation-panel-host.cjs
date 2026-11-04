"use strict";
// Isolated loopback host for the real plugin entry and workbench browser flow.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const root = path.resolve(__dirname, "..");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
const BLUE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC", "base64");
(async () => {
  const temporary = await fs.mkdtemp(path.join(process.env.PI_SCRATCH_DIR || os.tmpdir(), "film-panel-"));
  const workspace = path.join(temporary, "workspace");
  await fs.mkdir(path.join(workspace,"bone-media"),{recursive:true});
  await fs.writeFile(path.join(workspace,"bone-media/red.png"),PNG);
  await fs.writeFile(path.join(workspace,"bone-media/blue.png"),BLUE);
  const tools = new Map(); let clipboard = "";
  globalThis.pi = {
    plugin:{getDataPath:async()=>path.join(temporary,"private"),getManifest:async()=>JSON.parse(await fs.readFile(path.join(root,"manifest.json"),"utf8"))},
    commands:{register:async()=>{},unregister:async()=>{}},ui:{revealView:async()=>{}},
    agent:{registerTool:async tool=>tools.set(tool.name,tool),unregisterTool:async name=>tools.delete(name)},
    workspace:{get:async()=>({path:workspace})},
    fs:{stat:async relative=>{const stat=await fs.stat(path.join(workspace,relative));return {size:stat.size,mtimeMs:stat.mtimeMs};},readRange:async(relative,offset,length)=>{const data=await fs.readFile(path.join(workspace,relative));return {bytes:new Uint8Array(data.subarray(offset,offset+length)),totalSize:data.length};}},
  };
  const plugin=require("../main.js");await plugin.onLoad();
  const call=(name,args)=>{const tool=tools.get(name);if(!tool)throw Error("Unknown fixture tool");return tool.execute(args);};
  const {id}=await call("create_production",{title:"Reference panel fixture",kind:"film"});
  const {episodeId}=await call("write_script",{id,title:"Arrival",prose:"无影人站在青石巷。"});
  await call("write_episodes",{id,episodes:[{episodeId,title:"Arrival",beats:[{title:"Arrival beat"}]}]});
  const initial=await call("get_production",{id});const beatId=initial.production.episodes[0].script.beats[0].id;
  const {assets}=await call("add_assets",{id,assets:[{name:"无影人",type:"角色"},{name:"青石巷",type:"场景"}]});
  const red=await call("register_media",{id,path:"bone-media/red.png",kind:"image",title:"红色参考"});
  const blue=await call("register_media",{id,path:"bone-media/blue.png",kind:"image",title:"蓝色参考"});
  await call("adopt_media",{id,assetId:assets[0].id,mediaId:red.mediaId});await call("adopt_media",{id,assetId:assets[1].id,mediaId:blue.mediaId});
  const {shots}=await call("add_shots",{id,episodeId,shots:[{title:"Reference shot",scene:"无影人站在青石巷。",beatId,assetIds:assets.map(a=>a.id)}]});
  await call("update_shot",{id,shotId:shots[0].id,duration:4,motion:"缓慢推进",dialogue:"原有对白",soundDesign:{music:"保留镜头音乐",effects:"原有音效"},productionPlan:{sourceScene:"S1",purpose:"Arrival",requiredEvents:["Actor enters"],generationDurationSeconds:7,headHandleSeconds:1,tailHandleSeconds:1,retimePolicy:"forbidden",editingNotes:"Keep arrival"}});
  const fixture={id,episodeId,shotId:shots[0].id,assets,red,blue};
  if (process.argv.includes("--editorial")) Object.assign(fixture, await require("./editorial-panel-fixture.cjs")({ call, workspace, fixture }));
  const bridge=`<script>window.pluginBridge={invoke:async(channel,payload)=>{const response=await fetch('/bridge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,payload})});const data=await response.json();if(data.error)throw Object.assign(new Error(data.error.message),{code:data.error.code});return data.result;}};</script>`;
  const server=http.createServer(async(req,res)=>{
    const json=(code,value)=>{res.writeHead(code,{"Content-Type":"application/json"});res.end(JSON.stringify(value));};
    try{
      const pathname=new URL(req.url,"http://localhost").pathname;
      if(req.method==="GET"&&pathname==="/fixture"){json(200,{...fixture,clipboard});return;}
      if(req.method==="POST"&&["/bridge","/tool"].includes(pathname)){
        const parts=[];let bytes=0;for await(const part of req){bytes+=part.length;if(bytes>4*1024*1024)throw Error("Fixture request too large");parts.push(part);}
        const body=JSON.parse(Buffer.concat(parts).toString());
        let result;
        if(pathname==="/tool")result=await call(body.name,body.args);
        else if(body.channel==="clipboard.writeText"){clipboard=body.payload.text;result={ok:true};}
        else result=await plugin.onPanelInvoke(body.channel,body.payload);
        json(200,{result});return;
      }
      const file=pathname==="/"?"views/workshop.html":decodeURIComponent(pathname).slice(1);
      if(!/^(views|lib)\/[a-zA-Z0-9_.-]+\.(html|css|js)$/.test(file)){res.writeHead(404);res.end();return;}
      let data=await fs.readFile(path.join(root,file));
      if(file==="views/workshop.html")data=Buffer.from(data.toString().replace('<script src="./media-preview.js"></script>',bridge+'<script src="./media-preview.js"></script>'));
      res.writeHead(200,{"Content-Type":file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'text/javascript',"Cache-Control":"no-store"});res.end(data);
    }catch(error){json(400,{error:{code:error.code||"ERROR",message:error.message}});}
  });
  server.listen(0,"127.0.0.1",()=>process.stdout.write(JSON.stringify({url:`http://127.0.0.1:${server.address().port}/views/workshop.html`,...fixture})+'\n'));
  async function close(){server.close();await plugin.onUnload();await fs.rm(temporary,{recursive:true,force:true});process.exit(0);}
  process.on('SIGTERM',close);process.on('SIGINT',close);
})().catch(error=>{console.error(error);process.exitCode=1;});
