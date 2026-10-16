// node scripts/test-child-safety.cjs
// Real validation/removal helpers, mocked Storage only; no production requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022 },
  }).outputText, { module,exports:module.exports,URL,Date,Set,Error });
  return module.exports;
}
const { parseCaseAction } = load('src/lib/childSafety.ts');
const { ownedMediaPath, preserveStorageObject } = load('src/lib/moderationRemoval.ts');
const id='11111111-1111-4111-8111-111111111111';
const action={action:'authority',case_id:id,version:3,note:'Submitted by assigned safety contact',
  details:{reference:'receipt-123',authority:'Regional authority',reported_at:'2026-01-01T00:00:00Z'}};
assert.equal(parseCaseAction(action).details.reference,'receipt-123');
for(const invalid of [
  {...action,version:undefined}, {...action,case_id:'bad'}, {...action,note:' '},
  {...action,action:'delete'}, {...action,details:{...action.details,reference:''}},
  {...action,details:{...action.details,reported_at:'2999-01-01'}},
]) assert.throws(()=>parseCaseAction(invalid));
assert.equal(ownedMediaPath('photos',`https://project.supabase.co/storage/v1/object/public/photos/${id}/image.jpg`,id,'https://project.supabase.co'),`${id}/image.jpg`);
for(const [bucket,path] of [['photos',`${id}/../other.jpg`],['photos','other/image.jpg'],['face-checks',`${id}/file`],['photos',`https://evil.example/${id}/image.jpg`]])
  assert.throws(()=>ownedMediaPath(bucket,path,id,'https://project.supabase.co'));
function storageFixture({copyFails=false,copySize=12,removeFails=false,publicBucket=false,alreadyPreserved=false}={}) {
  const calls=[];let copied=alreadyPreserved;
  return {calls,db:{storage:{getBucket:async()=>({data:{public:publicBucket}}),from:bucket=>({
    info:async()=>bucket==='moderation-evidence' ? (copied?{data:{size:copySize}}:{error:new Error('not found')}) : {data:{size:12}},
    copy:async()=>{calls.push('copy');if(copyFails)return{error:new Error('copy refused')};copied=true;return{data:{}};},
    remove:async()=>{calls.push('remove');return removeFails?{error:new Error('remove refused')}:{data:{}};},
  })}}};
}
(async()=>{
  let f=storageFixture();await preserveStorageObject(f.db,'photos','source','private');assert.deepEqual(f.calls,['copy','remove']);
  for(const options of [{copyFails:true},{copySize:11},{publicBucket:true}]) {
    f=storageFixture(options);await assert.rejects(preserveStorageObject(f.db,'photos','source','private'));
    assert.ok(!f.calls.includes('remove'),'Never remove originals before private evidence verification');
  }
  f=storageFixture({removeFails:true});await assert.rejects(preserveStorageObject(f.db,'photos','source','private'));assert.deepEqual(f.calls,['copy','remove']);
  f=storageFixture({alreadyPreserved:true});await preserveStorageObject(f.db,'photos','source','private');assert.deepEqual(f.calls,['remove']);
  console.log('PASS validation, path ownership, private evidence requirement, verified copy-before-removal, failure handling and retries');
})().catch(e=>{console.error(e);process.exitCode=1});
