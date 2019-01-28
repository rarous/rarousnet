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
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const card = await page.$("#twitter-card");
  console.log("Will generate " + data.length + " images");
  for (let post of data) {
    await card.$eval("#title", (el, s) => (el.innerText = s), post.title);
    await card.$eval("#name", (el, s) => (el.innerText = s), post.name);
    await card.$eval("#date", (el, s) => (el.innerText = s), post.date);
    console.log(`Generating file ./dist/weblog/${post.fileName}`);
    const outputPath = path.resolve(`./dist/weblog/${post.fileName}`);
    await fs.promises
      .mkdir(path.dirname(outputPath), { recursive: true })
      .catch(err => {});
    await card.screenshot({ path: outputPath });
  }
  await browser.close();
})().catch(err => console.error(err));
