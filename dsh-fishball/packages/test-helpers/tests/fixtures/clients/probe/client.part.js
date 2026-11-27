// The probe's package-local chunk.
window.__ModuleLoader__.load({ id: 'fbtest-probe', chunk: 'client.part.js', factory: (load) => {
  load('react')
  return { word: 'own part' }
} })
