/* Upload documents for Claude to read. Files stay private in the database's storage. */
window.Docs=(function(){
  let el=null,cfg=null,rows=[],chan=null;
  const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const q=s=>el.querySelector(s);
  const say=(t,bad)=>{const m=q(".docMsg");m.textContent=t;m.style.color=bad?"var(--crit)":"var(--muted)";};
  const when=d=>d?new Date(d).toLocaleString("en-GB",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"";
  const cls=s=>s==="Added"?"ok":s==="Needs checking"?"warn":"";
  function list(){
    q(".docList").innerHTML=rows.length?`<div class="scroll"><table><thead><tr><th>File</th><th>Area</th><th>Note</th><th>Status</th><th>Uploaded</th><th></th></tr></thead><tbody>${rows.map(r=>`<tr><td style="min-width:150px;overflow-wrap:anywhere">${esc(r.name)}</td><td>${esc(r.area)}</td><td>${esc(r.note)}</td><td><span class="pill ${cls(r.status)}">${esc(r.status)}</span>${r.result?`<div class="sub" style="font-size:13px">${esc(r.result)}</div>`:""}</td><td style="white-space:nowrap">${esc(when(r.entered_at))}<div class="sub" style="font-size:13px">${esc(r.entered_by_name)}</div></td><td style="white-space:nowrap"><button class="btn sm" data-doc="open" data-id="${r.id}">Open</button> <button class="btn sm dang" data-doc="del" data-id="${r.id}">Delete</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="none">No documents uploaded yet.</div>`;
  }
  async function load(){
    const {data,error}=await cfg.sb.from("documents").select("*").eq("biz",cfg.biz).order("entered_at",{ascending:false}).limit(300);
    if(error){say("The document list couldn't be loaded. Check the internet and try again.",true);return;}
    rows=data;list();
  }
  async function upload(){
    const files=[...q(".docFile").files];
    if(!files.length){say("Choose a file first.",true);return;}
    const btn=q(".docGo");btn.disabled=true;let done=0;
    for(const f of files){
      if(f.size>20971520){say(f.name+" is over 20 MB, so it wasn't uploaded.",true);continue;}
      btn.textContent="Uploading "+(done+1)+" of "+files.length+"…";
      const safe=f.name.replace(/[^A-Za-z0-9._-]+/g,"-").slice(-80)||"file",path=cfg.biz+"/"+Date.now().toString(36)+Math.random().toString(36).slice(2,8)+"-"+safe;
      const up=await cfg.sb.storage.from("documents").upload(path,f,{contentType:f.type||undefined});
      if(up.error){say(f.name+" couldn't be uploaded. Check the internet and try again.",true);continue;}
      const ins=await cfg.sb.from("documents").insert({biz:cfg.biz,area:q(".docArea").value,note:q(".docNote").value.trim()||null,path,name:f.name,mime:f.type||null,size:f.size});
      if(ins.error){await cfg.sb.storage.from("documents").remove([path]);say(f.name+" couldn't be saved. Try again.",true);continue;}
      done++;
    }
    btn.disabled=false;btn.textContent="Upload";
    if(done){q(".docFile").value="";q(".docNote").value="";say(done+(done===1?" file":" files")+" uploaded. Ask Claude to read the new documents.");}
    load();
  }
  async function click(e){
    const b=e.target.closest("[data-doc]");if(!b)return;
    if(b.dataset.doc==="go"){upload();return;}
    const r=rows.find(x=>x.id===b.dataset.id);if(!r)return;
    if(b.dataset.doc==="open"){
      const w=window.open("","_blank");
      const {data,error}=await cfg.sb.storage.from("documents").createSignedUrl(r.path,600);
      if(error){if(w)w.close();say("That file couldn't be opened. Try again.",true);return;}
      if(w)w.location=data.signedUrl;else location.href=data.signedUrl;
    }
    if(b.dataset.doc==="del"){b.textContent="Yes, delete it";b.dataset.doc="delyes";return;}
    if(b.dataset.doc==="delyes"){
      const a=await cfg.sb.from("documents").delete().eq("id",r.id);
      if(a.error){say("That document couldn't be deleted. Try again.",true);return;}
      await cfg.sb.storage.from("documents").remove([r.path]);load();
    }
  }
  function mount(host,c){
    if(!el||cfg.biz!==c.biz){
      cfg=c;el=document.createElement("div");
      el.innerHTML=`<section class="panel"><h2>Upload a document</h2><div style="padding:14px;display:grid;gap:12px">
        <div class="sub">Upload a photo, PDF, Excel sheet or other file up to 20 MB. Then ask Claude to read the new documents. Nothing is added to the records until you've checked it.</div>
        <label style="display:grid;gap:3px;font-size:13px;font-weight:500;color:var(--muted)">Where should the details go?<select class="docArea" style="padding:8px 10px;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:5px;font-size:15px">${c.areas.map(a=>`<option>${esc(a)}</option>`).join("")}</select></label>
        <label style="display:grid;gap:3px;font-size:13px;font-weight:500;color:var(--muted)">Note for Claude (optional)<input class="docNote" autocomplete="off" placeholder="For example: new vendors from the October list" style="padding:8px 10px;background:var(--surface);color:var(--fg);border:1px solid var(--line);border-radius:5px;font-size:15px"></label>
        <label style="display:grid;gap:3px;font-size:13px;font-weight:500;color:var(--muted)">File<input class="docFile" type="file" multiple accept="image/*,application/pdf,.pdf,.csv,.txt,.xls,.xlsx,.doc,.docx" style="font-size:15px;max-width:100%"></label>
        <div class="row"><button class="btn pri docGo" data-doc="go">Upload</button></div><div class="docMsg" role="status" style="font-size:14px"></div></div></section>
        <section class="panel"><h2>Uploaded documents</h2><div class="docList"><div class="none">Loading…</div></div></section>`;
      el.addEventListener("click",click);
      if(chan)cfg.sb.removeChannel(chan);
      chan=cfg.sb.channel("docs-"+c.biz).on("postgres_changes",{event:"*",schema:"public",table:"documents"},()=>load()).subscribe();
      load();
    }
    host.replaceChildren(el);
  }
  return {mount};
})();
