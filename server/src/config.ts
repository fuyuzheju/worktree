export const config = {
  port: Number(process.env.PORT ?? 9997),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
};
