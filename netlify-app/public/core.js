export const STATES=['Saved','Evaluated','Applied','Responded','Assessment','Interview','Offer','Hired','Rejected','Discarded','SKIP'];
export const escapeHTML=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function emptyState(){return {schema:1,profile:{name:'',email:'',location:'',target:'',cv:''},applications:[],versions:[]};}
export function validateWorkspace(data){
 const str=(v,max=100000)=>typeof v==='string'&&v.length<=max;
 const date=v=>str(v,50)&&!Number.isNaN(Date.parse(v));
 if(!data||data.schema!==1||!data.profile||!['name','email','location','target','cv'].every(k=>str(data.profile[k]))||!Array.isArray(data.applications)||!Array.isArray(data.versions))throw new Error('This is not a Career Ops workspace backup.');
 if(data.applications.length>1000||data.versions.length>2000)throw new Error('Workspace is too large.');
 const ids=new Set();for(const a of data.applications){if(!a||!str(a.id,100)||!a.id||ids.has(a.id)||!STATES.includes(a.status)||!str(a.company,150)||!str(a.role,180)||!str(a.jd,60000)||!date(a.created)||!date(a.updated)||!Array.isArray(a.events)||!a.events.every(ev=>ev&&str(ev.type,100)&&str(ev.label,10000)&&date(ev.at)))throw new Error('Invalid application record.');ids.add(a.id);}
 const vids=new Set();for(const v of data.versions){if(!v||!str(v.id,100)||vids.has(v.id)||!str(v.label,1000)||!str(v.text)||!date(v.created)||typeof v.reviewed!=='boolean')throw new Error('Invalid CV version.');vids.add(v.id);}
 return data;
}
export function findDuplicate(apps,company,role){const norm=x=>String(x||'').trim().toLowerCase().replace(/\s+/g,' ');return apps.find(a=>norm(a.company)===norm(company)&&norm(a.role)===norm(role)&&!['Rejected','Discarded','SKIP'].includes(a.status));}
export function keywordMatch(cv,jd){const stop=new Set('with from that this your have will about their they team role work skills experience years ability using within our and the for are you job not can all'.split(' ')); const words=[...new Set((jd.toLowerCase().match(/[a-z][a-z+#.\d-]{2,}/g)||[]).filter(w=>!stop.has(w)))]; const source=cv.toLowerCase(); const found=words.filter(w=>source.includes(w));return {found:found.slice(0,20),missing:words.filter(w=>!source.includes(w)).slice(0,20),percent:words.length?Math.round(found.length/words.length*100):0};}
export function approvedFacts(source,generated){const nums=t=>new Set((t.match(/\b\d[\d.,%]*/g)||[]));const known=nums(source);return [...nums(generated)].filter(n=>!known.has(n));}
export function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'';}catch{return '';}}
