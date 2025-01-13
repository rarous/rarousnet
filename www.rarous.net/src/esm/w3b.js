import "./articles-feed.js";

async function main() {
  const feed = document.querySelector("articles-feed");

  const { searchParams } = new URL(location.href);
  if (searchParams.has("page")) {
    feed.dataset.pageIndex = searchParams.get("page");
  }
  if (searchParams.has("tag")) {
    feed.dataset.tag = searchParams.get("tag");
  }

  await feed.loadDataFromApi();
}

main();
