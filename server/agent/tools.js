const string = {type:'string',minLength:1,maxLength:500};
const id = {type:'string',pattern:'^[a-zA-Z0-9_-]{1,100}$'};
const num = {type:'number',minimum:0,maximum:30000};
const tool=(name,description,properties={},required=Object.keys(properties))=>({type:'function',function:{name,description,parameters:{type:'object',properties,required,additionalProperties:false}}});
export const agentTools = [
  tool('capabilities','Check which real tools are available. SAM 3D generation is not implemented yet.'),
  tool('connect_workspace','Connect this conversation to a website workspace using its one-time connection code.',{code:{type:'string',pattern:'^[a-f0-9]{16}$'}}),
  tool('list_houses','List houses saved in the connected workspace; demo is also available.'),
  tool('load_house','Load a saved house and its room IDs. demo is synthetic, not a measured property.',{home_id:id}),
  tool('search_ikea','Run the real IKEA Actor; return a product ID, image and measured inch dimensions. Do not claim a generated 3D mesh.',{description:string}),
  tool('place_furniture','Save a correctly sized primitive placeholder in a loaded house. Requires explicit user approval of the found product. Missing dimensions and collisions are rejected. Coordinates are inches, at object center.',{home_id:id,product_id:id,room_id:id,x:num,z:num,rotation:{type:'number',minimum:-360,maximum:360}},['home_id','product_id','room_id']),
  tool('move_furniture','Move or rotate a saved placement. Coordinates are inches. Invalid positions are rejected.',{home_id:id,placement_id:id,x:num,z:num,rotation:{type:'number',minimum:-360,maximum:360}},['home_id','placement_id','x','z','rotation']),
  tool('get_scene','Read the saved placements and house geometry after changes. Website viewer is optional; all changes are made in chat.',{home_id:id}),
  tool('start_house_search','Start the existing floor-plan Actor job for an address and listing home ID (not demo or custom-*). Poll get_house_job; never say a job finished merely because it started.',{address:string,home_id:id}),
  tool('get_house_job','Get status and plan asset IDs for a previously started floor-plan job.',{job_id:id}),
  tool('convert_house_plan','Convert an owned plan asset using CubiCasa and OCR, and save the resulting house. Fails if reliable scale is unavailable.',{asset_id:id,home_id:id,address:string}),
  tool('generate_furniture_model','Check SAM 3D generation. Currently returns unavailable; never invent a mesh or model URL.',{product_id:id}),
];
