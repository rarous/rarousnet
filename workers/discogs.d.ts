type Pagination = {
  page: number;
  pages: number;
  per_page: number;
  items: number;
  urls: any;
}

type Artist = {
  anv: string;
  id: string;
  name: string;
  resource_url: string;
  role: string;
  tracks: string;
}

type Format = {
  descriptions: string[];
  name: string;
  qty: string;
  text: string;
}

type Release = {
  id: number;
  instance_id: number;
  date_added: string;
  rating: 0;
  basic_information: {
    cover_image: string;
    id: number;
    thumb: string;
    year: number;
    title: string;
    genres: string[];
    styles: string[];
    artists: Artist[];
    master_url: string;
    resource_url: string;
    formats: Format[];
  }
}

type DiscogsReleaseResponse = {
  pagination: Pagination;
  releases: Release[];
}