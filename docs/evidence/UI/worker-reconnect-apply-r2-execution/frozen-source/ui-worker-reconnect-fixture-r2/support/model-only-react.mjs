// MODEL_ONLY dependency face. It never renders, mounts, runs hooks or creates a DOM.
export const modelOnlyReact = Object.freeze({
  createElement() { throw new Error('MODEL_ONLY_RENDER_NOT_AUTHORIZED'); },
});

export function modelOnlyRequire(id) {
  if (id === 'react') return modelOnlyReact;
  throw new Error('MODEL_ONLY_UNDECLARED_IMPORT');
}
