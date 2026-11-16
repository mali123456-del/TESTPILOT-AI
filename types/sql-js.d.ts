declare module 'sql.js' {
  export class Database {
    constructor(buffer?: Uint8Array | string);
    exec(sql: string): any[] | void;
    prepare(sql: string): { run(params: unknown[]): void; free(): void };
    export(): Uint8Array;
    close(): void;
  }
  export function run(sql: string): void;
}

declare module 'sql.js/dist/sql-wasm.js' {
  const init: () => Promise<{ Database: any; run: (sql: string) => void }>;
  export default init;
}
