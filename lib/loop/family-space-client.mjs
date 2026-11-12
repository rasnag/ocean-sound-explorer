// RAM-only local synthetic family-space client.
export function createFamilySpaceClient(fetcher=globalThis.fetch) {
 if(typeof fetcher!=='function')throw new TypeError('Local access unavailable.');
 async function request(path,body){
  const response=await fetcher('/adult/family'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',referrerPolicy:'no-referrer',headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok)throw Object.assign(new Error('Local family access could not be confirmed.'),{status:response.status});
  const value=await response.json();if(value?.status!=='family_space'||value?.synthetic_only!==true||value?.policy_version!=='TEST-v1'||typeof value.state!=='string')throw new Error('Local family response unavailable.');return value;
 }
 return Object.freeze({index:()=>request(''),read:input=>request('/read',{view_context:input.view_context,child_id:input.child_id}),open:input=>request('/open',{view_context:input.view_context,child_id:input.child_id,entry_kind:input.entry_kind,assignment_id:input.assignment_id,revision_id:input.revision_id,...(input.entry_kind==='play'?{play_id:input.play_id}:{})})});
}
