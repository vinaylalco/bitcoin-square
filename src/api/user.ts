import { strapiFetch, StrapiResponse } from './strapi-client';

interface PopulatedCourse {
  id: number;
  title: string;
}

export interface Order {
  id: number;
  course?: PopulatedCourse;
  createdAt: string;
}

export async function getUserOrders(token: string): Promise<Order[]> {
  const res = await strapiFetch<StrapiResponse<any>>('/api/orders?populate=course', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (res.data as any[]).map((o) => ({
    id: o.id,
    createdAt: o.attributes?.createdAt,
    course: o.attributes?.course?.data
      ? {
          id: o.attributes.course.data.id,
          title: o.attributes.course.data.attributes?.title,
        }
      : undefined,
  }));
}

export interface AccessGrant {
  id: number;
  course?: PopulatedCourse;
}

export async function getUserAccessGrants(token: string): Promise<AccessGrant[]> {
  const res = await strapiFetch<StrapiResponse<any>>('/api/access-grants?populate=course', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (res.data as any[]).map((g) => ({
    id: g.id,
    course: g.attributes?.course?.data
      ? {
          id: g.attributes.course.data.id,
          title: g.attributes.course.data.attributes?.title,
        }
      : undefined,
  }));
}
