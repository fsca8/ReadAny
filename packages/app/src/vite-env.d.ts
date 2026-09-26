/// <reference types="vite/client" />

/**
 * Short commit hash of the build, injected by vite (`define` in vite.config.ts)
 * and surfaced through `platform.getBuildInfo()`.
 */
declare const __READANY_COMMIT__: string;

declare interface PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
}

// foliate-js is a pure JS library with no type declarations
declare module "foliate-js/view.js";
declare module "foliate-js/epub.js";
declare module "foliate-js/pdf.js";
declare module "foliate-js/mobi.js";
declare module "foliate-js/comic-book.js";
declare module "foliate-js/fb2.js";
declare module "foliate-js/epubcfi.js";
declare module "foliate-js/paginator.js";
declare module "foliate-js/overlayer.js";
declare module "foliate-js/progress.js";
declare module "foliate-js/vendor/fflate.js";
declare module "foliate-js/vendor/zip.js";
