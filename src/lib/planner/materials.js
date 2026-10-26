// Surface materials from repo-root library.json (served by the shared-assets Vite plugin).
// Texture tiling is in real feet: one texture repeat covers `entry.tile_ft` feet.
import * as THREE from "three";

let libraryPromise;
export function loadLibrary(url = "/library.json") {
  if (!libraryPromise || url !== "/library.json")
    libraryPromise = fetch(url).then((r) => {
      if (!r.ok) throw Error(`Could not load ${url} (${r.status})`);
      return r.json();
    }).catch((e) => { libraryPromise = null; throw e; });
  return libraryPromise;
}
export const findEntry = (library, id) => (library || []).find((e) => e.id === id) || null;

const loader = new THREE.TextureLoader();
const textureCache = new Map();
function texture(path, srgb) {
  const url = "/" + path.replace(/^\/+/, "");
  const key = url + (srgb ? "|srgb" : "|linear");
  if (!textureCache.has(key)) {
    const t = loader.load(url);
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8; // clamped to the GPU max by three
    textureCache.set(key, t);
  }
  return textureCache.get(key);
}
// Same image, own repeat (Source is shared, so the image is uploaded once).
function repeated(path, srgb, rx, ry) {
  const base = texture(path, srgb);
  if (rx === 1 && ry === 1) return base;
  const key = `${path}|${srgb}|${rx.toFixed(3)}|${ry.toFixed(3)}`;
  if (!textureCache.has(key)) {
    const t = base.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    textureCache.set(key, t);
  }
  return textureCache.get(key);
}

const materialCache = new Map();
/** A MeshStandardMaterial for a library entry. repeat = [rx, ry] texture repeats across UV 0..1. */
export function makeMaterial(entry, repeat = [1, 1]) {
  const [rx, ry] = repeat;
  const key = `${entry.id}|${rx.toFixed(3)}|${ry.toFixed(3)}`;
  if (materialCache.has(key)) return materialCache.get(key);
  let m;
  if (entry.maps?.color) {
    m = new THREE.MeshStandardMaterial({
      map: repeated(entry.maps.color, true, rx, ry),
      normalMap: entry.maps.normal ? repeated(entry.maps.normal, false, rx, ry) : null,
      roughnessMap: entry.maps.roughness ? repeated(entry.maps.roughness, false, rx, ry) : null,
      roughness: 1,
      metalness: 0,
    });
  } else {
    m = new THREE.MeshStandardMaterial({ color: entry.color_hex || "#ffffff", roughness: 0.9, metalness: 0 });
  }
  m.name = `library:${entry.id}`;
  materialCache.set(key, m);
  return m;
}

// Rewrites a geometry's UVs as axis-aligned box projection measured in feet / tile_ft, using
// positions transformed by `matrix` (the mesh's local matrix, so adjacent wall sections in the
// same wall group get continuous tiling). Works for boxes, slabs and flat polygons.
const _p = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
export function boxProjectUVs(geometry, tileFt, matrix = new THREE.Matrix4()) {
  const pos = geometry.attributes.position, nor = geometry.attributes.normal;
  if (!pos || !nor) return false;
  const uv = geometry.attributes.uv?.count === pos.count
    ? geometry.attributes.uv : new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2);
  _nm.getNormalMatrix(matrix);
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    _n.fromBufferAttribute(nor, i).applyMatrix3(_nm);
    const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
    let u, v;
    // Oriented so the texture reads un-mirrored from the side the face points to.
    if (ay >= ax && ay >= az) { u = _p.x; v = _n.y > 0 ? -_p.z : _p.z; }
    else if (ax >= az) { u = _n.x > 0 ? -_p.z : _p.z; v = _p.y; }
    else { u = _n.z > 0 ? _p.x : -_p.x; v = _p.y; }
    uv.setXY(i, u / tileFt, v / tileFt);
  }
  geometry.setAttribute("uv", uv);
  uv.needsUpdate = true;
  return true;
}

/**
 * Apply a library entry to a mesh or every mesh under an Object3D.
 * - entry null: restore the original material.
 * - opts.sizeFt = [w, h]: the mesh's UVs span 0..1 over w x h feet (e.g. a PlaneGeometry);
 *   repeat is set to w/tile_ft by h/tile_ft and the UVs are left alone.
 * - otherwise: UVs are rewritten as a box projection in feet so tiles never stretch
 *   (what the box walls and floor slabs use).
 */
export function applyMaterial(object, entry, { sizeFt } = {}) {
  object.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const current = mesh.material;
    // Remember the mesh's own material (re-captured if React swapped it in the meantime).
    if (!current?.name?.startsWith("library:")) mesh.userData.originalMaterial = current;
    if (!entry) {
      if (mesh.userData.originalMaterial) mesh.material = mesh.userData.originalMaterial;
      mesh.userData.materialId = null;
      return;
    }
    const tile = entry.tile_ft || 1;
    if (entry.maps?.color && sizeFt) {
      mesh.material = makeMaterial(entry, [sizeFt[0] / tile, sizeFt[1] / tile]);
    } else {
      if (entry.maps?.color) {
        mesh.updateMatrix();
        boxProjectUVs(mesh.geometry, tile, mesh.matrix);
      }
      mesh.material = makeMaterial(entry);
    }
    mesh.userData.uvGeometry = mesh.geometry;
    mesh.userData.materialId = entry.id;
  });
  return object;
}

/** Apply `entry` (or null = original look) to every mesh tagged `userData.surface === surface`
 * under root. Cheap when nothing changed, so it is safe to call every frame (handles React
 * remounting meshes or replacing geometries). */
export function applySurfaceMaterial(root, surface, entry) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.surface !== surface) return;
    const isLibrary = !!o.material?.name?.startsWith("library:");
    if (!entry ? !isLibrary
      : isLibrary && o.userData.materialId === entry.id && o.userData.uvGeometry === o.geometry) return;
    applyMaterial(o, entry);
  });
}
