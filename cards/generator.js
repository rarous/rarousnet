import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { partition } from "@thi.ng/transducers";
import data from "./data.json" assert { type: "json" };

const url = process.argv[2];

console.log("Gryphoon 3.0");
console.log("Twitter Card images generator");
console.log("");

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
      this.card.locator("#date").evaluate(setContent, post.date),
    ]);
  }
  screenshot(path) {
    return this.card.screenshot({ path });
  }
}

async function generateCard(browser, post) {
  console.log(`Generating file ./dist/weblog/${post.fileName}`);
  const page = await browser.newPage();
  const twittedCardPage = new TwitterCardPage(page);
  await twittedCardPage.navigate(url);
  const [outputPath] = await Promise.all([
    prepareOutputPath(post),
    twittedCardPage.changeCardContent(post),
  ]);
  await twittedCardPage.screenshot(outputPath);
  await page.close();
}

try {
  console.log("Starting Playwright...");
  const browser = await chromium.launch({
    // We need to disable Sandbox to be able to run in CircleCI environment
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  console.log(`Will generate ${data.length} images`);
  for (const chunk of partition(5, true, data)) {
    await Promise.all(chunk.map((post) => generateCard(browser, post)));
  }
  console.log("");
  console.log("DONE");
  await browser.close();
} catch (err) {
  console.error(err);
  process.exit(1);
}

async function prepareOutputPath(post) {
  const outputPath = path.resolve("./dist/weblog/", post.fileName);
  await fs.promises
    .mkdir(path.dirname(outputPath), { recursive: true })
    .catch((err) => {
      /* ignore errors */
    });
  return outputPath;
}
