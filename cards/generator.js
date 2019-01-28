"use strict";

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const data = require("./data.json");
const url = process.argv[2];

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url);
  const card = await page.$("#twitter-card");
  for (let post of data) {
    await card.$eval("#title", (el, s) => (el.innerText = s), post.title);
    await card.$eval("#name", (el, s) => (el.innerText = s), post.name);
    await card.$eval("#date", (el, s) => (el.innerText = s), post.date);
    const outputPath = path.resolve(`./dist/weblog/${post.fileName}`);
    await fs.promises
      .mkdir(path.dirname(outputPath), { recursive: true })
      .catch(err => {});
    await card.screenshot({ path: outputPath });
  }
  await browser.close();
})().catch(err => console.error(err));
