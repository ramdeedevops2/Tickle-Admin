// Local browser QA with synthetic sessions and API fixtures. No live writes.
const { chromium }=require('playwright-core');
const fs=require('node:fs');const assert=require('node:assert/strict');
const id='11111111-1111-4111-8111-111111111111';
const report='33333333-3333-4333-8333-333333333333';
const now=new Date().toISOString();
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
const ctx=await browser.newContext({viewport:{width:1440,height:1100}});
const text=fs.readFileSync('.env.local','utf8')+fs.readFileSync('.env','utf8');
const host=text.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
const token=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:id})).toString('base64url')+'.test';
await ctx.addInitScript(({host,id,token})=>localStorage.setItem(`sb-${host}-auth-token`,JSON.stringify({access_token:token,refresh_token:'synthetic-test-only',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()}})),{host,id,token});
await ctx.route('**/*.supabase.co/**',route=>route.fulfill({json:route.request().url().includes('/admin_profiles')?{role:'admin',role_key:'super'}:[]}));
let item={id,report_id:report,target_user_id:id,status:'reviewing',assigned_to:id,evidence_reference:'restricted-evidence-01',containment_note:null,authority:null,authority_reference:null,authority_reported_at:null,created_at:now,updated_at:now,version:2};
const writes=[];
await ctx.route('**/api/**',async route=>{
 const url=new URL(route.request().url());let json={};
 if(url.pathname==='/api/me')json={email:'qa@example.test',role_key:'super',is_super:true,permissions:[]};
 if(url.pathname==='/api/child-safety') {
  if(route.request().method()==='POST'){const data=route.request().postDataJSON();writes.push(data);if(data.action==='note')item={...item,version:item.version+1};json={ok:true,id};}
  else if(url.searchParams.has('case'))json={events:[{id:'event1',action:'review',note:'Assigned safety reviewer opened this synthetic case.',actor_id:id,created_at:now,details:{}}]};
  else json={cases:[item],reports:[],flags:[]};
 }
 if(url.pathname==='/api/reports')json={reports:[]};
 await route.fulfill({json});
});
const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const requests=[];page.on('requestfinished',r=>requests.push(new URL(r.url()).pathname));
await page.goto('http://localhost:3108/safety?view=child-safety');
try { await page.getByRole('button',{name:/11111111.*reviewing/s}).click({timeout:20000}); }
catch(e){console.log('UI state:',page.url(),(await page.locator('body').innerText()).slice(0,2500));console.log('Page errors:',errors,'Requests:',requests.slice(-20));throw e;}
await page.getByRole('heading',{name:'Activity',exact:true}).waitFor();
await page.getByRole('button',{name:'Take ownership and review',exact:true}).click();
await page.getByRole('option',{name:'Add review note',exact:true}).click();
await page.getByLabel('Review note / reason').fill('Synthetic local review note only.');
await page.getByRole('button',{name:'Save case action',exact:true}).click();
await page.waitForTimeout(500);
assert.equal(writes.length,1);assert.equal(writes[0].action,'note');assert.equal(writes[0].version,2);
fs.mkdirSync('artifacts',{recursive:true});
await page.screenshot({path:'artifacts/child-safety-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/child-safety-mobile.png',fullPage:true});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal page overflow');
assert.deepEqual(errors,[]);
console.log('PASS authenticated case view with synthetic data, action selection, versioned save, activity, narrow layout and no browser errors');
await ctx.close();
}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1});
