import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const apps = await p.app.findMany({
  select: { id: true, slug: true, name: true, baseUrl: true },
  orderBy: { slug: "asc" },
});
console.log(apps);
await p.$disconnect();
