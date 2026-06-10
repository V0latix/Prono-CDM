// Permet d'importer un fichier en texte brut via la syntaxe Vite `?raw`
// (utilisé par les tests d'intégration pour charger une migration SQL réelle).
declare module "*?raw" {
  const content: string;
  export default content;
}
