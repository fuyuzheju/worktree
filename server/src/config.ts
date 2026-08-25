export const config = {
  port: Number(process.env.PORT ?? 9997),
  databaseUrl: process.env.DATABASE_URL ?? 'file:./dev.db',
  /** Only `open` today; `invite` (invite-code mode) is the reserved future value. */
  registrationMode: process.env.REGISTRATION_MODE ?? 'open',
};
