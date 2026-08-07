/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API. En desarrollo la sirve el proxy de Vite. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
