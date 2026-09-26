import type { ConfigOptions } from "cloudinary";
import type { BuildOptions } from "esbuild";
import type { pluginOptions } from "postcss-preset-env/dist/index";
import type { AcceptedPlugin } from "postcss";
import type { ResolvedConfig } from "vite";
import type { BufferFile } from "vinyl";
import type { SrcOptions } from "vinyl-fs";
import type * as File from "vinyl";

export interface TaskConfig {
  images?: boolean | ImagesTask;
  cloudflare?: boolean | SrcOptionsTask;
  cloudinary?: boolean | CloudinaryTask;
  fonts?: boolean | FontsTask;
  generate?: GenerateTask;
  "generate-html"?: Task;
  "generate-json"?: GenerateJsonTask;
  "generate-redirect"?: Task;
  static?: boolean | SrcOptionsTask;
  svgSprite?: boolean | SvgSpriteTask;
  stylesheets?: boolean | StylesheetsTask;
  esbuild?: boolean | EsbuildTask;
  html?: boolean | Task;
  vite?: ResolvedConfig;
  production?: Record<string, any>;
  watch?: Record<string, Array<string>>;

  [propName: string]: unknown;
}

interface Task {
  extensions?: Array<string>;
}

interface ImagesTask extends Task {}

interface SrcOptionsTask extends Task {
  srcOptions?: SrcOptions;
}

interface CloudinaryTask extends Task {
  config?: ConfigOptions;
  force?: boolean;
  manifest?: string;
  lqip?: boolean;
  keyResolver?: (path: string) => string;
  folderResolver?: (path: string) => string;
  getMetadata?: (
    file: BufferFile
  ) => Promise<{ lqip: null | number } | undefined>;
  setup?: (cloudinary) => Promise<void>;
}

interface EsbuildTask extends Task {
  options?: BuildOptions;
}

interface FontsTask extends Task {}

interface GenerateTask extends Task {
  json?: Array<JsonGenerator>;
  html?: Array<HtmlGenerator>;
  redirects?: Array<RedirectGenerator>;
}

interface GenerateJsonTask extends Task {
  mergeOption?: IGulpMergeJsonOptions;
}

interface Generator {
  collection: string;
  route: (item: Record<string, unknown>) => string;
}

interface HtmlGenerator extends Generator {
  template: string;
}

interface JsonGenerator extends Generator {
  srcGlob?: string | string[];
  mergeOption?: IGulpMergeJsonOptions;
}

interface RedirectGenerator extends Generator {
  host: string | URL;
}

interface SvgSpriteTask extends Task {
  svgStore?: { inlineSvg: boolean };
}

interface StylesheetsTask extends Task {
  postcss?: { plugins?: AcceptedPlugin[] };
  presetEnv?: pluginOptions;
  functions?: { [key: string]: (...args: any[]) => string };
}

interface IGulpMergeJsonOptions {
  /**
   * Output filename
   * @default 'combined.json'
   */
  fileName?: string;
  /**
   * Edit function (add/remove/edit keys during merge)
   * @default json => json
   */
  edit?: (json: any, file: File) => any | void;
  /**
   * Transform function (edit final merged object)
   * @default json => json
   */
  transform?: (json: any) => any;
  /**
   * Starting object to merge into (useful for providing default values)
   * @default {}
   */
  startObj?: any | any[];
  /** Object to merge after file merging complete (useful for overwriting with special values) */
  endObj?: any | any[];
  /**
   * Output module.exports = {MERGED_JSON_DATA}; or {exportModule} = {MERGED_JSON_DATA} when string passed
   * @default false
   */
  exportModule?: boolean | string;
  /**
   * Whether to concatenate arrays instead of merging
   * @default false
   */
  concatArrays?: boolean;
  /**
   * Whether to merge arrays or overwrite completely
   * @default true
   */
  mergeArrays?: boolean;
  /** Custom merge function for use with mergeWith */
  customizer?: (
    objValue: any,
    srcValue: any,
    key?: string,
    object?: any,
    source?: any,
    stack?: any
  ) => any;
  /** Custom JSON reviver function passed to parse */
  jsonReviver?: (key: string, value: any) => any;
  /** Custom JSON replacer function passed to stringify */
  jsonReplacer?: (key: string, value: any) => any;
  /**
   * String used for white space by stringify
   * @default '\t'
   */
  jsonSpace?: string;
  /**
   * Use JSON5 instead of JSON for parse and stringify
   * @default false
   */
  json5?: boolean;
}
