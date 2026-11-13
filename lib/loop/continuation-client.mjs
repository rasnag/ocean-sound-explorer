// Optional adult read-only transport. No browser storage or identity in URLs.
const states=new Set(['none','confirmation_pending','recorded_active','recorded_expired','unavailable']);
export function createContinuationClient(fetcher=globalThis.fetch){
 if(typeof fetcher!=='function')throw new TypeError('Local continuation unavailable.');
 async function status(input){
  const view_context=input.view_context,child_id=input.child_id;
  if(typeof view_context!=='string'||!/^[0-9a-f]{64}$/.test(view_context)||typeof child_id!=='string'||!/^[0-9a-f-]{36}$/.test(child_id))throw new Error('Local continuation unavailable.');
  const response=await fetcher('/adult/continuation/status',{method:'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:{'Content-Type':'application/json'},body:JSON.stringify({view_context,child_id})});
  if(!response.ok)throw Object.assign(new Error('Continuation status could not be confirmed.'),{status:response.status});
  const value=await response.json(),keys=['status','synthetic_only','policy_version','view_context','child_id','state'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.status!=='continuation_status'||value.synthetic_only!==true||value.policy_version!=='TEST-CONTINUATION-v1'||value.view_context!==view_context||value.child_id!==child_id||!states.has(value.state))throw new Error('Continuation status could not be confirmed.');
  return value;
 }
 return Object.freeze({status});
}
