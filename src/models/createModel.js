import { StickmanModel } from './StickmanModel.js';
import { GltfModel } from './GltfModel.js';
import { PlaceholderModel } from './PlaceholderModel.js';

/*
 * Builds a fighter's model from its `appearance` data (src/config/characters.js).
 *   type: 'stickman'    rigged stickman .glb with procedural animation (StickmanModel)
 *   type: 'gltf'        any .glb with its own animation clips (GltfModel)
 *   type: 'placeholder' primitive-shapes humanoid (PlaceholderModel)
 * To add a new kind of model, add a case here; nothing else needs to change.
 */
export function createModel(appearance = {}) {
  switch (appearance.type) {
    case 'stickman': return new StickmanModel(appearance);
    case 'gltf': return new GltfModel(appearance);
    default: return new PlaceholderModel(appearance);
  }
}
