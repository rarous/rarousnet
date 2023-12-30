import { comp, count, filter, iterator, partition } from "@thi.ng/transducers";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import data from "../.gryphoon/cards.json" assert { type: "json" };

const distDir = "./.gryphoon/dist/weblog/";
const manifestFileName = "./.gryphoon/.cache/cards.json";

class TwitterCardPage {
  constructor(page) {
    this.page = page;
    this.card = page.locator("#twitter-card");
  }

  navigate(url) {
    return this.page.goto(url);
  }

  changeCardContent(post) {
    const setContent = (el, s) => (el.innerText = s);
    return Promise.all([
      this.card.locator("#title").evaluate(setContent, post.title),
      this.card.locator("#name").evaluate(setContent, post.name),
      this.card.locator("#date").evaluate(setContent, post.date)
    ]);
  }

  screenshot(path) {
    return this.card.screenshot({ path });
  }
}

async function generateCard(twittedCardPage, post) {
  console.log(`Generating file ${distDir}${post.fileName}`);
  const [outputPath] = await Promise.all([
    prepareOutputPath(post.fileName),
    twittedCardPage.changeCardContent(post)
  ]);
  await twittedCardPage.screenshot(outputPath);
  return [post.fileName, post.hash];
}

async function prepareOutputPath(fileName) {
  const outputPath = path.resolve(distDir, fileName);
  await fs.mkdir(path.dirname(outputPath), { recursive: true }).catch((err) => {
    /* ignore errors */
  });
  return outputPath;
}

async function readManifest(manifestFileName) {
  if (!existsSync(manifestFileName)) return [];
  const data = await fs.readFile(manifestFileName, "utf-8");
  return JSON.parse(data);
}

async function writeManifest(manifestFileName, manifest) {
  console.log(`Writing manifest file ${manifestFileName}`);
  const content = JSON.stringify(Array.from(manifest));
  await fs.mkdir(path.dirname(manifestFileName), { recursive: true });
  return fs.writeFile(manifestFileName, content);
}

async function main(url, manifestFileName, POOL_SIZE) {
  console.log("Gryphoon 3.5 - static website generator");
  console.log("Twitter Card images generator");
  console.log("");

  const manifestData = await readManifest(manifestFileName);
  const manifest = new Map(manifestData);
  const updateManifest = ([fileName, hash]) => manifest.set(fileName, hash);
  const differentHash = x => manifest.get(x.fileName) !== x.hash;
  try {
    const items = iterator(comp(filter(differentHash), partition(POOL_SIZE, true)), data);
    const itemsCount = count(items);
    if (!itemsCount) {
      return console.log("Nothing to generate.\n\nDONE");
    }

    console.log("Starting Playwright...");
    const browser = await chromium.launch({
      // We need to disable Sandbox to be able to run in CircleCI environment
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    console.log("Preparing pool of tabs.", { size: POOL_SIZE });
    const tabsPool = [];
    for (let i = 0; i < POOL_SIZE; i++) {
      const page = await browser.newPage();
      const twittedCardPage = new TwitterCardPage(page);
      await twittedCardPage.navigate(url);
      tabsPool.push(twittedCardPage);
    }
    console.log(`Will generate ${itemsCount} images`);

    for (const chunk of items) {
      await Promise.all(chunk.map((post, i) => generateCard(tabsPool[i], post).then(updateManifest)));
    }
    await writeManifest(manifestFileName, manifest);
    console.log("");
    console.log("DONE");
    await browser.close();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

const POOL_SIZE = parseInt(process.env.POOL_SIZE ?? 8, 10);
const url = process.argv[2];
await main(url, manifestFileName, POOL_SIZE);
