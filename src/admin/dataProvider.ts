import { DataProvider, fetchUtils } from "react-admin";

const apiUrl = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";

const httpClient = (url: string, options: fetchUtils.Options = {}) => {
  if (!options.headers) {
    options.headers = new Headers({ Accept: "application/json" });
  }
  const token = localStorage.getItem("strapi_token");
  if (token) {
    (options.headers as Headers).set("Authorization", `Bearer ${token}`);
  }
  return fetchUtils.fetchJson(url, options);
};

const convert = (record: any) => ({ id: record.id, ...(record.attributes || {}) });

const dataProvider: DataProvider = {
  getList: async (resource, params) => {
    const { page, perPage } = params.pagination;
    const { field, order } = params.sort;
    const query = new URLSearchParams();
    query.set("pagination[page]", String(page));
    query.set("pagination[pageSize]", String(perPage));
    if (field) {
      query.set("sort", `${field}:${order.toLowerCase()}`);
    }
    const url = `${apiUrl}/api/${resource}?${query.toString()}`;
    const { json } = await httpClient(url);
    return {
      data: Array.isArray(json.data) ? json.data.map(convert) : [],
      total: json.meta?.pagination?.total || 0,
    };
  },

  getOne: async (resource, params) => {
    const url = `${apiUrl}/api/${resource}/${params.id}`;
    const { json } = await httpClient(url);
    return { data: convert(json.data) };
  },

  create: async (resource, params) => {
    const url = `${apiUrl}/api/${resource}`;
    const { json } = await httpClient(url, {
      method: "POST",
      body: JSON.stringify({ data: params.data }),
    });
    return { data: convert(json.data) };
  },

  update: async (resource, params) => {
    const url = `${apiUrl}/api/${resource}/${params.id}`;
    const { json } = await httpClient(url, {
      method: "PUT",
      body: JSON.stringify({ data: params.data }),
    });
    return { data: convert(json.data) };
  },

  delete: async (resource, params) => {
    const url = `${apiUrl}/api/${resource}/${params.id}`;
    await httpClient(url, { method: "DELETE" });
    return { data: { id: params.id } };
  },

  deleteMany: async (resource, params) => {
    const results = await Promise.all(
      params.ids.map((id) =>
        httpClient(`${apiUrl}/api/${resource}/${id}`, { method: "DELETE" })
      )
    );
    return { data: params.ids };
  },
};

export default dataProvider;
