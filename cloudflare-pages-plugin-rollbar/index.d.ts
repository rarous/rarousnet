export type PluginArgs = {
  token: string;
  custom: Record<string, any>
};

export default function (args: PluginArgs): PagesFunction;
