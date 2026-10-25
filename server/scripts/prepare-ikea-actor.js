// Local source/schema preparation only. This script never calls Apify or deploys.
import { readFile, writeFile } from "node:fs/promises";
import Ajv from "ajv";
const root = new URL("../../actors/ikea-furniture-finder/",import.meta.url);
const read = name => readFile(new URL(name,root),"utf8");
const write = (name,data) => writeFile(new URL(name,root),JSON.stringify(data,null,2)+"\n");
const properties = {
  query:{type:"string"},name:{type:"string"},price:{type:"string"},url:{type:"string"},
  imageUrl:{type:["string","null"]},matchScore:{type:"number"},searchUrl:{type:"string"},
  widthIn:{type:["number","null"]},depthIn:{type:["number","null"]},heightIn:{type:["number","null"]},
  dimensionUnit:{enum:["in"]},dimensionSource:{enum:["product","missing"]},
};
const fields = {type:"object",additionalProperties:false,properties,required:Object.keys(properties)};
new Ajv({strict:false}).compile(fields);
const dataset = JSON.parse(await read(".actor/dataset_schema.json"));
dataset.fields = fields;
dataset.views.overview.transformation.fields = Object.keys(properties);
for (const axis of ["widthIn","depthIn","heightIn"])
  dataset.views.overview.display.properties[axis] = {label:axis.replace("In"," (inches)"),format:"number"};
await write(".actor/dataset_schema.json",dataset);
await write(".actor/key_value_store_schema.json",{
  actorKeyValueStoreSchemaVersion:1,title:"IKEA search files",collections:{
    result:{title:"Matched product",key:"result",contentTypes:["application/json"],jsonSchema:fields},
    image:{title:"Product image",key:"furniture-image",contentTypes:["image/jpeg","image/png","image/webp","image/avif"]},
    debug:{title:"Search diagnostic",key:"debug-search-page.html",contentTypes:["text/html"]},
    state:{title:"Aborted run state",key:"state",contentTypes:["application/json"],jsonSchema:{type:"object",properties:{status:{enum:["aborted"]}},required:["status"]}},
  },
});
const actor = JSON.parse(await read(".actor/actor.json"));
actor.storages.keyValueStore = "./key_value_store_schema.json";
await write(".actor/actor.json",actor);
const input = JSON.parse(await read(".actor/input_schema.json"));
input.properties.country.prefill = "us";
input.properties.language.prefill = "en";
await write(".actor/input_schema.json",input);
const snapshot = JSON.parse(await readFile(new URL("../data/ikea-actor-source-before.json",import.meta.url),"utf8"));
const names = ["src/main.ts","src/dimensions.js",".actor/actor.json",".actor/input_schema.json",".actor/dataset_schema.json",".actor/key_value_store_schema.json","tsconfig.json","README.md"];
const changedFiles = [];
for (const name of names) {
  const content = await read(name);
  const old = snapshot.sourceFiles.find(f=>f.name===name);
  if (!old || old.content!==content) changedFiles.push(name);
  if (old) old.content = content;
  else snapshot.sourceFiles.push({name,format:"TEXT",content});
}
await writeFile(new URL("../data/ikea-actor-update.json",import.meta.url),JSON.stringify(snapshot));
console.log(JSON.stringify({prepared:true,changedFiles,deployed:false},null,2));
