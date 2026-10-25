import React,{useRef,useState} from 'react';
import {plannerApi} from '../../lib/planner/persistence';

export default function AgentConnect({clientId}) {
  const dialog=useRef();
  const [code,setCode]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <>
    <button disabled={busy} onClick={async()=>{
      setBusy(true);setError('');setCode('');
      try {const result=await plannerApi(clientId,'/agent/link',{method:'POST',body:'{}'});setCode(result.code);}
      catch(err){setError(err.message);}
      finally {setBusy(false);dialog.current.showModal();}
    }}>Connect ASI:One</button>
    <dialog className="furniture-dialog" ref={dialog} aria-labelledby="agent-connect-title">
      <h2 id="agent-connect-title">Connect your planner</h2>
      {code && <><p>Tell your PropertyLens agent in ASI:One:</p><p><code>Connect my workspace with code {code}</code></p><p>This one-time code expires in 10 minutes. It lets that conversation use your saved houses and furniture.</p></>}
      {error && <p role="alert">{error}</p>}
      <button onClick={()=>dialog.current.close()}>Close</button>
    </dialog>
  </>;
}
