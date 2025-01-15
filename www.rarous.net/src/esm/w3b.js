import "./articles-feed.js";
import "./feed-pagination.js";

async function main() {
  const feed = document.querySelector("articles-feed");
  const pagination = document.querySelector("feed-pagination");

  const { searchParams } = new URL(location.href);
  if (searchParams.has("page")) {
    feed.dataset.pageIndex = searchParams.get("page");
    pagination.dataset.currentPage = searchParams.get("page");
  } else {
    pagination.dataset.currentPage = 0;
  }
  if (searchParams.has("tag")) {
    feed.dataset.tag = searchParams.get("tag");
  }

  await feed.loadDataFromApi();
  pagination.dataset.itemsCount = feed.itemsCount;
}

main();
