// The probe's package-local chunk.
window.__ModuleLoader__.load({ id: 'fbtest-probe', chunk: 'client.part.js', factory: (require) => {
  require('react')
  return { word: 'own part' }
} })
