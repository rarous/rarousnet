import fs from "fs";
import parse from "csv-parse/lib/sync.js";

/** @typedef { import("schema-dts").Book } Book */
/** @typedef { import("schema-dts").Review } Review */
/** @typedef { import("schema-dts").Person } Person */
/** @typedef { import("schema-dts").WithContext } WithContext */

/**
 *
 * @param item
 * @returns {Review | undefined}
 */
function review(item) {
  if (item["My Review"] === "" && item["My Rating"] === "0") return;
  return {
    "@type": "Review",
    author: {
      "@type": "Person",
      "@id": "https://www.rarous.net/#me",
      name: "Aleš Roubíček",
    },
    reviewBody: item["My Review"] || undefined,
    reviewRating: {
      "@type": "Rating",
      ratingValue: parseInt(item["My Rating"]),
    },
  };
}

/**
 *
 * @param {String} name
 * @returns {Person | undefined}
 */
function person(name) {
  if (!name) return;
  return {
    "@type": "Person",
    name: name.trim(),
    url: `https://www.goodreads.com/book/author/${name
      .trim()
      .replace(/\s/g, "+")}`,
  };
}

function author(item) {
  return [person(item["Author"])]
    .concat(item["Additional Authors"].split(",").map(person))
    .filter(Boolean);
}

function keywords(item) {
  const input = [item["Exclusive Shelf"]].concat(
    item["Bookshelves"].split(", ")
  );
  return Array.from(new Set(input)).join();
}

const formats = new Map([["Kindle Edition", "EBook"]]);

function bookFormat(item) {
  const type = formats.get(item["Binding"]) ?? item["Binding"];
  return `https://schema.org/${type}`;
}

/**
 *
 * @param item
 * @returns {WithContext<Book>}
 */
function book(item) {
  const isbn =
    (item["ISBN"] ?? item["ISBN13"]).replace("=", "").replace(/"/g, "") ||
    undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Book",
    name: item["Title"],
    url: isbn && `https://www.goodreads.com/book/isbn/${isbn}`,
    isbn,
    copyrightYear: item["Year Published"],
    numberOfPages: parseInt(item["Number of Pages"], 10),
    bookFormat: bookFormat(item),
    author: author(item),
    publisher: item["Publisher"]
      ? {
          "@type": "Organization",
          name: item["Publisher"],
        }
      : undefined,
    review: review(item),
    keywords: keywords(item),
  };
}

async function main() {
  const goodReadsExport = await fs.promises.readFile(
    "./static/data/goodreads_library_export.csv"
  );
  const data = parse(goodReadsExport, { columns: true });
  await fs.promises.writeFile(
    "./static/data/books.jsonld",
    JSON.stringify(data.map(book), null, 2)
  );
}

main();
