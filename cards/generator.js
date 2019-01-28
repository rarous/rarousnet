"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const data = require("./data.json");
const url = process.argv[2];

console.log("Gryphoon 3.0");
console.log("Twitter Card images generator");
console.log("");

(async () => {
  console.log("Starting Puppeteer...");
  const browser = await puppeteer.launch({
    // We need to disable Sandbox to be able to run in CircleCI environment
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.goto(url);
  const card = await page.$("#twitter-card");
  console.log(`Will generate ${data.length} images`);
  for (let post of data) {
    console.log(`Generating file ./dist/weblog/${post.fileName}`);
    await changeCardContent(card, post);
    await card.screenshot({ path: await prepareOutputPath(post) });
  }
  console.log("");
  console.log("DONE");
  await browser.close();
})().catch(err => console.error(err));

async function changeCardContent(card, post) {
  const setContent = (el, s) => (el.innerText = s);
  await Promise.all([
    card.$eval("#title", setContent, post.title),
    card.$eval("#name", setContent, post.name),
    card.$eval("#date", setContent, post.date)
  ]);
}

async function prepareOutputPath(post) {
  const outputPath = path.resolve(`./dist/weblog/${post.fileName}`);
  await fs.promises
    .mkdir(path.dirname(outputPath), { recursive: true })
    .catch(err => {
      /* ignore errors */
    });
  return outputPath;
}
