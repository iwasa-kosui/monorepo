declare module 'sql.js/dist/sql-wasm-browser.js' {
  import type { InitSqlJsStatic } from 'sql.js';

  const initSqlJs: InitSqlJsStatic;
  export default initSqlJs;
}
