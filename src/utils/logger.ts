import chalk from "chalk";

const prefix = chalk.bold("[hld-bench]");

export const log = {
  info: (msg: string) => console.log(`${prefix} ${msg}`),
  success: (msg: string) => console.log(`${prefix} ${chalk.green("✓")} ${msg}`),
  warn: (msg: string) => console.log(`${prefix} ${chalk.yellow("⚠")} ${msg}`),
  error: (msg: string) => console.error(`${prefix} ${chalk.red("✗")} ${msg}`),
  dim: (msg: string) => console.log(`${prefix} ${chalk.dim(msg)}`),
  model: (model: string, msg: string) =>
    console.log(`${prefix} ${chalk.cyan(`[${model}]`)} ${msg}`),
};
